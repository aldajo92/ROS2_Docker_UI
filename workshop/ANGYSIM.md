# ROS2 Workshop

## 1. ROS2 + Docker
Read [README.md](../README.md) for instructions on how to set up ROS2 with Docker.

## 1. Move to the ANGYSIM branch
git checkout angysim
```
git checkout angy_sim
git submodule update --init --recursive
```

## 2. Build the container
Build the container with the following command:
```
./scripts/build.sh
```

Excute the container with the following command:
```
./scripts/run.sh # <- linux
./scripts/run_mac.sh # <- mac
./scripts/nvidia_run.sh # <- linux with nvidia gpu
```
