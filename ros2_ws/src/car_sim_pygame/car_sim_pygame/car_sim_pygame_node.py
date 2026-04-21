import math
import os
import threading
from collections import deque

import cv2
import numpy as np
import pygame
import yaml

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, PoseStamped, Quaternion
from nav_msgs.msg import Odometry, Path
from visualization_msgs.msg import Marker, MarkerArray

WINDOW_W = 800
WINDOW_H = 800
SDL_WINDOW_ALWAYS_ON_TOP = 0x00008000

COLOR_BG = (30, 30, 30)
COLOR_GRID = (50, 50, 50)
COLOR_OBSTACLE = (200, 200, 200)
COLOR_ROBOT = (0, 255, 255)
COLOR_HEADING = (255, 60, 60)
COLOR_TRAIL = (255, 80, 80)
COLOR_ORIGIN = (80, 200, 80)
COLOR_HUD_TEXT = (220, 220, 220)


def yaw_to_quaternion(yaw):
    return Quaternion(
        x=0.0, y=0.0,
        z=math.sin(yaw / 2.0),
        w=math.cos(yaw / 2.0),
    )


class CarSimPygameNode(Node):
    def __init__(self):
        super().__init__('car_sim_pygame_node')

        self.declare_parameter('initial_x', 0.0)
        self.declare_parameter('initial_y', 0.0)
        self.declare_parameter('initial_yaw', 0.0)
        self.declare_parameter('frequency', 20.0)
        self.declare_parameter('chassis_radius', 0.25)
        self.declare_parameter('trail_length', 500)
        self.declare_parameter('stop_on_release', True)
        self.declare_parameter('pixels_per_meter', 60.0)
        self.declare_parameter('obstacles_file', '')
        self.declare_parameter('map_yaml', '')

        initial_x = self.get_parameter('initial_x').value
        initial_y = self.get_parameter('initial_y').value
        initial_yaw = self.get_parameter('initial_yaw').value
        self.frequency = self.get_parameter('frequency').value
        self.dt = 1.0 / self.frequency
        self.chassis_radius = self.get_parameter('chassis_radius').value
        trail_length = self.get_parameter('trail_length').value
        self.stop_on_release = self.get_parameter('stop_on_release').value
        self.ppm = self.get_parameter('pixels_per_meter').value

        self.state = np.array([initial_x, initial_y, initial_yaw, 0.0, 0.0])
        self.cmd_v = 0.0
        self.cmd_w = 0.0
        self.last_cmd_time = self.get_clock().now()
        self.cmd_timeout = 2.0 / self.frequency

        self.trail = deque(maxlen=trail_length)

        map_yaml = self.get_parameter('map_yaml').value
        obstacles_file = self.get_parameter('obstacles_file').value

        if map_yaml:
            self.obstacles = self._load_obstacles_from_map(map_yaml)
        else:
            self.obstacles = self._load_obstacles(obstacles_file)

        self.cmd_vel_sub = self.create_subscription(
            Twist, '/cmd_vel', self._cmd_vel_callback, 10
        )

        self.odom_pub = self.create_publisher(Odometry, '/odom', 10)
        self.trajectory_pub = self.create_publisher(Path, '/trajectory', 10)
        self.markers_pub = self.create_publisher(MarkerArray, '/markers', 10)

        # Camera offset from robot (for middle-click drag)
        self.cam_offset_x = 0.0
        self.cam_offset_y = 0.0
        self.dragging = False
        self.drag_last_pos = (0, 0)

        self.sim_timer = self.create_timer(self.dt, self._simulation_step)

        self.get_logger().info(
            f'Pygame car sim started at ({initial_x}, {initial_y}) | '
            f'freq={self.frequency}Hz | stop_on_release={self.stop_on_release}'
        )

    # ── Obstacle loading ────────────────────────────────────────────

    def _load_obstacles(self, filepath: str) -> np.ndarray:
        if not filepath:
            self.get_logger().info('No obstacles_file provided, using empty obstacle set')
            return np.empty((0, 2))

        if not os.path.isfile(filepath):
            self.get_logger().error(f'Obstacles file not found: {filepath}')
            return np.empty((0, 2))

        points = []
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split(',')
                if len(parts) >= 2:
                    try:
                        points.append([float(parts[0]), float(parts[1])])
                    except ValueError:
                        continue

        self.get_logger().info(f'Loaded {len(points)} obstacles from {filepath}')
        if not points:
            return np.empty((0, 2))
        return np.array(points)

    def _load_obstacles_from_map(self, yaml_path: str) -> np.ndarray:
        if not os.path.isfile(yaml_path):
            self.get_logger().error(f'Map YAML not found: {yaml_path}')
            return np.empty((0, 2))

        with open(yaml_path, 'r') as f:
            map_config = yaml.safe_load(f)

        image_name = map_config.get('image', '')
        resolution = float(map_config.get('resolution', 1.0))
        origin = map_config.get('origin', [0.0, 0.0])
        origin_x, origin_y = float(origin[0]), float(origin[1])

        image_path = os.path.join(os.path.dirname(yaml_path), image_name)
        if not os.path.isfile(image_path):
            self.get_logger().error(f'Map image not found: {image_path}')
            return np.empty((0, 2))

        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            self.get_logger().error(f'Failed to read image: {image_path}')
            return np.empty((0, 2))

        h, w = img.shape[:2]
        points = []

        if img.shape[2] == 4:
            alpha = img[:, :, 3]
            for row in range(h):
                for col in range(w):
                    if alpha[row, col] > 0:
                        x = origin_x + col * resolution
                        y = origin_y + (h - 1 - row) * resolution
                        points.append([x, y])
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            for row in range(h):
                for col in range(w):
                    if gray[row, col] < 128:
                        x = origin_x + col * resolution
                        y = origin_y + (h - 1 - row) * resolution
                        points.append([x, y])

        self.get_logger().info(
            f'Loaded {len(points)} obstacles from map '
            f'({w}x{h}, res={resolution}, origin=[{origin_x}, {origin_y}])'
        )
        if not points:
            return np.empty((0, 2))
        return np.array(points)

    # ── ROS2 callbacks ───────────────────────────────────────────────

    def _cmd_vel_callback(self, msg: Twist):
        self.cmd_v = msg.linear.x
        self.cmd_w = msg.angular.z
        self.last_cmd_time = self.get_clock().now()

    def _simulation_step(self):
        if self.stop_on_release:
            elapsed = (self.get_clock().now() - self.last_cmd_time).nanoseconds * 1e-9
            if elapsed > self.cmd_timeout:
                self.cmd_v = 0.0
                self.cmd_w = 0.0

        v, w = self.cmd_v, self.cmd_w
        self.state[2] += w * self.dt
        self.state[0] += v * math.cos(self.state[2]) * self.dt
        self.state[1] += v * math.sin(self.state[2]) * self.dt
        self.state[3] = v
        self.state[4] = w

        self.trail.append((float(self.state[0]), float(self.state[1])))

        stamp = self.get_clock().now().to_msg()
        self._publish_odometry(stamp)
        self._publish_trajectory(stamp)
        self._publish_markers(stamp)

    # ── ROS2 publishers ──────────────────────────────────────────────

    def _publish_odometry(self, stamp):
        msg = Odometry()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        msg.child_frame_id = 'base_link'
        msg.pose.pose.position.x = float(self.state[0])
        msg.pose.pose.position.y = float(self.state[1])
        msg.pose.pose.orientation = yaw_to_quaternion(self.state[2])
        msg.twist.twist.linear.x = float(self.state[3])
        msg.twist.twist.angular.z = float(self.state[4])
        self.odom_pub.publish(msg)

    def _publish_trajectory(self, stamp):
        msg = Path()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        for tx, ty in self.trail:
            pose = PoseStamped()
            pose.header.stamp = stamp
            pose.header.frame_id = 'odom'
            pose.pose.position.x = tx
            pose.pose.position.y = ty
            msg.poses.append(pose)
        self.trajectory_pub.publish(msg)

    def _publish_markers(self, stamp):
        ma = MarkerArray()
        for i, obs in enumerate(self.obstacles if len(self.obstacles) > 0 else []):
            m = Marker()
            m.header.stamp = stamp
            m.header.frame_id = 'odom'
            m.ns = 'obstacles'
            m.id = i
            m.type = Marker.CYLINDER
            m.action = Marker.ADD
            m.pose.position.x = float(obs[0])
            m.pose.position.y = float(obs[1])
            m.scale.x = 0.3
            m.scale.y = 0.3
            m.scale.z = 0.5
            m.color.a = 1.0
            ma.markers.append(m)

        robot = Marker()
        robot.header.stamp = stamp
        robot.header.frame_id = 'odom'
        robot.ns = 'robot'
        robot.id = 0
        robot.type = Marker.CYLINDER
        robot.action = Marker.ADD
        robot.pose.position.x = float(self.state[0])
        robot.pose.position.y = float(self.state[1])
        robot.scale.x = float(self.chassis_radius * 2)
        robot.scale.y = float(self.chassis_radius * 2)
        robot.scale.z = 0.3
        robot.color.g = 1.0
        robot.color.b = 1.0
        robot.color.a = 1.0
        ma.markers.append(robot)
        self.markers_pub.publish(ma)

    # ── Pygame rendering ─────────────────────────────────────────────

    def world_to_screen(self, wx, wy, cam_x, cam_y):
        sx = int((wx - cam_x) * self.ppm + WINDOW_W / 2)
        sy = int(-(wy - cam_y) * self.ppm + WINDOW_H / 2)
        return sx, sy

    def draw(self, surface, font):
        cam_x = float(self.state[0]) + self.cam_offset_x
        cam_y = float(self.state[1]) + self.cam_offset_y

        surface.fill(COLOR_BG)

        # Grid
        grid_step = 1.0
        world_half_w = (WINDOW_W / 2) / self.ppm
        world_half_h = (WINDOW_H / 2) / self.ppm
        x_min = math.floor(cam_x - world_half_w)
        x_max = math.ceil(cam_x + world_half_w)
        y_min = math.floor(cam_y - world_half_h)
        y_max = math.ceil(cam_y + world_half_h)

        gx = x_min
        while gx <= x_max:
            sx, _ = self.world_to_screen(gx, 0, cam_x, cam_y)
            pygame.draw.line(surface, COLOR_GRID, (sx, 0), (sx, WINDOW_H))
            gx += grid_step
        gy = y_min
        while gy <= y_max:
            _, sy = self.world_to_screen(0, gy, cam_x, cam_y)
            pygame.draw.line(surface, COLOR_GRID, (0, sy), (WINDOW_W, sy))
            gy += grid_step

        # Origin cross
        ox, oy = self.world_to_screen(0, 0, cam_x, cam_y)
        pygame.draw.line(surface, COLOR_ORIGIN, (ox - 8, oy), (ox + 8, oy), 2)
        pygame.draw.line(surface, COLOR_ORIGIN, (ox, oy - 8), (ox, oy + 8), 2)

        # Obstacles
        obs_radius_px = max(int(0.15 * self.ppm), 3)
        if len(self.obstacles) > 0:
            for obs in self.obstacles:
                sx, sy = self.world_to_screen(obs[0], obs[1], cam_x, cam_y)
                pygame.draw.circle(surface, COLOR_OBSTACLE, (sx, sy), obs_radius_px)

        # Trajectory trail
        if len(self.trail) > 1:
            pts = [self.world_to_screen(tx, ty, cam_x, cam_y) for tx, ty in self.trail]
            pygame.draw.lines(surface, COLOR_TRAIL, False, pts, 2)

        # Robot body
        rx, ry = self.world_to_screen(self.state[0], self.state[1], cam_x, cam_y)
        robot_r_px = max(int(self.chassis_radius * self.ppm), 4)
        pygame.draw.circle(surface, COLOR_ROBOT, (rx, ry), robot_r_px)

        # Heading arrow
        arrow_len = self.chassis_radius * 2.5 * self.ppm
        hx = rx + int(arrow_len * math.cos(self.state[2]))
        hy = ry - int(arrow_len * math.sin(self.state[2]))
        pygame.draw.line(surface, COLOR_HEADING, (rx, ry), (hx, hy), 3)

        # HUD
        lines = [
            f'v = {self.state[3]:.2f} m/s',
            f'w = {math.degrees(self.state[4]):.1f} deg/s',
            f'pos = ({self.state[0]:.2f}, {self.state[1]:.2f})',
            f'yaw = {math.degrees(self.state[2]):.1f} deg',
        ]
        for i, text in enumerate(lines):
            surf = font.render(text, True, COLOR_HUD_TEXT)
            surface.blit(surf, (10, 10 + i * 22))


def main(args=None):
    rclpy.init(args=args)
    node = CarSimPygameNode()

    spin_thread = threading.Thread(target=rclpy.spin, args=(node,), daemon=True)
    spin_thread.start()

    pygame.init()
    screen = pygame.display.set_mode((WINDOW_W, WINDOW_H), SDL_WINDOW_ALWAYS_ON_TOP)
    pygame.display.set_caption('Car Teleop Sim (Pygame)')
    clock = pygame.time.Clock()
    font = pygame.font.SysFont('monospace', 16)

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_c:
                    node.cam_offset_x = 0.0
                    node.cam_offset_y = 0.0
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 2:
                node.dragging = True
                node.drag_last_pos = event.pos
            elif event.type == pygame.MOUSEBUTTONUP and event.button == 2:
                node.dragging = False
            elif event.type == pygame.MOUSEMOTION and node.dragging:
                dx = event.pos[0] - node.drag_last_pos[0]
                dy = event.pos[1] - node.drag_last_pos[1]
                node.cam_offset_x -= dx / node.ppm
                node.cam_offset_y += dy / node.ppm
                node.drag_last_pos = event.pos

        node.draw(screen, font)
        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    node.destroy_node()
    rclpy.shutdown()
