# Dockerfile.prod Agent Prompt

Use this prompt to create a production Docker setup for `ROS2_Docker_UI`.

This project currently has a development `Dockerfile`. The production Dockerfile
must be separate and should not replace the development container.

---

## Agent Role

You are a production-container implementation agent.

Your task is to create a CPU-only `Dockerfile.prod` and supporting production
compose files for a small public/private demo deployment of `angy_sim_ros2` and
rosbridge.

The deployment target is a standard VPS such as DigitalOcean, without NVIDIA,
CUDA, GPU runtime, or GUI requirements.

---

## Goals

Create:

```text
Dockerfile.prod
compose.prod.yml
Caddyfile
```

The production stack must:

- build the web simulator frontend
- run ROS 2 / rosbridge for integration demos
- expose the frontend over HTTPS through Caddy
- expose rosbridge only through a WSS reverse proxy path, not directly on a
  public port
- avoid NVIDIA/GPU assumptions
- avoid host UID/GID build args
- keep the current development Dockerfile working unchanged

---

## Read First

Before implementing, inspect:

```text
README.md
Dockerfile
scripts/build.sh
scripts/run.sh
scripts/bash.sh
ros2_ws/angy_sim_ros2/package.json
ros2_ws/angy_sim_ros2/vite.config.*
ros2_ws/src/**/launch/*.py
ros2_ws/src/angy_sim_topics/launch/web_test.launch.py
```

If some files are missing, adapt to the current repository state.

---

## Production Architecture

Preferred stack:

```text
caddy
  -> app service (static frontend)
  -> ros service (/rosbridge -> internal port 9090)
```

Recommended service split:

```text
app:
  frontend static assets served by nginx/caddy/node static server

ros:
  ROS 2 workspace + rosbridge launch command

caddy:
  public HTTP/HTTPS entrypoint
```

If keeping one app+ROS image is much simpler for the first pass, that is
acceptable, but the final public entrypoint should still be through Caddy.

---

## Dockerfile.prod Requirements

Use multi-stage builds where practical.

Suggested targets:

```text
target: web-build
  - node image
  - npm ci
  - npm run build

target: app
  - nginx or caddy/static image
  - copy built frontend assets

target: ros
  - ros:${ROS_DISTRO}-ros-base
  - install only runtime ROS dependencies needed for demo:
      ros-${ROS_DISTRO}-rosbridge-suite
      package dependencies needed by selected launch files
  - copy ros2_ws/src
  - colcon build
  - default command can be overridden by compose
```

Do not include:

- NVIDIA Container Toolkit
- CUDA packages
- GUI/RViz/Gazebo desktop dependencies unless required by the selected demo
- development-only aliases
- host UID/GID user creation
- bind mounts as a requirement for production

Do include:

- `rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*` after apt installs
- `apt-get` or `apt` consistently; prefer `apt-get` in Dockerfiles
- non-root runtime user when practical
- deterministic frontend install (`npm ci`) if lockfile exists
- clear `WORKDIR`s

---

## Frontend Build Requirements

The web app lives under:

```text
ros2_ws/angy_sim_ros2
```

Build using project scripts from `package.json`.

Production env must support:

```text
VITE_ROSBRIDGE_URL=wss://<domain>/rosbridge
```

If the app currently reads a different env var, use the existing one and
document it.

Build args may be used:

```dockerfile
ARG VITE_ROSBRIDGE_URL
ENV VITE_ROSBRIDGE_URL=${VITE_ROSBRIDGE_URL}
```

Make sure the final static server serves the Vite `dist/` output.

---

## ROS Runtime Requirements

The ROS service should:

- source `/opt/ros/${ROS_DISTRO}/setup.bash`
- source the built workspace install setup
- launch the selected demo launch file
- run rosbridge websocket on internal port `9090`

Example compose command:

```bash
bash -lc "source /opt/ros/$ROS_DISTRO/setup.bash \
  && source /home/ros/ros2_ws/install/setup.bash \
  && ros2 launch angy_sim_topics web_test.launch.py"
```

Adjust the package/launch file to whatever the repository actually contains.

---

## Caddyfile Requirements

Create a `Caddyfile` like:

```caddyfile
{$APP_DOMAIN} {
  encode gzip

  handle_path /rosbridge* {
    reverse_proxy ros:9090
  }

  handle {
    reverse_proxy app:80
  }
}
```

If using static Caddy service for frontend, adapt service names accordingly.

Optional Basic Auth block should be included as commented guidance.

---

## compose.prod.yml Requirements

Create a production compose file with:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.prod
      target: app
      args:
        VITE_ROSBRIDGE_URL: ${VITE_ROSBRIDGE_URL}
    restart: unless-stopped

  ros:
    build:
      context: .
      dockerfile: Dockerfile.prod
      target: ros
    restart: unless-stopped
    expose:
      - "9090"

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      APP_DOMAIN: ${APP_DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
      - ros

volumes:
  caddy_data:
  caddy_config:
```

Do not publish `9090:9090` publicly.

---

## Optional .env.prod.example

If useful, create:

```text
APP_DOMAIN=your-domain.example
VITE_ROSBRIDGE_URL=wss://your-domain.example/rosbridge
```

Do not commit secrets.

---

## Build And Run Commands

Document:

```bash
cp .env.prod.example .env.prod
docker compose --env-file .env.prod -f compose.prod.yml build
docker compose --env-file .env.prod -f compose.prod.yml up -d
docker compose --env-file .env.prod -f compose.prod.yml logs -f
```

---

## Verification

After implementation:

1. Build the production images.
2. Run the compose stack.
3. Confirm the frontend responds.
4. Confirm Caddy logs show HTTPS certificates when using a real domain.
5. Confirm `/rosbridge` websocket proxies to the ROS service.
6. Confirm port `9090` is not publicly published.
7. Confirm the original development Dockerfile/scripts still work.

Useful commands:

```bash
docker compose -f compose.prod.yml config
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs -f ros
docker compose -f compose.prod.yml logs -f app
docker compose -f compose.prod.yml logs -f caddy
```

---

## Common Failure Modes To Avoid

- Installing Node.js through apt in a ROS image when a separate Node build stage
  is simpler and smaller.
- Leaving apt caches in layers, causing disk pressure.
- Requiring `HOST_UID` / `HOST_GID` in production.
- Exposing rosbridge on public `9090`.
- Building frontend with `ws://localhost:9090` for public deployment.
- Including GPU/NVIDIA setup in a CPU-only VPS deployment.
- Depending on bind-mounted source code in production.
- Starting Vite dev server in production instead of serving static assets.

---

## Output Expected From The Agent

When done, report:

- Files created/changed.
- Exact production build command.
- Exact production run command.
- Which launch file the ROS service runs.
- Which env vars are required.
- How rosbridge is exposed externally.
- Any known limitations or deferred work.

