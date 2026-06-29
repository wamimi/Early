import { NextRequest, NextResponse } from "next/server";
import { createReclaimProofRequest } from "@/lib/reclaim";
import { createProofSession } from "@/lib/supabase-proof-sessions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tweetUrl?: unknown };

    if (typeof body.tweetUrl !== "string") {
      return NextResponse.json({ error: "tweetUrl is required." }, { status: 400 });
    }

    const origin = request.headers.get("origin") ?? undefined;
    const proofRequest = await createReclaimProofRequest({
      tweetUrl: body.tweetUrl,
      origin
    });

    await createProofSession({
      sessionId: proofRequest.sessionId,
      tweetId: proofRequest.tweetId,
      tweetUrl: body.tweetUrl,
      requestUrl: proofRequest.requestUrl,
      statusUrl: proofRequest.statusUrl
    });

    return NextResponse.json({
      sessionId: proofRequest.sessionId,
      requestUrl: proofRequest.requestUrl,
      statusUrl: proofRequest.statusUrl,
      tweetId: proofRequest.tweetId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Reclaim verification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
