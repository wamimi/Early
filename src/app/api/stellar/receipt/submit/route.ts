import { NextRequest, NextResponse } from "next/server";
import { getProofSession, recordStellarReceipt } from "@/lib/supabase-proof-sessions";
import { assertValidStellarAddress, submitSignedStellarReceipt } from "@/lib/stellar-receipt";

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

    if (session.status !== "succeeded" || !session.proof_artifact) {
      return NextResponse.json({ error: "A succeeded Reclaim proof artifact is required before submitting." }, { status: 409 });
    }

    const result = await submitSignedStellarReceipt(body.signedTxXdr);
    await recordStellarReceipt({
      sessionId: body.sessionId,
      walletAddress: body.walletAddress,
      network: "testnet",
      contractId: typeof body.contractId === "string" ? body.contractId : null,
      txHash: result.txHash,
      status: result.status === "PENDING" ? "pending" : "published"
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit Stellar receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
