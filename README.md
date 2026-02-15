# DockWatch

**Lightweight Docker Log Viewer & Monitor**

Built with Go + Vanilla JS. Single binary, under 20MB.

## Features (Phase 1)
- List running containers
- Live log streaming via Server-Sent Events (SSE)
- Dark mode UI
- No external runtime dependencies (just Docker)

## How to Run

Since you don't have Go installed locally, you can run everything via Docker.

1. **Build and Run**:
   Open a terminal in this directory and run:
   ```bash
   docker-compose up --build
   ```

2. **Access UI**:
   Open your browser at `http://localhost:8080`

3. **Stop**:
   Press `Ctrl+C` in the terminal.

## Architecture
- **Backend**: Go (standard `net/http`)
- **Frontend**: HTML5 + CSS3 + EventSource (No 3rd party JS)
- **Docker Client**: Official Docker SDK
- **Deployment**: Multi-stage Docker build (Alpine Linux base)

## Roadmap
- [ ] Phase 2: CPU/Memory Metrics & Alerts (Slack/Discord)
- [ ] Phase 3: Export Logs (JSON, CSV, PDF)

Author: Ruturaj Sharbidre