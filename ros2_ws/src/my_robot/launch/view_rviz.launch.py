import os
from launch_ros.actions import Node
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import Command, LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare
from ament_index_python.packages import get_package_share_directory

def generate_launch_description():
    # Launch arguments
    use_sim_time = LaunchConfiguration('use_sim_time')
    robot_name = LaunchConfiguration('robot_name')

    # Get the URDF file path using substitutions
    urdf_file = PathJoinSubstitution([
        FindPackageShare('my_robot'),
        'urdf',
        [robot_name, '.urdf']
    ])

    # Robot State Publisher - publishes robot description and transforms
    robot_state_publisher = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        name='robot_state_publisher',
        output='screen',
        parameters=[{
            'robot_description': Command(['cat ', urdf_file]),
            'use_sim_time': use_sim_time
        }]
    )

    # Joint State Publisher GUI - for interactive joint control
    joint_state_publisher_gui = Node(
        package='joint_state_publisher_gui',
        executable='joint_state_publisher_gui',
        name='joint_state_publisher_gui',
        output='screen'
    )
    
    # Rviz Configuration
    rviz_config_file = os.path.join(
        get_package_share_directory('my_robot'),
        'rviz',
        'config.rviz'
    )

    # RViz2 - visualization tool
    rviz = Node(
        package="rviz2",
        executable="rviz2",
        name="rviz2",
        output="screen",
        arguments=["-d", rviz_config_file]
        # Note: No specific config file - RViz will start with default configuration
        # You can manually add robot model display and set Fixed Frame to 'base_link'
    )

    return LaunchDescription([
        DeclareLaunchArgument(
            'use_sim_time',
            default_value='false',
            description='Use simulation (Gazebo) clock if true'
        ),
        DeclareLaunchArgument(
            'robot_name',
            default_value='my_robot',
            description='Name of the robot URDF file (without .urdf extension). Options: my_robot, my_pendulum'
        ),
        robot_state_publisher,
        joint_state_publisher_gui,
        rviz
    ])
