import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { discoverServices } from "@/lib/docker";
import { discoverKubernetesServices } from "@/lib/kubernetes";
import { setDiscoveredServices, getDiscoveredServices, getMergedServices } from "@/lib/runtime";
import { checkFavicon } from "@/lib/favicon";
import { Services } from "@/lib/types";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/services/refresh" });

async function checkFavicons(services: Services): Promise<Services> {
  const checks = Object.entries(services).map(async ([id, service]) => {
    if (!service.url) return;
    try {
      const result = await checkFavicon(service.url);
      if (result) {
        services[id] = { ...service, hasFavicon: true };
      }
    } catch {
      // favicon check failed, leave hasFavicon unset
    }
  });
  await Promise.allSettled(checks);
  return services;
}

export async function POST() {
  log.info("Refreshing services");
  try {
    const config = await loadConfig();

    // Discover from Docker
    const dockerServices = await discoverServices(config.docker);

    // Discover from Kubernetes
    const k8sServices = config.kubernetes.enabled
      ? await discoverKubernetesServices(config.kubernetes)
      : {};

    // Merge all discovered services (stored in memory, not persisted)
    const discovered: Services = { ...dockerServices, ...k8sServices };

    // Preserve health status from previous discovery
    const previous = getDiscoveredServices();
    for (const [id, service] of Object.entries(discovered)) {
      if (previous[id]) {
        discovered[id] = {
          ...service,
          status: previous[id].status,
          lastChecked: previous[id].lastChecked,
        };
      }
    }

    setDiscoveredServices(discovered);

    // Check favicons for discovered services with URLs
    await checkFavicons(discovered);

    // Also check favicons for manually configured services
    await checkFavicons(config.services);

    // Return merged view: manual (persisted) + discovered (runtime)
    return NextResponse.json({ ...config, services: getMergedServices(config.services) });
  } catch (error) {
    log.error({ err: error }, "Failed to refresh services");
    return NextResponse.json(
      { error: "Failed to refresh services" },
      { status: 500 }
    );
  }
}
