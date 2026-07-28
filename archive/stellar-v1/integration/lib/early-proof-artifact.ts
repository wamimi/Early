import { createHash } from "node:crypto";

type JsonRecord = Record<string, unknown>;

export type EarlyProofArtifact = {
  version: "early-proof-artifact/v1";
  platform: "x";
  sessionId: string;
  parentContentId: string | null;
  replyContentId: string | null;
  replyTimestamp: string | null;
  replyTimestampUnix: number | null;
  screenName: string | null;
  proofHash: string;
  identityHash: string | null;
  publicCommitment: string;
};

export type CreateEarlyProofArtifactInput = {
  sessionId: string;
  proofPayload: unknown;
  extractedParameters: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(parameters: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = parameters[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as JsonRecord)[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function parseXTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const milliseconds = Date.parse(timestamp);

  if (Number.isNaN(milliseconds)) {
    return null;
  }

  return Math.floor(milliseconds / 1000);
}

export function createEarlyProofArtifact(input: CreateEarlyProofArtifactInput): EarlyProofArtifact {
  const parameters = isRecord(input.extractedParameters) ? input.extractedParameters : {};
  const parentContentId = getString(parameters, ["in_reply_to_status_id_str", "conversation_id_str_13369", "conversation_id_str", "id_str"]);
  const replyContentId = getString(parameters, ["id_str_84642", "rest_id_43767", "reply_id_str", "replyContentId"]);
  const replyTimestamp = getString(parameters, ["created_at", "reply_created_at", "replyTimestamp"]);
  const screenName = getString(parameters, ["screen_name", "in_reply_to_screen_name"]);
  const normalizedScreenName = screenName?.replace(/^@/, "").toLowerCase() ?? null;
  const proofHash = sha256(input.proofPayload);
  const identityHash = normalizedScreenName ? sha256({ platform: "x", screenName: normalizedScreenName }) : null;

  const commitmentSource = {
    version: "early-proof-artifact/v1" as const,
    platform: "x" as const,
    sessionId: input.sessionId,
    parentContentId,
    replyContentId,
    replyTimestamp,
    identityHash,
    proofHash
  };

  return {
    ...commitmentSource,
    replyTimestampUnix: parseXTimestamp(replyTimestamp),
    screenName: normalizedScreenName,
    publicCommitment: sha256(commitmentSource)
  };
}
