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
      proofArtifact: session.proof_artifact,
      errorMessage: session.error_message,
      stellarReceipt: {
        walletAddress: session.stellar_wallet_address,
        network: session.stellar_network,
        contractId: session.stellar_contract_id,
        txHash: session.stellar_receipt_tx_hash,
        status: session.stellar_receipt_status,
        createdAt: session.stellar_receipt_created_at
      },
      stellarVerifier: {
        contractId: session.stellar_verifier_contract_id,
        txHash: session.stellar_verifier_tx_hash,
        status: session.stellar_verifier_status,
        createdAt: session.stellar_verifier_created_at,
        errorMessage: session.stellar_verifier_error_message
      },
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      completedAt: session.completed_at
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Reclaim proof session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
