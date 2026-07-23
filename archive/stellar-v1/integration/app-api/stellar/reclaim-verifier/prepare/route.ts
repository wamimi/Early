import { NextRequest, NextResponse } from "next/server";
import { getProofSession, recordStellarVerifier } from "@/lib/supabase-proof-sessions";
import {
  createStellarReclaimVerifierPayload,
  prepareStellarReclaimVerifierTransaction
} from "@/lib/stellar-reclaim-verifier";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sessionId?: unknown; walletAddress?: unknown };

    if (typeof body.sessionId !== "string" || typeof body.walletAddress !== "string") {
      return NextResponse.json({ error: "sessionId and walletAddress are required." }, { status: 400 });
    }

    const session = await getProofSession(body.sessionId);

    if (!session) {
      return NextResponse.json({ error: "Proof session was not found." }, { status: 404 });
    }

    if (session.status !== "succeeded" || !session.proof_payload) {
      return NextResponse.json({ error: "A succeeded Reclaim proof payload is required before on-chain verification." }, { status: 409 });
    }

    const verifier = createStellarReclaimVerifierPayload(session.proof_payload, body.walletAddress);
    const preparation = await prepareStellarReclaimVerifierTransaction(verifier);

    await recordStellarVerifier({
      sessionId: body.sessionId,
      contractId: verifier.contractId,
      status: "prepared"
    });

    return NextResponse.json(preparation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare Stellar Reclaim verifier transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
