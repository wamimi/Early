import { NextRequest, NextResponse } from "next/server";
import { createReclaimProofRequest } from "@/lib/reclaim";
import { createProofSession } from "@/lib/supabase-proof-sessions";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tweetUrl?: unknown };

    if (typeof body.tweetUrl !== "string") {
      return NextResponse.json({ error: "tweetUrl is required." }, { status: 400 });
    }

    const origin = request.headers.get("origin") ?? undefined;
    let proofRequest;

    try {
      proofRequest = await createReclaimProofRequest({
        tweetUrl: body.tweetUrl,
        origin
      });
    } catch (error) {
      console.error("[Early/Reclaim] Failed to create proof request", error);
      throw new Error(`Reclaim request failed: ${getErrorMessage(error)}`);
    }

    try {
      await createProofSession({
        sessionId: proofRequest.sessionId,
        tweetId: proofRequest.tweetId,
        tweetUrl: body.tweetUrl,
        requestUrl: proofRequest.requestUrl,
        statusUrl: proofRequest.statusUrl
      });
    } catch (error) {
      console.error("[Early/Reclaim] Failed to save proof session", error);
      throw new Error(`Proof session storage failed: ${getErrorMessage(error)}`);
    }

    return NextResponse.json({
      sessionId: proofRequest.sessionId,
      requestUrl: proofRequest.requestUrl,
      mobileRequestUrl: proofRequest.mobileRequestUrl,
      statusUrl: proofRequest.statusUrl,
      tweetId: proofRequest.tweetId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Reclaim verification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
