/**
 * The camera "personality" the user picked. Adding a new mode is a
 * three-step process:
 *
 *   1. Add the literal here.
 *   2. Implement a `CameraController` for it.
 *   3. Register the controller in `CameraControllerManager`.
 */
export type CameraMode = 'orbit' | 'followVehicle' | 'topDown'
