import math
import os

import cv2
import numpy as np
import yaml

import rclpy
from rclpy.node import Node
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from geometry_msgs.msg import Twist, PoseStamped, Quaternion
from nav_msgs.msg import Odometry, Path

from car_sim_pygame_msgs.action import NavigateToGoal


def yaw_to_quaternion(yaw):
    return Quaternion(
        x=0.0, y=0.0,
        z=math.sin(yaw / 2.0),
        w=math.cos(yaw / 2.0),
    )


class DWAActionServerNode(Node):
    def __init__(self):
        super().__init__('dwa_action_server_node')

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
        self.declare_parameter('heading_gain', 0.2)
        self.declare_parameter('velocity_gain', 1.0)
        self.declare_parameter('distance_gain', 1.7)
        self.declare_parameter('frequency', 10.0)
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
        self.frequency = self.get_parameter('frequency').value

        map_yaml = self.get_parameter('map_yaml').value
        obstacles_file = self.get_parameter('obstacles_file').value
        if map_yaml:
            self.obstacles = self._load_obstacles_from_map(map_yaml)
        elif obstacles_file:
            self.obstacles = self._load_obstacles_csv(obstacles_file)
        else:
            self.obstacles = np.empty((0, 2))

        self.state = None

        self.cb_group = ReentrantCallbackGroup()

        self.odom_sub = self.create_subscription(
            Odometry, '/odom', self._odom_callback, 10,
            callback_group=self.cb_group,
        )
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.predicted_path_pub = self.create_publisher(
            Path, '/dwa/predicted_path', 10
        )
        self.goal_pub = self.create_publisher(PoseStamped, '/dwa/goal', 10)

        self._action_server = ActionServer(
            self,
            NavigateToGoal,
            'navigate_to_goal',
            execute_callback=self._execute_callback,
            goal_callback=self._goal_callback,
            cancel_callback=self._cancel_callback,
            callback_group=self.cb_group,
        )

        self.get_logger().info(
            f'DWA action server ready — {len(self.obstacles)} obstacles loaded'
        )

    # ── Obstacle loading (same as dwa_planner_node) ──────────────────

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

    # ── Odom callback ────────────────────────────────────────────────

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

    # ── Action callbacks ─────────────────────────────────────────────

    def _goal_callback(self, goal_request):
        self.get_logger().info(
            f'Goal received: ({goal_request.goal_x:.2f}, '
            f'{goal_request.goal_y:.2f}), tol={goal_request.goal_tolerance:.2f}'
        )
        return GoalResponse.ACCEPT

    def _cancel_callback(self, goal_handle):
        self.get_logger().info('Goal cancel requested')
        return CancelResponse.ACCEPT

    def _execute_callback(self, goal_handle):
        goal = np.array([goal_handle.request.goal_x, goal_handle.request.goal_y])
        tolerance = goal_handle.request.goal_tolerance
        self.get_logger().info(
            f'Executing: navigate to ({goal[0]:.2f}, {goal[1]:.2f})'
        )

        feedback_msg = NavigateToGoal.Feedback()
        rate = self.create_rate(self.frequency)

        while rclpy.ok():
            if goal_handle.is_cancel_requested:
                goal_handle.canceled()
                self._stop_robot()
                self.get_logger().info('Goal canceled')
                result = NavigateToGoal.Result()
                result.success = False
                if self.state is not None:
                    result.final_x = float(self.state[0])
                    result.final_y = float(self.state[1])
                    result.final_distance = float(math.hypot(
                        self.state[0] - goal[0], self.state[1] - goal[1]
                    ))
                return result

            if self.state is None:
                rate.sleep()
                continue

            dist = math.hypot(
                self.state[0] - goal[0], self.state[1] - goal[1]
            )

            if dist < tolerance:
                self._stop_robot()
                goal_handle.succeed()
                self.get_logger().info(f'Goal reached (d={dist:.3f}m)')
                result = NavigateToGoal.Result()
                result.success = True
                result.final_distance = float(dist)
                result.final_x = float(self.state[0])
                result.final_y = float(self.state[1])
                return result

            u, pred_traj = self._dwa_control(np.array(self.state), goal)
            self._publish_cmd_vel(u[0], u[1])
            self._publish_predicted_path(pred_traj)
            self._publish_goal(goal)

            feedback_msg.distance_to_goal = float(dist)
            feedback_msg.current_x = float(self.state[0])
            feedback_msg.current_y = float(self.state[1])
            feedback_msg.current_yaw = float(self.state[2])
            feedback_msg.current_v = float(self.state[3])
            feedback_msg.current_w = float(self.state[4])
            goal_handle.publish_feedback(feedback_msg)

            rate.sleep()

        self._stop_robot()
        result = NavigateToGoal.Result()
        result.success = False
        return result

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

    def _stop_robot(self):
        self._publish_cmd_vel(0.0, 0.0)

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

    def _publish_goal(self, goal):
        msg = PoseStamped()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'odom'
        msg.pose.position.x = float(goal[0])
        msg.pose.position.y = float(goal[1])
        self.goal_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = DWAActionServerNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
