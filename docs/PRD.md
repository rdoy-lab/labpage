# LabPage - Product Requirements Document

## Overview

LabPage is a self-hosted dashboard application that automatically discovers and displays services running in Docker and Kubernetes environments. It provides a clean, customizable interface for accessing and monitoring homelab/self-hosted services with minimal manual configuration.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: React 19
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State Management**: Zustand
- **Config Parsing**: js-yaml
- **Docker SDK**: dockerode
- **Kubernetes SDK**: @kubernetes/client-node

## Core Features

### 1. Auto-Discovery

#### Docker Integration
- Connect to local/remote Docker daemons via socket or TCP
- Support multiple Docker hosts
- Auto-discover running containers
- Extract service metadata (name, image, ports, labels, health status)

#### Service URL Detection (Priority Order)

Services are prioritized by how accessible they are:

1. **Manual Override** (highest priority)
   - `labpage.url` label on container overrides all detection

2. **Traefik Labels**
   - Detect `traefik.enable=true` and extract routing info
   - Read hostname from `traefik.http.routers.*.rule` labels (e.g., `Host(\`app.example.com\`)`)
   - Use `traefik.http.services.*.loadbalancer.server.port` for backend port
   - Construct URL: `http(s)://{hostname}`

3. **Traefik Admin API** (fallback)
   - Connect to Traefik's API endpoint (`/api/http/routers`, `/api/entrypoints`)
   - Map container names to discovered routes
   - Extract hostnames and ports from router rules
   - Useful when labels are defined in Traefik config files instead of Docker

4. **Published Ports** (lowest priority)
   - Use Docker's published port mappings
   - Construct URL: `http://{host}:{port}`
   - Prefer ports in common ranges (80, 443, 8080, 3000-9999)

#### Optional LabPage Labels
All labels are optional overrides - zero-config by default:
- `labpage.name` - Override display name
- `labpage.icon` - Override icon
- `labpage.group` - Override group assignment
- `labpage.url` - Override auto-detected URL
- `labpage.hide` - Set to `true` to exclude from dashboard
- `labpage.checkPath` - Custom health check path (default: `/`)

#### Kubernetes Integration
- Connect via kubeconfig, in-cluster config, or token/server URL
- Discover services from Ingress resources, Gateway API, and Services
- Service prioritization:
  1. **Ingress rules** - Extract hostnames from Ingress spec.rules[].host
  2. **Gateway API** - Gateways + HTTPRoutes
  3. **Services with type LoadBalancer** - Use external IP/hostname
  4. **Services with type NodePort** - Use node IP + nodePort
- Support multiple contexts and namespaces
- Group services by namespace
- Optional annotation overrides:
  - `labpage.icon: "app-icon"`
  - `labpage.group: "Networking"`
  - `labpage.hide: "true"`

### 2. Manual Configuration

#### YAML Configuration
- Single `config.yaml` file for all configuration
- Manual services added under `services:` key
- Settings, groups, and integrations in same file
- Path configurable via `--config` flag or `LABPAGE_CONFIG` env var (defaults to XDG path)

Example manual service in `config.yaml`:
```yaml
services:
  my-custom-app:
    name: Custom App
    url: http://192.168.1.100:3000
    icon: custom-app
    group: Development
    source: manual
    description: Internal development tool
```

#### Web UI Configuration
- Add/edit/delete services via UI
- Group management (collapse/expand, reorder)
- All manual service changes written back to config.yaml
- Changes are git-friendly (readable diffs)

### 3. Dashboard Display

#### Layout
- Responsive grid layout
- Collapsible service groups
- Tab-based views: Groups, Stacks (Docker Compose + Kubernetes namespaces)
- Dark/Light/System theme

#### Service Cards
- Icon (favicon proxy or auto-detected from image name) + name display
- Clickable link to service
- Status indicator dot (green=online, red=offline, yellow=unknown)
- Description showing URL detection source

#### Groups
- Auto-generated groups from Docker image name heuristics
- Custom groups via config/UI
- Collapse/expand groups with state persisted to config.yaml
- Reorderable via config

