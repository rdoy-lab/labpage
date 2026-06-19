import * as k8s from "@kubernetes/client-node";
import { KubernetesConfig, Services } from "./types";
import logger from "./logger";

const log = logger.child({ module: "kubernetes" });

function loadKubeConfig(config: KubernetesConfig): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();

  if (config.token && config.server) {
    kc.loadFromOptions({
      clusters: [
        {
          name: "labpage",
          server: config.server,
          skipTLSVerify: true,
        },
      ],
      users: [
        {
          name: "labpage",
          token: config.token,
        },
      ],
      contexts: [
        {
          name: "labpage",
          cluster: "labpage",
          user: "labpage",
        },
      ],
      currentContext: "labpage",
    });
  } else if (config.kubeconfig) {
    kc.loadFromFile(config.kubeconfig);
  } else {
    try {
      kc.loadFromDefault();
    } catch {
      try {
        kc.loadFromCluster();
      } catch {
        throw new Error(
          "No Kubernetes config found. Set kubeconfig path or run in-cluster."
        );
      }
    }
  }

  return kc;
}

interface K8sResource {
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

interface IngressRule {
  host?: string;
  http?: {
    paths: Array<{
      path?: string;
      pathType?: string;
      backend?: {
        service?: {
          name?: string;
          port?: {
            number?: number;
            name?: string;
          };
        };
      };
    }>;
  };
}

interface IngressTls {
  hosts?: string[];
}

interface GatewayListener {
  hostname?: string;
  protocol?: string;
  port?: number;
}

interface HttpRouteHost {
  hostnames?: string[];
  rules?: Array<{
    backendRefs?: Array<{
      name?: string;
      port?: number;
    }>;
    matches?: Array<{
      path?: {
        value?: string;
      };
    }>;
  }>;
  parentRefs?: Array<{
    name?: string;
    namespace?: string;
  }>;
}

export async function discoverKubernetesServices(
  config: KubernetesConfig
): Promise<Services> {
  if (!config.enabled) return {};

  const services: Services = {};

  try {
    const kc = loadKubeConfig(config);
    const k8sApi = k8s.KubernetesObjectApi.makeApiClient(kc);
    const contexts = config.contexts || [kc.getCurrentContext()];

    for (const context of contexts) {
      log.info({ context }, "Discovering Kubernetes services");
      try {
        kc.setCurrentContext(context);

        // Discover Ingresses cluster-wide
        await discoverIngresses(k8sApi, services);

        // Discover Gateway API cluster-wide
        await discoverGatewayApi(k8sApi, services);

        // Discover NodePort/LoadBalancer services cluster-wide
        await discoverServices(k8sApi, services);
      } catch (error) {
        log.error({ context, err: error }, "Failed to discover from K8s context");
      }
    }
  } catch (error) {
    log.error({ err: error }, "Failed to connect to Kubernetes");
  }

  return services;
}

async function discoverIngresses(
  k8sApi: k8s.KubernetesObjectApi,
  services: Services
): Promise<void> {
  try {
    const result = await k8sApi.list(
      "networking.k8s.io/v1",
      "Ingress",
      "" // empty namespace = all namespaces
    );
    const items = (result.items || []) as unknown as K8sResource[];
    for (const ingress of items) {
      processIngress(ingress, services);
    }
  } catch (error) {
    log.error({ err: error }, "Failed to list Ingresses");
  }
}

async function discoverGatewayApi(
  k8sApi: k8s.KubernetesObjectApi,
  services: Services
): Promise<void> {
  // Discover Gateway resources
  const gateways = new Map<string, GatewayListener[]>();

  try {
    const result = await k8sApi.list(
      "gateway.networking.k8s.io/v1",
      "Gateway",
      ""
    );
    const items = (result.items || []) as unknown as K8sResource[];
    for (const gw of items) {
      const ns = gw.metadata?.namespace || "default";
      const name = gw.metadata?.name;
      if (!name) continue;

      const spec = gw.spec as {
        listeners?: GatewayListener[];
      } | undefined;

      const listeners = spec?.listeners || [];
      gateways.set(`${ns}/${name}`, listeners);
    }
  } catch {
    // Gateway API might not be installed - that's okay
  }

  // Discover HTTPRoutes
  try {
    const result = await k8sApi.list(
      "gateway.networking.k8s.io/v1",
      "HTTPRoute",
      ""
    );
    const items = (result.items || []) as unknown as K8sResource[];
    for (const route of items) {
      processHttpRoute(route, gateways, services);
    }
  } catch {
    // Gateway API might not be installed
  }
}

async function discoverServices(
  k8sApi: k8s.KubernetesObjectApi,
  services: Services
): Promise<void> {
  try {
    const result = await k8sApi.list("v1", "Service", "");
    const items = (result.items || []) as unknown as K8sResource[];
    for (const svc of items) {
      processService(svc, services);
    }
  } catch (error) {
    log.error({ err: error }, "Failed to list Services");
  }
}

function processIngress(
  ingress: K8sResource,
  services: Services
): void {
  const annotations = ingress.metadata?.annotations || {};
  const namespace = ingress.metadata?.namespace || "default";
  const ingressName = ingress.metadata?.name;

  if (annotations["labpage.hide"] === "true") return;

  const spec = ingress.spec as {
    rules?: IngressRule[];
    tls?: IngressTls[];
  } | undefined;

  if (!spec?.rules) return;

  const tlsHosts = new Set<string>();
  if (spec.tls) {
    for (const tls of spec.tls) {
      if (tls.hosts) {
        for (const host of tls.hosts) {
          tlsHosts.add(host);
        }
      }
    }
  }

  for (const rule of spec.rules) {
    if (!rule.host || !rule.http?.paths) continue;

    for (const path of rule.http.paths) {
      const serviceName = path.backend?.service?.name;
      if (!serviceName) continue;

      const isTls = tlsHosts.has(rule.host);
      const url = isTls
        ? `https://${rule.host}${path.path || ""}`
        : `http://${rule.host}${path.path || ""}`;

      const id = `k8s:${namespace}:${serviceName}:ingress:${ingressName}`;
      const displayName = annotations["labpage.name"] || serviceName;
      const icon =
        annotations["labpage.icon"] || guessIconFromName(serviceName);
      const group = annotations["labpage.group"] || "Kubernetes";

      services[id] = {
        name: displayName,
        url,
        icon,
        group,
        source: "kubernetes",
        namespace,
        description: `Ingress: ${rule.host}`,
        checkPath: path.path || "/",
        status: "unknown",
      };
    }
  }
}

function processHttpRoute(
  route: K8sResource,
  gateways: Map<string, GatewayListener[]>,
  services: Services
): void {
  const annotations = route.metadata?.annotations || {};
  const namespace = route.metadata?.namespace || "default";
  const routeName = route.metadata?.name;

  if (annotations["labpage.hide"] === "true") return;

  const spec = route.spec as HttpRouteHost | undefined;
  if (!spec) return;

  // Get hostnames from the route or parent gateways
  const hostnames: string[] = spec.hostnames || [];

  // If no hostnames on route, try to get from parent gateway listeners
  if (hostnames.length === 0 && spec.parentRefs) {
    for (const parent of spec.parentRefs) {
      const parentNs = parent.namespace || namespace;
      const gwKey = `${parentNs}/${parent.name}`;
      const listeners = gateways.get(gwKey);
      if (listeners) {
        for (const listener of listeners) {
          if (listener.hostname) {
            hostnames.push(listener.hostname);
          }
        }
      }
    }
  }

  if (hostnames.length === 0) return;

  // Get backend services from rules
  for (const rule of spec.rules || []) {
    for (const backend of rule.backendRefs || []) {
      if (!backend.name) continue;

      const pathPrefix = rule.matches?.[0]?.path?.value || "";

      for (const hostname of hostnames) {
        const url = `https://${hostname}${pathPrefix}`;
        const id = `k8s:${namespace}:${backend.name}:httproute:${routeName}`;
        const displayName = annotations["labpage.name"] || backend.name;
        const icon =
          annotations["labpage.icon"] || guessIconFromName(backend.name);
        const group = annotations["labpage.group"] || "Kubernetes";

        services[id] = {
          name: displayName,
          url,
          icon,
          group,
          source: "kubernetes",
          namespace,
          description: `HTTPRoute: ${hostname}`,
          checkPath: pathPrefix || "/",
          status: "unknown",
        };
      }
    }
  }
}

function processService(
  svc: K8sResource,
  services: Services
): void {
  const annotations = svc.metadata?.annotations || {};
  const namespace = svc.metadata?.namespace || "default";
  const name = svc.metadata?.name;

  if (!name) return;
  if (annotations["labpage.hide"] === "true") return;

  // Skip if already covered by ingress or httproute
  for (const key of Object.keys(services)) {
    if (key.includes(`:${name}:`) && key.includes(`:${namespace}:`)) return;
  }

  const spec = svc.spec as {
    type?: string;
    ports?: Array<{ port?: number; nodePort?: number }>;
    externalIPs?: string[];
  } | undefined;

  if (!spec) return;

  // Skip non-LoadBalancer services
  if (spec.type !== "LoadBalancer") return;

  const status = svc.status as {
    loadBalancer?: {
      ingress?: Array<{ ip?: string; hostname?: string }>;
    };
  } | undefined;

  let url: string | undefined;
  const ingressIp =
    spec.externalIPs?.[0] ||
    status?.loadBalancer?.ingress?.[0]?.ip ||
    status?.loadBalancer?.ingress?.[0]?.hostname;

  if (ingressIp) {
    const port = spec.ports?.[0]?.port;
    url = `http://${ingressIp}:${port}`;
  } else {
    return; // No external IP yet
  }

  const displayName = annotations["labpage.name"] || name;
  const icon = annotations["labpage.icon"] || guessIconFromName(name);
  const group = annotations["labpage.group"] || "Kubernetes";

  services[`k8s:${namespace}:${name}:svc`] = {
    name: displayName,
    url,
    icon,
    group,
    source: "kubernetes",
    namespace,
    description: `${spec.type}: ${name}`,
    checkPath: "/",
    status: "unknown",
  };
}

function guessIconFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-");
}
