import os
from launch_ros.actions import Node
from launch import LaunchDescription
from launch.substitutions import Command
from launch.actions import DeclareLaunchArgument
from ament_index_python.packages import get_package_share_directory
from launch.substitutions import LaunchConfiguration

def generate_launch_description():
    use_sim_time = LaunchConfiguration('use_sim_time', default='false')

    xacro_file = os.path.join(
        get_package_share_directory('waver_description'),
        'urdf',
        'waver.xacro'
    )

    # Load the URDF file (change to xacro if needed)
    # doc = xacro.process_file(xacro_file)
    # robot_desc = doc.toprettyxml(indent='  ')

    # Robot State Publisher
    robot_state_publisher = Node(package='robot_state_publisher',
                                 executable='robot_state_publisher',
                                 name='robot_state_publisher',
                                 output='both',
                                 parameters=[{
                                     'robot_description': Command(['xacro ', xacro_file])
                                     }])

    # Joint State Publisher GUI (optional, for interactive joint control)
    joint_state_publisher_gui = Node(
        package='joint_state_publisher_gui',
        executable='joint_state_publisher_gui',
        output='screen'
    )

    # Rviz Configuration
    rviz_config_file = os.path.join(
        get_package_share_directory('waver_description'),
        'rviz',
        'config.rviz'
    )

    rviz = Node(
        package="rviz2",
        executable="rviz2",
        name="rviz2",
        output="screen",
        arguments=["-d", rviz_config_file]
    )

    return LaunchDescription([
        DeclareLaunchArgument('use_sim_time', default_value='false', description='Use simulation (Gazebo) clock'),
        robot_state_publisher,
        joint_state_publisher_gui,  # Only needed for interactive joints
        rviz
    ])
