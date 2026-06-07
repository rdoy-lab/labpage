import { NextResponse } from "next/server";
import { loadConfig, updateConfig } from "@/lib/config";
import { getMergedServices } from "@/lib/runtime";

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
    return NextResponse.json({ ...updated, services: getMergedServices(updated.services) });
  } catch {
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    );
  }
}
