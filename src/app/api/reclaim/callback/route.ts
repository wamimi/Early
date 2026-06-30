import { NextRequest, NextResponse } from "next/server";
import { type Proof, verifyProof } from "@reclaimprotocol/js-sdk";
import { createEarlyProofArtifact } from "@/lib/early-proof-artifact";
import { completeProofSession } from "@/lib/supabase-proof-sessions";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function parseCallbackBody(request: NextRequest) {
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

function getProofs(payload: unknown): unknown[] {
  const parsedPayload = parseMaybeJson(payload);

  if (Array.isArray(parsedPayload)) {
    return parsedPayload;
  }

  if (!isRecord(parsedPayload)) {
    return [];
  }

  const candidates = [
    parsedPayload.proofs,
    parsedPayload.proof,
    parsedPayload.claims,
    parsedPayload.data,
    parsedPayload.response
  ].map(parseMaybeJson);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (isRecord(candidate) && "claimData" in candidate) {
      return [candidate];
    }
  }

  if ("claimData" in parsedPayload) {
    return [parsedPayload];
  }

  return [];
}

function parseContext(value: unknown): JsonRecord | null {
  const parsed = parseMaybeJson(value);
  return isRecord(parsed) ? parsed : null;
}

function getSessionId(payload: unknown, proofs: unknown[], request: NextRequest) {
  const headerSessionId = request.headers.get("x-reclaim-session-id");

  if (headerSessionId) {
    return headerSessionId;
  }

  if (isRecord(payload)) {
    const directSessionId = payload.sessionId ?? payload.session_id ?? payload.reclaimSessionId;

    if (typeof directSessionId === "string") {
      return directSessionId;
    }
  }

  for (const proof of proofs) {
    if (!isRecord(proof) || !isRecord(proof.claimData)) {
      continue;
    }

    const context = parseContext(proof.claimData.context);
    const sessionId = context?.reclaimSessionId;

    if (typeof sessionId === "string") {
      return sessionId;
    }
  }

  return null;
}

function getExtractedParameters(payload: unknown, proofs: unknown[]) {
  const merged: JsonRecord = {};

  if (isRecord(payload)) {
    const direct = payload.extractedParameterValues ?? payload.extractedParameters;

    if (isRecord(direct)) {
      Object.assign(merged, direct);
    }
  }

  for (const proof of proofs) {
    if (!isRecord(proof)) {
      continue;
    }

    if (isRecord(proof.extractedParameterValues)) {
      Object.assign(merged, proof.extractedParameterValues);
    }

    if (isRecord(proof.claimData)) {
      const context = parseContext(proof.claimData.context);

      if (isRecord(context?.extractedParameters)) {
        Object.assign(merged, context.extractedParameters);
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local and Vercel environment variables.`);
  }

  return value;
}

function shouldRequireTeeAttestation() {
  return process.env.RECLAIM_REQUIRE_TEE_ATTESTATION === "true";
}

function isProof(value: unknown): value is Proof {
  return isRecord(value) && typeof value.identifier === "string" && isRecord(value.claimData) && Array.isArray(value.signatures);
}

async function verifyReclaimProofs(proofs: unknown[]) {
  const validProofs = proofs.filter(isProof);

  if (validProofs.length === 0) {
    return {
      isVerified: false,
      extractedParameters: null,
      errorMessage: "Callback did not include a Reclaim proof payload."
    };
  }

  try {
    const verificationConfig: {
      providerId: string;
      providerVersion: string;
      teeAttestation?: { appSecret: string };
    } = {
      providerId: getRequiredEnv("RECLAIM_PROVIDER_ID"),
      providerVersion: process.env.RECLAIM_PROVIDER_VERSION ?? "1.0.0"
    };

    if (shouldRequireTeeAttestation()) {
      verificationConfig.teeAttestation = {
        appSecret: getRequiredEnv("RECLAIM_APP_SECRET")
      };
    }

    const result = await verifyProof(validProofs, verificationConfig);

    if (!result.isVerified) {
      return {
        isVerified: false,
        extractedParameters: null,
        errorMessage: result.error.message
      };
    }

    return {
      isVerified: true,
      extractedParameters: Object.assign({}, ...result.data.map((item) => item.extractedParameters)),
      errorMessage: undefined
    };
  } catch (error) {
    return {
      isVerified: false,
      extractedParameters: null,
      errorMessage: error instanceof Error ? error.message : "Reclaim proof verification failed."
    };
  }
}

export async function POST(request: NextRequest) {
  const body = await parseCallbackBody(request);
  const proofs = getProofs(body);
  const sessionId = getSessionId(body, proofs, request);

  console.info("[Early/Reclaim] Proof callback received", JSON.stringify(body, null, 2));

  if (!sessionId) {
    return NextResponse.json({ error: "Missing Reclaim session id." }, { status: 400 });
  }

  const verification = await verifyReclaimProofs(proofs);
  const extractedParameters = verification.extractedParameters ?? getExtractedParameters(body, proofs);
  const proofArtifact = verification.isVerified
    ? createEarlyProofArtifact({
        sessionId,
        proofPayload: body,
        extractedParameters
      })
    : null;

  try {
    await completeProofSession({
      sessionId,
      status: verification.isVerified ? "succeeded" : "failed",
      proofPayload: body,
      extractedParameters,
      proofArtifact,
      errorMessage: verification.errorMessage
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Reclaim proof session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessionId });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Early Reclaim callback endpoint is alive."
  });
}
