import { NextResponse } from "next/server";
import { loadConfig, updateConfig } from "@/lib/config";
import { getDiscoveredServices } from "@/lib/runtime";
import { Service, Services } from "@/lib/types";

export async function GET() {
  try {
    const config = await loadConfig();
    const discovered = getDiscoveredServices();
    const manualServices: Services = {};
    for (const [id, service] of Object.entries(config.services)) {
      manualServices[id] = { ...service, source: "manual" };
    }
    const merged = { ...manualServices, ...discovered };
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json(
      { error: "Failed to load services" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, ...service } = body as { id: string } & Service;

    if (!id || !service.name) {
      return NextResponse.json(
        { error: "Missing required fields: id, name" },
        { status: 400 }
      );
    }

    // Manual services are persisted
    const config = await loadConfig();
    config.services[id] = {
      ...service,
      source: "manual",
    };

    const updated = await updateConfig({ services: config.services });
    const discovered = getDiscoveredServices();
    const merged = { ...updated.services, ...discovered };
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json(
      { error: "Failed to add service" },
      { status: 500 }
    );
  }
}
