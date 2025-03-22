from setuptools import setup

package_name = 'waver_cv'

setup(
    name=package_name,
    version='0.0.1',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
         ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    author='name',
    author_email='email@domain.com',
    maintainer='name',
    maintainer_email='email@domain.com',
    description='Person detection node with YOLOv8 for ROS 2',
    license='License declaration',
    entry_points={
        'console_scripts': [
            'yolo_person_detector = waver_cv.yolo_person_detector:main'
        ],
    },
)
