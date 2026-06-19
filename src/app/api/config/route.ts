import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { getMergedServices } from "@/lib/runtime";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/config" });

export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json({ ...config, services: getMergedServices(config.services) });
  } catch (err) {
    log.error({ err }, "Failed to load config");
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 }
    );
  }
}
