import { useSimulation, useSimulationTime, useEntityListVersion } from '../app/useSimulation'
import { VehicleEntity } from '../simulation/entities/VehicleEntity'
import { StaticObstacleEntity } from '../simulation/entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../simulation/entities/DynamicActorEntity'
import type { Entity } from '../simulation/entities/Entity'

export function EntityListPanel() {
  const { engine } = useSimulation()
  // Subscribing to both `tick` and `entityListVersion` lets the table
  // update as poses change AND when entities are added/removed. The
  // cost is one re-render per tick of just this component.
  useSimulationTime()
  useEntityListVersion()

  const entities = engine.entities.toArray()

  return (
    <section className="panel entity-panel">
      <h2>Entities ({entities.length})</h2>
      {entities.length === 0 ? (
        <p className="empty">No entities. Load a scenario to begin.</p>
      ) : (
        <table className="entity-table">
          <thead>
            <tr>
              <th>id</th>
              <th>type</th>
              <th>x</th>
              <th>y</th>
              <th>θ</th>
              <th>v</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <EntityRow key={e.id} entity={e} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function EntityRow({ entity }: { entity: Entity }) {
  const summary = describeEntity(entity)
  return (
    <tr>
      <td>{entity.id}</td>
      <td>{entity.type}</td>
      <td>{summary.x}</td>
      <td>{summary.y}</td>
      <td>{summary.yaw}</td>
      <td>{summary.v}</td>
    </tr>
  )
}

interface EntitySummary {
  x: string
  y: string
  yaw: string
  v: string
}

function describeEntity(entity: Entity): EntitySummary {
  if (entity instanceof VehicleEntity) {
    return {
      x: entity.pose.position.x.toFixed(2),
      y: entity.pose.position.y.toFixed(2),
      yaw: entity.pose.yaw.toFixed(2),
      v: entity.v.toFixed(2),
    }
  }
  if (entity instanceof DynamicActorEntity) {
    const speed = Math.hypot(entity.velocity.x, entity.velocity.y)
    return {
      x: entity.pose.position.x.toFixed(2),
      y: entity.pose.position.y.toFixed(2),
      yaw: entity.pose.yaw.toFixed(2),
      v: speed.toFixed(2),
    }
  }
  if (entity instanceof StaticObstacleEntity) {
    return {
      x: entity.position.x.toFixed(2),
      y: entity.position.y.toFixed(2),
      yaw: '—',
      v: '0.00',
    }
  }
  return { x: '—', y: '—', yaw: '—', v: '—' }
}
