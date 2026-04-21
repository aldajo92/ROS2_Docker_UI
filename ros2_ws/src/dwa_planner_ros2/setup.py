from setuptools import find_packages, setup

package_name = 'dwa_planner_ros2'

setup(
    name=package_name,
    version='0.0.1',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools', 'numpy', 'scipy', 'matplotlib'],
    zip_safe=True,
    maintainer='Alejandro Daniel José Gómez Flórez',
    maintainer_email='aldajo92@gmail.com',
    description='ROS2 node for DWA (Dynamic Window Approach) local planner simulation',
    license='MIT',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'dwa_planner_node = dwa_planner_ros2.dwa_planner_node:main',
        ],
    },
)
