# LabPage - Product Requirements Document

## Overview

LabPage is a self-hosted dashboard application that automatically discovers and displays services running in Docker and Kubernetes environments. It provides a clean, customizable interface for accessing and monitoring homelab/self-hosted services with minimal manual configuration.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **Config Parsing**: js-yaml
- **Docker SDK**: dockerode
- **Kubernetes SDK**: @kubernetes/client-node

## Core Features

### 1. Auto-Discovery

#### Docker Integration
- Connect to local/remote Docker daemons via socket or TCP
- Auto-discover running containers
- Extract service metadata (name, image, ports, labels, health status)
- Real-time updates via Docker events API
- Support multiple Docker hosts

#### Service URL Detection (Priority Order)

Services are prioritized by how accessible they are:

1. **Traefik Labels** (highest priority)
   - Detect `traefik.enable=true` and extract routing info
   - Read hostname from `traefik.http.routers.*.rule` labels (e.g., `Host(\`app.example.com\`)`)
   - Use `traefik.http.services.*.loadbalancer.server.port` for backend port
   - Construct URL: `http(s)://{hostname}`

2. **Traefik Admin API** (fallback)
   - Connect to Traefik's API endpoint (`/api/http/routers`, `/api/http/services`)
   - Map container names to discovered routes
   - Extract hostnames and ports from router rules
   - Useful when labels are defined in Traefik config files instead of Docker

3. **Exposed/Published Ports**
   - Use Docker's published port mappings
   - Construct URL: `http://{host}:{port}`
   - Prefer ports in common ranges (80, 443, 8080, 3000-9999)

4. **Other Containers** (lowest priority)
   - Show name, image, status
   - No clickable link
   - Still useful for visibility

#### Optional LabPage Labels
All labels are optional overrides - zero-config by default:
- `labpage.name` - Override display name
- `labpage.icon` - Override icon
- `labpage.group` - Override group assignment
- `labpage.url` - Override auto-detected URL
- `labpage.hide` - Set to `true` to exclude from dashboard

#### Kubernetes Integration
- Connect via kubeconfig or in-cluster config
- Discover services primarily from Ingress resources
- Service prioritization:
  1. **Ingress rules** - Extract hostnames from Ingress spec.rules[].host
  2. **Services with type LoadBalancer** - Use external IP/hostname
  3. **Services with type NodePort** - Use node IP + nodePort
  4. **ClusterIP services** - Show as internal-only (no clickable link)
- Auto-generate URLs from Ingress hosts + TLS configuration
- Support multiple clusters and namespaces
- Optional annotation overrides:
  - `labpage.icon: "app-icon"`
  - `labpage.group: "Networking"`
  - `labpage.hide: "true"`

### 2. Manual Configuration

#### YAML Configuration
- Single `config.yaml` file for all configuration
- Manual services added under `services:` key
- Settings, groups, and integrations in same file
- Hot-reload on file changes

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
- Drag-and-drop reordering
- Group management
- Icon picker with popular service icons
- All changes written back to config.yaml
- Changes are git-friendly (readable diffs)

### 3. Dashboard Display

#### Layout
- Responsive grid layout
- Collapsible service groups
- Customizable columns (2-6)
- Dark/Light/System theme
- Sortable: manual, alphabetical, by status

#### Service Cards
- Icon + name display
- Clickable link to service
- Status indicator (online/offline/unknown)
- Description tooltip on hover
- Custom colors per group

#### Groups
- Default groups from integration metadata
- Custom groups via config/UI
- Drag services between groups
- Collapse/expand groups
- Reorder groups

### 4. Status Monitoring

- HTTP(S) health checks for each service
- Configurable check intervals (default: 60s)
- Status indicators:
  - 🟢 Online (2xx response)
  - 🔴 Offline (timeout/error)
  - 🟡 Unknown (not checked yet)
- WebSocket for real-time status updates
- Configurable per-service check paths

