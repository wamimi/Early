import { NextRequest, NextResponse } from "next/server";
import { getProofSession } from "@/lib/supabase-proof-sessions";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }

    const session = await getProofSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Proof session was not found." }, { status: 404 });
    }

    return NextResponse.json({
      sessionId: session.session_id,
      tweetId: session.tweet_id,
      tweetUrl: session.tweet_url,
      status: session.status,
      extractedParameters: session.extracted_parameters,
      errorMessage: session.error_message,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      completedAt: session.completed_at
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Reclaim proof session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
