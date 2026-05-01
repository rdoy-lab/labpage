import Docker from "dockerode";
import os from "os";
import { DockerConfig, DockerHost, Service, Services } from "./types";

interface ContainerInfo {
  Id: string;
  Names: string[];
  Image: string;
  Labels: Record<string, string>;
  State: string;
  Ports: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
}

interface TraefikRouter {
  name: string;
  rule: string;
  service: string;
  status: string;
}

export function createDockerClient(host: DockerHost): Docker {
  if (host.socket) {
    return new Docker({ socketPath: host.socket });
  }
  if (host.host) {
    const url = new URL(host.host);
    return new Docker({
      host: url.hostname,
      port: parseInt(url.port) || 2375,
      protocol: url.protocol.replace(":", "") as "http" | "https",
    });
  }
  return new Docker({ socketPath: "/var/run/docker.sock" });
}

function getMachineIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

function getHostIp(host: DockerHost): string {
  if (host.host) {
    try {
      return new URL(host.host).hostname;
    } catch {
      return "localhost";
    }
  }
  // Socket connection - use machine's actual IP
  return getMachineIp();
}

function replaceLocalhost(url: string, hostIp: string): string {
  return url.replace(/localhost|127\.0\.0\.1/gi, hostIp);
}

export async function discoverServices(
  config: DockerConfig
): Promise<Services> {
  const services: Services = {};

  for (const host of config.hosts) {
    try {
      const docker = createDockerClient(host);
      const containers = (await docker.listContainers()) as ContainerInfo[];

      // Try to get Traefik routers if enabled
      let traefikRouters: TraefikRouter[] = [];
      if (config.traefik.enabled) {
        traefikRouters = await getTraefikRouters(docker, config);
      }

      for (const container of containers) {
        const service = extractService(
          container,
          traefikRouters,
          host,
          docker
        );
        if (service) {
          services[container.Id] = service;
        }
      }
    } catch (error) {
      console.error(`Failed to connect to Docker host:`, host, error);
    }
  }

  return services;
}

