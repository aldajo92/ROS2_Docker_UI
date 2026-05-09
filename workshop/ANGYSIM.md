# ROS2 Workshop

## 1. ROS2 + Docker
Read [README.md](../README.md) for instructions on how to set up ROS2 with Docker.

## 1. Move to the ANGYSIM branch
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
./scripts/macos_run.sh # <- mac
./scripts/nvidia_run.sh # <- linux with nvidia gpu
```

## 3. Run the web application
Once in the container, run the following command to start the web application:
```
cd ~/ros2_ws/angy_sim_ros2
npm install
npm run dev
```

## 4. Open the web application
Open your web browser and navigate to `http://localhost:5173` to access the web application.

## 5. Run the ROS2 nodes
In another terminal, open a bash session in the container:
```
./scripts/bash.sh
```

Then, run the ROS2 nodes:
```
cd ~/ros2_ws/
bros2
```