## Configuration

### File Structure
```
~/.labpage/
  config.yaml         # Single config file (settings + services + groups)
  icons/
    custom-icons/     # Custom icon files
```

Single YAML file is the source of truth. UI changes write directly to it.

## API Design

All mutations write directly to `config.yaml`. No database.

### Endpoints

```
GET    /api/services          # List all services (merged discovered + manual)
POST   /api/services          # Add manual service → config.yaml
PUT    /api/services/:id      # Update service → config.yaml
DELETE /api/services/:id      # Remove service → config.yaml
POST   /api/services/refresh  # Re-scan Docker, update config.yaml

GET    /api/groups            # List groups with metadata
PUT    /api/groups/:name      # Update group order/collapsed → config.yaml

GET    /api/settings          # Get settings
PUT    /api/settings          # Update settings → config.yaml

GET    /api/health            # Health check endpoint
WS     /ws/status             # Real-time status updates
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard - service grid |
| `/settings` | App settings (theme, layout, integrations) |
| `/settings/services` | Manual service management |
| `/settings/groups` | Group management |

## Data Model (Single YAML File)

### config.yaml
```yaml
# App settings
settings:
  port: 3000
  theme: dark
  layout:
    columns: 4
    sortBy: group  # group | alphabetical | status
  monitoring:
    enabled: true
    interval: 60
    timeout: 5000

# Integrations
docker:
  hosts:
    - socket: /var/run/docker.sock
  traefik:
    enabled: true
    url: http://traefik:8080
    autoDetect: true

kubernetes:
  enabled: false
  kubeconfig: ~/.kube/config
  # Or use a service account token directly:
  # server: https://kubernetes.default.svc
  # token: eyJhbGciOiJSUzI1NiIs...

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

# Services (discovered + manual)
services:
  # Discovered from Docker (auto-populated)
  abc123def456:
    name: Sonarr
    url: https://sonarr.example.com
    icon: sonarr
    group: Media
    source: docker
    containerId: abc123def456
    checkPath: /ping
    # User overrides (merged on top of discovered)
    description: TV show management

  # Manual service (no container)
  manual-plex:
    name: Plex
    url: https://plex.example.com
    icon: plex
    group: Media
    source: manual
    description: Media server
```

### Merging Strategy
- On discovery: new containers added to `services` with `source: docker`
- User edits saved as overrides on the same entry
- If container removed: entry kept but marked `status: removed`
- Manual services (source: manual) always preserved
- UI reads merged state, writes individual changes

## Icons

- Built-in icon pack for common services (200+ icons)
- Support for custom icons via URL or file upload
- Integration with [dashboard-icons](https://github.com/walkxcode/dashboard-icons) collection
- Fallback icon for unknown services

## Security (Phase 2)

- Optional authentication (local users, OIDC, Authelia/Authentik proxy)
- API key support for programmatic access
- Rate limiting
- CORS configuration

## MVP Scope (v0.1.0)

### In Scope
- [ ] Next.js + TypeScript + Tailwind setup
- [ ] Docker integration (single host)
- [ ] Auto-discover containers
- [ ] Traefik label detection for service URLs
- [ ] Traefik admin API integration
- [ ] URL detection priority system (Traefik > ports > none)
- [ ] Basic service cards with icons
- [ ] Service groups (auto from Traefik routers + manual)
- [ ] Manual service addition via YAML
- [ ] HTTP health checks
- [ ] Dark/Light theme
- [ ] Responsive grid layout

### Out of Scope (Future)
- [ ] Kubernetes integration
- [ ] Multi-host Docker
- [ ] Authentication
- [ ] Custom themes
- [ ] Service analytics/uptime history
- [ ] Bookmarks section
- [ ] Widget system (weather, calendar, etc.)

## Success Metrics

- Services auto-discovered within 5s of container start
- Page load < 1s
- Health check accuracy > 99%
- Zero-config experience for Docker users
