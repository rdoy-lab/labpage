import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { checkAllServices } from "@/lib/health";
import { getDiscoveredServices, setDiscoveredServices, getMergedServices } from "@/lib/runtime";

export async function POST() {
  try {
    const config = await loadConfig();
    const discovered = getDiscoveredServices();

    // Merge manual + discovered for health checking
    const allServices = { ...config.services, ...discovered };

    const results = await checkAllServices(allServices);

    // Update status on discovered services
    const updatedDiscovered = { ...discovered };
    for (const [id, status] of results) {
      if (updatedDiscovered[id]) {
        updatedDiscovered[id] = {
          ...updatedDiscovered[id],
          status,
          lastChecked: new Date().toISOString(),
        };
      }
    }

    setDiscoveredServices(updatedDiscovered);

    return NextResponse.json({ ...config, services: getMergedServices(config.services) });
  } catch {
    return NextResponse.json(
      { error: "Failed to check health" },
      { status: 500 }
    );
  }
}
