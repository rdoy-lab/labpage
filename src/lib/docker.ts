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
  entryPoints: string[];
}

interface TraefikEntrypoint {
  name: string;
  address: string;
}

interface TraefikInfo {
  routers: TraefikRouter[];
  entrypoints: TraefikEntrypoint[];
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
  if (process.env.HOST_IP) {
    return process.env.HOST_IP;
  }
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
  if (host.hostIp) {
    return host.hostIp;
  }
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
      let traefikInfo: TraefikInfo = { routers: [], entrypoints: [] };
      if (config.traefik.enabled) {
        traefikInfo = await getTraefikInfo(docker, config);
      }

      for (const container of containers) {
        const service = extractService(
          container,
          traefikInfo,
          host
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
  traefikInfo: TraefikInfo,
  host: DockerHost
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

  // Determine URL with priority system and discovery source
  const { url, urlSource } = detectUrl(container, traefikInfo, labels, host);

  // Determine health check path
  const checkPath = labels["labpage.checkPath"] || "/";

  // Determine description based on how URL was discovered
  const description = urlSource ? `${urlSource}: ${url}` : undefined;

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
    description,
    checkPath,
    status: container.State === "running" ? "unknown" : "offline",
    composeProject,
    composeService,
  };
}

function detectUrl(
  container: ContainerInfo,
  traefikInfo: TraefikInfo,
  labels: Record<string, string>,
  host: DockerHost
): { url?: string; urlSource?: string } {
  const hostIp = getHostIp(host);

  // Priority 1: Manual override
  if (labels["labpage.url"]) {
    return {
      url: replaceLocalhost(labels["labpage.url"], hostIp),
      urlSource: "Manual",
    };
  }

  // Priority 2: Traefik hostname from labels
  const traefikHostname = extractTraefikHostname(labels);
  if (traefikHostname) {
    const protocol = guessProtocolFromLabels(labels) ? "https" : "http";
    const url = traefikHostname.startsWith("http")
      ? traefikHostname
      : `${protocol}://${traefikHostname}`;
    return {
      url: replaceLocalhost(url, hostIp),
      urlSource: "Traefik",
    };
  }

  // Priority 3: Traefik admin API routers
  const routerUrl = findRouterForContainer(container, traefikInfo);
  if (routerUrl) {
    return {
      url: replaceLocalhost(routerUrl, hostIp),
      urlSource: "Traefik",
    };
  }

  // Priority 4: Published ports
  const portUrl = extractPortUrl(container.Ports, host);
  if (portUrl) {
    return {
      url: replaceLocalhost(portUrl, hostIp),
      urlSource: "Port",
    };
  }

  return {};
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

function guessProtocolFromLabels(labels: Record<string, string>): boolean {
  // Check for TLS/cert resolver or entrypoint=websecure in router labels
  for (const [key, value] of Object.entries(labels)) {
    if (!key.includes("traefik.http.routers") || !key.includes(".")) {
      continue;
    }
    const suffix = key.split(".").pop();
    if (suffix === "tls") {
      return value === "true";
    }
    if (suffix === "entrypoints" && value.toLowerCase().includes("websecure")) {
      return true;
    }
    if (suffix === "entrypoints" && value.toLowerCase() === "web") {
      return false;
    }
  }
  return false;
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
      const hostIp = port.IP && port.IP !== "0.0.0.0" ? port.IP : getHostIp(host);
      const protocol = port.PublicPort === 443 || port.PublicPort === 8443
        ? "https"
        : "http";
      return `${protocol}://${hostIp}:${port.PublicPort}`;
    }
  }

  // Fallback to first published port
  const publishedPort = ports.find((p) => p.PublicPort);
  if (publishedPort && publishedPort.PublicPort) {
    const hostIp = publishedPort.IP && publishedPort.IP !== "0.0.0.0"
      ? publishedPort.IP
      : getHostIp(host);
    return `http://${hostIp}:${publishedPort.PublicPort}`;
  }

  return undefined;
}

