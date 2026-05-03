"""Launch the angy_sim_topics demo_publisher node.

Equivalent to:

    ros2 run angy_sim_topics demo_publisher

…but with a few common overrides exposed as launch arguments:

    ros2 launch angy_sim_topics demo_publisher.launch.py \\
        node_name:=demo_publisher \\
        namespace:='' \\
        log_level:=info

The node itself takes no ROS parameters today; the arguments below are
the standard rclcpp/launch-time knobs (name, namespace, logger level)
that are useful when running multiple instances or debugging.
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description() -> LaunchDescription:
    node_name_arg = DeclareLaunchArgument(
        "node_name",
        default_value="demo_publisher",
        description="Name to register the demo publisher node under.",
    )
    namespace_arg = DeclareLaunchArgument(
        "namespace",
        default_value="",
        description=(
            "Optional ROS namespace. Topics /demo/* become "
            "/<namespace>/demo/* when set."
        ),
    )
    log_level_arg = DeclareLaunchArgument(
        "log_level",
        default_value="info",
        description=(
            "rclcpp logger level for the demo_publisher node "
            "(debug | info | warn | error | fatal)."
        ),
    )

    demo_publisher_node = Node(
        package="angy_sim_topics",
        executable="demo_publisher",
        name=LaunchConfiguration("node_name"),
        namespace=LaunchConfiguration("namespace"),
        # `output='screen'` so [INFO] lines from the node land in the
        # same terminal as `ros2 launch`. Without it the messages are
        # only routed through /rosout and the launch terminal looks
        # silent.
        output="screen",
        emulate_tty=True,
        arguments=[
            "--ros-args",
            "--log-level",
            LaunchConfiguration("log_level"),
        ],
    )

    return LaunchDescription(
        [
            node_name_arg,
            namespace_arg,
            log_level_arg,
            demo_publisher_node,
        ]
    )
