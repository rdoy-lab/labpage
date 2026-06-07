import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { checkAllServices } from "@/lib/health";
import { getDiscoveredServices, setDiscoveredServices, getMergedServices } from "@/lib/runtime";
import { Services } from "@/lib/types";

export async function POST() {
  try {
    const config = await loadConfig();
    const discovered = getDiscoveredServices();

    // Merge manual + discovered for health checking
    const allServices = { ...config.services, ...discovered };

    const results = await checkAllServices(allServices);
    const lastChecked = new Date().toISOString();

    // Update status on discovered services
    const updatedDiscovered = { ...discovered };
    for (const [id, status] of results) {
      if (updatedDiscovered[id]) {
        updatedDiscovered[id] = {
          ...updatedDiscovered[id],
          status,
          lastChecked,
        };
      }
    }
    setDiscoveredServices(updatedDiscovered);

    // Update status on manual services in memory
    const updatedManual: Services = {};
    for (const [id, status] of results) {
      if (config.services[id]) {
        updatedManual[id] = {
          ...config.services[id],
          status,
          lastChecked,
        };
      }
    }
    const manualWithStatus = { ...config.services, ...updatedManual };

    return NextResponse.json({ ...config, services: getMergedServices(manualWithStatus) });
  } catch {
    return NextResponse.json(
      { error: "Failed to check health" },
      { status: 500 }
    );
  }
}
