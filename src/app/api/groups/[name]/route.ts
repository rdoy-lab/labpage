import { NextResponse } from "next/server";
import { loadConfig, updateConfig } from "@/lib/config";
import { getDiscoveredServices } from "@/lib/runtime";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const body = await request.json();
    const config = await loadConfig();

    config.groups[decodedName] = {
      ...config.groups[decodedName],
      ...body,
    };

    const updated = await updateConfig({ groups: config.groups });
    const discovered = getDiscoveredServices();
    const merged = { ...updated.services, ...discovered };
    return NextResponse.json({ ...updated, services: merged });
  } catch {
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    );
  }
}
