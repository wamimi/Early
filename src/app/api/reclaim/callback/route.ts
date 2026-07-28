import { NextRequest, NextResponse } from "next/server";
import {
  getReclaimProofs,
  getReclaimSessionId,
  parseReclaimCallback,
  verifyReclaimSessionProofs,
} from "@/lib/reclaim-proof";
import { encryptRawProof } from "@/lib/proof-encryption";
import { createVerifiedDiscovery } from "@/lib/proof-model";
import {
  claimSessionForVerification,
  completeProofSession,
  failProofSession,
  getProofSession,
} from "@/lib/v2-store";

export const runtime = "nodejs";

function baseChainId() {
  return Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? "84532");
}

function registryAddress() {
  const address = process.env.NEXT_PUBLIC_BASE_REGISTRY_ADDRESS;
  if (!address) throw new Error("Missing NEXT_PUBLIC_BASE_REGISTRY_ADDRESS.");
  return address;
}

export async function POST(request: NextRequest) {
  const body = await parseReclaimCallback(request);
  const proofs = getReclaimProofs(body);
  const sessionId = getReclaimSessionId(
    body,
    proofs,
    request.headers.get("x-reclaim-session-id")
  );

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing Reclaim session id." },
      { status: 400 }
    );
  }

  const session = await claimSessionForVerification(sessionId);
  if (!session) {
    const existing = await getProofSession(sessionId);
    if (!existing) {
      return NextResponse.json(
        { error: "Unknown proof session." },
        { status: 404 }
      );
    }
    if (existing.status === "verified" || existing.status === "finalized") {
      return NextResponse.json({ ok: true, sessionId, replay: true });
    }
    return NextResponse.json(
      { error: `Proof session is already ${existing.status}.` },
      { status: 409 }
    );
  }

  try {
    const verification = await verifyReclaimSessionProofs(proofs, session);
    const discovery = createVerifiedDiscovery({
      platform: session.platform,
      provider: session.provider_configuration,
      proofPayload: verification.proofs,
      extractedParameters: verification.extractedParameters,
      sessionNullifier: session.session_nullifier,
      wallet: session.wallet_address,
      subjectId: session.subject_id,
      chainId: baseChainId(),
      registryAddress: registryAddress(),
    });

    await completeProofSession(
      sessionId,
      encryptRawProof(verification.proofs),
      discovery
    );
    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reclaim proof verification failed.";
    await failProofSession(sessionId, message);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Early V2 Reclaim callback is ready.",
  });
}
