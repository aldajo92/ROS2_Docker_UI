import os
from launch_ros.actions import Node
from launch import LaunchDescription
from launch.substitutions import Command
from launch.actions import ExecuteProcess
from launch.actions import DeclareLaunchArgument
from ament_index_python.packages import get_package_share_directory
from launch.substitutions import LaunchConfiguration
from launch.actions import TimerAction

def generate_launch_description():
    use_sim_time = LaunchConfiguration('use_sim_time', default='true')

    xacro_file = os.path.join(
        get_package_share_directory('unal_robot_description'),
        'model',
        'unal_robot.xacro'
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
                                     'use_sim_time': use_sim_time, 'robot_description': Command(['xacro ', xacro_file])
                                     }])

    # Spawn the robot in Gazebo
    spawn_entity_robot = TimerAction(
        period=2.0,  # Wait a couple of seconds
        actions=[
            Node(
                package='gazebo_ros',
                executable='spawn_entity.py',
                arguments=['-entity', 'unal_robot', '-topic', 'robot_description'],
                output='screen'
            )
        ]
    )

    # Start Gazebo with empty world
    gazebo_node = ExecuteProcess(
        cmd=['gazebo', '--verbose',
            '-s', 'libgazebo_ros_init.so',
            '-s', 'libgazebo_ros_factory.so'],
        output='screen'
    )
    
    ## DISABLED: Joint states are published by gazebo 
    # joint_state_publisher = Node(
    #     package='joint_state_publisher',
    #     executable='joint_state_publisher',
    #     output='screen'
    # )
    
    # Rviz Configuration
    rviz_config_file = os.path.join(
        get_package_share_directory('unal_robot_description'),
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
        DeclareLaunchArgument('use_sim_time', default_value='true', description='Use simulation (Gazebo) clock'),
        robot_state_publisher, 
        spawn_entity_robot, 
        gazebo_node,
        # joint_state_publisher, ## DISABLED: Joint states are published by gazebo 
        rviz
        ])
