import { NextResponse } from "next/server";
import { loadConfig, updateConfig } from "@/lib/config";
import { getMergedServices } from "@/lib/runtime";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/groups/[name]" });

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
  } catch (err) {
    log.error({ err }, "Failed to update group");
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    );
  }
}
