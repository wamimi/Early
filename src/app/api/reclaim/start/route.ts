import { NextRequest, NextResponse } from "next/server";
import { createReclaimProofRequest } from "@/lib/reclaim";

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

    return NextResponse.json(proofRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Reclaim verification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
