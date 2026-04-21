import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    pkg_share = get_package_share_directory('car_sim_pygame')
    default_obstacles = os.path.join(pkg_share, 'map', 'obstacles.csv')
    default_map_yaml = os.path.join(pkg_share, 'map', 'map.yaml')

    return LaunchDescription([
        DeclareLaunchArgument('map_yaml', default_value=default_map_yaml,
                              description='Path to map YAML (overrides obstacles_file)'),
        DeclareLaunchArgument('obstacles_file', default_value=default_obstacles,
                              description='Path to obstacles CSV file'),
        DeclareLaunchArgument('initial_x', default_value='0.0'),
        DeclareLaunchArgument('initial_y', default_value='0.0'),
        DeclareLaunchArgument('initial_yaw', default_value='0.0'),
        DeclareLaunchArgument('frequency', default_value='20.0'),
        DeclareLaunchArgument('chassis_radius', default_value='0.25'),
        DeclareLaunchArgument('trail_length', default_value='500'),
        DeclareLaunchArgument('stop_on_release', default_value='true'),
        DeclareLaunchArgument('pixels_per_meter', default_value='20.0'),

        Node(
            package='car_sim_pygame',
            executable='car_sim_pygame_node',
            name='car_sim_pygame_node',
            output='screen',
            parameters=[{
                'map_yaml': LaunchConfiguration('map_yaml'),
                'obstacles_file': LaunchConfiguration('obstacles_file'),
                'initial_x': LaunchConfiguration('initial_x'),
                'initial_y': LaunchConfiguration('initial_y'),
                'initial_yaw': LaunchConfiguration('initial_yaw'),
                'frequency': LaunchConfiguration('frequency'),
                'chassis_radius': LaunchConfiguration('chassis_radius'),
                'trail_length': LaunchConfiguration('trail_length'),
                'stop_on_release': LaunchConfiguration('stop_on_release'),
                'pixels_per_meter': LaunchConfiguration('pixels_per_meter'),
            }],
        ),
    ])
