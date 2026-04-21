import math
import numpy as np
import matplotlib.pyplot as plt

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, PoseStamped, Quaternion
from nav_msgs.msg import Odometry, Path
from visualization_msgs.msg import Marker, MarkerArray

from dwa_planner_ros2.dwa import DWA


def yaw_to_quaternion(yaw):
    return Quaternion(
        x=0.0,
        y=0.0,
        z=math.sin(yaw / 2.0),
        w=math.cos(yaw / 2.0)
    )


class DWAPlannerNode(Node):
    def __init__(self):
        super().__init__('dwa_planner_node')

        self.declare_parameter('goal_x', 10.0)
        self.declare_parameter('goal_y', 10.0)
        self.declare_parameter('initial_x', 0.0)
        self.declare_parameter('initial_y', 0.0)
        self.declare_parameter('initial_yaw', math.pi)
        self.declare_parameter('enable_plot', True)

        goal_x = self.get_parameter('goal_x').value
        goal_y = self.get_parameter('goal_y').value
        initial_x = self.get_parameter('initial_x').value
        initial_y = self.get_parameter('initial_y').value
        initial_yaw = self.get_parameter('initial_yaw').value
        self.enable_plot = self.get_parameter('enable_plot').value

        self.state = np.array([initial_x, initial_y, initial_yaw, 0.0, 0.0])
        self.goal = np.array([goal_x, goal_y])
        self.trajectory = np.array(self.state)
        self.dwa = DWA()
        self.path_found = False

        self.odom_pub = self.create_publisher(Odometry, '/dwa/odom', 10)
        self.cmd_vel_pub = self.create_publisher(Twist, '/dwa/cmd_vel', 10)
        self.predicted_path_pub = self.create_publisher(Path, '/dwa/predicted_path', 10)
        self.trajectory_pub = self.create_publisher(Path, '/dwa/trajectory', 10)
        self.markers_pub = self.create_publisher(MarkerArray, '/dwa/markers', 10)

        if self.enable_plot:
            plt.ion()
            self.fig, self.ax = plt.subplots()

        dt = self.dwa.config_params.dt
        self.timer = self.create_timer(dt, self.simulation_step)

        self.get_logger().info(
            f'DWA Planner started — goal: ({goal_x}, {goal_y}), '
            f'start: ({initial_x}, {initial_y}, yaw={initial_yaw:.2f})'
        )

    def simulation_step(self):
        if self.path_found:
            return

        u_control, pred_trajectory = self.dwa.calculate_ctrl_traj(
            self.state, self.goal
        )
        self.state = self.dwa.update_motion(self.state, u_control)
        self.trajectory = np.vstack((self.trajectory, self.state))

        dist_goal = math.hypot(
            self.state[0] - self.goal[0],
            self.state[1] - self.goal[1]
        )

        stamp = self.get_clock().now().to_msg()
        self._publish_odometry(stamp)
        self._publish_cmd_vel(u_control)
        self._publish_predicted_path(pred_trajectory, stamp)
        self._publish_trajectory(stamp)
        self._publish_markers(stamp)

        if self.enable_plot:
            self._update_plot(pred_trajectory)

        if dist_goal < 1.0:
            self.path_found = True
            self.get_logger().info('Goal reached!')
            if self.enable_plot:
                self.ax.plot(
                    self.trajectory[:, 0], self.trajectory[:, 1], '-r'
                )
                plt.pause(0.001)

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

    def _publish_cmd_vel(self, u):
        msg = Twist()
        msg.linear.x = float(u[0])
        msg.angular.z = float(u[1])
        self.cmd_vel_pub.publish(msg)

    def _publish_predicted_path(self, pred_trajectory, stamp):
        msg = Path()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        for row in pred_trajectory:
            pose = PoseStamped()
            pose.header.stamp = stamp
            pose.header.frame_id = 'odom'
            pose.pose.position.x = float(row[0])
            pose.pose.position.y = float(row[1])
            pose.pose.orientation = yaw_to_quaternion(row[2])
            msg.poses.append(pose)
        self.predicted_path_pub.publish(msg)

    def _publish_trajectory(self, stamp):
        msg = Path()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        for row in self.trajectory:
            pose = PoseStamped()
            pose.header.stamp = stamp
            pose.header.frame_id = 'odom'
            pose.pose.position.x = float(row[0])
            pose.pose.position.y = float(row[1])
            pose.pose.orientation = yaw_to_quaternion(row[2])
            msg.poses.append(pose)
        self.trajectory_pub.publish(msg)

    def _publish_markers(self, stamp):
        marker_array = MarkerArray()

        obstacles = self.dwa.config_params.obstacles
        for i, obs in enumerate(obstacles):
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
        robot.scale.x = 0.5
        robot.scale.y = 0.5
        robot.scale.z = 0.3
        robot.color.r = 0.0
        robot.color.g = 1.0
        robot.color.b = 1.0
        robot.color.a = 1.0
        marker_array.markers.append(robot)

        goal = Marker()
        goal.header.stamp = stamp
        goal.header.frame_id = 'odom'
        goal.ns = 'goal'
        goal.id = 0
        goal.type = Marker.SPHERE
        goal.action = Marker.ADD
        goal.pose.position.x = float(self.goal[0])
        goal.pose.position.y = float(self.goal[1])
        goal.scale.x = 0.5
        goal.scale.y = 0.5
        goal.scale.z = 0.5
        goal.color.b = 1.0
        goal.color.a = 1.0
        marker_array.markers.append(goal)

        self.markers_pub.publish(marker_array)

    # ── Matplotlib visualization ─────────────────────────────────────

    def _update_plot(self, pred_trajectory):
        self.ax.cla()
        self.ax.plot(
            self.goal[0], self.goal[1],
            marker='o', markerfacecolor='blue'
        )
        self.ax.plot(0.0, 0.0, marker='o', markerfacecolor='red')
        self.ax.plot(pred_trajectory[:, 0], pred_trajectory[:, 1])
        self.ax.plot(
            self.dwa.config_params.obstacles[:, 0],
            self.dwa.config_params.obstacles[:, 1],
            'ok'
        )
        robot_body = plt.Circle(
            (self.state[0], self.state[1]), 0.25, color='#00ffff'
        )
        self.ax.add_patch(robot_body)
        self.ax.grid(True)
        self.ax.axis('equal')
        plt.pause(0.001)


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
