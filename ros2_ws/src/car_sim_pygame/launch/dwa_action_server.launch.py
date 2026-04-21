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

    map_yaml_arg = DeclareLaunchArgument(
        'map_yaml', default_value=default_map_yaml,
        description='Path to map YAML (overrides obstacles_file)')
    obstacles_file_arg = DeclareLaunchArgument(
        'obstacles_file', default_value=default_obstacles,
        description='Path to obstacles CSV file')

    # Simulator args
    initial_x_arg = DeclareLaunchArgument('initial_x', default_value='0.0')
    initial_y_arg = DeclareLaunchArgument('initial_y', default_value='0.0')
    initial_yaw_arg = DeclareLaunchArgument(
        'initial_yaw', default_value='3.14159')
    sim_freq_arg = DeclareLaunchArgument('sim_frequency', default_value='20.0')
    chassis_radius_sim_arg = DeclareLaunchArgument(
        'chassis_radius_sim', default_value='0.25')
    trail_arg = DeclareLaunchArgument('trail_length', default_value='500')
    ppm_arg = DeclareLaunchArgument('pixels_per_meter', default_value='60.0')
    noise_arg = DeclareLaunchArgument(
        'odom_noise_sigma', default_value='0.0',
        description='Std-dev of Gaussian noise added to published odometry (x, y, yaw)')

    # DWA action server args
    dwa_freq_arg = DeclareLaunchArgument('dwa_frequency', default_value='10.0')
    heading_arg = DeclareLaunchArgument('heading_gain', default_value='0.2')
    velocity_arg = DeclareLaunchArgument('velocity_gain', default_value='1.0')
    distance_arg = DeclareLaunchArgument('distance_gain', default_value='1.7')
    max_v_arg = DeclareLaunchArgument('max_v', default_value='1.0')
    min_v_arg = DeclareLaunchArgument('min_v', default_value='-0.5')
    max_w_arg = DeclareLaunchArgument('max_w', default_value='0.7')
    min_w_arg = DeclareLaunchArgument('min_w', default_value='-0.7')
    max_a_arg = DeclareLaunchArgument('max_a', default_value='0.2')
    max_d_w_arg = DeclareLaunchArgument('max_d_w', default_value='0.7')
    chassis_radius_dwa_arg = DeclareLaunchArgument(
        'chassis_radius_dwa', default_value='1.0')
    dw_time_arg = DeclareLaunchArgument('dw_time', default_value='3.0')

    sim_node = Node(
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
            'frequency': LaunchConfiguration('sim_frequency'),
            'chassis_radius': LaunchConfiguration('chassis_radius_sim'),
            'trail_length': LaunchConfiguration('trail_length'),
            'stop_on_release': False,
            'pixels_per_meter': LaunchConfiguration('pixels_per_meter'),
            'odom_noise_sigma': LaunchConfiguration('odom_noise_sigma'),
        }],
    )

    action_server_node = Node(
        package='car_sim_pygame',
        executable='dwa_action_server_node',
        name='dwa_action_server_node',
        output='screen',
        parameters=[{
            'map_yaml': LaunchConfiguration('map_yaml'),
            'obstacles_file': LaunchConfiguration('obstacles_file'),
            'frequency': LaunchConfiguration('dwa_frequency'),
            'heading_gain': LaunchConfiguration('heading_gain'),
            'velocity_gain': LaunchConfiguration('velocity_gain'),
            'distance_gain': LaunchConfiguration('distance_gain'),
            'max_v': LaunchConfiguration('max_v'),
            'min_v': LaunchConfiguration('min_v'),
            'max_w': LaunchConfiguration('max_w'),
            'min_w': LaunchConfiguration('min_w'),
            'max_a': LaunchConfiguration('max_a'),
            'max_d_w': LaunchConfiguration('max_d_w'),
            'chassis_radius': LaunchConfiguration('chassis_radius_dwa'),
            'dw_time': LaunchConfiguration('dw_time'),
        }],
    )

    return LaunchDescription([
        map_yaml_arg,
        obstacles_file_arg,
        initial_x_arg,
        initial_y_arg,
        initial_yaw_arg,
        sim_freq_arg,
        chassis_radius_sim_arg,
        trail_arg,
        ppm_arg,
        noise_arg,
        dwa_freq_arg,
        heading_arg,
        velocity_arg,
        distance_arg,
        max_v_arg,
        min_v_arg,
        max_w_arg,
        min_w_arg,
        max_a_arg,
        max_d_w_arg,
        chassis_radius_dwa_arg,
        dw_time_arg,
        sim_node,
        action_server_node,
    ])
