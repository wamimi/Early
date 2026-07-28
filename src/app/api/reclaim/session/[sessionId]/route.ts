import { NextRequest, NextResponse } from "next/server";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import { getOwnedProofSession } from "@/lib/v2-store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const walletAddress = request.nextUrl.searchParams.get("wallet");
    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { error: "sessionId and wallet are required." },
        { status: 400 }
      );
    }

    const user = await authenticatePrivyRequest(request, walletAddress);
    const session = await getOwnedProofSession(sessionId, user.user_id);
    if (!session) {
      return NextResponse.json(
        { error: "Proof session was not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sessionId: session.session_id,
      platform: session.platform,
      subjectId: session.subject_id,
      subjectUrl: session.subject_url,
      requestUrl: session.request_url,
      status: session.status,
      discovery: session.verified_discovery,
      errorMessage: session.error_message,
      createdAt: session.created_at,
      completedAt: session.completed_at,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load proof session.";
    const status = message.includes("access token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
