import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as unknown;

  console.info("[Early/Reclaim] Proof callback received", JSON.stringify(body, null, 2));

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Early Reclaim callback endpoint is alive."
  });
}
