Show me the React component tree as a Mermaid graph TD. Include only nodes that are React components (functions/classes rendered as <X />). Exclude HTML elements, CSS classes, JSX expressions, hooks, providers, routers, props, and state. No styling, no notes, no extra commentary.

graph TD
  App --> CarSimScene
  App --> Dashboard
  Dashboard --> VelocityChart
  VelocityChart --> ChartLine

  CarSimScene --> SimScene
  CarSimScene --> ProjectionCamera
  CarSimScene --> CameraFollower
  CarSimScene --> OrbitControls

  SimScene --> WorldFrame
  WorldFrame --> Ground
  SimScene --> OriginMarker
  SimScene --> WorldAxes
  SimScene --> Obstacles
  SimScene --> Trail
  SimScene --> Car

  WorldAxes --> Arrow
  Car --> Arrow
  Trail --> DreiLine
  Obstacles --> Obstacle

  ProjectionCamera --> PerspectiveCamera
  ProjectionCamera --> OrthographicCamera

  Development --> SimSceneCell
  Development --> CarCamSimCell

  SimSceneCell --> SimScene
  SimSceneCell --> OrbitControls

  CarCamSimCell --> SimScene
  CarCamSimCell --> ProjectionCamera
  CarCamSimCell --> PresetCameraRig
  CarCamSimCell --> OrbitControls
  CarCamSimCell --> CameraHud
