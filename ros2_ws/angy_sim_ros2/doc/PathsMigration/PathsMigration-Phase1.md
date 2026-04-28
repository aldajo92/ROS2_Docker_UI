## Prompt 1: crear la capa genérica de trayectorias

````text
I want to add a generic simulation-owned trajectory tracking model to `angy_sim_ros2`.

Context:
- Follow `Architecture.md` and `Development_Guide.md`.
- This is Phase 1 of a migration.
- Do not modify the renderer yet.
- Do not modify the Inspector yet.
- Do not modify scenario loading yet unless strictly needed for imports/types.
- The current vehicle trail may still exist in the renderer for now.
- The goal of this phase is only to create the simulation-level trajectory data model and registry.

Important distinction:
- `Path2D` = planned/reference route.
- `Trajectory` = actual historical runtime samples of an entity.
- Trajectory tracking should be generic and entity-based, not vehicle-only.

Architecture rules:
- Do not import React, Three.js, Phaser, DOM APIs, Rapier, WebSocket, ROS2, DDS, or infrastructure code inside `src/simulation` or `src/math`.
- Do not store trajectory samples inside `VehicleEntity`.
- Do not mutate trajectories from renderers.
- This phase should create the data model only.

Create:

src/simulation/trajectories/
  TrajectorySample2D.ts
  EntityTrajectory2D.ts
  TrajectoryRegistry.ts
  TrajectoryTrackingConfig.ts
  getEntityTrajectoryPose2D.ts

1. Create `TrajectorySample2D.ts`

```ts
export type TrajectorySample2D = {
  timeSec: number;
  x: number;
  y: number;
  yaw?: number;
  speed?: number;
};
````

Rules:

* `timeSec` is simulation time.
* `x` and `y` are simulation coordinates in meters.
* `yaw` is optional and in radians.
* `speed` is optional.
* Keep it JSON-friendly.

2. Create `EntityTrajectory2D.ts`

```ts
import type { TrajectorySample2D } from "./TrajectorySample2D";

export type EntityTrajectory2D = {
  entityId: string;
  samples: TrajectorySample2D[];
  metadata?: Record<string, unknown>;
};

export type ReadonlyEntityTrajectory2D = {
  readonly entityId: string;
  readonly samples: readonly TrajectorySample2D[];
  readonly metadata?: Readonly<Record<string, unknown>>;
};
```

3. Create `TrajectoryRegistry.ts`

Requirements:

* Store trajectories by `entityId`.
* Support add/append/clear/prune.
* Enforce max sample count.
* Expose readonly or defensive-copy access to prevent renderer mutation.
* Preserve insertion order.

Suggested API:

```ts
import type {
  EntityTrajectory2D,
  ReadonlyEntityTrajectory2D,
} from "./EntityTrajectory2D";
import type { TrajectorySample2D } from "./TrajectorySample2D";

export class TrajectoryRegistry {
  private readonly trajectories = new Map<string, EntityTrajectory2D>();

  get(entityId: string): ReadonlyEntityTrajectory2D | undefined {
    const trajectory = this.trajectories.get(entityId);
    if (!trajectory) return undefined;

    return {
      entityId: trajectory.entityId,
      samples: [...trajectory.samples],
      metadata: trajectory.metadata ? { ...trajectory.metadata } : undefined,
    };
  }

  has(entityId: string): boolean {
    return this.trajectories.has(entityId);
  }

  ensure(entityId: string): void {
    if (!this.trajectories.has(entityId)) {
      this.trajectories.set(entityId, {
        entityId,
        samples: [],
      });
    }
  }

  append(entityId: string, sample: TrajectorySample2D, maxSamples: number): void {
    this.ensure(entityId);

    const trajectory = this.trajectories.get(entityId);
    if (!trajectory) return;

    trajectory.samples.push(sample);

    while (trajectory.samples.length > maxSamples) {
      trajectory.samples.shift();
    }
  }

