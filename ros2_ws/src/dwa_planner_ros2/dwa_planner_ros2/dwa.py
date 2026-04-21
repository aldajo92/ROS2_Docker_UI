import math
import numpy as np

from dwa_planner_ros2.robot_config import Parameters


class DWA:
    def __init__(self) -> None:
        self.config_params = Parameters()

    def update_motion(self, x: np.array, u: np.array) -> list:
        x[2] += u[1] * self.config_params.dt
        x[0] += u[0] * math.cos(x[2]) * self.config_params.dt
        x[1] += u[0] * math.sin(x[2]) * self.config_params.dt
        x[3] = u[0]
        x[4] = u[1]
        return x

    def calculate_dw(self, x: np.array) -> list:
        dw = [
            max(x[3] - self.config_params.max_a * self.config_params.dt, self.config_params.min_v),
            min(x[3] + self.config_params.max_a * self.config_params.dt, self.config_params.max_v),
            max(x[4] - self.config_params.max_d_w * self.config_params.dt, self.config_params.min_w),
            min(x[4] + self.config_params.max_d_w * self.config_params.dt, self.config_params.max_w)
        ]
        return dw

    def calculate_traj(self, x: np.array, v: float, w: float) -> np.array:
        x_tmp = np.array(x)
        predicted_traj = np.array(x_tmp)
        u = np.array([v, w])
        time = 0.0

        while time <= self.config_params.dw_time:
            x_tmp = self.update_motion(x_tmp, u)
            predicted_traj = np.vstack((predicted_traj, x_tmp))
            time += self.config_params.dt

        return predicted_traj

    def target_heading(self, trajectory: np.array, goal: np.array) -> float:
        pos_x = trajectory[-1, 0]
        pos_y = trajectory[-1, 1]

        diff_x = goal[0] - pos_x
        diff_y = goal[1] - pos_y

        heading = math.atan2(diff_y, diff_x)
        error = heading - trajectory[-1, 2]
        return abs(math.atan2(math.sin(error), math.cos(error)))

    def obstacle_distance(self, trajectory: np.array) -> float:
        obst_x = self.config_params.obstacles[:, 0]
        obst_y = self.config_params.obstacles[:, 1]

        diff_x = trajectory[:, 0] - obst_x[:, None]
        diff_y = trajectory[:, 1] - obst_y[:, None]

        dist = np.array(np.hypot(diff_x, diff_y))

        if np.any(dist <= self.config_params.chassis_radius * 0.5):
            return float("inf")

        min_value = np.min(dist)
        return 1 / min_value

    def calculate_ctrl_traj(self, x: np.array, goal: np.array):
        dw_v = self.calculate_dw(x)

        v_vect = np.arange(dw_v[0], dw_v[1], self.config_params.v_res)
        w_vect = np.arange(dw_v[2], dw_v[3], self.config_params.w_res)

        minimum_cost = float("inf")
        optimal_u = [0.0, 0.0]
        optimal_traj = x

        for v in v_vect:
            for w in w_vect:
                trajectory = self.calculate_traj(x, v, w)
                clearance_cost = self.config_params.distance_gain * self.obstacle_distance(trajectory)
                heading_cost = self.config_params.heading_gain * self.target_heading(trajectory, goal)
                velocity_cost = self.config_params.velocity_gain * abs(self.config_params.max_v - trajectory[-1, 3])

                total_cost = clearance_cost + heading_cost + velocity_cost

                if minimum_cost >= total_cost:
                    minimum_cost = total_cost
                    optimal_u = [v, w]
                    optimal_traj = trajectory

                    if abs(optimal_u[0]) < 0.001 and abs(x[3]) < 0.001:
                        optimal_u[1] = -40.0 * math.pi / 180.0

        return optimal_u, optimal_traj
