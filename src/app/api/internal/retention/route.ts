import { NextRequest, NextResponse } from "next/server";
import { clearExpiredRawProofs } from "@/lib/v2-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected = process.env.RETENTION_CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cleared = await clearExpiredRawProofs();
  return NextResponse.json({ cleared: cleared.length });
}