async function getTraefikInfo(
  docker: Docker,
  config: DockerConfig
): Promise<TraefikInfo> {
  const emptyResult: TraefikInfo = { routers: [], entrypoints: [] };

  try {
    // Try to find Traefik container
    const containers = (await docker.listContainers()) as ContainerInfo[];
    const traefikContainer = containers.find(
      (c) =>
        c.Image.includes("traefik") ||
        c.Names.some((n) => n.includes("traefik"))
    );

    if (!traefikContainer) return emptyResult;

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

    if (!apiUrl) return emptyResult;

    // Fetch routers and entrypoints in parallel
    const [routersResponse, entrypointsResponse] = await Promise.all([
      fetch(`${apiUrl}/api/http/routers`),
      fetch(`${apiUrl}/api/entrypoints`),
    ]);

    if (!routersResponse.ok) return emptyResult;

    const routers = await routersResponse.json();
    const entrypoints = entrypointsResponse.ok
      ? await entrypointsResponse.json()
      : [];

    const traefikRouters: TraefikRouter[] = routers
      .filter((r: { rule: string }) => r.rule?.includes("Host("))
      .map(
        (r: {
          name: string;
          rule: string;
          service: string;
          status: string;
          entryPoints?: string[];
        }) => ({
          name: r.name,
          rule: r.rule,
          service: r.service,
          status: r.status,
          entryPoints: r.entryPoints || [],
        })
      );

    const traefikEntrypoints: TraefikEntrypoint[] = entrypoints.map(
      (ep: { name: string; address: string }) => ({
        name: ep.name,
        address: ep.address,
      })
    );

    return {
      routers: traefikRouters,
      entrypoints: traefikEntrypoints,
    };
  } catch {
    return emptyResult;
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
  traefikInfo: TraefikInfo
): string | undefined {
  const containerName = container.Names[0]?.replace(/^\//, "") || "";

  for (const router of traefikInfo.routers) {
    // Check if router's service matches container name
    if (
      router.service.includes(containerName) ||
      containerName.includes(router.service)
    ) {
      const hostMatch = router.rule.match(/Host\(`([^`]+)`\)/);
      if (hostMatch) {
        const hostname = hostMatch[1];
        const port = getEntrypointPort(router.entryPoints, traefikInfo.entrypoints);
        if (port === 80) {
          return `http://${hostname}`;
        }
        if (port === 443 || port === 8443) {
          return `https://${hostname}`;
        }
        if (port) {
          const protocol = router.entryPoints.includes("websecure") ? "https" : "http";
          return `${protocol}://${hostname}:${port}`;
        }
        // Fallback: determine protocol purely by entrypoint name if no port resolved
        const protocol = router.entryPoints.includes("websecure") ? "https" : "http";
        return `${protocol}://${hostname}`;
      }
    }
  }
  return undefined;
}

function getEntrypointPort(
  entryPoints: string[],
  allEntrypoints: TraefikEntrypoint[]
): number | undefined {
  if (!entryPoints || entryPoints.length === 0) return undefined;

  // Priority order for entrypoints
  const priorityOrder = ["websecure", "web", "https", "http", "traefik"];

  for (const priorityName of priorityOrder) {
    if (entryPoints.includes(priorityName)) {
      const ep = allEntrypoints.find((e) => e.name === priorityName);
      if (ep?.address) {
        const parsedPort = parseAddressPort(ep.address);
        if (parsedPort) return parsedPort;
      }
    }
  }

  // Fallback: check all other entrypoints
  for (const epName of entryPoints) {
    const ep = allEntrypoints.find((e) => e.name === epName);
    if (ep?.address) {
      const parsedPort = parseAddressPort(ep.address);
      if (parsedPort) return parsedPort;
    }
  }

  return undefined;
}

function parseAddressPort(address: string): number | undefined {
  // Address format: ":80", ":443", "0.0.0.0:80", "[::]:80", "127.0.0.1:8080/tcp"
  const trimmed = address.replace(/\/tcp$/, "").replace(/\/udp$/, "");
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon === -1) return undefined;

  const portStr = trimmed.slice(lastColon + 1);
  const port = parseInt(portStr, 10);
  return isNaN(port) ? undefined : port;
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
