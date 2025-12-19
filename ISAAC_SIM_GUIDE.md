# NVIDIA Isaac Sim 5.1.0 - Setup Guide

This project has been configured to use **NVIDIA Isaac Sim 5.1.0** with ROS2 Humble.

## Prerequisites

- NVIDIA GPU with updated drivers
- Docker with NVIDIA Container Toolkit installed
- X11 server access for GUI

> **🤖 Running on Jetson Thor?** See [JETSON_QUICK_START.md](./JETSON_QUICK_START.md) for Jetson-specific setup.

## Setup Instructions

### 1. Build the Docker Image

```bash
./scripts/build.sh
```

**Note:** The first build will download ~30GB Isaac Sim base image. This may take significant time depending on your internet connection.

### 2. Run the Container

For NVIDIA GPU support (required for Isaac Sim):

```bash
./scripts/nvidia_run.sh
```

This script automatically creates persistent directories for:
- `isaac_cache/` - Isaac Sim cache files
- `isaac_logs/` - Application logs
- `isaac_data/` - User data and settings

### 3. Open Additional Terminal Sessions

```bash
./scripts/bash.sh
```

Or execute commands directly:

```bash
./scripts/bash.sh "ros2 topic list"
```

## Isaac Sim Features

Isaac Sim 5.1.0 includes:
- **ROS2 Humble** pre-installed
- **Omniverse** simulation environment
- **Physics simulation** (PhysX)
- **Sensor simulation** (cameras, lidars, IMU, etc.)
- **Robot simulation** capabilities
- **Isaac SDK** integration
- **Python API** for automation

## ROS2 Distribution

This configuration uses **ROS2 Jazzy**, which is the official ROS2 distribution for **Ubuntu 24.04 (Noble)**. 

**Important Notes:**
- Isaac Sim 5.1.0 internally uses ROS2 Humble
- The container is configured with ROS2 Jazzy for additional packages (compatible with Ubuntu 24.04)
- Additional packages installed: `navigation2`, `slam_toolbox`, `cv_bridge`, `robot_state_publisher`, `joint_state_publisher`, `teleop_twist_keyboard`, and more
- Your custom ROS2 packages in `ros2_ws` will use Jazzy

This dual setup allows you to leverage both Isaac Sim's capabilities and modern ROS2 packages.

## Launching Isaac Sim

Inside the container, you can launch Isaac Sim with:

```bash
/isaac-sim/isaac-sim.sh
```

## ROS2 Integration

Isaac Sim has native ROS2 support. Your ROS2 workspace at `~/ros2_ws` is mounted and accessible.

Use the custom aliases:
- `bros2` - Build ROS2 workspace
- `sros2` - Source ROS2 workspace

## Environment Variables

The following Isaac Sim variables are pre-configured:
- `ACCEPT_EULA=Y` - Automatically accept EULA
- `OMNI_SERVER=localhost`
- `OMNI_USER=admin`
- `OMNI_PASS=admin`

## Troubleshooting

### GPU Not Detected

Verify NVIDIA container toolkit:
```bash
docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
```

### Display Issues

Ensure X11 forwarding is enabled:
```bash
xhost +local:docker
```

### Permission Issues

The container user is created with your host UID/GID to avoid permission conflicts with mounted volumes.

## Resources

- [Isaac Sim Documentation](https://docs.omniverse.nvidia.com/isaacsim/latest/index.html)
- [Isaac Sim ROS2 Tutorials](https://docs.omniverse.nvidia.com/isaacsim/latest/ros2_tutorials.html)
- [Omniverse Forum](https://forums.developer.nvidia.com/c/omniverse/)

## Notes

- The Isaac Sim base image includes many pre-installed packages
- Additional ROS2 packages (navigation2, slam_toolbox, etc.) have been added
- The container runs with full GPU access for optimal performance

