import { NextRequest, NextResponse } from "next/server";
import { getProofSession, recordStellarVerifier } from "@/lib/supabase-proof-sessions";
import { assertValidStellarAddress } from "@/lib/stellar-receipt";
import { submitSignedStellarReclaimVerifier } from "@/lib/stellar-reclaim-verifier";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionId?: unknown;
      walletAddress?: unknown;
      signedTxXdr?: unknown;
      contractId?: unknown;
    };

    if (typeof body.sessionId !== "string" || typeof body.walletAddress !== "string" || typeof body.signedTxXdr !== "string") {
      return NextResponse.json({ error: "sessionId, walletAddress, and signedTxXdr are required." }, { status: 400 });
    }

    assertValidStellarAddress(body.walletAddress);

    const session = await getProofSession(body.sessionId);

    if (!session) {
      return NextResponse.json({ error: "Proof session was not found." }, { status: 404 });
    }

    if (session.status !== "succeeded" || !session.proof_payload) {
      return NextResponse.json({ error: "A succeeded Reclaim proof payload is required before verifier submission." }, { status: 409 });
    }

    try {
      const result = await submitSignedStellarReclaimVerifier(body.signedTxXdr);

      await recordStellarVerifier({
        sessionId: body.sessionId,
        contractId: typeof body.contractId === "string" ? body.contractId : null,
        txHash: result.txHash,
        status: "verified"
      });

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stellar Reclaim verifier transaction failed.";

      await recordStellarVerifier({
        sessionId: body.sessionId,
        contractId: typeof body.contractId === "string" ? body.contractId : null,
        status: "failed",
        errorMessage: message
      });

      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit Stellar Reclaim verifier transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
