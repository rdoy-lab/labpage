import { NextResponse } from "next/server";
import { loadConfig, updateConfig } from "@/lib/config";
import { getMergedServices } from "@/lib/runtime";
import { Service } from "@/lib/types";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/services" });

export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json(getMergedServices(config.services));
  } catch (err) {
    log.error({ err }, "Failed to load services");
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
    return NextResponse.json(getMergedServices(updated.services));
  } catch (err) {
    log.error({ err }, "Failed to add service");
    return NextResponse.json(
      { error: "Failed to add service" },
      { status: 500 }
    );
  }
}
