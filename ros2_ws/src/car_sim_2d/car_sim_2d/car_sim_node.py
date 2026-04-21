import math
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, PoseStamped, Quaternion
from nav_msgs.msg import Odometry, Path
from visualization_msgs.msg import Marker, MarkerArray


def yaw_to_quaternion(yaw):
    return Quaternion(
        x=0.0,
        y=0.0,
        z=math.sin(yaw / 2.0),
        w=math.cos(yaw / 2.0)
    )


class CarSimNode(Node):
    def __init__(self):
        super().__init__('car_sim_node')

        self.declare_parameter('initial_x', 0.0)
        self.declare_parameter('initial_y', 0.0)
        self.declare_parameter('initial_yaw', 0.0)
        self.declare_parameter('frequency', 20.0)
        self.declare_parameter('chassis_radius', 0.25)
        self.declare_parameter('trail_length', 500)
        self.declare_parameter('stop_on_release', True)

        initial_x = self.get_parameter('initial_x').value
        initial_y = self.get_parameter('initial_y').value
        initial_yaw = self.get_parameter('initial_yaw').value
        frequency = self.get_parameter('frequency').value
        self.dt = 1.0 / frequency
        self.chassis_radius = self.get_parameter('chassis_radius').value
        self.trail_length = self.get_parameter('trail_length').value
        self.stop_on_release = self.get_parameter('stop_on_release').value

        # State: [x, y, yaw, v, w]
        self.state = np.array([
            initial_x, initial_y, initial_yaw, 0.0, 0.0
        ])
        self.cmd_v = 0.0
        self.cmd_w = 0.0
        self.last_cmd_time = self.get_clock().now()
        self.cmd_timeout = 2.0 / frequency

        # Trajectory trail (ring buffer)
        self.trail_x = []
        self.trail_y = []

        # Obstacles (same as dwa_planner for consistency)
        self.obstacles = np.array([
            [1.6, 2.3],
            [3.0, 3.0],
            [2.0, 7.0],
            [3.0, 5.5],
            [6.0, 4.2],
            [6.0, 8.3],
            [7.0, 1.5],
            [8.0, 6.0]
        ])

        # Subscriber
        self.cmd_vel_sub = self.create_subscription(
            Twist, '/cmd_vel', self._cmd_vel_callback, 10
        )

        # Publishers
        self.odom_pub = self.create_publisher(Odometry, '/odom', 10)
        self.trajectory_pub = self.create_publisher(Path, '/trajectory', 10)
        self.markers_pub = self.create_publisher(MarkerArray, '/markers', 10)

        # Matplotlib setup
        plt.ion()
        self.fig, self.ax = plt.subplots(figsize=(8, 8))
        self.fig.canvas.manager.set_window_title('Car Teleop Simulation')

        # Simulation timer
        self.timer = self.create_timer(self.dt, self._simulation_step)

        self.get_logger().info(
            f'Car simulation started at ({initial_x}, {initial_y}) | '
            f'freq={frequency}Hz | '
            f'stop_on_release={self.stop_on_release}'
        )

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

        v = self.cmd_v
        w = self.cmd_w

        self.state[2] += w * self.dt
        self.state[0] += v * math.cos(self.state[2]) * self.dt
        self.state[1] += v * math.sin(self.state[2]) * self.dt
        self.state[3] = v
        self.state[4] = w

        self.trail_x.append(self.state[0])
        self.trail_y.append(self.state[1])
        if len(self.trail_x) > self.trail_length:
            self.trail_x.pop(0)
            self.trail_y.pop(0)

        stamp = self.get_clock().now().to_msg()
        self._publish_odometry(stamp)
        self._publish_trajectory(stamp)
        self._publish_markers(stamp)
        self._update_plot()

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
        for tx, ty in zip(self.trail_x, self.trail_y):
            pose = PoseStamped()
            pose.header.stamp = stamp
            pose.header.frame_id = 'odom'
            pose.pose.position.x = float(tx)
            pose.pose.position.y = float(ty)
            msg.poses.append(pose)
        self.trajectory_pub.publish(msg)

    def _publish_markers(self, stamp):
        marker_array = MarkerArray()

        for i, obs in enumerate(self.obstacles):
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
            marker_array.markers.append(m)

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
        robot.color.r = 0.0
        robot.color.g = 1.0
        robot.color.b = 1.0
        robot.color.a = 1.0
        marker_array.markers.append(robot)

        self.markers_pub.publish(marker_array)

    # ── Matplotlib visualization ─────────────────────────────────────

    def _update_plot(self):
        self.ax.cla()

        # Obstacles
        self.ax.plot(
            self.obstacles[:, 0], self.obstacles[:, 1],
            'ok', markersize=10, label='Obstacles'
        )

        # Trajectory trail
        if len(self.trail_x) > 1:
            self.ax.plot(
                self.trail_x, self.trail_y,
                '-r', linewidth=1.5, alpha=0.6, label='Trail'
            )

        # Robot body
        robot_circle = plt.Circle(
            (self.state[0], self.state[1]),
            self.chassis_radius, color='#00ffff', zorder=5
        )
        self.ax.add_patch(robot_circle)

        # Heading arrow
        arrow_len = self.chassis_radius * 2.0
        dx = arrow_len * math.cos(self.state[2])
        dy = arrow_len * math.sin(self.state[2])
        self.ax.annotate(
            '', xy=(self.state[0] + dx, self.state[1] + dy),
            xytext=(self.state[0], self.state[1]),
            arrowprops=dict(arrowstyle='->', color='red', lw=2)
        )

        # Origin marker
        self.ax.plot(0.0, 0.0, marker='s', color='green', markersize=8)

        # Info text
        self.ax.set_title(
            f'v={self.state[3]:.2f} m/s  '
            f'w={math.degrees(self.state[4]):.1f} deg/s  '
            f'pos=({self.state[0]:.2f}, {self.state[1]:.2f})',
            fontsize=10
        )

        self.ax.set_xlabel('X (m)')
        self.ax.set_ylabel('Y (m)')
        self.ax.grid(True, alpha=0.3)
        self.ax.axis('equal')
        self.ax.legend(loc='upper left', fontsize=8)
        plt.tight_layout()
        plt.pause(0.001)


def main(args=None):
    rclpy.init(args=args)
    node = CarSimNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
