import json
import math
import os
import threading
from collections import deque

import cv2
import numpy as np
import pygame
import yaml

import rclpy
from rclpy.node import Node
from ament_index_python.packages import get_package_share_directory
from geometry_msgs.msg import Twist, PoseStamped, Quaternion
from nav_msgs.msg import Odometry, Path
from visualization_msgs.msg import Marker, MarkerArray

WINDOW_W = 800
WINDOW_H = 800
WINDOW_STEP = 100
WINDOW_MIN_PX = 200
WINDOW_MAX_PX = 4096
FONT_BASE_PX = 16
FONT_STEP_PX = 2
SDL_WINDOW_ALWAYS_ON_TOP = 0x00008000


def font_size_for_window(window_w: int) -> int:
    """Derive a HUD font size from the current window width.

    Matches the legacy +/- keybinding where each WINDOW_STEP of width
    bumps the font size by ``FONT_STEP_PX``.
    """
    steps = max(0, (int(window_w) - WINDOW_W) // WINDOW_STEP)
    return FONT_BASE_PX + FONT_STEP_PX * steps

COLOR_BG = (30, 30, 30)
COLOR_GRID = (50, 50, 50)
COLOR_OBSTACLE = (200, 200, 200)
COLOR_ROBOT = (0, 255, 255)
COLOR_HEADING = (255, 60, 60)
COLOR_TRAIL = (255, 80, 80)
COLOR_ORIGIN = (80, 200, 80)
COLOR_HUD_TEXT = (220, 220, 220)
COLOR_PREDICTED_PATH = (100, 200, 255)
COLOR_GOAL = (50, 120, 255)
COLOR_BUTTON_BG = (45, 45, 45)
COLOR_BUTTON_BG_HOVER = (70, 70, 70)
COLOR_BUTTON_BORDER = (120, 120, 120)
COLOR_OVERLAY_BG = (15, 15, 15)
COLOR_OVERLAY_BORDER = (90, 90, 90)
COLOR_ERROR_BORDER = (220, 80, 80)
COLOR_ERROR_TEXT = (255, 120, 120)
COLOR_SNIPPET_TEXT = (170, 210, 170)

# Settings button is a fixed size regardless of zoom.
BUTTON_SIZE_PX = 48
BUTTON_MARGIN_PX = 12

# On-screen joystick (bottom-right). The base scales softly with the window
# so it stays comfortably usable at different window sizes.
JOYSTICK_BASE_RADIUS_PX = 90
JOYSTICK_MIN_BASE_RADIUS_PX = 60
JOYSTICK_MARGIN_PX = 24
JOYSTICK_MAX_V = 1.0   # forward/back scaling applied to knob y-offset
JOYSTICK_MAX_W = 1.0   # yaw-rate scaling applied to knob x-offset

COLOR_JOYSTICK_BASE = (35, 35, 35)
COLOR_JOYSTICK_BASE_BORDER = (110, 110, 110)
COLOR_JOYSTICK_CROSS = (70, 70, 70)
COLOR_JOYSTICK_KNOB = (170, 170, 170)
COLOR_JOYSTICK_KNOB_ACTIVE = (100, 200, 255)
COLOR_JOYSTICK_KNOB_BORDER = (40, 40, 40)
COLOR_CHECKBOX_BG = (45, 45, 45)
COLOR_CHECKBOX_BG_ON = (70, 140, 210)
COLOR_CHECKBOX_BORDER = (120, 120, 120)
COLOR_CHECKBOX_TICK = (240, 240, 240)


class View:
    """Viewport state for the 2D pygame renderer.

    Encapsulates everything the user can manipulate about the camera:
      * ``zoom``         — pixels-per-meter scale (mouse wheel).
      * ``aspect_ratio`` — (x, y) world-unit ratio; kept 1:1 for now.
      * ``drag_offset_*``— world-space offset applied on top of the robot
                           position when middle-dragging.

    Mouse interaction state (``dragging`` / ``drag_last_pos``) also lives
    here so the main event loop only has to forward events to a single
    object.
    """

    ZOOM_MIN = 1.0
    ZOOM_MAX = 500.0
    ZOOM_STEP = 1.1  # multiplicative wheel-zoom factor

    def __init__(self, zoom: float, aspect_ratio=(1, 1),
                 window_w: int = WINDOW_W, window_h: int = WINDOW_H):
        self.zoom_default = float(zoom)
        self.zoom = float(zoom)
        self.aspect_ratio = aspect_ratio  # hard-coded 1:1 for now

        self.drag_offset_x = 0.0
        self.drag_offset_y = 0.0

        self.window_w = int(window_w)
        self.window_h = int(window_h)

        self.dragging = False
        self.drag_last_pos = (0, 0)

    def grow_window(self):
        self.window_w = min(self.window_w + WINDOW_STEP, WINDOW_MAX_PX)
        self.window_h = min(self.window_h + WINDOW_STEP, WINDOW_MAX_PX)

    def shrink_window(self):
        self.window_w = max(self.window_w - WINDOW_STEP, WINDOW_MIN_PX)
        self.window_h = max(self.window_h - WINDOW_STEP, WINDOW_MIN_PX)

    def center(self):
        """Re-anchor the camera on the car, preserving the current zoom."""
        self.drag_offset_x = 0.0
        self.drag_offset_y = 0.0

    def reset(self):
        """Full reset: restore initial zoom and re-center on the car."""
        self.zoom = self.zoom_default
        self.center()

    def zoom_in(self):
        self.zoom = min(self.zoom * self.ZOOM_STEP, self.ZOOM_MAX)

    def zoom_out(self):
        self.zoom = max(self.zoom / self.ZOOM_STEP, self.ZOOM_MIN)

    def start_drag(self, pos):
        self.dragging = True
        self.drag_last_pos = pos

    def end_drag(self):
        self.dragging = False

    def update_drag(self, pos):
        if not self.dragging:
            return
        dx = pos[0] - self.drag_last_pos[0]
        dy = pos[1] - self.drag_last_pos[1]
        ax, ay = self.aspect_ratio
        self.drag_offset_x -= dx / (self.zoom * ax)
        self.drag_offset_y += dy / (self.zoom * ay)
        self.drag_last_pos = pos

    # ── JSON (de)serialization ────────────────────────────────────────
    #
    # Only the persistent viewport state is saved; transient input state
    # (``dragging`` / ``drag_last_pos``) is deliberately excluded.
    #
    # Schema (all fields optional on load):
    #   {
    #     "zoom":         float,
    #     "aspect_ratio": [float, float],
    #     "drag_offset":  [float, float],
    #     "window_size":  [int,   int]
    #   }

    def to_dict(self) -> dict:
        return {
            'zoom': float(self.zoom),
            'aspect_ratio': [float(self.aspect_ratio[0]),
                             float(self.aspect_ratio[1])],
            'drag_offset': [float(self.drag_offset_x),
                            float(self.drag_offset_y)],
            'window_size': [int(self.window_w), int(self.window_h)],
        }

    def update_from_dict(self, data: dict) -> None:
        """Overwrite view state from a dict matching :meth:`to_dict`.

        Raises ``ValueError`` if any provided field is malformed. On
        error nothing is modified (changes are staged first and only
        applied at the end).
        """
        if not isinstance(data, dict):
            raise ValueError('view payload must be a JSON object')

        new_zoom = self.zoom
        new_aspect = self.aspect_ratio
        new_offset = (self.drag_offset_x, self.drag_offset_y)
        new_window = (self.window_w, self.window_h)

        if 'zoom' in data:
            z = data['zoom']
            if not isinstance(z, (int, float)):
                raise ValueError('"zoom" must be a number')
            new_zoom = max(self.ZOOM_MIN, min(float(z), self.ZOOM_MAX))

        if 'aspect_ratio' in data:
            ar = data['aspect_ratio']
            if (not isinstance(ar, (list, tuple)) or len(ar) != 2
                    or not all(isinstance(v, (int, float)) and v > 0 for v in ar)):
                raise ValueError(
                    '"aspect_ratio" must be a 2-element list of positive numbers'
                )
            new_aspect = (float(ar[0]), float(ar[1]))

        if 'drag_offset' in data:
            off = data['drag_offset']
            if (not isinstance(off, (list, tuple)) or len(off) != 2
                    or not all(isinstance(v, (int, float)) for v in off)):
                raise ValueError(
                    '"drag_offset" must be a 2-element list of numbers'
                )
            new_offset = (float(off[0]), float(off[1]))

        if 'window_size' in data:
            ws = data['window_size']
            if (not isinstance(ws, (list, tuple)) or len(ws) != 2
                    or not all(isinstance(v, int) and not isinstance(v, bool)
                               for v in ws)):
                raise ValueError(
                    '"window_size" must be a 2-element list of integers'
                )
            w = max(WINDOW_MIN_PX, min(int(ws[0]), WINDOW_MAX_PX))
            h = max(WINDOW_MIN_PX, min(int(ws[1]), WINDOW_MAX_PX))
            new_window = (w, h)

        self.zoom = new_zoom
        self.aspect_ratio = new_aspect
        self.drag_offset_x, self.drag_offset_y = new_offset
        self.window_w, self.window_h = new_window


def yaw_to_quaternion(yaw):
    return Quaternion(
        x=0.0, y=0.0,
        z=math.sin(yaw / 2.0),
        w=math.cos(yaw / 2.0),
    )


class CarSimPygameNode(Node):
    def __init__(self):
        super().__init__('car_sim_pygame_node')

        self.declare_parameter('initial_x', 0.0)
        self.declare_parameter('initial_y', 0.0)
        self.declare_parameter('initial_yaw', 0.0)
        self.declare_parameter('frequency', 20.0)
        self.declare_parameter('chassis_radius', 0.25)
        self.declare_parameter('trail_length', 500)
        self.declare_parameter('stop_on_release', True)
        self.declare_parameter('pixels_per_meter', 60.0)
        self.declare_parameter('obstacles_file', '')
        self.declare_parameter('map_yaml', '')
        self.declare_parameter('maps_dir', '')
        self.declare_parameter('odom_noise_sigma', 0.0)
        self.declare_parameter('view_file', '')

        initial_x = self.get_parameter('initial_x').value
        initial_y = self.get_parameter('initial_y').value
        initial_yaw = self.get_parameter('initial_yaw').value
        self.frequency = self.get_parameter('frequency').value
        self.dt = 1.0 / self.frequency
        self.chassis_radius = self.get_parameter('chassis_radius').value
        trail_length = self.get_parameter('trail_length').value
        self.stop_on_release = self.get_parameter('stop_on_release').value

        # All viewport/camera state (zoom, aspect ratio, drag offset) lives
        # on this View helper so the rendering & input code manipulate a
        # single object instead of a bag of loose attributes.
        self.view = View(zoom=self.get_parameter('pixels_per_meter').value)

        self.odom_noise_sigma = self.get_parameter('odom_noise_sigma').value

        self.state = np.array([initial_x, initial_y, initial_yaw, 0.0, 0.0])
        self.cmd_v = 0.0
        self.cmd_w = 0.0
        self.last_cmd_time = self.get_clock().now()
        self.cmd_timeout = 2.0 / self.frequency

        self.trail = deque(maxlen=trail_length)

        map_yaml = self.get_parameter('map_yaml').value
        obstacles_file = self.get_parameter('obstacles_file').value
        maps_dir = self.get_parameter('maps_dir').value

        if map_yaml:
            self.obstacles = self._load_obstacles_from_map(map_yaml)
            self.current_map_path = map_yaml
        elif obstacles_file:
            self.obstacles = self._load_obstacles(obstacles_file)
            self.current_map_path = obstacles_file
        else:
            self.obstacles = self._load_obstacles(obstacles_file)
            self.current_map_path = ''

        # Discover available maps from ``maps_dir`` (or the installed share
        # directory by default) so the settings overlay can offer a dropdown.
        self.maps_dir = self._resolve_maps_dir(maps_dir)
        self.available_maps = self._discover_maps(self.maps_dir)
        self._ensure_current_map_in_list()

        self.predicted_path = []
        self.goal_pos = None

        self.cmd_vel_sub = self.create_subscription(
            Twist, '/cmd_vel', self._cmd_vel_callback, 10
        )
        self.predicted_path_sub = self.create_subscription(
            Path, '/dwa/predicted_path', self._predicted_path_callback, 10
        )
        self.goal_sub = self.create_subscription(
            PoseStamped, '/dwa/goal', self._goal_callback, 10
        )

        self.odom_pub = self.create_publisher(Odometry, '/odom', 10)
        self.trajectory_pub = self.create_publisher(Path, '/trajectory', 10)
        self.markers_pub = self.create_publisher(MarkerArray, '/markers', 10)

        # Settings button state (top-right corner; size scales with zoom).
        self._gear_icon_raw = None
        self._gear_icon_scaled = None
        self._gear_icon_scaled_size = -1
        self.settings_button_rect = pygame.Rect(0, 0, 0, 0)
        self.settings_button_hover = False
        self.settings_open = False

        # Map dropdown state, rendered inside the settings overlay.
        self.map_dropdown_open = False
        self.map_dropdown_button_rect = pygame.Rect(0, 0, 0, 0)
        self.map_dropdown_option_rects = []
        self.map_dropdown_hover_index = -1

        # Error modal (used e.g. when a map YAML file is malformed).
        self.error_open = False
        self.error_filename = ''
        self.error_detail = ''
        self.error_dismiss_rect = pygame.Rect(0, 0, 0, 0)

        # On-screen joystick (bottom-right; toggled via settings checkbox).
        self.show_joystick = False
        self.joystick_active = False
        self.joystick_knob_dx = 0.0
        self.joystick_knob_dy = 0.0
        self.joystick_checkbox_rect = pygame.Rect(0, 0, 0, 0)

        self.sim_timer = self.create_timer(self.dt, self._simulation_step)

        self.get_logger().info(
            f'Pygame car sim started at ({initial_x}, {initial_y}) | '
            f'freq={self.frequency}Hz | stop_on_release={self.stop_on_release}'
        )

        self._init_view_file()

    # ── Map discovery / switching ───────────────────────────────────

    def _resolve_maps_dir(self, override: str) -> str:
        """Return the directory to scan for map files.

        If ``override`` is set (via ROS parameter) it is used as-is,
        otherwise we fall back to the installed ``share/car_sim_pygame/map``
        directory so a fresh clone just works.
        """
        if override:
            return override
        try:
            share = get_package_share_directory('car_sim_pygame')
            return os.path.join(share, 'map')
        except Exception:
            return ''

    def _discover_maps(self, directory: str) -> list:
        """Return the list of ``.yaml``/``.yml`` map files in ``directory``.

        Only YAML files are exposed through the UI dropdown. Malformed or
        unreadable YAMLs are still listed so the user can select them and
        see a descriptive error (instead of the file silently disappearing).
        """
        if not directory or not os.path.isdir(directory):
            return []
        entries = []
        for name in sorted(os.listdir(directory)):
            path = os.path.join(directory, name)
            if not os.path.isfile(path):
                continue
            lower = name.lower()
            if lower.endswith('.yaml') or lower.endswith('.yml'):
                entries.append({'label': name, 'path': path, 'kind': 'yaml'})
        return entries

    def _ensure_current_map_in_list(self) -> None:
        """Make sure the currently active YAML map is in the dropdown list."""
        if not self.current_map_path:
            return
        if not self.current_map_path.lower().endswith(('.yaml', '.yml')):
            # CSV obstacle files are not managed by the dropdown.
            return
        current = os.path.abspath(self.current_map_path)
        for entry in self.available_maps:
            if os.path.abspath(entry['path']) == current:
                return
        self.available_maps.insert(0, {
            'label': os.path.basename(self.current_map_path),
            'path': self.current_map_path,
            'kind': 'yaml',
        })

    @staticmethod
    def _validate_map_yaml(path: str):
        """Validate a map YAML file.

        Returns ``(True, None)`` if the file conforms to the documented
        format, or ``(False, error_message)`` with a short human-readable
        description of what is wrong.
        """
        if not os.path.isfile(path):
            return False, f'File not found: {path}'

        try:
            with open(path, 'r') as f:
                config = yaml.safe_load(f)
        except yaml.YAMLError as e:
            return False, f'YAML parse error: {e}'
        except OSError as e:
            return False, f'Could not read file: {e}'

        if not isinstance(config, dict):
            return False, 'Top-level YAML must be a mapping (key/value pairs).'

        required = ('image', 'resolution', 'origin')
        missing = [k for k in required if k not in config]
        if missing:
            return False, 'Missing required field(s): ' + ', '.join(missing)

        image = config.get('image')
        if not isinstance(image, str) or not image:
            return False, "'image' must be a non-empty string (PNG filename)."

        resolution = config.get('resolution')
        if not isinstance(resolution, (int, float)) or isinstance(resolution, bool):
            return False, "'resolution' must be a number (meters per pixel)."
        if resolution <= 0:
            return False, "'resolution' must be greater than 0."

        origin = config.get('origin')
        if (not isinstance(origin, (list, tuple))
                or len(origin) < 2
                or not all(isinstance(v, (int, float))
                           and not isinstance(v, bool) for v in origin[:2])):
            return False, "'origin' must be a list of two numbers, e.g. [0.0, 0.0]."

        image_path = os.path.join(os.path.dirname(path), image)
        if not os.path.isfile(image_path):
            return False, f"Referenced image not found: {image_path}"

        return True, None

    def select_map(self, entry: dict) -> None:
        """Switch the active map to the given dropdown entry.

        Validates the YAML first; if invalid, surfaces an error modal and
        leaves the current obstacles untouched.
        """
        path = entry['path']
        ok, err = self._validate_map_yaml(path)
        if not ok:
            self.get_logger().error(f'Invalid map YAML {path}: {err}')
            self._show_map_error(os.path.basename(path), err)
            return
        obstacles = self._load_obstacles_from_map(path)
        self.obstacles = obstacles
        self.current_map_path = path
        self.get_logger().info(f'Switched map to {path}')

    def _show_map_error(self, filename: str, detail: str) -> None:
        """Open the error modal describing an invalid map file."""
        self.error_filename = filename
        self.error_detail = detail
        self.error_open = True
        # Make sure the dropdown doesn't linger underneath the modal.
        self.map_dropdown_open = False

    def dismiss_error(self) -> None:
        self.error_open = False
        self.error_filename = ''
        self.error_detail = ''

    # ── Obstacle loading ────────────────────────────────────────────

    def _load_obstacles(self, filepath: str) -> np.ndarray:
        if not filepath:
            self.get_logger().info('No obstacles_file provided, using empty obstacle set')
            return np.empty((0, 2))

        if not os.path.isfile(filepath):
            self.get_logger().error(f'Obstacles file not found: {filepath}')
            return np.empty((0, 2))

        points = []
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split(',')
                if len(parts) >= 2:
                    try:
                        points.append([float(parts[0]), float(parts[1])])
                    except ValueError:
                        continue

        self.get_logger().info(f'Loaded {len(points)} obstacles from {filepath}')
        if not points:
            return np.empty((0, 2))
        return np.array(points)

    def _load_obstacles_from_map(self, yaml_path: str) -> np.ndarray:
        if not os.path.isfile(yaml_path):
            self.get_logger().error(f'Map YAML not found: {yaml_path}')
            return np.empty((0, 2))

        with open(yaml_path, 'r') as f:
            map_config = yaml.safe_load(f)

        image_name = map_config.get('image', '')
        resolution = float(map_config.get('resolution', 1.0))
        origin = map_config.get('origin', [0.0, 0.0])
        origin_x, origin_y = float(origin[0]), float(origin[1])

        image_path = os.path.join(os.path.dirname(yaml_path), image_name)
        if not os.path.isfile(image_path):
            self.get_logger().error(f'Map image not found: {image_path}')
            return np.empty((0, 2))

        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            self.get_logger().error(f'Failed to read image: {image_path}')
            return np.empty((0, 2))

        h, w = img.shape[:2]
        points = []

        if img.shape[2] == 4:
            alpha = img[:, :, 3]
            for row in range(h):
                for col in range(w):
                    if alpha[row, col] > 0:
                        x = origin_x + col * resolution
                        y = origin_y + (h - 1 - row) * resolution
                        points.append([x, y])
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            for row in range(h):
                for col in range(w):
                    if gray[row, col] < 128:
                        x = origin_x + col * resolution
                        y = origin_y + (h - 1 - row) * resolution
                        points.append([x, y])

        self.get_logger().info(
            f'Loaded {len(points)} obstacles from map '
            f'({w}x{h}, res={resolution}, origin=[{origin_x}, {origin_y}])'
        )
        if not points:
            return np.empty((0, 2))
        return np.array(points)

    # ── ROS2 callbacks ───────────────────────────────────────────────

    def _cmd_vel_callback(self, msg: Twist):
        self.cmd_v = msg.linear.x
        self.cmd_w = msg.angular.z
        self.last_cmd_time = self.get_clock().now()

    def _predicted_path_callback(self, msg: Path):
        self.predicted_path = [
            (p.pose.position.x, p.pose.position.y) for p in msg.poses
        ]

    def _goal_callback(self, msg: PoseStamped):
        self.goal_pos = (msg.pose.position.x, msg.pose.position.y)

    def _simulation_step(self):
        if self.stop_on_release:
            elapsed = (self.get_clock().now() - self.last_cmd_time).nanoseconds * 1e-9
            if elapsed > self.cmd_timeout:
                self.cmd_v = 0.0
                self.cmd_w = 0.0

        v, w = self.cmd_v, self.cmd_w
        self.state[2] += w * self.dt
        self.state[0] += v * math.cos(self.state[2]) * self.dt
        self.state[1] += v * math.sin(self.state[2]) * self.dt
        self.state[3] = v
        self.state[4] = w

        self.trail.append((float(self.state[0]), float(self.state[1])))

        stamp = self.get_clock().now().to_msg()
        self._publish_odometry(stamp)
        self._publish_trajectory(stamp)
        self._publish_markers(stamp)

    # ── ROS2 publishers ──────────────────────────────────────────────

    def _publish_odometry(self, stamp):
        sigma = self.odom_noise_sigma
        if sigma > 0.0 and (self.state[3] != 0.0 or self.state[4] != 0.0):
            noise_x = np.random.normal(0.0, sigma)
            noise_y = np.random.normal(0.0, sigma)
            noise_yaw = np.random.normal(0.0, sigma)
        else:
            noise_x = noise_y = noise_yaw = 0.0

        msg = Odometry()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        msg.child_frame_id = 'base_link'
        msg.pose.pose.position.x = float(self.state[0]) + noise_x
        msg.pose.pose.position.y = float(self.state[1]) + noise_y
        msg.pose.pose.orientation = yaw_to_quaternion(self.state[2] + noise_yaw)
        msg.twist.twist.linear.x = float(self.state[3])
        msg.twist.twist.angular.z = float(self.state[4])
        self.odom_pub.publish(msg)

    def _publish_trajectory(self, stamp):
        msg = Path()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        for tx, ty in self.trail:
            pose = PoseStamped()
            pose.header.stamp = stamp
            pose.header.frame_id = 'odom'
            pose.pose.position.x = tx
            pose.pose.position.y = ty
            msg.poses.append(pose)
        self.trajectory_pub.publish(msg)

    def _publish_markers(self, stamp):
        ma = MarkerArray()
        for i, obs in enumerate(self.obstacles if len(self.obstacles) > 0 else []):
            m = Marker()
            m.header.stamp = stamp
            m.header.frame_id = 'odom'
            m.ns = 'obstacles'
            m.id = i
            m.type = Marker.CYLINDER
            m.action = Marker.ADD
            m.pose.position.x = float(obs[0])
            m.pose.position.y = float(obs[1])
            m.scale.x = 0.3
            m.scale.y = 0.3
            m.scale.z = 0.5
            m.color.a = 1.0
            ma.markers.append(m)

        robot = Marker()
        robot.header.stamp = stamp
        robot.header.frame_id = 'odom'
        robot.ns = 'robot'
        robot.id = 0
        robot.type = Marker.CYLINDER
        robot.action = Marker.ADD
        robot.pose.position.x = float(self.state[0])
        robot.pose.position.y = float(self.state[1])
        robot.scale.x = float(self.chassis_radius * 2)
        robot.scale.y = float(self.chassis_radius * 2)
        robot.scale.z = 0.3
        robot.color.g = 1.0
        robot.color.b = 1.0
        robot.color.a = 1.0
        ma.markers.append(robot)
        self.markers_pub.publish(ma)

    # ── View persistence (JSON) ──────────────────────────────────────

    def _view_file_path(self) -> str:
        """Resolve the JSON file path used by save_view / load_view.

        Uses the ``view_file`` ROS parameter if set; otherwise falls
        back to ``~/.car_sim_pygame_view.json``.
        """
        path = self.get_parameter('view_file').value
        if not path:
            path = os.path.join(os.path.expanduser('~'),
                                '.car_sim_pygame_view.json')
        return os.path.expanduser(path)

    def _init_view_file(self) -> None:
        """Load the view file at startup, or create a default if missing.

        Called unconditionally from ``__init__`` so the simulator always
        starts with a view file on disk that the user can hand-edit.
        """
        path = self._view_file_path()
        if os.path.isfile(path):
            self.load_view()
        else:
            self.get_logger().info(
                f'No view file at {path}; writing defaults.'
            )
            self.save_view()

    def save_view(self) -> bool:
        path = self._view_file_path()
        try:
            os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
            with open(path, 'w') as f:
                json.dump(self.view.to_dict(), f, indent=2)
                f.write('\n')
        except OSError as e:
            self.get_logger().error(f'Failed to save view to {path}: {e}')
            return False
        self.get_logger().info(f'View saved to {path}')
        return True

    def load_view(self) -> bool:
        path = self._view_file_path()
        if not os.path.isfile(path):
            self.get_logger().warn(f'View file not found: {path}')
            return False
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            self.view.update_from_dict(data)
        except (OSError, json.JSONDecodeError, ValueError) as e:
            self.get_logger().error(f'Failed to load view from {path}: {e}')
            return False
        self.get_logger().info(
            f'View loaded from {path} '
            f'(zoom={self.view.zoom:.2f}, '
            f'aspect={self.view.aspect_ratio}, '
            f'offset=({self.view.drag_offset_x:.2f}, {self.view.drag_offset_y:.2f}))'
        )
        return True

    # ── Pygame rendering ─────────────────────────────────────────────

    def _gear_icon_path(self) -> str:
        try:
            pkg_share = get_package_share_directory('car_sim_pygame')
            return os.path.join(pkg_share, '_sim_assets', 'gear_icon.png')
        except Exception as e:  # pragma: no cover - only reachable outside a ROS install
            self.get_logger().warn(f'Could not resolve package share dir: {e}')
            return ''

    def _ensure_gear_icon_loaded(self):
        if self._gear_icon_raw is not None:
            return
        path = self._gear_icon_path()
        if not path or not os.path.isfile(path):
            self.get_logger().warn(
                f'Gear icon not found at {path!r}; settings button disabled'
            )
            return
        try:
            self._gear_icon_raw = pygame.image.load(path).convert_alpha()
        except pygame.error as e:
            self.get_logger().warn(f'Failed to load gear icon: {e}')
            self._gear_icon_raw = None

    # ── On-screen joystick ──────────────────────────────────────────

    def _joystick_base_radius(self) -> int:
        """Base circle radius. Scales mildly with window size."""
        base = max(
            JOYSTICK_MIN_BASE_RADIUS_PX,
            min(self.view.window_w, self.view.window_h) // 10,
        )
        return int(base)

    def _joystick_center(self) -> tuple:
        """(cx, cy) center of the joystick base in window coordinates."""
        r = self._joystick_base_radius()
        cx = self.view.window_w - JOYSTICK_MARGIN_PX - r
        cy = self.view.window_h - JOYSTICK_MARGIN_PX - r
        return cx, cy

    def _joystick_hit(self, pos) -> bool:
        if not self.show_joystick:
            return False
        cx, cy = self._joystick_center()
        r = self._joystick_base_radius()
        dx = pos[0] - cx
        dy = pos[1] - cy
        return dx * dx + dy * dy <= r * r

    def start_joystick_drag(self, pos) -> None:
        self.joystick_active = True
        self._update_joystick_knob(pos)

    def _update_joystick_knob(self, pos) -> None:
        cx, cy = self._joystick_center()
        r = float(self._joystick_base_radius())
        dx = pos[0] - cx
        dy = pos[1] - cy
        dist = math.hypot(dx, dy)
        if dist > r and dist > 0:
            dx *= r / dist
            dy *= r / dist
        self.joystick_knob_dx = dx
        self.joystick_knob_dy = dy
        # Map to normalized [-1, 1]; y is inverted so pushing up = +v.
        nx = dx / r
        ny = -dy / r
        self.cmd_v = ny * JOYSTICK_MAX_V
        self.cmd_w = -nx * JOYSTICK_MAX_W
        self.last_cmd_time = self.get_clock().now()

    def release_joystick(self) -> None:
        self.joystick_active = False
        self.joystick_knob_dx = 0.0
        self.joystick_knob_dy = 0.0
        self.cmd_v = 0.0
        self.cmd_w = 0.0
        self.last_cmd_time = self.get_clock().now()

    def _draw_joystick(self, surface) -> None:
        if not self.show_joystick:
            return
        cx, cy = self._joystick_center()
        r = self._joystick_base_radius()
        knob_r = max(16, r // 2)

        # Base: filled circle with a subtle border.
        base_surf = pygame.Surface((r * 2 + 4, r * 2 + 4), pygame.SRCALPHA)
        pygame.draw.circle(
            base_surf, (*COLOR_JOYSTICK_BASE, 210), (r + 2, r + 2), r,
        )
        pygame.draw.circle(
            base_surf, COLOR_JOYSTICK_BASE_BORDER, (r + 2, r + 2), r, width=2,
        )
        # Cross guides for orientation.
        pygame.draw.line(
            base_surf, COLOR_JOYSTICK_CROSS,
            (r + 2 - r // 2, r + 2), (r + 2 + r // 2, r + 2), 1,
        )
        pygame.draw.line(
            base_surf, COLOR_JOYSTICK_CROSS,
            (r + 2, r + 2 - r // 2), (r + 2, r + 2 + r // 2), 1,
        )
        surface.blit(base_surf, (cx - r - 2, cy - r - 2))

        # Knob: positioned by joystick offset.
        kx = int(cx + self.joystick_knob_dx)
        ky = int(cy + self.joystick_knob_dy)
        knob_color = (
            COLOR_JOYSTICK_KNOB_ACTIVE
            if self.joystick_active else COLOR_JOYSTICK_KNOB
        )
        pygame.draw.circle(surface, knob_color, (kx, ky), knob_r)
        pygame.draw.circle(
            surface, COLOR_JOYSTICK_KNOB_BORDER, (kx, ky), knob_r, width=2,
        )

    def toggle_show_joystick(self) -> None:
        self.show_joystick = not self.show_joystick
        if not self.show_joystick and self.joystick_active:
            self.release_joystick()

    def _draw_settings_button(self, surface):
        size = BUTTON_SIZE_PX
        x = self.view.window_w - size - BUTTON_MARGIN_PX
        y = BUTTON_MARGIN_PX
        self.settings_button_rect = pygame.Rect(x, y, size, size)

        bg_color = COLOR_BUTTON_BG_HOVER if self.settings_button_hover else COLOR_BUTTON_BG
        radius = max(4, size // 6)
        pygame.draw.rect(surface, bg_color, self.settings_button_rect, border_radius=radius)
        pygame.draw.rect(
            surface, COLOR_BUTTON_BORDER, self.settings_button_rect,
            width=2, border_radius=radius,
        )

        self._ensure_gear_icon_loaded()
        if self._gear_icon_raw is None:
            return

        icon_size = max(1, size - 8)
        if self._gear_icon_scaled is None or self._gear_icon_scaled_size != icon_size:
            self._gear_icon_scaled = pygame.transform.smoothscale(
                self._gear_icon_raw, (icon_size, icon_size)
            )
            self._gear_icon_scaled_size = icon_size

        icon_rect = self._gear_icon_scaled.get_rect(center=self.settings_button_rect.center)
        surface.blit(self._gear_icon_scaled, icon_rect)

    @staticmethod
    def _ellipsize_left(text: str, max_px: int, font) -> str:
        """Trim ``text`` from the left with a leading '…' until it fits.

        Used for long file paths so the filename (the useful end) is
        always visible.
        """
        if font.size(text)[0] <= max_px:
            return text
        ellipsis = '…'
        # Shrink until ellipsis + remaining tail fits.
        while text and font.size(ellipsis + text)[0] > max_px:
            text = text[1:]
        return ellipsis + text if text else ellipsis

    def _draw_error_overlay(self, surface, font):
        """Modal error dialog (e.g. for an invalid map YAML)."""
        window_w = self.view.window_w
        window_h = self.view.window_h

        dim = pygame.Surface((window_w, window_h), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 200))
        surface.blit(dim, (0, 0))

        body_font = font
        line_h = body_font.get_linesize()
        pad = max(line_h, 16)
        divider_gap = max(line_h // 2, 14)

        font.set_bold(True)
        title_surf = font.render('Invalid map file', True, COLOR_ERROR_TEXT)
        font.set_bold(False)

        subtitle_text = f'{self.error_filename}' if self.error_filename else ''
        detail_text = self.error_detail or ''

        hint_text = (
            'Please follow the documented format in README.md '
            '(section "Map formats"):'
        )

        snippet_lines = [
            'image: map.png',
            'resolution: 1.0',
            'origin: [0.0, 0.0]',
        ]

        dismiss_text = 'Press ESC or click to dismiss'

        max_text_w = max(window_w // 2, 480)
        max_text_w = min(max_text_w, window_w - 80)

        def wrap(text, max_px):
            if not text:
                return []
            words = text.split(' ')
            lines, cur = [], ''
            for w in words:
                candidate = (cur + ' ' + w).strip() if cur else w
                if body_font.size(candidate)[0] <= max_px or not cur:
                    cur = candidate
                else:
                    lines.append(cur)
                    cur = w
            if cur:
                lines.append(cur)
            return lines

        detail_lines = wrap(detail_text, max_text_w)
        hint_lines = wrap(hint_text, max_text_w)

        all_widths = [title_surf.get_width(), body_font.size(subtitle_text)[0]]
        all_widths += [body_font.size(l)[0] for l in detail_lines]
        all_widths += [body_font.size(l)[0] for l in hint_lines]
        all_widths += [body_font.size(l)[0] for l in snippet_lines]
        all_widths.append(body_font.size(dismiss_text)[0])
        content_w = max(all_widths)
        panel_w = min(content_w + 2 * pad, window_w - 40)

        body_rows = (
            (1 if subtitle_text else 0)
            + len(detail_lines)
            + (len(hint_lines) if hint_lines else 0)
            + len(snippet_lines)
        )
        panel_h = (
            pad
            + title_surf.get_height()
            + divider_gap
            + body_rows * line_h
            + divider_gap
            + line_h
            + pad
        )
        panel_h = min(panel_h, window_h - 40)

        panel_x = (window_w - panel_w) // 2
        panel_y = (window_h - panel_h) // 2
        panel_rect = pygame.Rect(panel_x, panel_y, panel_w, panel_h)

        pygame.draw.rect(
            surface, COLOR_OVERLAY_BG, panel_rect, border_radius=12,
        )
        pygame.draw.rect(
            surface, COLOR_ERROR_BORDER, panel_rect, width=2, border_radius=12,
        )

        x_left = panel_x + pad
        y = panel_y + pad

        surface.blit(title_surf, (x_left, y))
        y += title_surf.get_height() + divider_gap // 2

        pygame.draw.line(
            surface, COLOR_ERROR_BORDER,
            (x_left, y), (panel_x + panel_w - pad, y), 1,
        )
        y += divider_gap // 2

        if subtitle_text:
            surface.blit(
                body_font.render(subtitle_text, True, COLOR_HUD_TEXT),
                (x_left, y),
            )
            y += line_h

        for line in detail_lines:
            surface.blit(
                body_font.render(line, True, COLOR_HUD_TEXT),
                (x_left, y),
            )
            y += line_h

        for line in hint_lines:
            surface.blit(
                body_font.render(line, True, COLOR_HUD_TEXT),
                (x_left, y),
            )
            y += line_h

        for line in snippet_lines:
            surface.blit(
                body_font.render(line, True, COLOR_SNIPPET_TEXT),
                (x_left, y),
            )
            y += line_h

        y += divider_gap // 2
        pygame.draw.line(
            surface, COLOR_ERROR_BORDER,
            (x_left, y), (panel_x + panel_w - pad, y), 1,
        )
        y += divider_gap // 2

        dismiss_surf = body_font.render(dismiss_text, True, COLOR_HUD_TEXT)
        surface.blit(dismiss_surf, (x_left, y))

        self.error_dismiss_rect = panel_rect

    def _draw_settings_overlay(self, surface, font):
        window_w = self.view.window_w
        window_h = self.view.window_h

        # Dim the scene behind the panel.
        dim = pygame.Surface((window_w, window_h), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 160))
        surface.blit(dim, (0, 0))

        # Use the HUD font so the overlay scales with the window size
        # (via the +/- shortcuts), matching the rest of the UI.
        body_font = font
        line_h = body_font.get_linesize()
        pad = max(line_h, 16)
        col_gap = max(line_h * 2, 24)

        # The title reuses the same font but rendered bold.
        font.set_bold(True)
        title_surf = font.render('Settings', True, COLOR_HUD_TEXT)
        font.set_bold(False)
        title_h = title_surf.get_height()

        rows = [
            ('zoom',            f'{self.view.zoom:.0f} px/m'),
            ('frequency',       f'{self.frequency:.1f} Hz'),
            ('chassis radius',  f'{self.chassis_radius:.2f} m'),
            ('stop on release', 'on' if self.stop_on_release else 'off'),
            ('odom noise σ',    f'{self.odom_noise_sigma:.3f}'),
            ('window',          f'{window_w} × {window_h} px'),
            ('aspect ratio',
             f'{self.view.aspect_ratio[0]:g} : {self.view.aspect_ratio[1]:g}'),
        ]

        # Dropdown bookkeeping: figure out its width from the longest option
        # label so the button always fully contains any map name.
        map_label_text = 'map'
        current_label = (
            os.path.basename(self.current_map_path)
            if self.current_map_path else '(none)'
        )
        option_labels = [m['label'] for m in self.available_maps]
        widest_option_text = max(
            option_labels + [current_label], key=lambda s: body_font.size(s)[0],
        )
        caret_text = ' v'
        dropdown_btn_w = (
            body_font.size(widest_option_text)[0]
            + body_font.size(caret_text)[0]
            + 24  # internal padding (left + right + gap before caret)
        )
        dropdown_btn_h = line_h + 6

        joystick_label_text = 'show joystick'
        label_w = max(
            [body_font.size(k)[0] for k, _ in rows]
            + [body_font.size(map_label_text)[0],
               body_font.size(joystick_label_text)[0]],
        )
        value_w = max(
            [body_font.size(v)[0] for _, v in rows] + [dropdown_btn_w],
        )
        rows_w = label_w + col_gap + value_w

        shortcuts_surf = body_font.render(
            'S  save view     L  load view     C  center car     ESC  close',
            True, COLOR_HUD_TEXT,
        )

        # Provisional panel width; clamped below to fit inside the window.
        content_w = max(rows_w, title_surf.get_width(), shortcuts_surf.get_width())
        panel_w = min(content_w + 2 * pad, window_w - 40)

        # Truncate the path so it never overflows the panel width.
        raw_path = self._view_file_path()
        path_label = body_font.render('view file  ', True, COLOR_HUD_TEXT)
        path_max_px = panel_w - 2 * pad - path_label.get_width()
        path_surf = body_font.render(
            self._ellipsize_left(raw_path, path_max_px, body_font),
            True, COLOR_HUD_TEXT,
        )

        divider_gap = max(line_h // 2, 14)  # vertical room around the separator line
        title_gap = max(line_h // 2, 12)
        map_row_h = max(dropdown_btn_h, line_h)
        checkbox_size = max(line_h, 18)
        checkbox_row_h = max(checkbox_size, line_h)
        panel_h = (
            pad                               # top padding
            + title_h
            + title_gap                       # title/body gap
            + len(rows) * line_h
            + map_row_h                       # map dropdown row
            + checkbox_row_h                  # show-joystick checkbox row
            + divider_gap
            + line_h                          # path line
            + divider_gap
            + shortcuts_surf.get_height()
            + pad                             # bottom padding
        )
        panel_h = min(panel_h, window_h - 40)

        panel_x = (window_w - panel_w) // 2
        panel_y = (window_h - panel_h) // 2
        panel_rect = pygame.Rect(panel_x, panel_y, panel_w, panel_h)

        pygame.draw.rect(surface, COLOR_OVERLAY_BG, panel_rect, border_radius=12)
        pygame.draw.rect(
            surface, COLOR_OVERLAY_BORDER, panel_rect, width=2, border_radius=12,
        )

        x_left = panel_x + pad
        y = panel_y + pad

        surface.blit(title_surf, (x_left, y))
        y += title_h + title_gap

        for k, v in rows:
            surface.blit(body_font.render(k, True, COLOR_HUD_TEXT), (x_left, y))
            surface.blit(
                body_font.render(v, True, COLOR_HUD_TEXT),
                (x_left + label_w + col_gap, y),
            )
            y += line_h

        # Map dropdown row.
        map_row_y = y
        surface.blit(
            body_font.render(map_label_text, True, COLOR_HUD_TEXT),
            (x_left, map_row_y + (map_row_h - line_h) // 2),
        )
        btn_x = x_left + label_w + col_gap
        btn_y = map_row_y + (map_row_h - dropdown_btn_h) // 2
        self.map_dropdown_button_rect = pygame.Rect(
            btn_x, btn_y, dropdown_btn_w, dropdown_btn_h,
        )
        btn_bg = (
            COLOR_BUTTON_BG_HOVER
            if self.map_dropdown_open else COLOR_BUTTON_BG
        )
        pygame.draw.rect(
            surface, btn_bg, self.map_dropdown_button_rect, border_radius=6,
        )
        pygame.draw.rect(
            surface, COLOR_BUTTON_BORDER,
            self.map_dropdown_button_rect, width=1, border_radius=6,
        )
        # Truncate the current value if somehow wider than the button.
        value_max = dropdown_btn_w - body_font.size(caret_text)[0] - 16
        value_text = self._ellipsize_left(current_label, value_max, body_font)
        value_surf = body_font.render(value_text, True, COLOR_HUD_TEXT)
        surface.blit(
            value_surf,
            (btn_x + 8, btn_y + (dropdown_btn_h - value_surf.get_height()) // 2),
        )
        caret_surf = body_font.render(caret_text, True, COLOR_HUD_TEXT)
        surface.blit(
            caret_surf,
            (btn_x + dropdown_btn_w - caret_surf.get_width() - 8,
             btn_y + (dropdown_btn_h - caret_surf.get_height()) // 2),
        )
        y += map_row_h

        # Joystick visibility checkbox row.
        cb_row_y = y
        surface.blit(
            body_font.render(joystick_label_text, True, COLOR_HUD_TEXT),
            (x_left, cb_row_y + (checkbox_row_h - line_h) // 2),
        )
        cb_x = x_left + label_w + col_gap
        cb_y = cb_row_y + (checkbox_row_h - checkbox_size) // 2
        self.joystick_checkbox_rect = pygame.Rect(
            cb_x, cb_y, checkbox_size, checkbox_size,
        )
        cb_fill = (
            COLOR_CHECKBOX_BG_ON if self.show_joystick else COLOR_CHECKBOX_BG
        )
        pygame.draw.rect(
            surface, cb_fill, self.joystick_checkbox_rect, border_radius=3,
        )
        pygame.draw.rect(
            surface, COLOR_CHECKBOX_BORDER,
            self.joystick_checkbox_rect, width=1, border_radius=3,
        )
        if self.show_joystick:
            # Draw a simple check mark inside the box.
            inset = max(3, checkbox_size // 5)
            p1 = (cb_x + inset, cb_y + checkbox_size // 2)
            p2 = (cb_x + checkbox_size // 2 - 1,
                  cb_y + checkbox_size - inset - 1)
            p3 = (cb_x + checkbox_size - inset, cb_y + inset)
            pygame.draw.lines(
                surface, COLOR_CHECKBOX_TICK, False, [p1, p2, p3], 2,
            )
        y += checkbox_row_h

        # Divider above the path line.
        y += divider_gap // 2
        pygame.draw.line(
            surface, COLOR_OVERLAY_BORDER,
            (x_left, y), (panel_x + panel_w - pad, y), 1,
        )
        y += divider_gap // 2

        surface.blit(path_label, (x_left, y))
        surface.blit(path_surf, (x_left + path_label.get_width(), y))
        y += line_h

        # Divider above the shortcuts.
        y += divider_gap // 2
        pygame.draw.line(
            surface, COLOR_OVERLAY_BORDER,
            (x_left, y), (panel_x + panel_w - pad, y), 1,
        )
        y += divider_gap // 2

        surface.blit(shortcuts_surf, (x_left, y))

        # Dropdown option list (drawn last so it sits on top of everything).
        self.map_dropdown_option_rects = []
        if self.map_dropdown_open and self.available_maps:
            opt_h = dropdown_btn_h
            list_w = dropdown_btn_w
            list_x = self.map_dropdown_button_rect.x
            total_h = opt_h * len(self.available_maps)
            # Prefer opening downwards; flip upward if there is no room.
            list_y = self.map_dropdown_button_rect.bottom + 2
            if list_y + total_h > window_h - 10:
                list_y = self.map_dropdown_button_rect.top - total_h - 2
            list_rect = pygame.Rect(list_x, list_y, list_w, total_h)
            pygame.draw.rect(
                surface, COLOR_OVERLAY_BG, list_rect, border_radius=6,
            )
            pygame.draw.rect(
                surface, COLOR_OVERLAY_BORDER, list_rect, width=1,
                border_radius=6,
            )
            current_abs = (
                os.path.abspath(self.current_map_path)
                if self.current_map_path else ''
            )
            for i, entry in enumerate(self.available_maps):
                r = pygame.Rect(list_x, list_y + i * opt_h, list_w, opt_h)
                self.map_dropdown_option_rects.append(r)
                if i == self.map_dropdown_hover_index:
                    pygame.draw.rect(
                        surface, COLOR_BUTTON_BG_HOVER, r, border_radius=6,
                    )
                lbl = entry['label']
                if os.path.abspath(entry['path']) == current_abs:
                    lbl = '* ' + lbl
                lbl_max = list_w - 16
                lbl = self._ellipsize_left(lbl, lbl_max, body_font)
                lbl_surf = body_font.render(lbl, True, COLOR_HUD_TEXT)
                surface.blit(
                    lbl_surf,
                    (r.x + 8, r.y + (opt_h - lbl_surf.get_height()) // 2),
                )

    def world_to_screen(self, wx, wy, cam_x, cam_y):
        zoom = self.view.zoom
        sx = int((wx - cam_x) * zoom + self.view.window_w / 2)
        sy = int(-(wy - cam_y) * zoom + self.view.window_h / 2)
        return sx, sy

    def draw(self, surface, font):
        cam_x = float(self.state[0]) + self.view.drag_offset_x
        cam_y = float(self.state[1]) + self.view.drag_offset_y

        surface.fill(COLOR_BG)

        # Grid
        grid_step = 1.0
        zoom = self.view.zoom
        window_w = self.view.window_w
        window_h = self.view.window_h
        world_half_w = (window_w / 2) / zoom
        world_half_h = (window_h / 2) / zoom
        x_min = math.floor(cam_x - world_half_w)
        x_max = math.ceil(cam_x + world_half_w)
        y_min = math.floor(cam_y - world_half_h)
        y_max = math.ceil(cam_y + world_half_h)

        gx = x_min
        while gx <= x_max:
            sx, _ = self.world_to_screen(gx, 0, cam_x, cam_y)
            pygame.draw.line(surface, COLOR_GRID, (sx, 0), (sx, window_h))
            gx += grid_step
        gy = y_min
        while gy <= y_max:
            _, sy = self.world_to_screen(0, gy, cam_x, cam_y)
            pygame.draw.line(surface, COLOR_GRID, (0, sy), (window_w, sy))
            gy += grid_step

        # Origin cross
        ox, oy = self.world_to_screen(0, 0, cam_x, cam_y)
        pygame.draw.line(surface, COLOR_ORIGIN, (ox - 8, oy), (ox + 8, oy), 2)
        pygame.draw.line(surface, COLOR_ORIGIN, (ox, oy - 8), (ox, oy + 8), 2)

        # Obstacles
        obs_radius_px = max(int(0.15 * zoom), 3)
        if len(self.obstacles) > 0:
            for obs in self.obstacles:
                sx, sy = self.world_to_screen(obs[0], obs[1], cam_x, cam_y)
                pygame.draw.circle(surface, COLOR_OBSTACLE, (sx, sy), obs_radius_px)

        # Trajectory trail
        if len(self.trail) > 1:
            pts = [self.world_to_screen(tx, ty, cam_x, cam_y) for tx, ty in self.trail]
            pygame.draw.lines(surface, COLOR_TRAIL, False, pts, 2)

        # Robot body
        rx, ry = self.world_to_screen(self.state[0], self.state[1], cam_x, cam_y)
        robot_r_px = max(int(self.chassis_radius * zoom), 4)
        pygame.draw.circle(surface, COLOR_ROBOT, (rx, ry), robot_r_px)

        # Heading arrow
        arrow_len = self.chassis_radius * 2.5 * zoom
        hx = rx + int(arrow_len * math.cos(self.state[2]))
        hy = ry - int(arrow_len * math.sin(self.state[2]))
        pygame.draw.line(surface, COLOR_HEADING, (rx, ry), (hx, hy), 3)

        # DWA predicted path
        if len(self.predicted_path) > 1:
            pts = [self.world_to_screen(px, py, cam_x, cam_y)
                   for px, py in self.predicted_path]
            pygame.draw.lines(surface, COLOR_PREDICTED_PATH, False, pts, 2)

        # Goal marker
        if self.goal_pos is not None:
            gx, gy = self.world_to_screen(
                self.goal_pos[0], self.goal_pos[1], cam_x, cam_y
            )
            pygame.draw.circle(surface, COLOR_GOAL, (gx, gy), 10)
            pygame.draw.circle(surface, COLOR_GOAL, (gx, gy), 14, 2)

        # HUD
        lines = [
            f'v = {self.state[3]:.2f} m/s',
            f'w = {math.degrees(self.state[4]):.1f} deg/s',
            f'pos = ({self.state[0]:.2f}, {self.state[1]:.2f})',
            f'yaw = {math.degrees(self.state[2]):.1f} deg',
            f'zoom = {self.view.zoom:.0f} px/m',
        ]
        if self.goal_pos is not None:
            dist = math.hypot(
                self.state[0] - self.goal_pos[0],
                self.state[1] - self.goal_pos[1],
            )
            lines.append(f'goal = ({self.goal_pos[0]:.1f}, {self.goal_pos[1]:.1f})  d={dist:.2f}m')
        line_h = font.get_linesize()
        for i, text in enumerate(lines):
            surf = font.render(text, True, COLOR_HUD_TEXT)
            surface.blit(surf, (10, 10 + i * line_h))

        # On-screen joystick sits on top of the world but below overlays.
        self._draw_joystick(surface)

        # Settings UI (drawn on top of the HUD).
        self._draw_settings_button(surface)
        if self.settings_open:
            self._draw_settings_overlay(surface, font)
        if self.error_open:
            self._draw_error_overlay(surface, font)


def _sync_display(view):
    """(Re)create the pygame display + HUD font to match ``view.window_w/h``.

    Returns ``(screen, font)``. Call once at startup and any time the
    view's window size changes (+/- keys or ``L`` load).
    """
    screen = pygame.display.set_mode(
        (view.window_w, view.window_h), SDL_WINDOW_ALWAYS_ON_TOP,
    )
    font = pygame.font.SysFont('monospace', font_size_for_window(view.window_w))
    return screen, font


def main(args=None):
    rclpy.init(args=args)
    node = CarSimPygameNode()

    spin_thread = threading.Thread(target=rclpy.spin, args=(node,), daemon=True)
    spin_thread.start()

    pygame.init()
    screen, font = _sync_display(node.view)
    pygame.display.set_caption('Car Teleop Sim (Pygame)')
    clock = pygame.time.Clock()

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
                continue
            # The error modal is modal: any left-click or key dismisses
            # it, and any mouse event is swallowed so the world doesn't
            # shift/zoom under the dialog.
            if node.error_open:
                if event.type == pygame.KEYDOWN or (
                    event.type == pygame.MOUSEBUTTONDOWN and event.button == 1
                ):
                    node.dismiss_error()
                    continue
                if event.type in (
                    pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP,
                    pygame.MOUSEWHEEL, pygame.MOUSEMOTION,
                ):
                    continue
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if node.map_dropdown_open:
                        node.map_dropdown_open = False
                    elif node.settings_open:
                        node.settings_open = False
                    else:
                        running = False
                elif event.key == pygame.K_c:
                    node.view.center()
                elif event.key == pygame.K_s:
                    node.save_view()
                elif event.key == pygame.K_l:
                    prev_size = (node.view.window_w, node.view.window_h)
                    if node.load_view():
                        if (node.view.window_w, node.view.window_h) != prev_size:
                            screen, font = _sync_display(node.view)
                elif event.key in (pygame.K_PLUS, pygame.K_EQUALS):
                    node.view.grow_window()
                    screen, font = _sync_display(node.view)
                elif event.key == pygame.K_MINUS:
                    node.view.shrink_window()
                    screen, font = _sync_display(node.view)
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if node.settings_button_rect.collidepoint(event.pos):
                    node.settings_open = not node.settings_open
                    node.map_dropdown_open = False
                elif node.settings_open:
                    if node.map_dropdown_open:
                        for i, r in enumerate(node.map_dropdown_option_rects):
                            if r.collidepoint(event.pos):
                                node.select_map(node.available_maps[i])
                                break
                        # Any click while the dropdown is open closes only
                        # the dropdown; the settings panel stays open.
                        node.map_dropdown_open = False
                    elif node.map_dropdown_button_rect.collidepoint(event.pos):
                        if node.available_maps:
                            node.map_dropdown_open = True
                    elif node.joystick_checkbox_rect.collidepoint(event.pos):
                        node.toggle_show_joystick()
                    else:
                        node.settings_open = False
                elif node._joystick_hit(event.pos):
                    node.start_joystick_drag(event.pos)
            elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                if node.joystick_active:
                    node.release_joystick()
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 2:
                node.view.start_drag(event.pos)
            elif event.type == pygame.MOUSEBUTTONUP and event.button == 2:
                node.view.end_drag()
            elif event.type == pygame.MOUSEMOTION:
                node.settings_button_hover = (
                    node.settings_button_rect.collidepoint(event.pos)
                )
                node.map_dropdown_hover_index = -1
                if node.settings_open and node.map_dropdown_open:
                    for i, r in enumerate(node.map_dropdown_option_rects):
                        if r.collidepoint(event.pos):
                            node.map_dropdown_hover_index = i
                            break
                if node.joystick_active:
                    node._update_joystick_knob(event.pos)
                node.view.update_drag(event.pos)
            elif event.type == pygame.MOUSEWHEEL:
                if event.y > 0:
                    node.view.zoom_in()
                elif event.y < 0:
                    node.view.zoom_out()

        node.draw(screen, font)
        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    node.destroy_node()
    rclpy.shutdown()
