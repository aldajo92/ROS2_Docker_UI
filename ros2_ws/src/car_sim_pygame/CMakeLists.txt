cmake_minimum_required(VERSION 3.8)
project(car_sim_pygame)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(ament_cmake_python REQUIRED)
find_package(rclpy REQUIRED)

# Install the Python package (car_sim_pygame/) so it is importable
# from any rclpy node (equivalent to what setup.py used to do).
ament_python_install_package(${PROJECT_NAME})

# Install thin wrapper scripts that expose each node as a ros2 run executable.
# These wrappers simply import the corresponding main() from the Python package,
# replicating the behaviour of setup.py console_scripts entry_points.
install(PROGRAMS
  scripts/car_sim_pygame_node
  scripts/dwa_planner_node
  scripts/dwa_action_server_node
  DESTINATION lib/${PROJECT_NAME}
)

# Install launch files and map resources (available via
# ament_index_python.packages.get_package_share_directory).
install(DIRECTORY launch
  DESTINATION share/${PROJECT_NAME}
)

install(DIRECTORY map
  DESTINATION share/${PROJECT_NAME}
)

install(DIRECTORY _sim_assets
  DESTINATION share/${PROJECT_NAME}
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  # Keep the same linters that the ament_python package used.
  set(ament_cmake_copyright_FOUND TRUE)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
