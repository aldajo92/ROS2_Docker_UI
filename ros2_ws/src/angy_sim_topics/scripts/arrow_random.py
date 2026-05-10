#!/usr/bin/env python3
import rclpy
import threading
import random
import math
from geometry_msgs.msg import PoseArray, Pose
from std_msgs.msg import Header
import numpy as np
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

def generate_pose_in_circle(radius):
    """
    Generate a random Pose within a circle of the given radius.
    """
    # Generate random x, y coordinates with normal distribution
    angle = random.uniform(0, 2 * math.pi)
    r = np.random.normal(loc=radius / 2.0, scale=radius / 4.0)
    r = max(0, min(r, radius))  # Clamp radius within bounds [0, radius]

    # Polar to Cartesian conversion
    x = r * math.cos(angle)
    y = r * math.sin(angle)

    pose = Pose()
    pose.position.x = x
    pose.position.y = y
    pose.position.z = 0.0  # Z is set to 0 for 2D plane

    # Generate random orientation in the XY plane (rotation around Z-axis)
    orientation_angle = random.uniform(0, 2 * math.pi)

    # Convert the orientation to quaternion (rotation around Z-axis)
    pose.orientation.x = 0.0
    pose.orientation.y = 0.0
    pose.orientation.z = math.sin(orientation_angle / 2.0)
    pose.orientation.w = math.cos(orientation_angle / 2.0)

    return pose

def publish_pose_array(radius, pose_count, frequency):
    """
    Publish a PoseArray incrementally, resetting after the specified count.
    """
    # Initialize the ROS2 node
    node = rclpy.create_node('pose_array_publisher')
    thread = threading.Thread(target=rclpy.spin, args=(node, ), daemon=True)
    thread.start()

    # Publisher for PoseArray
    pub = node.create_publisher(PoseArray, '/pose_array', 10)

    # Set the rate of publishing
    rate = node.create_rate(frequency)

    # Initialize PoseArray
    pose_array = PoseArray()
    pose_array.header = Header()
    pose_array.header.frame_id = "map"

    # Main loop for publishing
    while rclpy.ok():
        for i in range(pose_count):
            # Generate a single new pose
            new_pose = generate_pose_in_circle(radius)
            pose_array.poses.append(new_pose)

            # Update the header timestamp
            pose_array.header.stamp = time_ns_to_ros_time(time.time_ns())

            # Publish the updated PoseArray
            pub.publish(pose_array)

            # Sleep to maintain the desired frequency
            rate.sleep()

        # Reset the PoseArray after reaching the pose count
        pose_array.poses.clear()

def main(args=None):
    rclpy.init(args=args)

    try:
        # Set parameters for the circle
        radius = 1.0           # Radius of the circle
        pose_count = 100       # Number of poses to publish before restarting
        frequency = 10         # Publishing frequency in Hz

        publish_pose_array(radius, pose_count, frequency)
    except KeyboardInterrupt:
        pass
    finally:
        # Shutdown ROS2
        rclpy.shutdown()

if __name__ == '__main__':
    main()
