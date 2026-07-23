import { NextRequest, NextResponse } from "next/server";
import {
  type Proof,
  transformForOnchain,
} from "@reclaimprotocol/js-sdk";
import { hexlify } from "ethers";
import {
  baseChainId,
  baseRegistryAddress,
} from "@/lib/base-contracts";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import { decryptRawProof } from "@/lib/proof-encryption";
import { toPublicReceipt } from "@/lib/proof-model";
import { getOwnedProofSession } from "@/lib/v2-store";

export const runtime = "nodejs";

function isProofArray(value: unknown): value is Proof[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (proof) =>
        typeof proof === "object" &&
        proof !== null &&
        "claimData" in proof &&
        "signatures" in proof
    )
  );
}

function onchainProof(proof: Proof) {
  const transformed = transformForOnchain(proof);
  return {
    claimInfo: {
      provider: transformed.claimInfo.provider,
      parameters: transformed.claimInfo.parameters,
      context: transformed.claimInfo.context,
    },
    signedClaim: {
      claim: {
        identifier: transformed.signedClaim.claim.identifier,
        owner: transformed.signedClaim.claim.owner,
        timestampS: transformed.signedClaim.claim.timestampS,
        epoch: transformed.signedClaim.claim.epoch,
      },
      signatures: transformed.signedClaim.signatures.map(
        (signature: string | Uint8Array) =>
          typeof signature === "string" ? signature : hexlify(signature)
      ),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    assertAllowedOrigin(request.headers.get("origin"));
    const body = (await request.json()) as {
      sessionId?: unknown;
      walletAddress?: unknown;
    };
    if (
      typeof body.sessionId !== "string" ||
      typeof body.walletAddress !== "string"
    ) {
      return NextResponse.json(
        { error: "sessionId and walletAddress are required." },
        { status: 400 }
      );
    }

    const user = await authenticatePrivyRequest(request, body.walletAddress);
    const session = await getOwnedProofSession(body.sessionId, user.user_id);
    if (!session) {
      return NextResponse.json(
        { error: "Proof session was not found." },
        { status: 404 }
      );
    }
    if (
      session.status !== "verified" ||
      !session.proof_ciphertext ||
      !session.verified_discovery
    ) {
      return NextResponse.json(
        { error: "A verified, unfinalized Reclaim proof is required." },
        { status: 409 }
      );
    }

    const proofs = decryptRawProof(session.proof_ciphertext);
    if (!isProofArray(proofs)) {
      throw new Error("The encrypted proof payload is invalid.");
    }

    return NextResponse.json({
      chainId: baseChainId(),
      registryAddress: baseRegistryAddress(),
      method: "verifyAndRegister",
      proof: onchainProof(proofs[0]),
      expectedReceipt: toPublicReceipt(session.verified_discovery),
      privacyNotice:
        "This public path submits selected Reclaim proof fields in Base transaction calldata.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to prepare the Base receipt.";
    const status = message.includes("access token")
      ? 401
      : message.includes("origin") || message.includes("not linked")
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