#### Stacks View
- Docker Compose project grouping via `com.docker.compose.project` label
- Kubernetes namespace grouping for K8s services
- Stack/namespace cards with service count

### 4. Status Monitoring

- HTTP(S) health checks for each service
- Configurable per-service check paths
- 5s timeout per check
- Status indicators:
  - Green: Online (2xx-3xx response)
  - Red: Offline (timeout/error)
  - Yellow: Unknown (not checked yet)
- Batch health checks via API and UI refresh

## Configuration

### File Structure
```
~/.config/labpage/
  config.yaml         # Single config file (manual services + groups + integration settings)
```

Single YAML file is the source of truth for manual services. Discovered services are held in memory and merged on read.

## API Design

Manual service mutations write directly to `config.yaml`. No database.

### Endpoints

```
GET    /api/services          # List all services (merged discovered + manual)
POST   /api/services          # Add manual service → config.yaml
PUT    /api/services/:id      # Update service → config.yaml
DELETE /api/services/:id      # Remove service → config.yaml
POST   /api/services/refresh  # Re-scan Docker + Kubernetes, re-check favicons

PUT    /api/groups/:name      # Update group order/collapsed → config.yaml

GET    /api/config            # Get full config with merged services

POST   /api/health            # Run health checks on all services
GET    /api/favicon?url=<...> # Proxy-fetch a service favicon
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard - service grid with Groups and Stacks tabs |

## Data Model (Single YAML File)

### config.yaml
```yaml
# Docker integration
docker:
  hosts:
    - socket: /var/run/docker.sock
  traefik:
    enabled: true
    autoDetect: true

# Kubernetes integration
kubernetes:
  enabled: true
  kubeconfig: ~/.kube/config

# Group ordering and collapsed state
groups:
  Media:
    order: 0
    collapsed: false
  Networking:
    order: 1
    collapsed: false
  Development:
    order: 2
    collapsed: true

# Manual services only (persisted)
# Discovered services are in-memory and not written to config.yaml
services:
  manual-plex:
    name: Plex
    url: https://plex.example.com
    icon: plex
    group: Media
    source: manual
    description: Media server
```

### Merging Strategy
- Discovered services are kept in memory (server-side module), not written to disk
- Manual services (source: manual) are persisted in config.yaml
- On API reads, manual and discovered services are merged (discovered override manual for same ID)
- Service refresh re-discovers all Docker containers and Kubernetes resources

## Icons

- Auto-detected from Docker image name (e.g., `sonarr` → icon: `sonarr`)
- Configurable via `labpage.icon` label or manual service config
- Favicon proxy endpoint fetches and caches favicons from service URLs
- Falls back to showing first letter of service name if no favicon available

## Security (Phase 2)

- Optional authentication (local users, OIDC, Authelia/Authentik proxy)
- API key support for programmatic access
- Rate limiting
- CORS configuration

## Current Scope (v0.1.0)

### Implemented
- [x] Docker integration (socket/TCP, multiple hosts)
- [x] Auto-discover containers
- [x] Traefik label detection for service URLs
- [x] Traefik admin API integration
- [x] URL detection priority system (manual > Traefik labels > Traefik API > ports)
- [x] Kubernetes integration (Ingress, Gateway API, LoadBalancer/NodePort)
- [x] Service cards with favicon proxy
- [x] Service groups (auto from image heuristics + manual)
- [x] Collapsible groups with persisted state
- [x] Docker Compose stack grouping
- [x] Kubernetes namespace grouping
- [x] Manual service addition via YAML and API
- [x] HTTP health checks with status indicators
- [x] Dark/Light/System theme
- [x] Responsive grid layout
- [x] Favicon proxy with caching

### Future
- [ ] Settings page (UI for config editing)
- [ ] Service add/edit/delete from UI
- [ ] Customizable columns
- [ ] Drag-and-drop reordering
- [ ] Real-time updates via Docker events API
- [ ] WebSocket for live status updates
- [ ] Authentication
- [ ] Built-in icon pack (dashboard-icons integration)
- [ ] Custom themes
- [ ] Service analytics/uptime history
- [ ] Bookmarks section
- [ ] Widget system (weather, calendar, etc.)
