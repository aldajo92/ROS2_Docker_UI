#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from std_msgs.msg import Float32MultiArray
from cv_bridge import CvBridge, CvBridgeError
import cv2
from ultralytics import YOLO

class YoloPersonDetector(Node):
    def __init__(self):
        super().__init__('yolo_person_detector')
        
        # Declarar parámetros configurables
        # Se establece por defecto que la entrada sea /camera/image_raw, presente en tu entorno.
        # Los tópicos de salida se eligen de manera que no interfieran con tus tópicos actuales.
        self.declare_parameter('confidence_threshold', 0.5)
        self.declare_parameter('input_topic', '/camera/image_raw')
        self.declare_parameter('output_image_topic', '/yolo_persons_detected')
        self.declare_parameter('output_bbox_topic', '/yolo_persons_bboxes')
        self.declare_parameter('model_path', 'yolov8n.pt')
        
        # Obtener los valores de los parámetros
        self.confidence_threshold = self.get_parameter('confidence_threshold').value
        self.input_topic = self.get_parameter('input_topic').value
        self.output_image_topic = self.get_parameter('output_image_topic').value
        self.output_bbox_topic = self.get_parameter('output_bbox_topic').value
        self.model_path = self.get_parameter('model_path').value

        # Inicializar el puente entre ROS y OpenCV
        self.bridge = CvBridge()

        # Crear publicadores para la imagen procesada y las bounding boxes
        self.image_pub = self.create_publisher(Image, self.output_image_topic, 10)
        self.bbox_pub = self.create_publisher(Float32MultiArray, self.output_bbox_topic, 10)

        # Crear el suscriptor al tópico de imágenes
        self.subscription = self.create_subscription(Image, self.input_topic, self.image_callback, 10)

        # Cargar el modelo YOLO
        self.get_logger().info(f'Cargando modelo YOLO desde: {self.model_path}')
        self.model = YOLO(self.model_path)
    
    def image_callback(self, msg):
        try:
            # Convertir el mensaje ROS a una imagen OpenCV (formato BGR)
            cv_image = self.bridge.imgmsg_to_cv2(msg, desired_encoding='bgr8')
        except CvBridgeError as e:
            self.get_logger().error(f'Error al convertir la imagen: {e}')
            return
        
        # Procesar la imagen con el modelo YOLO
        results = self.model(cv_image)
        detections = []  # Lista para almacenar detecciones de personas

        # Iterar sobre los resultados y filtrar detecciones de la clase 'persona' (id 0)
        for result in results:
            # Cada detección tiene el formato [x1, y1, x2, y2, score, class]
            for box in result.boxes.data.cpu().numpy():
                x1, y1, x2, y2, score, cls = box
                if score < self.confidence_threshold:
                    continue
                # Suponemos que la clase 'persona' es la 0 (según el dataset COCO)
                if int(cls) == 0:
                    detections.append([x1, y1, x2, y2, score])
                    # Dibujar la bounding box y la etiqueta en la imagen
                    cv2.rectangle(cv_image, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                    cv2.putText(cv_image, f'Person {score:.2f}', (int(x1), int(y1)-10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Publicar la imagen procesada en el tópico configurado
        try:
            image_msg = self.bridge.cv2_to_imgmsg(cv_image, encoding="bgr8")
            self.image_pub.publish(image_msg)
        except CvBridgeError as e:
            self.get_logger().error(f'Error al publicar imagen: {e}')

        # Publicar las bounding boxes detectadas en formato Float32MultiArray
        bbox_msg = Float32MultiArray()
        # Cada 5 elementos corresponden a [x1, y1, x2, y2, score]
        bbox_msg.data = [item for detection in detections for item in detection]
        self.bbox_pub.publish(bbox_msg)

def main(args=None):
    rclpy.init(args=args)
    node = YoloPersonDetector()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
