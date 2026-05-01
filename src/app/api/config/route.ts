import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { getDiscoveredServices } from "@/lib/runtime";

export async function GET() {
  try {
    const config = await loadConfig();
    const discovered = getDiscoveredServices();
    const merged = { ...config.services, ...discovered };
    return NextResponse.json({ ...config, services: merged });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 }
    );
  }
}
