import os
from launch import LaunchDescription
import xacro

from ament_index_python.packages import get_package_share_directory, get_package_prefix
from launch.actions import DeclareLaunchArgument, SetEnvironmentVariable, ExecuteProcess
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():

    waver_description_dir = get_package_share_directory('waver_description')

    world_path = os.path.join(
        waver_description_dir,
        'worlds', 'coworking.world'
    )

    model_paths = [
        os.path.join('/usr/share/gazebo-11', 'models')
    ]

    plugin_paths = [
        '/usr/share/gazebo-11'
    ]
    
    model_path_str = ':'.join(model_paths)
    plugin_path_str = ':'.join(plugin_paths)

    gzserver_command = ExecuteProcess(
        cmd=[
            'gzserver',
            '--verbose',
            '-s', 'libgazebo_ros_factory.so',
            '-s', 'libgazebo_ros_init.so',
            world_path
        ],
        output='both',
        additional_env={
            'GAZEBO_MODEL_PATH': model_path_str,
            'GAZEBO_RESOURCE_PATH': '/usr/share/gazebo-11/',
            'GAZEBO_PLUGIN_PATH': plugin_path_str,
            'GAZEBO_MODEL_DATABASE_URI': '',
            'MENGE_RESOURCE_PATH': ''
        }
    )

    gzclient_command = ExecuteProcess(
        cmd=[
            'gzclient',
            '--verbose',
            world_path
        ],
        output='both',
        additional_env={
            'GAZEBO_MODEL_PATH': model_path_str,
            'GAZEBO_RESOURCE_PATH': '/usr/share/gazebo-11/',
            'GAZEBO_PLUGIN_PATH': plugin_path_str
        }
    )

    
    #########################################

    return LaunchDescription([
        gzserver_command,
        gzclient_command
    ])
