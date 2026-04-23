import math
import os
import threading

import cv2
import numpy as np
import yaml

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, PoseStamped, Quaternion
from nav_msgs.msg import Odometry, Path
from visualization_msgs.msg import MarkerArray


def yaw_to_quaternion(yaw):
    return Quaternion(
        x=0.0, y=0.0,
        z=math.sin(yaw / 2.0),
        w=math.cos(yaw / 2.0),
    )


class DWAPlannerNode(Node):
    def __init__(self):
        super().__init__('dwa_planner_node')

        # DWA kinematic parameters
        self.declare_parameter('max_v', 1.0)
        self.declare_parameter('min_v', -0.5)
        self.declare_parameter('max_w', 0.7)
        self.declare_parameter('min_w', -0.7)
        self.declare_parameter('max_a', 0.2)
        self.declare_parameter('max_d_w', 0.7)
        self.declare_parameter('v_res', 0.01)
        self.declare_parameter('w_res', 0.00175)
        self.declare_parameter('dt', 0.1)
        self.declare_parameter('dw_time', 3.0)
        self.declare_parameter('chassis_radius', 1.0)

        # DWA cost gains
        self.declare_parameter('heading_gain', 0.2)
        self.declare_parameter('velocity_gain', 1.0)
        self.declare_parameter('distance_gain', 1.7)

        # Goal and control
        self.declare_parameter('goal_x', 10.0)
        self.declare_parameter('goal_y', 10.0)
        self.declare_parameter('goal_tolerance', 1.0)
        self.declare_parameter('frequency', 10.0)

        # Obstacle sources
        self.declare_parameter('obstacles_file', '')
        self.declare_parameter('map_yaml', '')

        self.max_v = self.get_parameter('max_v').value
        self.min_v = self.get_parameter('min_v').value
        self.max_w = self.get_parameter('max_w').value
        self.min_w = self.get_parameter('min_w').value
        self.max_a = self.get_parameter('max_a').value
        self.max_d_w = self.get_parameter('max_d_w').value
        self.v_res = self.get_parameter('v_res').value
        self.w_res = self.get_parameter('w_res').value
        self.dt = self.get_parameter('dt').value
        self.dw_time = self.get_parameter('dw_time').value
        self.chassis_radius = self.get_parameter('chassis_radius').value

        self.heading_gain = self.get_parameter('heading_gain').value
        self.velocity_gain = self.get_parameter('velocity_gain').value
        self.distance_gain = self.get_parameter('distance_gain').value

        goal_x = self.get_parameter('goal_x').value
        goal_y = self.get_parameter('goal_y').value
        self.goal = np.array([goal_x, goal_y])
        self.goal_tolerance = self.get_parameter('goal_tolerance').value
        frequency = self.get_parameter('frequency').value

        self.state = None
        self.goal_reached = False

        # Load obstacles
        map_yaml = self.get_parameter('map_yaml').value
        obstacles_file = self.get_parameter('obstacles_file').value
        if map_yaml:
            self.obstacles = self._load_obstacles_from_map(map_yaml)
        elif obstacles_file:
            self.obstacles = self._load_obstacles_csv(obstacles_file)
        else:
            self.obstacles = np.empty((0, 2))

        # Subscribers
        self.odom_sub = self.create_subscription(
            Odometry, '/odom', self._odom_callback, 10
        )
        # Listen to the simulator's obstacle markers so map switches done
        # in the sim UI propagate here without needing a restart.
        self.markers_sub = self.create_subscription(
            MarkerArray, '/markers', self._markers_callback, 10
        )

        # Publishers
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.predicted_path_pub = self.create_publisher(
            Path, '/dwa/predicted_path', 10
        )
        self.goal_pub = self.create_publisher(PoseStamped, '/dwa/goal', 10)

        self.timer = self.create_timer(1.0 / frequency, self._plan_step)

        self.get_logger().info(
            f'DWA planner started — goal: ({goal_x}, {goal_y}), '
            f'{len(self.obstacles)} obstacles'
        )

    # ── Obstacle updates from the simulator ──────────────────────────

    def _markers_callback(self, msg: MarkerArray) -> None:
        """Rebuild ``self.obstacles`` from the simulator's ``/markers`` topic."""
        points = [
            (float(m.pose.position.x), float(m.pose.position.y))
            for m in msg.markers if m.ns == 'obstacles'
        ]
        new_obstacles = (
            np.array(points, dtype=float) if points else np.empty((0, 2))
        )
        if (new_obstacles.shape == self.obstacles.shape
                and np.array_equal(new_obstacles, self.obstacles)):
            return
        self.obstacles = new_obstacles
        self.get_logger().info(
            f'Obstacle set updated from /markers: {len(new_obstacles)} points'
        )

    # ── Obstacle loading ─────────────────────────────────────────────

    def _load_obstacles_csv(self, filepath: str) -> np.ndarray:
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
        return np.array(points) if points else np.empty((0, 2))

    def _load_obstacles_from_map(self, yaml_path: str) -> np.ndarray:
        if not os.path.isfile(yaml_path):
            self.get_logger().error(f'Map YAML not found: {yaml_path}')
            return np.empty((0, 2))
        with open(yaml_path, 'r') as f:
            cfg = yaml.safe_load(f)
        image_path = os.path.join(
            os.path.dirname(yaml_path), cfg.get('image', '')
        )
        resolution = float(cfg.get('resolution', 1.0))
        origin = cfg.get('origin', [0.0, 0.0])
        ox, oy = float(origin[0]), float(origin[1])

        if not os.path.isfile(image_path):
            self.get_logger().error(f'Map image not found: {image_path}')
            return np.empty((0, 2))
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            return np.empty((0, 2))

        h, w = img.shape[:2]
        points = []
        if len(img.shape) > 2 and img.shape[2] == 4:
            alpha = img[:, :, 3]
            for row in range(h):
                for col in range(w):
                    if alpha[row, col] > 0:
                        points.append([
                            ox + col * resolution,
                            oy + (h - 1 - row) * resolution,
                        ])
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) > 2 else img
            for row in range(h):
                for col in range(w):
                    if gray[row, col] < 128:
                        points.append([
                            ox + col * resolution,
                            oy + (h - 1 - row) * resolution,
                        ])
        self.get_logger().info(f'Loaded {len(points)} obstacles from map')
        return np.array(points) if points else np.empty((0, 2))

    # ── ROS2 callbacks ───────────────────────────────────────────────

    def _odom_callback(self, msg: Odometry):
        q = msg.pose.pose.orientation
        yaw = math.atan2(
            2.0 * (q.w * q.z + q.x * q.y),
            1.0 - 2.0 * (q.y * q.y + q.z * q.z),
        )
        self.state = np.array([
            msg.pose.pose.position.x,
            msg.pose.pose.position.y,
            yaw,
            msg.twist.twist.linear.x,
            msg.twist.twist.angular.z,
        ])

    def _plan_step(self):
        self._publish_goal()

        if self.state is None or self.goal_reached:
            return

        dist = math.hypot(
            self.state[0] - self.goal[0],
            self.state[1] - self.goal[1],
        )
        if dist < self.goal_tolerance:
            self.goal_reached = True
            self.get_logger().info('Goal reached!')
            self._publish_cmd_vel(0.0, 0.0)
            return

        u, pred_traj = self._dwa_control(np.array(self.state), self.goal)
        self._publish_cmd_vel(u[0], u[1])
        self._publish_predicted_path(pred_traj)

    # ── DWA algorithm ────────────────────────────────────────────────

    def _update_motion(self, x, u):
        x[2] += u[1] * self.dt
        x[0] += u[0] * math.cos(x[2]) * self.dt
        x[1] += u[0] * math.sin(x[2]) * self.dt
        x[3] = u[0]
        x[4] = u[1]
        return x

    def _calc_dynamic_window(self, x):
        return [
            max(x[3] - self.max_a * self.dt, self.min_v),
            min(x[3] + self.max_a * self.dt, self.max_v),
            max(x[4] - self.max_d_w * self.dt, self.min_w),
            min(x[4] + self.max_d_w * self.dt, self.max_w),
        ]

    def _calc_trajectory(self, x, v, w):
        x_tmp = np.array(x)
        traj = np.array(x_tmp)
        u = np.array([v, w])
        t = 0.0
        while t <= self.dw_time:
            x_tmp = self._update_motion(x_tmp, u)
            traj = np.vstack((traj, x_tmp))
            t += self.dt
        return traj

    def _heading_cost(self, trajectory, goal):
        dx = goal[0] - trajectory[-1, 0]
        dy = goal[1] - trajectory[-1, 1]
        heading = math.atan2(dy, dx)
        error = heading - trajectory[-1, 2]
        return abs(math.atan2(math.sin(error), math.cos(error)))

    def _obstacle_cost(self, trajectory):
        if len(self.obstacles) == 0:
            return 0.0
        diff_x = trajectory[:, 0] - self.obstacles[:, 0][:, None]
        diff_y = trajectory[:, 1] - self.obstacles[:, 1][:, None]
        dist = np.hypot(diff_x, diff_y)
        if np.any(dist <= self.chassis_radius * 0.5):
            return float('inf')
        return 1.0 / np.min(dist)

    def _dwa_control(self, x, goal):
        dw = self._calc_dynamic_window(x)
        v_range = np.arange(dw[0], dw[1], self.v_res)
        w_range = np.arange(dw[2], dw[3], self.w_res)

        min_cost = float('inf')
        best_u = [0.0, 0.0]
        best_traj = x.reshape(1, -1)

        for v in v_range:
            for w in w_range:
                traj = self._calc_trajectory(x, v, w)
                clearance = self.distance_gain * self._obstacle_cost(traj)
                heading = self.heading_gain * self._heading_cost(traj, goal)
                velocity = self.velocity_gain * abs(self.max_v - traj[-1, 3])
                cost = clearance + heading + velocity

                if cost < min_cost:
                    min_cost = cost
                    best_u = [v, w]
                    best_traj = traj

                    if abs(best_u[0]) < 0.001 and abs(x[3]) < 0.001:
                        best_u[1] = -40.0 * math.pi / 180.0

        return best_u, best_traj

    # ── Publishers ───────────────────────────────────────────────────

    def _publish_cmd_vel(self, v, w):
        msg = Twist()
        msg.linear.x = float(v)
        msg.angular.z = float(w)
        self.cmd_vel_pub.publish(msg)

    def _publish_predicted_path(self, traj):
        msg = Path()
        stamp = self.get_clock().now().to_msg()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        for row in traj:
            pose = PoseStamped()
            pose.header.stamp = stamp
            pose.header.frame_id = 'odom'
            pose.pose.position.x = float(row[0])
            pose.pose.position.y = float(row[1])
            pose.pose.orientation = yaw_to_quaternion(row[2])
            msg.poses.append(pose)
        self.predicted_path_pub.publish(msg)

    def _publish_goal(self):
        msg = PoseStamped()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'odom'
        msg.pose.position.x = float(self.goal[0])
        msg.pose.position.y = float(self.goal[1])
        self.goal_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = DWAPlannerNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
