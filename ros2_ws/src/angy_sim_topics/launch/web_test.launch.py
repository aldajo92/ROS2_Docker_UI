"""Compose the angy_sim_topics demo_publisher with rosbridge_server.

This is the entry point used to smoke-test the web app's
`rosbridge` transport against a real ROS 2 graph:

    apt update
    apt install -y ros-${ROS_DISTRO}-rosbridge-server

    colcon build --packages-select angy_sim_topics
    source install/setup.bash
    ros2 launch angy_sim_topics web_test.launch.py

The browser then connects with:

    VITE_TRANSPORT_KIND=rosbridge
    VITE_ROSBRIDGE_URL=ws://localhost:9090

The launch file spawns two things:

    1. The `demo_publisher` node from this package (publishes the
       canonical /demo/string_message and /demo/counter topics).
    2. The standard `rosbridge_websocket_launch.xml` shipped by
       `rosbridge_server` (no SSL, no compression, defaults
       otherwise) plus its companion `rosapi` node. We include the
       upstream XML file rather than hand-rolling the websocket node
       so behavior tracks `rosbridge_server` releases automatically.

Configurable arguments (all optional):

    port             rosbridge WebSocket port. Default: 9090.
    address          Bind address for the WebSocket. Default: ''
                     (listen on all interfaces, friendly to Docker
                     `--network host` deployments).
    node_name        Name to register the demo_publisher node under.
    namespace        Optional ROS namespace for demo_publisher.
    log_level        rclcpp log level for demo_publisher.
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description() -> LaunchDescription:
    # ----- Launch arguments -------------------------------------------------
    port_arg = DeclareLaunchArgument(
        "port",
        default_value="9090",
        description="WebSocket port for rosbridge_server (default 9090).",
    )
    address_arg = DeclareLaunchArgument(
        "address",
        default_value="",
        description=(
            "Bind address for the WebSocket. Empty string (default) "
            "binds to all interfaces, which is what you want when "
            "running inside Docker with --network host so the host "
            "browser can reach ws://localhost:<port>."
        ),
    )
    node_name_arg = DeclareLaunchArgument(
        "node_name",
        default_value="demo_publisher",
        description="Name to register the demo_publisher node under.",
    )
    namespace_arg = DeclareLaunchArgument(
        "namespace",
        default_value="",
        description=(
            "Optional ROS namespace for demo_publisher. Topics /demo/* "
            "become /<namespace>/demo/* when set."
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

    # ----- Include rosbridge_websocket_launch.xml --------------------------
    # We resolve the upstream launch file via FindPackageShare so this
    # works against any ros-${ROS_DISTRO}-rosbridge-server install
    # (humble, iron, jazzy, …) — no hard-coded paths.
    rosbridge_launch_path = PathJoinSubstitution(
        [
            FindPackageShare("rosbridge_server"),
            "launch",
            "rosbridge_websocket_launch.xml",
        ]
    )
    rosbridge_include = IncludeLaunchDescription(
        # `AnyLaunchDescriptionSource` accepts XML/YAML/Python launch
        # files transparently, so the include keeps working if
        # rosbridge ever switches its bundled launch format.
        AnyLaunchDescriptionSource(rosbridge_launch_path),
        launch_arguments={
            "port": LaunchConfiguration("port"),
            "address": LaunchConfiguration("address"),
        }.items(),
    )

    # ----- Demo publisher node ---------------------------------------------
    demo_publisher_node = Node(
        package="angy_sim_topics",
        executable="demo_publisher",
        name=LaunchConfiguration("node_name"),
        namespace=LaunchConfiguration("namespace"),
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
            port_arg,
            address_arg,
            node_name_arg,
            namespace_arg,
            log_level_arg,
            rosbridge_include,
            demo_publisher_node,
        ]
    )
