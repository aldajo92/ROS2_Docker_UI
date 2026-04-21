# car_sim_pygame

2D car simulation with Pygame visualization, controlled via `teleop_twist_keyboard`.

## Dependencies

- ROS2 Humble
- `python3-pygame`
- `python3-opencv` (via `ros-humble-cv-bridge`)
- `python3-yaml`
- `teleop_twist_keyboard` (for manual control)

## Build

```bash
cd ~/ros2_ws
colcon build --packages-select car_sim_pygame
source install/setup.bash
```

## Run

### Using the launch file (recommended)

Load obstacles from a PNG map:

```bash
ros2 launch car_sim_pygame car_sim_pygame.launch.py
```

Override parameters at launch:

```bash
ros2 launch car_sim_pygame car_sim_pygame.launch.py \
  initial_x:=10.0 \
  initial_y:=15.0 \
  pixels_per_meter:=25.0
```

Load obstacles from a CSV file instead of the map image:

```bash
ros2 launch car_sim_pygame car_sim_pygame.launch.py map_yaml:=""
```

### Running the node directly

```bash
ros2 run car_sim_pygame car_sim_pygame_node --ros-args \
  -p map_yaml:=/path/to/map.yaml \
  -p initial_x:=15.0 \
  -p initial_y:=17.0
```

### Teleop control

In a separate terminal, run the teleop node to drive the car:

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard
```

Keyboard controls: `i` forward, `,` backward, `j`/`l` rotate, `u`/`o`/`m`/`.` combined movement, `k` stop.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `initial_x` | float | `0.0` | Start position X (meters) |
| `initial_y` | float | `0.0` | Start position Y (meters) |
| `initial_yaw` | float | `0.0` | Start heading (radians) |
| `frequency` | float | `20.0` | Simulation loop rate (Hz) |
| `chassis_radius` | float | `0.25` | Robot radius (meters) |
| `trail_length` | int | `500` | Max trajectory trail points |
| `stop_on_release` | bool | `true` | Stop car when no `/cmd_vel` is received |
| `pixels_per_meter` | float | `60.0` | Zoom level for the Pygame view |
| `map_yaml` | string | `""` | Path to map YAML file (overrides `obstacles_file`) |
| `obstacles_file` | string | `""` | Path to obstacles CSV file |

## Topics

### Subscribed

| Topic | Type | Description |
|-------|------|-------------|
| `/cmd_vel` | `geometry_msgs/Twist` | Velocity commands from teleop |

### Published

| Topic | Type | Description |
|-------|------|-------------|
| `/odom` | `nav_msgs/Odometry` | Robot pose and velocity |
| `/trajectory` | `nav_msgs/Path` | Trajectory trail |
| `/markers` | `visualization_msgs/MarkerArray` | Obstacles and robot for RViz |

## Map formats

### PNG map (`map_yaml`)

Provide a YAML file pointing to a PNG image:

```yaml
image: map.png
resolution: 1.0
origin: [0.0, 0.0]
```

- `image`: path to the PNG file (relative to the YAML)
- `resolution`: meters per pixel
- `origin`: world coordinates `[x, y]` of the bottom-left pixel

Non-transparent pixels in the PNG are converted to obstacle points. Each pixel at `(col, row)` maps to world position `(origin_x + col * resolution, origin_y + (height - 1 - row) * resolution)`.

### CSV obstacles (`obstacles_file`)

One obstacle per line with `x, y` coordinates in meters. Lines starting with `#` are comments.

```csv
# Obstacle positions: x, y (meters)
1.6, 2.3
3.0, 3.0
```

## License

MIT
