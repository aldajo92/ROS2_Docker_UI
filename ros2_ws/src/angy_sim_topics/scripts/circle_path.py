#!/usr/bin/env python3
import rclpy
import threading

from nav_msgs.msg import Path
from geometry_msgs.msg import PoseStamped
import math
import tf_transformations  # Use tf_transformations for quaternion calculations
import time
from builtin_interfaces.msg import Time

def time_ns_to_ros_time(time_ns):
    """
    Convert time in nanoseconds from time.time_ns() to a ROS2 Time message.
    """
    ros_time = Time()
    ros_time.sec = time_ns // 1_000_000_000  # Convert nanoseconds to seconds
    ros_time.nanosec = time_ns % 1_000_000_000  # Remaining nanoseconds
    return ros_time

def create_circle_path(center_x, center_y, radius, angular_velocity, elapsed_time):
    """
    Create a PoseStamped for a point on a circle at a given time.
    """
    # Calculate position on the circle
    x = center_x + radius * math.cos(angular_velocity * elapsed_time)
    y = center_y + radius * math.sin(angular_velocity * elapsed_time)

    # Calculate the tangent direction (yaw) for orientation
    theta = angular_velocity * elapsed_time
    yaw = theta + math.pi / 2

    # Create a PoseStamped message for the calculated position
    pose = PoseStamped()
    pose.header.stamp = time_ns_to_ros_time(time.time_ns())  # Use the converted timestamp here
    pose.header.frame_id = "map"  # Adjust frame if needed
    pose.pose.position.x = x
    pose.pose.position.y = y
    pose.pose.position.z = 0.0

    # Create the quaternion from yaw (theta + π/2 for tangent)
    quaternion = tf_transformations.quaternion_from_euler(0, 0, yaw)

    # Set the orientation based on the tangent direction
    pose.pose.orientation.x = quaternion[0]
    pose.pose.orientation.y = quaternion[1]
    pose.pose.orientation.z = quaternion[2]
    pose.pose.orientation.w = quaternion[3]

    return pose

def publish_path():
    # Initialize the ROS2 node
    node = rclpy.create_node('circle_path_publisher')
    thread = threading.Thread(target=rclpy.spin, args=(node, ), daemon=True)
    thread.start()

    # Create a publisher for the Path message
    pub = node.create_publisher(Path, '/circle_path', 10)

    # Set the rate of publishing
    rate = node.create_rate(10)  # 10 Hz

    # Create a Path message
    path = Path()
    path.header.frame_id = "map"  # Adjust frame if necessary

    # Define circle parameters
    radius = 1.0
    center_x, center_y = 0.0, 0.0
    angular_velocity = 2  # 2 Hz
    start_time = time.time_ns()

    # Total time for a full revolution (2π/ω)
    full_revolution_time = 2 * math.pi / angular_velocity

    while rclpy.ok():
        # Calculate elapsed time
        current_time_ns = time.time_ns()
        elapsed_time = (current_time_ns - start_time)/1e9  # Convert to seconds

        # If a full revolution is completed, reset the path
        if elapsed_time >= full_revolution_time:
            path.poses.clear()  # Clear the path to reset
            start_time = time.time_ns()  # Reset start time
            elapsed_time = 0  # Reset elapsed time

        # Convert current time to ROS2 Time message
        ros_timestamp = time_ns_to_ros_time(current_time_ns)

        # Create a new point on the circle
        pose = create_circle_path(center_x, center_y, radius, angular_velocity, elapsed_time)

        # Add the PoseStamped to the path
        path.poses.append(pose)

        # Update the path timestamp
        path.header.stamp = ros_timestamp

        # Publish the Path message
        pub.publish(path)

        # # Sleep to maintain loop rate
        rate.sleep()

def main(args=None):
    rclpy.init(args=args)

    try:
        # Call the function to publish the path
        publish_path()
    except KeyboardInterrupt:
        pass
    finally:
        # Shutdown and clean up ROS2
        rclpy.shutdown()

if __name__ == '__main__':
    main()
