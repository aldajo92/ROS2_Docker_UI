# angy_sim_topics

Minimal ROS 2 (Humble, `ament_cmake`, C++17) package that publishes two
topics at 1 Hz so you can verify them with `ros2 topic list` and
`ros2 topic echo`.

| Topic                   | Type                   | Description                          |
| ----------------------- | ---------------------- | ------------------------------------ |
| `/demo/string_message`  | `std_msgs/msg/String`  | "Hello from angy_sim_topics #N"      |
| `/demo/counter`         | `std_msgs/msg/Int32`   | Monotonically increasing counter `N` |

A single node (`demo_publisher`) owns both publishers and one wall
timer — no launch file, no parameters, no extra dependencies beyond
`rclcpp` and `std_msgs`.

## Layout

```
angy_sim_topics/
├── CMakeLists.txt
├── package.xml
├── README.md
├── launch/
│   ├── demo_publisher.launch.py
│   └── web_test.launch.py
└── src/
    └── demo_publisher.cpp
```

## Build & run (inside the container)

The commands below are written for the Docker container shipped with
this repo. Open a shell with `./scripts/bash.sh` (from the host) and
run them in `~/ros2_ws`.

```bash
# 1. Build only this package (or drop --packages-select to build all)
cd ~/ros2_ws
colcon build --packages-select angy_sim_topics

# 2. Source the overlay so `ros2 run` can find the executable
source install/setup.bash

# 3a. Start the node directly — keep this terminal open
ros2 run angy_sim_topics demo_publisher

# 3b. …or start it via the bundled Python launch file
ros2 launch angy_sim_topics demo_publisher.launch.py
```

The launch file accepts a few standard overrides:

```bash
# Custom node name, namespace and logger level
ros2 launch angy_sim_topics demo_publisher.launch.py \
    node_name:=demo \
    namespace:=robot1 \
    log_level:=debug
```

With `namespace:=robot1`, the topics become `/robot1/demo/string_message`
and `/robot1/demo/counter`.

Expected log lines:

```
[INFO] [demo_publisher]: demo_publisher up: publishing /demo/string_message and /demo/counter at 1 Hz
[INFO] [demo_publisher]: Published string='Hello from angy_sim_topics #0', counter=0
[INFO] [demo_publisher]: Published string='Hello from angy_sim_topics #1', counter=1
...
```

## Verify the topics

In **another shell** inside the container (`./scripts/bash.sh` again,
then `source ~/ros2_ws/install/setup.bash`):

```bash
# Both topics should appear in the list
ros2 topic list
# Expected (among others):
#   /demo/counter
#   /demo/string_message

# Stream the string topic
ros2 topic echo /demo/string_message
# data: 'Hello from angy_sim_topics #N'

# Stream the counter topic
ros2 topic echo /demo/counter
# data: N
```

You can also confirm the message types:

```bash
ros2 topic info /demo/string_message     # → Type: std_msgs/msg/String
ros2 topic info /demo/counter            # → Type: std_msgs/msg/Int32
```

## Web simulator integration via rosbridge_server

`launch/web_test.launch.py` brings up the demo publisher *and* a
`rosbridge_server` WebSocket bridge in a single command, so the web
app (`ros2_ws/angy_sim_ros2`) can connect over `ws://localhost:9090`.

### One-time setup (inside the container)

`rosbridge_server` is not installed by default in every base image. If
`ros2 pkg prefix rosbridge_server` returns nothing, install it with:

```bash
apt update
apt install -y ros-${ROS_DISTRO}-rosbridge-server
```

### Run the bridge + publisher

```bash
cd ~/ros2_ws
colcon build --packages-select angy_sim_topics
source install/setup.bash

# Default port 9090, listens on all interfaces
ros2 launch angy_sim_topics web_test.launch.py
```

Override the port (and other arguments) when needed:

```bash
ros2 launch angy_sim_topics web_test.launch.py port:=9091

# Restrict the bind address to loopback
ros2 launch angy_sim_topics web_test.launch.py address:=127.0.0.1

# Namespace the demo publisher (topics become /robot1/demo/*)
ros2 launch angy_sim_topics web_test.launch.py namespace:=robot1
```

### Verify

In another shell inside the container:

```bash
source ~/ros2_ws/install/setup.bash

# 1. Topics are flowing
ros2 topic list
#   /demo/counter
#   /demo/string_message
#   /rosout
#   ...

# 2. rosbridge is live (the rosbridge_websocket node spins up rosout)
ros2 node list
#   /demo_publisher
#   /rosbridge_websocket
#   /rosapi

# 3. Port 9090 is bound (port utility may need apt install -y net-tools)
ss -ltn 'sport = :9090' || netstat -ltn | grep 9090
```

### Connect the web app

Set the following environment variables for the Vite dev server (or
edit `ros2_ws/angy_sim_ros2/.env`):

```dotenv
VITE_TRANSPORT_KIND=rosbridge
VITE_ROSBRIDGE_URL=ws://localhost:9090
```

The Connection panel in the web app should switch to **Connected**
within ~1 s and the `/demo/string_message` / `/demo/counter` traffic
becomes visible to any subscribed component.

## One-liner via the host helper

If you prefer to drive everything from the host (without an interactive
shell), the project ships `./scripts/bash.sh`, which runs a command
inside the running container:

```bash
# Build
./scripts/bash.sh "cd ~/ros2_ws && colcon build --packages-select angy_sim_topics"

# Run via `ros2 run`
./scripts/bash.sh "source ~/ros2_ws/install/setup.bash && ros2 run angy_sim_topics demo_publisher"

# Run via `ros2 launch`
./scripts/bash.sh "source ~/ros2_ws/install/setup.bash && ros2 launch angy_sim_topics demo_publisher.launch.py"

# Run the rosbridge web-test composition
./scripts/bash.sh "source ~/ros2_ws/install/setup.bash && ros2 launch angy_sim_topics web_test.launch.py"
```
