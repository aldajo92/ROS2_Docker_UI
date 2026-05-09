cmake_minimum_required(VERSION 3.8)
project(angy_sim_topics)

# C++17 keeps us aligned with the rclcpp ABI shipped in Humble.
if(NOT CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 17)
  set(CMAKE_CXX_STANDARD_REQUIRED ON)
endif()

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(rosgraph_msgs REQUIRED)
find_package(std_msgs REQUIRED)

add_executable(demo_publisher src/demo_publisher.cpp)
ament_target_dependencies(demo_publisher
  rclcpp
  std_msgs
)

add_executable(cmd_vel_sine_clock_publisher src/cmd_vel_sine_clock_publisher.cpp)
ament_target_dependencies(cmd_vel_sine_clock_publisher
  rclcpp
  geometry_msgs
  rosgraph_msgs
)

# Install the executable into `lib/<project>` so `ros2 run` can find it.
install(TARGETS
  demo_publisher
  cmd_vel_sine_clock_publisher
  DESTINATION lib/${PROJECT_NAME}
)

# Install launch files into `share/<project>/launch` so `ros2 launch`
# can discover them.
install(DIRECTORY launch
  DESTINATION share/${PROJECT_NAME}
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  # Skip copyright/cpplint until we add proper headers; matches the
  # convention used by `my_robot` in this workspace.
  set(ament_cmake_copyright_FOUND TRUE)
  set(ament_cmake_cpplint_FOUND TRUE)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
