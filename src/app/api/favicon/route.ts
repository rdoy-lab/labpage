import { NextRequest, NextResponse } from "next/server";
import { fetchFavicon } from "@/lib/favicon";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const result = await fetchFavicon(url);

  if (!result) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
