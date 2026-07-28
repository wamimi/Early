import { NextRequest, NextResponse } from "next/server";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import { createReclaimProofRequest } from "@/lib/reclaim";
import type { DiscoveryPlatform } from "@/lib/proof-model";
import { createProofSession } from "@/lib/v2-store";

export const runtime = "nodejs";

function statusFor(message: string) {
  if (message.includes("access token")) return 401;
  if (message.includes("not linked") || message.includes("origin")) return 403;
  if (
    message.startsWith("Paste") ||
    message.includes("required") ||
    message.includes("platform")
  ) {
    return 400;
  }
  return 500;
}

export async function POST(request: NextRequest) {
  try {
    assertAllowedOrigin(request.headers.get("origin"));
    const body = (await request.json()) as {
      platform?: unknown;
      subjectUrl?: unknown;
      walletAddress?: unknown;
    };
    const platform = body.platform as DiscoveryPlatform;

    if (platform !== "x" && platform !== "youtube") {
      throw new Error("A supported platform is required.");
    }
    if (typeof body.subjectUrl !== "string") {
      throw new Error("subjectUrl is required.");
    }
    if (typeof body.walletAddress !== "string") {
      throw new Error("walletAddress is required.");
    }

    const user = await authenticatePrivyRequest(request, body.walletAddress);
    const proofRequest = await createReclaimProofRequest({
      platform,
      subjectUrl: body.subjectUrl,
      walletAddress: user.wallet,
    });

    await createProofSession({
      sessionId: proofRequest.sessionId,
      privyUserId: user.user_id,
      walletAddress: user.wallet,
      platform,
      subjectId: proofRequest.subjectId,
      subjectUrl: proofRequest.subjectUrl,
      provider: proofRequest.provider,
      sessionNullifier: proofRequest.sessionNullifier,
      requestUrl: proofRequest.requestUrl,
      statusUrl: proofRequest.statusUrl,
    });

    return NextResponse.json({
      sessionId: proofRequest.sessionId,
      requestUrl: proofRequest.requestUrl,
      mobileRequestUrl: proofRequest.mobileRequestUrl,
      statusUrl: proofRequest.statusUrl,
      subjectId: proofRequest.subjectId,
      platform,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to start Reclaim verification.";
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
