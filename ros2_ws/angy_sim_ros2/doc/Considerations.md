# Considerations

## Coordinate convention (engine-side)

The simulation core is **right-handed**, with:

- **+X** to the right
- **+Y** forward
- **+Z** out of the page (up, when viewing the ground plane top-down)
- **Yaw** in radians, **CCW positive** from +X

Every angular operation in the codebase agrees with this: `Pose2D.yaw`,
`VehicleControls.w`, `vectorAngle = atan2(y, x)`, `vectorRotate` (standard
CCW rotation matrix), `vectorCross` (scalar z of the 3D cross — positive
when `b` is CCW from `a`), `Transform2D.applyToPoint`/`applyToVector`,
and `vectorCross3` (right-handed: x̂ × ŷ = ẑ).

The vehicle integration is consistent too:

```
yaw_{t+1} = yaw_t + w · dt
x_{t+1}   = x_t + v · cos(yaw_{t+1}) · dt
y_{t+1}   = y_t + v · sin(yaw_{t+1}) · dt
```

At `yaw = 0` the body moves along +X; at `yaw = π/2` along +Y; `w > 0`
rotates CCW when viewed from +Z. Standard right-hand rule.

## Renderer handedness — to be aware of when wiring a renderer

The engine convention assumes "ground plane = XY, Z up", but most
rendering libraries default to a different ground/screen convention.
Without an explicit adapter, a positive yaw in the engine can render as
**clockwise** on screen. Each renderer needs a mapping that preserves
right-handedness:

- **Three.js** — default world is **Y-up** with the ground typically on
  the **XZ** plane. Map sim `(x, y, yaw) → render (x, 0, −y, yaw)` (note
  the sign flip on Z) so sim's +Y-forward becomes render's −Z (away from
  a default camera). Without the flip, yaw appears clockwise.
- **PixiJS / Canvas 2D** — screen **Y points down**, so naive drawing
  inverts yaw. Apply a `scaleY(-1)` (or equivalent) on the world
  container so the sim frame stays right-handed visually.
- **Phaser** — same as Pixi: Y-down screen space; flip on the way out.

These conversions belong **in the renderer adapter** (an implementation
of `SimulationRenderer`), not in the engine. The engine should never see
a flipped axis or a clockwise yaw.

### Rule of thumb

Before merging a new renderer:

1. Place a vehicle at `(0, 0)` with `yaw = 0` and `v = 1, w = 0`. It
   must move **right** on screen.
2. Set `v = 0, w = +1`. The heading indicator must rotate
   **counter-clockwise** on screen.
3. Place an obstacle at `(1, 1)` with the camera looking down at the
   XY plane. It must appear in the **upper-right** quadrant.

If any of those fail, the bug is in the renderer adapter — not in the
engine.

## Units

All engine-internal quantities are in SI:

- distance: **meters**
- time: **seconds**
- angles: **radians**
- linear velocity: **m/s**
- angular velocity: **rad/s**

Renderer adapters are free to apply a `pixelsPerMeter` (or equivalent)
scale, but no unit conversion should leak into the simulation core.
