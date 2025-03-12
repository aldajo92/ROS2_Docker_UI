from setuptools import setup

package_name = 'waver_cv'

setup(
    name=package_name,
    version='0.0.1',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    author='Tu Nombre',
    author_email='tu.email@example.com',
    maintainer='Tu Nombre',
    maintainer_email='tu.email@example.com',
    description='Nodo ROS 2 para detección de personas con YOLO',
    license='License declaration',
    entry_points={
        'console_scripts': [
            'yolo_person_detector = waver_cv.yolo_person_detector:main'
        ],
    },
)