function extractService(
  container: ContainerInfo,
  traefikRouters: TraefikRouter[],
  host: DockerHost,
  docker: Docker
): Service | null {
  const labels = container.Labels || {};
  const name = container.Names[0]?.replace(/^\//, "") || container.Id.slice(0, 12);

  // Skip if explicitly hidden
  if (labels["labpage.hide"] === "true") {
    return null;
  }

  // Determine display name
  const displayName = labels["labpage.name"] || name;

  // Determine icon
  const icon = labels["labpage.icon"] || guessIcon(container.Image);

  // Determine group
  const group = labels["labpage.group"] || inferGroup(labels, container.Image);

  // Determine URL with priority system
  const url = detectUrl(container, traefikRouters, labels, host);

  // Determine health check path
  const checkPath = labels["labpage.checkPath"] || "/";

  // Extract compose project info
  const composeProject = labels["com.docker.compose.project"] || undefined;
  const composeService = labels["com.docker.compose.service"] || undefined;

  return {
    name: displayName,
    url,
    icon,
    group,
    source: "docker",
    containerId: container.Id,
    checkPath,
    status: container.State === "running" ? "unknown" : "offline",
    composeProject,
    composeService,
  };
}

function detectUrl(
  container: ContainerInfo,
  traefikRouters: TraefikRouter[],
  labels: Record<string, string>,
  host: DockerHost
): string | undefined {
  const hostIp = getHostIp(host);

  // Priority 1: Manual override
  if (labels["labpage.url"]) {
    return replaceLocalhost(labels["labpage.url"], hostIp);
  }

  // Priority 2: Traefik hostname from labels
  const traefikHostname = extractTraefikHostname(labels);
  if (traefikHostname) {
    const url = traefikHostname.startsWith("http")
      ? traefikHostname
      : `https://${traefikHostname}`;
    return replaceLocalhost(url, hostIp);
  }

  // Priority 3: Traefik admin API routers
  const routerHostname = findRouterForContainer(container, traefikRouters);
  if (routerHostname) {
    const url = routerHostname.startsWith("http")
      ? routerHostname
      : `https://${routerHostname}`;
    return replaceLocalhost(url, hostIp);
  }

  // Priority 4: Published ports
  const portUrl = extractPortUrl(container.Ports, host);
  if (portUrl) {
    return replaceLocalhost(portUrl, hostIp);
  }

  return undefined;
}

function extractTraefikHostname(
  labels: Record<string, string>
): string | undefined {
  // Look for traefik.http.routers.*.rule with Host(...)
  for (const [key, value] of Object.entries(labels)) {
    if (key.includes("traefik.http.routers") && key.endsWith(".rule")) {
      const hostMatch = value.match(/Host\(`([^`]+)`\)/);
      if (hostMatch) {
        return hostMatch[1];
      }
    }
  }
  return undefined;
}

function extractPortUrl(
  ports: ContainerInfo["Ports"],
  host: DockerHost
): string | undefined {
  if (!ports || ports.length === 0) return undefined;

  // Prefer common web ports
  const priorityPorts = [443, 80, 8080, 3000, 8443, 9090];

  for (const priorityPort of priorityPorts) {
    const port = ports.find(
      (p) => p.PublicPort === priorityPort || p.PrivatePort === priorityPort
    );
    if (port && port.PublicPort) {
      // Use binding IP if specific (not 0.0.0.0), otherwise use host IP
      let hostIp = port.IP && port.IP !== "0.0.0.0" ? port.IP : getHostIp(host);
      const protocol = port.PublicPort === 443 || port.PublicPort === 8443
        ? "https"
        : "http";
      return `${protocol}://${hostIp}:${port.PublicPort}`;
    }
  }

  // Fallback to first published port
  const publishedPort = ports.find((p) => p.PublicPort);
  if (publishedPort && publishedPort.PublicPort) {
    let hostIp = publishedPort.IP && publishedPort.IP !== "0.0.0.0"
      ? publishedPort.IP
      : getHostIp(host);
    return `http://${hostIp}:${publishedPort.PublicPort}`;
  }

  return undefined;
}

async function getTraefikRouters(
  docker: Docker,
  config: DockerConfig
): Promise<TraefikRouter[]> {
  try {
    // Try to find Traefik container
    const containers = (await docker.listContainers()) as ContainerInfo[];
    const traefikContainer = containers.find(
      (c) =>
        c.Image.includes("traefik") ||
        c.Names.some((n) => n.includes("traefik"))
    );

    if (!traefikContainer) return [];

    // Determine Traefik API URL
    let apiUrl = config.traefik.url;
    if (!apiUrl && config.traefik.autoDetect) {
      // Try to extract from Traefik container labels
      const apiPort = extractTraefikApiPort(traefikContainer.Labels);
      if (apiPort) {
        const hostIp = config.hosts[0]?.host
          ? new URL(config.hosts[0].host).hostname
          : "localhost";
        apiUrl = `http://${hostIp}:${apiPort}`;
      }
    }

    if (!apiUrl) return [];

    // Fetch routers from Traefik API
    const response = await fetch(`${apiUrl}/api/http/routers`);
    if (!response.ok) return [];

    const routers = await response.json();
    return routers
      .filter((r: { rule: string }) => r.rule?.includes("Host("))
      .map(
        (r: {
          name: string;
          rule: string;
          service: string;
          status: string;
        }) => ({
          name: r.name,
          rule: r.rule,
          service: r.service,
          status: r.status,
        })
      );
  } catch {
    return [];
  }
}

function extractTraefikApiPort(
  labels: Record<string, string>
): number | undefined {
  // Check for --api.insecure=true and exposed port 8080
  for (const [key, value] of Object.entries(labels)) {
    if (key.includes("traefik") && value === "true") {
      // Look for port 8080
      const port = Object.entries(labels).find(
        ([k, v]) => k.includes("port") && v === "8080"
      );
      if (port) return 8080;
    }
  }
  return 8080; // Default Traefik API port
}

function findRouterForContainer(
  container: ContainerInfo,
  routers: TraefikRouter[]
): string | undefined {
  const containerName = container.Names[0]?.replace(/^\//, "") || "";

  for (const router of routers) {
    // Check if router's service matches container name
    if (
      router.service.includes(containerName) ||
      containerName.includes(router.service)
    ) {
      const hostMatch = router.rule.match(/Host\(`([^`]+)`\)/);
      if (hostMatch) {
        return hostMatch[1];
      }
    }
  }
  return undefined;
}

function inferGroup(
  labels: Record<string, string>,
  image: string
): string {
  // Common image-to-group mappings
  const groupMappings: Record<string, string> = {
    sonarr: "Media",
    radarr: "Media",
    lidarr: "Media",
    bazarr: "Media",
    plex: "Media",
    jellyfin: "Media",
    emby: "Media",
    tautulli: "Media",
    nginx: "Networking",
    traefik: "Networking",
    caddy: "Networking",
    pihole: "Networking",
    adguard: "Networking",
    wireguard: "Networking",
    openvpn: "Networking",
    portainer: "Management",
    watchtower: "Management",
    homepage: "Management",
    grafana: "Monitoring",
    prometheus: "Monitoring",
    influxdb: "Monitoring",
    uptime: "Monitoring",
    postgres: "Databases",
    mysql: "Databases",
    mariadb: "Databases",
    mongodb: "Databases",
    redis: "Databases",
    nextcloud: "Productivity",
    gitea: "Development",
    gitlab: "Development",
    jenkins: "Development",
    drone: "Development",
  };

  const imageLower = image.toLowerCase();
  for (const [keyword, group] of Object.entries(groupMappings)) {
    if (imageLower.includes(keyword)) {
      return group;
    }
  }

  return "Other";
}

function guessIcon(image: string): string {
  // Extract image name without tag
  const imageName = image.split(":")[0].split("/").pop()?.toLowerCase() || "";
  return imageName;
}
