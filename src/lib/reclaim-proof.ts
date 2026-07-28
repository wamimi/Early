import {
  type Context,
  type Proof,
  verifyProof,
} from "@reclaimprotocol/js-sdk";
import { getAddress } from "ethers";
import type { ProofSessionV2 } from "./v2-store";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export async function parseReclaimCallback(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as unknown;
  }

  const text = await request.text();
  const form = new URLSearchParams(text);
  const body: JsonRecord = {};
  form.forEach((value, key) => {
    body[key] = parseMaybeJson(value);
  });
  return Object.keys(body).length > 0 ? body : parseMaybeJson(text);
}

function isProof(value: unknown): value is Proof {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    isRecord(value.claimData) &&
    Array.isArray(value.signatures)
  );
}

export function getReclaimProofs(payload: unknown): Proof[] {
  const parsed = parseMaybeJson(payload);
  if (Array.isArray(parsed)) return parsed.filter(isProof);
  if (!isRecord(parsed)) return [];

  const candidates = [
    parsed.proofs,
    parsed.proof,
    parsed.claims,
    parsed.data,
    parsed.response,
  ].map(parseMaybeJson);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const proofs = candidate.filter(isProof);
      if (proofs.length > 0) return proofs;
    }
    if (isProof(candidate)) return [candidate];
  }

  return isProof(parsed) ? [parsed] : [];
}

function proofContext(proof: Proof): Context {
  const parsed = parseMaybeJson(proof.claimData.context);
  if (!isRecord(parsed)) {
    throw new Error("The Reclaim proof context is malformed.");
  }
  return parsed as unknown as Context;
}

function contextMessage(context: Context) {
  const parsed = parseMaybeJson(context.contextMessage);
  if (!isRecord(parsed)) {
    throw new Error("The Early proof context message is malformed.");
  }
  return parsed;
}

export function getReclaimSessionId(
  payload: unknown,
  proofs: Proof[],
  headerSessionId?: string | null
) {
  if (headerSessionId) return headerSessionId;
  if (isRecord(payload)) {
    const direct =
      payload.sessionId ?? payload.session_id ?? payload.reclaimSessionId;
    if (typeof direct === "string") return direct;
  }
  for (const proof of proofs) {
    const sessionId = proofContext(proof).reclaimSessionId;
    if (typeof sessionId === "string" && sessionId) return sessionId;
  }
  return null;
}

function assertContextMatchesSession(proof: Proof, session: ProofSessionV2) {
  const context = proofContext(proof);
  const message = contextMessage(context);
  const expectedWallet = getAddress(session.wallet_address);

  if (getAddress(context.contextAddress) !== expectedWallet) {
    throw new Error("The proof wallet context does not match this session.");
  }
  if (getAddress(proof.claimData.owner) !== expectedWallet) {
    throw new Error("The Reclaim proof owner does not match this session.");
  }
  if (context.reclaimSessionId !== session.session_id) {
    throw new Error("The Reclaim session binding is invalid.");
  }
  if (
    message.version !== "2" ||
    message.schemaVersion !== "2" ||
    message.platform !== session.platform ||
    message.providerConfigHash !== session.provider_hash ||
    message.sessionNullifier !== session.session_nullifier ||
    message.subjectId !== session.subject_id
  ) {
    throw new Error("The proof context does not match the requested Early claim.");
  }
}

export async function verifyReclaimSessionProofs(
  proofs: Proof[],
  session: ProofSessionV2
) {
  if (proofs.length === 0) {
    throw new Error("The callback did not include a Reclaim proof.");
  }

  for (const proof of proofs) assertContextMatchesSession(proof, session);

  const verification = await verifyProof(proofs, {
    providerId: session.provider_configuration.id,
    providerVersion: session.provider_configuration.version,
    allowedTags: [],
    ...(process.env.RECLAIM_REQUIRE_TEE_ATTESTATION === "true"
      ? {
          teeAttestation: {
            appSecret:
              process.env.RECLAIM_APP_SECRET ??
              (() => {
                throw new Error("Missing RECLAIM_APP_SECRET.");
              })(),
          },
        }
      : {}),
  });

  if (!verification.isVerified) {
    throw new Error(verification.error.message);
  }

  const extractedParameters = Object.assign(
    {},
    ...verification.data.map((item) => item.extractedParameters)
  ) as Record<string, unknown>;

  return { proofs, extractedParameters };
}