  pruneOlderThan(entityId: string, minTimeSec: number): void {
    const trajectory = this.trajectories.get(entityId);
    if (!trajectory) return;

    trajectory.samples = trajectory.samples.filter(
      (sample) => sample.timeSec >= minTimeSec
    );
  }

  clear(entityId?: string): void {
    if (entityId) {
      this.trajectories.delete(entityId);
      return;
    }

    this.trajectories.clear();
  }

  remove(entityId: string): void {
    this.trajectories.delete(entityId);
  }

  toArray(): ReadonlyEntityTrajectory2D[] {
    return [...this.trajectories.values()].map((trajectory) => ({
      entityId: trajectory.entityId,
      samples: [...trajectory.samples],
      metadata: trajectory.metadata ? { ...trajectory.metadata } : undefined,
    }));
  }

  size(): number {
    return this.trajectories.size;
  }
}
```

4. Create `TrajectoryTrackingConfig.ts`

```ts
export type TrajectorySamplingMode = "pointCount" | "timeWindow";

export type EntityTrajectoryTrackingConfig = {
  entityId: string;
  enabled?: boolean;
  samplingMode?: TrajectorySamplingMode;
  maxSamples?: number;
  timeWindowSec?: number;
  minSampleDtSec?: number;
  minDistance?: number;
};

export type TrajectoryTrackingConfig = {
  enabled?: boolean;
  trackAllSupportedEntities?: boolean;

  defaultSamplingMode?: TrajectorySamplingMode;
  defaultMaxSamples?: number;
  defaultTimeWindowSec?: number;
  defaultMinSampleDtSec?: number;
  defaultMinDistance?: number;

  entities?: EntityTrajectoryTrackingConfig[];
};

export const DEFAULT_TRAJECTORY_TRACKING_CONFIG = {
  enabled: false,
  trackAllSupportedEntities: false,
  defaultSamplingMode: "pointCount",
  defaultMaxSamples: 500,
  defaultTimeWindowSec: 10,
  defaultMinSampleDtSec: 0,
  defaultMinDistance: 0,
  entities: [],
} satisfies Required<TrajectoryTrackingConfig>;
```

Rules:

* `pointCount` keeps the last `maxSamples`.
* `timeWindow` keeps samples newer than `currentTimeSec - timeWindowSec`, and also enforces `maxSamples`.
* `minDistance = 0` means append even if stopped.
* `minSampleDtSec = 0` means append every tick.

5. Create `getEntityTrajectoryPose2D.ts`

Create a helper that extracts a generic 2D trajectory pose from supported entities.

```ts
import type { Entity } from "../entities/Entity";

export type TrajectoryPose2D = {
  x: number;
  y: number;
  yaw?: number;
  speed?: number;
};

export function getEntityTrajectoryPose2D(
  entity: Entity
): TrajectoryPose2D | undefined {
  // VehicleEntity:
  // use public pose API.
  // include yaw and speed if available.
  //
  // DynamicActorEntity:
  // use public pose or position API.
  //
  // StaticObstacleEntity:
  // return undefined by default, unless the current design wants to support static entities.
  //
  // Unsupported entities:
  // return undefined.
}
```

Rules:

* Use public entity APIs only.
* Do not access private fields.
* Do not import renderer code.
* Do not import Three.js.
* Return `undefined` for unsupported entities.

6. Add tests

Create tests for:

TrajectoryRegistry:

* starts empty
* ensure creates trajectory
* append adds samples
* append enforces maxSamples
* pruneOlderThan removes old samples
* clear one entity
* clear all
* toArray returns defensive copies or readonly-safe data
* insertion order is deterministic

getEntityTrajectoryPose2D:

* extracts vehicle pose if supported
* extracts dynamic actor pose if supported
* returns undefined for unsupported/static entities if that is the selected policy

7. Expected result

After this phase:

* The project has a generic simulation-level trajectory model.
* No renderer behavior has changed yet.
* The existing renderer-owned trail can still exist temporarily.
* No forbidden imports are introduced.

````
