#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from cv_bridge import CvBridge
import numpy as np

def generate_random_image(width, height):
    """ Generate a random color image of specified size. """
    return np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)

class ImagePublisher(Node):
    def __init__(self):
        super().__init__('image_publisher')

        # Publisher for the random image
        self.image_pub = self.create_publisher(Image, '/random_image', 10)

        # CvBridge for OpenCV to ROS2 Image message conversion
        self.bridge = CvBridge()

        # Timer to control the publishing rate (10 Hz)
        self.timer = self.create_timer(0.1, self.publish_random_image)

    def publish_random_image(self):
        """ Generate a random image and publish it. """
        random_img = generate_random_image(640, 480)  # Generate a 640x480 random image
        image_message = self.bridge.cv2_to_imgmsg(random_img, "bgr8")  # Convert to ROS2 Image message
        self.image_pub.publish(image_message)
        # self.get_logger().info('Published a random image.')

def main(args=None):
    rclpy.init(args=args)

    try:
        node = ImagePublisher()
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        rclpy.shutdown()

if __name__ == '__main__':
    main()
