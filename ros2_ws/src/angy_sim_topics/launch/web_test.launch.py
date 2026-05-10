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

The launch file spawns:

    1. The `demo_publisher` node from this package (publishes the
       canonical /demo/string_message and /demo/counter topics).
    2. The `cmd_vel_sine_clock_publisher` node from this package
       (publishes /cmd_vel Twist commands driven by /clock).
    3. The standard `rosbridge_websocket_launch.xml` shipped by
       `rosbridge_server` (no SSL, no compression, defaults
       otherwise) plus its companion `rosapi` node. We include the
       upstream XML file rather than hand-rolling the websocket node
       so behavior tracks `rosbridge_server` releases automatically.
    4. A static `world -> map` transform so visualization nodes
       publishing in `frame_id="map"` render correctly.
    5. Four Python visualization nodes (originally from
       `rviz2_visuals`):
         - `arrow_random.py`   -> /pose_array     (PoseArray)
         - `circle_wave.py`    -> /circle_wave    (Path)
         - `circle_path.py`    -> /circle_path    (Path)
         - `image_publisher.py`-> /random_image   (Image)

Configurable arguments (all optional):

    port             rosbridge WebSocket port. Default: 9090.
    address          Bind address for the WebSocket. Default: ''
                     (listen on all interfaces, friendly to Docker
                     `--network host` deployments).
    node_name        Name to register the demo_publisher node under.
    namespace        Optional ROS namespace for demo_publisher.
    log_level        rclcpp log level for demo_publisher.
    cmd_vel_node_name
                     Name to register the cmd_vel sine publisher under.
    linear_velocity_mps
                     Constant linear.x command in meters per second.
    angular_amplitude_radps
                     Sinusoidal angular.z amplitude in radians per second.
    frequency_hz     Sine-wave frequency in hertz.
    cmd_vel_topic    Twist command topic. Default: cmd_vel.
    clock_topic      Clock topic used as the simulation-time source.
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
    cmd_vel_node_name_arg = DeclareLaunchArgument(
        "cmd_vel_node_name",
        default_value="cmd_vel_sine_clock_publisher",
        description="Name to register the cmd_vel sine publisher node under.",
    )
    linear_velocity_arg = DeclareLaunchArgument(
        "linear_velocity_mps",
        default_value="0.5",
        description="Constant linear.x velocity in meters per second.",
    )
    angular_amplitude_arg = DeclareLaunchArgument(
        "angular_amplitude_radps",
        default_value="1.0",
        description="Sinusoidal angular.z amplitude in radians per second.",
    )
    frequency_arg = DeclareLaunchArgument(
        "frequency_hz",
        default_value="0.2",
        description="Sine-wave frequency in hertz.",
    )
    cmd_vel_topic_arg = DeclareLaunchArgument(
        "cmd_vel_topic",
        default_value="cmd_vel",
        description=(
            "Twist command topic. Relative by default so namespaces compose "
            "cleanly."
        ),
    )
    clock_topic_arg = DeclareLaunchArgument(
        "clock_topic",
        default_value="/clock",
        description="Clock topic used as the simulation-time source.",
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

    # ----- /clock-driven cmd_vel publisher node ----------------------------
    cmd_vel_sine_node = Node(
        package="angy_sim_topics",
        executable="cmd_vel_sine_clock_publisher",
        name=LaunchConfiguration("cmd_vel_node_name"),
        namespace=LaunchConfiguration("namespace"),
        output="screen",
        emulate_tty=True,
        parameters=[
            {
                "linear_velocity_mps": LaunchConfiguration("linear_velocity_mps"),
                "angular_amplitude_radps": LaunchConfiguration(
                    "angular_amplitude_radps"
                ),
                "frequency_hz": LaunchConfiguration("frequency_hz"),
                "cmd_vel_topic": LaunchConfiguration("cmd_vel_topic"),
                "clock_topic": LaunchConfiguration("clock_topic"),
            }
        ],
        arguments=[
            "--ros-args",
            "--log-level",
            LaunchConfiguration("log_level"),
        ],
    )

    # ----- Visualization helpers (ported from rviz2_visuals) ---------------
    # Static `world -> map` transform so the visualization nodes below,
    # which publish in `frame_id="map"`, render correctly in RViz/web UI.
    world_to_map_tf = Node(
        package="tf2_ros",
        executable="static_transform_publisher",
        name="map_transform",
        output="screen",
        arguments=["0", "0", "0", "0", "0", "0", "world", "map"],
    )

    arrow_random_node = Node(
        package="angy_sim_topics",
        executable="arrow_random.py",
        name="arrow_random_node",
        output="screen",
    )

    circle_wave_node = Node(
        package="angy_sim_topics",
        executable="circle_wave.py",
        name="circle_wave_node",
        output="screen",
    )

    circle_path_node = Node(
        package="angy_sim_topics",
        executable="circle_path.py",
        name="circle_path_node",
        output="screen",
    )

    image_publisher_node = Node(
        package="angy_sim_topics",
        executable="image_publisher.py",
        name="image_publisher_node",
        output="screen",
    )

    return LaunchDescription(
        [
            port_arg,
            address_arg,
            node_name_arg,
            namespace_arg,
            log_level_arg,
            cmd_vel_node_name_arg,
            linear_velocity_arg,
            angular_amplitude_arg,
            frequency_arg,
            cmd_vel_topic_arg,
            clock_topic_arg,
            rosbridge_include,
            demo_publisher_node,
            cmd_vel_sine_node,
            world_to_map_tf,
            arrow_random_node,
            circle_wave_node,
            circle_path_node,
            image_publisher_node,
        ]
    )
