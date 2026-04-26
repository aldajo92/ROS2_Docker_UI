# Angy Sim ROS2

A 2D/3D robot simulation built with React, TypeScript, Vite, Phaser 4, and Three.js.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm >= 10

## Getting Started

```bash
npm install
npm run dev
```

The dev server starts at [http://localhost:5173](http://localhost:5173).

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint the codebase with ESLint |

## Scenarios

Simulation scenarios are defined as JSON files in `public/scenarios/`. Load them from the UI at runtime.
