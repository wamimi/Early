import { NextRequest, NextResponse } from "next/server";
import { getProofSession, recordStellarReceipt } from "@/lib/supabase-proof-sessions";
import { createStellarReceiptPayload, prepareStellarReceiptTransaction } from "@/lib/stellar-receipt";

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

    if (session.status !== "succeeded" || !session.proof_artifact) {
      return NextResponse.json({ error: "A succeeded Reclaim proof artifact is required before publishing." }, { status: 409 });
    }

    const receipt = createStellarReceiptPayload(session.proof_artifact, body.walletAddress);
    const preparation = await prepareStellarReceiptTransaction(receipt);

    if (!preparation.contractConfigured) {
      await recordStellarReceipt({
        sessionId: body.sessionId,
        walletAddress: receipt.owner,
        network: receipt.network,
        contractId: receipt.contractId,
        status: "prepared"
      });
    }

    return NextResponse.json(preparation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare Stellar receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
