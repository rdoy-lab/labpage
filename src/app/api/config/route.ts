import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { getMergedServices } from "@/lib/runtime";

export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json({ ...config, services: getMergedServices(config.services) });
  } catch {
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 }
    );
  }
}
