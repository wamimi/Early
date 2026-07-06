import { NextRequest, NextResponse } from "next/server";
import { getProofSession, recordZamaReceipt } from "@/lib/supabase-proof-sessions";
import { assertValidEvmAddress, getTasteTierLabel, getZamaExplorerTxUrl } from "@/lib/zama-private-receipt";

export const runtime = "nodejs";

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertValidTxHash(txHash: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error("A valid EVM transaction hash is required.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionId?: unknown;
      walletAddress?: unknown;
      contractAddress?: unknown;
      txHash?: unknown;
      encryptedTimestampHandle?: unknown;
      encryptedEarlyDeltaHandle?: unknown;
      tierHandle?: unknown;
      publicTier?: unknown;
      publicTierLabel?: unknown;
      campaignWindowMinutes?: unknown;
      eligibilityHandle?: unknown;
      publicEligible?: unknown;
    };
    const sessionId = getString(body.sessionId);
    const walletAddress = getString(body.walletAddress);
    const contractAddress = getString(body.contractAddress);
    const txHash = getString(body.txHash);

    if (!sessionId || !walletAddress || !contractAddress || !txHash) {
      return NextResponse.json({ error: "sessionId, walletAddress, contractAddress, and txHash are required." }, { status: 400 });
    }

    assertValidEvmAddress(walletAddress);
    assertValidEvmAddress(contractAddress);
    assertValidTxHash(txHash);

    const session = await getProofSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Proof session was not found." }, { status: 404 });
    }

    if (session.status !== "succeeded" || !session.proof_artifact) {
      return NextResponse.json({ error: "A succeeded Reclaim proof artifact is required before submitting a Zama receipt." }, { status: 409 });
    }

    await recordZamaReceipt({
      sessionId,
      walletAddress,
      network: "sepolia",
      contractAddress,
      txHash,
      status: "sealed",
      encryptedTimestampHandle: getString(body.encryptedTimestampHandle),
      encryptedEarlyDeltaHandle: getString(body.encryptedEarlyDeltaHandle),
      tierHandle: getString(body.tierHandle),
      publicTier: typeof body.publicTier === "number" && Number.isInteger(body.publicTier) ? body.publicTier : null,
      publicTierLabel:
        typeof body.publicTier === "number" && Number.isInteger(body.publicTier)
          ? getTasteTierLabel(body.publicTier)
          : getString(body.publicTierLabel),
      campaignWindowMinutes:
        typeof body.campaignWindowMinutes === "number" && Number.isInteger(body.campaignWindowMinutes) ? body.campaignWindowMinutes : null,
      eligibilityHandle: getString(body.eligibilityHandle),
      publicEligible: typeof body.publicEligible === "boolean" ? body.publicEligible : null
    });

    return NextResponse.json({
      txHash,
      status: "SEALED",
      explorerUrl: getZamaExplorerTxUrl(txHash)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit Zama private taste proof.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
