#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from nav_msgs.msg import Path
from geometry_msgs.msg import PoseStamped
import math

class CirclePathPublisher(Node):

    def __init__(self):
        super().__init__('circle_wave_publisher')

        # Create a publisher for the Path message
        self.publisher_ = self.create_publisher(Path, '/circle_wave', 10)

        # Set the timer to control the loop rate (50Hz)
        self.timer = self.create_timer(0.02, self.publish_circle_path)

        # Initial radius
        self.radius = 0.05

    def create_circle_path(self, radius):
        # Create a Path message
        path = Path()
        path.header.frame_id = "map"  # Adjust the frame if necessary

        # Define circle parameters
        center_x, center_y = 0.0, 0.0  # Center of the circle
        num_points = 100  # Number of points to define the circle

        # Generate the points of the circle
        for i in range(num_points+1):
            # Calculate angle for each point (divide the circle into equal segments)
            angle = 2 * math.pi * i / num_points
            
            # Calculate the x and y position for the point on the circle
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)

            # Create a PoseStamped message for each point
            pose = PoseStamped()
            pose.header.stamp = self.get_clock().now().to_msg()
            pose.header.frame_id = "base_footprint"
            pose.pose.position.x = x
            pose.pose.position.y = y
            pose.pose.position.z = 0.0
            
            # Set the orientation (optional, using identity quaternion)
            pose.pose.orientation.x = 0.0
            pose.pose.orientation.y = 0.0
            pose.pose.orientation.z = 0.0
            pose.pose.orientation.w = 1.0

            # Add the pose to the path
            path.poses.append(pose)

        return path

    def publish_circle_path(self):
        # Create the circular path for the current radius
        path = self.create_circle_path(radius=self.radius)
        
        # Update the header timestamp for the Path
        path.header.stamp = self.get_clock().now().to_msg()

        # Publish the path
        self.publisher_.publish(path)

        # Increment the radius for the next iteration
        self.radius += 0.05

        if self.radius > 5.0:
            self.radius = 0.5

def main(args=None):
    rclpy.init(args=args)
    
    # Create the node
    circle_publisher = CirclePathPublisher()

    try:
        # Spin the node to keep it alive
        rclpy.spin(circle_publisher)
    except KeyboardInterrupt:
        pass
    finally:
        # Shutdown the ROS2 system
        circle_publisher.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
