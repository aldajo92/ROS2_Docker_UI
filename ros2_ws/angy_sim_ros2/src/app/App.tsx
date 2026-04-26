import { SimulationProvider } from './SimulationProvider'
import { ControlPanel } from '../ui/ControlPanel'
import { SimulationTimeDisplay } from '../ui/SimulationTimeDisplay'
import { EntityListPanel } from '../ui/EntityListPanel'
import { MetricsPanel } from '../ui/MetricsPanel'
import { SimulationViewport } from '../ui/SimulationViewport'

export default function App() {
  return (
    <SimulationProvider>
      <main className="app-shell">
        <header>
          <h1>angy_sim_ros2</h1>
          <p className="subtitle">
            Rendering-agnostic simulation core · React UI shell only
          </p>
        </header>
        <div className="layout">
          <div className="layout-left">
            <SimulationViewport />
          </div>
          <aside className="layout-right" aria-label="Inspector">
            <h2 className="layout-title">Inspector</h2>
            <ControlPanel />
            <SimulationTimeDisplay />
            <MetricsPanel />
            <EntityListPanel />
          </aside>
        </div>
      </main>
    </SimulationProvider>
  )
}
