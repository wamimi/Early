import { NextRequest, NextResponse } from "next/server";
import { getProofSession, recordZamaReceipt } from "@/lib/supabase-proof-sessions";
import { createZamaPrivateTastePayload } from "@/lib/zama-private-receipt";

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
      return NextResponse.json({ error: "A succeeded Reclaim proof artifact is required before computing a Zama private taste tier." }, { status: 409 });
    }

    const receipt = createZamaPrivateTastePayload(session.proof_artifact, body.walletAddress);

    await recordZamaReceipt({
      sessionId: body.sessionId,
      walletAddress: receipt.walletAddress,
      network: receipt.network,
      contractAddress: receipt.contractAddress,
      status: "prepared",
      campaignWindowMinutes: receipt.campaignWindowMinutes
    });

    return NextResponse.json({
      receipt,
      message: "Zama payload is ready. Encrypt the early delta locally, then submit the private taste transaction."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare Zama private taste proof.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
