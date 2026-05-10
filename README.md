# LabPage

Self-hosted dashboard that auto-discovers services from Docker and Kubernetes. Zero-config by default - just point it at your Docker socket.

## Features

- **Auto-discovery** - Finds running Docker containers automatically
- **Kubernetes integration** - Discovers services from Kubernetes (Ingresses, Gateway API, LoadBalancer/NodePort)
- **Traefik integration** - Detects hostnames from Traefik labels and admin API
- **Docker Compose stacks** - Groups containers by compose project
- **Kubernetes namespaces** - Groups services by namespace
- **Favicon detection** - Proxies and caches service favicons automatically
- **Health monitoring** - HTTP checks with online/offline indicators
- **Single config file** - Everything in a YAML config file
- **Dark/light theme** - System-aware with manual override
- **Responsive grid** - Works on desktop and mobile

## Quick Start

```bash
npm install
npm run dev -- --hostname 0.0.0.0
```

Open http://localhost:3000 and click **Refresh** to discover services.

## Docker

### Docker Compose

```yaml
services:
  labpage:
    image: ghcr.io/rdoy-lab/labpage:latest
    container_name: labpage
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - LABPAGE_CONFIG=/config/config.yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config.yaml:/config/config.yaml
      # Uncomment for Kubernetes integration:
      # - ~/.kube/config:/root/.kube/config:ro
```

Place your `config.yaml` next to the `docker-compose.yml`, then start:

```bash
docker compose up -d
```

### Docker CLI

```bash
docker run -d \
  --name labpage \
  -p 3000:3000 \
  -e LABPAGE_CONFIG=/config/config.yaml \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./config.yaml:/config/config.yaml \
  ghcr.io/rdoy-lab/labpage:latest
```

### Build from source

```bash
docker build -t labpage .
docker run -d \
  -p 3000:3000 \
  -e LABPAGE_CONFIG=/config/config.yaml \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./config.yaml:/config/config.yaml \
  labpage
```

## Configuration

Config path defaults to `~/.config/labpage/config.yaml` (XDG). Override with:
- `--config <path>` flag
- `LABPAGE_CONFIG` environment variable

```yaml
docker:
  hosts:
    - socket: /var/run/docker.sock
  traefik:
    enabled: true
    autoDetect: true

kubernetes:
  enabled: true
  kubeconfig: ~/.kube/config
  # Or target specific contexts:
  # contexts: ["prod-cluster", "dev-cluster"]
  # Or use a service account token directly:
  # server: https://kubernetes.default.svc
  # token: eyJhbGciOiJSUzI1NiIs...

groups:
  Media:
    order: 0
    collapsed: false

services:
  manual-plex:
    name: Plex
    url: https://plex.example.com
    icon: plex
    group: Media
    source: manual
```

Manual services are persisted to config.yaml. Discovered services are kept in memory.

## URL Detection

Services are prioritized by accessibility:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Manual override (`labpage.url` label) | `https://myapp.com` |
| 2 | Traefik labels | `Host(\`app.example.com\`)` |
| 3 | Traefik admin API | Router rules lookup |
| 4 | Published ports | `http://host:8080` |

Localhost references are automatically replaced with the machine's IP.

## Docker Labels

All labels are optional - zero-config by default.

| Label | Description |
|-------|-------------|
| `labpage.hide=true` | Exclude from dashboard |
| `labpage.name=My App` | Override display name |
| `labpage.icon=app-icon` | Override icon |
| `labpage.group=Media` | Override group |
| `labpage.url=https://...` | Override detected URL |
| `labpage.checkPath=/health` | Custom health check path |

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get full config with merged services |
| `/api/services` | GET | List services |
| `/api/services` | POST | Add manual service |
| `/api/services/:id` | PUT | Update service |
| `/api/services/:id` | DELETE | Remove service |
| `/api/services/refresh` | POST | Re-scan Docker and Kubernetes |
| `/api/groups/:name` | PUT | Update group |
| `/api/health` | POST | Run health checks |
| `/api/favicon?url=<service-url>` | GET | Fetch service favicon |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── config/         # Config API
│   │   ├── favicon/        # Favicon proxy
│   │   ├── groups/         # Group management
│   │   ├── health/         # Health check API
│   │   └── services/       # Service CRUD + refresh
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Dashboard
│   └── globals.css         # Global styles
├── components/
│   ├── dashboard.tsx       # Main dashboard with tabs
│   ├── service-card.tsx    # Service card with favicon
│   ├── service-group.tsx   # Collapsible group
│   ├── stack-group.tsx     # Compose stack container
│   ├── theme-provider.tsx  # Theme provider
│   └── ui/                 # shadcn/ui components
└── lib/
    ├── config.ts           # YAML config parser
    ├── docker.ts           # Docker + Traefik discovery
    ├── favicon.ts          # Favicon fetcher
    ├── health.ts           # Health check service
    ├── kubernetes.ts       # Kubernetes discovery
    ├── runtime.ts          # In-memory discovered services
    ├── store.ts            # Zustand state
    ├── types.ts            # TypeScript types
    └── utils.ts            # Utility functions
```

## Tech Stack

- [Next.js](https://nextjs.org/) 16 - App Router, API routes
- [React](https://react.dev/) 19 - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) 4 - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [dockerode](https://github.com/apocas/dockerode) - Docker API
- [@kubernetes/client-node](https://github.com/kubernetes-client/javascript) - Kubernetes API
- [js-yaml](https://github.com/nodeca/js-yaml) - YAML parsing
