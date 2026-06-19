import { NextResponse } from "next/server";
import { loadConfig, updateConfig } from "@/lib/config";
import { getDiscoveredServices, setDiscoveredServices, getMergedServices } from "@/lib/runtime";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/services/[id]" });

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const config = await loadConfig();
    const discovered = getDiscoveredServices();

    // Check if it's a manual service (persisted) or discovered (runtime)
    if (config.services[id]) {
      // Update manual service in config
      config.services[id] = { ...config.services[id], ...body };
      const updated = await updateConfig({ services: config.services });
      return NextResponse.json(getMergedServices(updated.services));
    } else if (discovered[id]) {
      // Update discovered service in memory (e.g., for overrides)
      discovered[id] = { ...discovered[id], ...body };
      setDiscoveredServices(discovered);
      return NextResponse.json(getMergedServices(config.services));
    }

    return NextResponse.json(
      { error: "Service not found" },
      { status: 404 }
    );
  } catch (err) {
    log.error({ err }, "Failed to update service");
    return NextResponse.json(
      { error: "Failed to update service" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = await loadConfig();

    // Only manual services can be deleted
    if (!config.services[id]) {
      return NextResponse.json(
        { error: "Can only delete manual services" },
        { status: 400 }
      );
    }

    delete config.services[id];
    const updated = await updateConfig({ services: config.services });
    return NextResponse.json(getMergedServices(updated.services));
  } catch (err) {
    log.error({ err }, "Failed to delete service");
    return NextResponse.json(
      { error: "Failed to delete service" },
      { status: 500 }
    );
  }
}
