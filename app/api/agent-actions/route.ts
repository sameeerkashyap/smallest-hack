import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const convexSiteUrl =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL;

  if (!convexSiteUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_CONVEX_SITE_URL" },
      { status: 500 }
    );
  }

  const limit = request.nextUrl.searchParams.get("limit") ?? "30";

  try {
    const response = await fetch(
      `${convexSiteUrl.replace(/\/$/, "")}/agent-actions?limit=${encodeURIComponent(limit)}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch agent actions", details: String(error) },
      { status: 500 }
    );
  }
}
