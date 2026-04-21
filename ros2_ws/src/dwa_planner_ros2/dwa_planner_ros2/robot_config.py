import numpy as np


class Parameters:
    def __init__(self) -> None:
        # Kinematic constraints
        self.max_a = 0.2
        self.max_d_w = 0.7
        self.max_v = 1.0
        self.min_v = -0.5
        self.max_w = 0.7
        self.min_w = -0.7

        # Discretization
        self.dt = 0.1
        self.v_res = 0.01
        self.w_res = 0.00175

        # Robot
        self.chassis_radius = 1.0

        # Dynamic window
        self.dw_time = 3.0
        self.heading_gain = 0.2
        self.velocity_gain = 1.0
        self.distance_gain = 1.7

        # Obstacles in the X and Y coordinates
        self.obstacles = np.array([
            [1.6, 2.3],
            [3.0, 3.0],
            [2.0, 7.0],
            [3.0, 5.5],
            [6.0, 4.2],
            [6.0, 8.3],
            [7.0, 1.5],
            [8.0, 6.0]
        ])
