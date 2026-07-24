import { NextRequest, NextResponse } from "next/server";
import { keccak256, toUtf8Bytes } from "ethers";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import { decryptRawProof } from "@/lib/proof-encryption";
import {
  finalizeProofSession,
  getOrCreateVaultIdentity,
  getOwnedProofSession,
  recordConfidentialInput,
} from "@/lib/v2-store";
import {
  confirmVaultRegistration,
  requestAttestedVaultRegistration,
} from "@/lib/zama-vault";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    if (
      !session ||
      session.status !== "verified" ||
      !session.proof_ciphertext ||
      !session.verified_discovery
    ) {
      return NextResponse.json(
        { error: "A verified, unfinalized proof session is required." },
        { status: 409 }
      );
    }

    const identity = await getOrCreateVaultIdentity(user.user_id);
    const subjectHash = keccak256(
      toUtf8Bytes(session.verified_discovery.subject)
    );
    const registration = await requestAttestedVaultRegistration({
      proofPayload: decryptRawProof(session.proof_ciphertext),
      providerId: session.provider_configuration.id,
      providerVersion: session.provider_configuration.version,
      vaultId: identity.vault_id,
      ownerBinding: identity.owner_binding,
      expectedProofCommitment: session.verified_discovery.commitment,
      expectedSubjectHash: subjectHash,
    });

    await recordConfidentialInput({
      sessionId: session.session_id,
      privyUserId: user.user_id,
      vaultId: registration.vaultId,
      ownerBinding: registration.ownerBinding,
      proofCommitment: registration.proofCommitment,
      subjectHash: registration.subjectHash,
      ciphertextHash: registration.ciphertextHash,
      nonce: registration.nonce,
      expiry: registration.expiry,
      transactionHash: registration.transactionHash,
      status: "submitted",
    });

    await confirmVaultRegistration(registration);
    await recordConfidentialInput({
      sessionId: session.session_id,
      privyUserId: user.user_id,
      vaultId: registration.vaultId,
      ownerBinding: registration.ownerBinding,
      proofCommitment: registration.proofCommitment,
      subjectHash: registration.subjectHash,
      ciphertextHash: registration.ciphertextHash,
      nonce: registration.nonce,
      expiry: registration.expiry,
      transactionHash: registration.transactionHash,
      status: "confirmed",
    });
    await finalizeProofSession(session.session_id);

    const explorerRoot =
      process.env.NEXT_PUBLIC_ZAMA_EXPLORER_URL ??
      "https://sepolia.etherscan.io";
    return NextResponse.json({
      status: "confirmed",
      artifact: {
        vaultId: registration.vaultId,
        proofCommitment: registration.proofCommitment,
        subjectHash: registration.subjectHash,
        ciphertextHash: registration.ciphertextHash,
        transactionHash: registration.transactionHash,
      },
      explorerUrl: `${explorerRoot.replace(/\/$/, "")}/tx/${registration.transactionHash}`,
      privacyNotice:
        "Early's attestor sees and verifies the plaintext proof. The encrypted history is not disclosed to brands or public observers.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to seal this discovery in the private vault.";
    const status = message.includes("access token")
      ? 401
      : message.includes("origin") || message.includes("not linked")
        ? 403
        : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
