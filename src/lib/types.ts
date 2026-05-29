export interface Service {
  name: string;
  url?: string;
  icon?: string;
  group?: string;
  source: "docker" | "kubernetes" | "manual";
  containerId?: string;
  description?: string;
  checkPath?: string;
  status?: "online" | "offline" | "unknown";
  lastChecked?: string;
  composeProject?: string;
  composeService?: string;
  namespace?: string;
  hasFavicon?: boolean;
}

export interface Services {
  [key: string]: Service;
}

export interface GroupMeta {
  order: number;
  collapsed: boolean;
}

export interface Groups {
  [key: string]: GroupMeta;
}

export interface DockerTraefik {
  enabled: boolean;
  url?: string;
  autoDetect: boolean;
}

export interface DockerHost {
  socket?: string;
  host?: string;
  hostIp?: string;
}

export interface DockerConfig {
  hosts: DockerHost[];
  traefik: DockerTraefik;
}

export interface KubernetesConfig {
  enabled: boolean;
  kubeconfig?: string;
  contexts?: string[];
  server?: string;
  token?: string;
}

export interface Config {
  docker: DockerConfig;
  kubernetes: KubernetesConfig;
  groups: Groups;
  services: Services;  // Manual services only (persisted)
}

export const DEFAULT_CONFIG: Config = {
  docker: {
    hosts: [{ socket: "/var/run/docker.sock" }],
    traefik: {
      enabled: true,
      autoDetect: true,
    },
  },
  kubernetes: {
    enabled: true,
  },
  groups: {},
  services: {},
};
