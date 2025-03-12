import os
from launch_ros.actions import Node
from launch import LaunchDescription
from launch.substitutions import Command
from launch.actions import ExecuteProcess
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

    # Spawn the robot in Gazebo
    spawn_entity_robot = Node(package='gazebo_ros',
                              executable='spawn_entity.py',
                              arguments=['-entity', 'waver', '-topic', 'robot_description'],
                              output='screen')

    # Start Gazebo with my empty world
    world = os.path.join(get_package_share_directory('waver_description'), 'worlds', 'world.world')
    gazebo_node = ExecuteProcess(cmd=['gazebo', '--verbose', world, '-s', 'libgazebo_ros_factory.so'], output='screen')

    return LaunchDescription([
        robot_state_publisher, 
        spawn_entity_robot, 
        gazebo_node
        ])
