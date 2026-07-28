import { AbiCoder, getAddress, isHexString, keccak256, toUtf8Bytes } from "ethers";

export const VERIFIED_DISCOVERY_VERSION = "early.verified-discovery/v2" as const;
export const PUBLIC_RECEIPT_VERSION = "early.public-receipt/v2" as const;
export const CONFIDENTIAL_ATTESTATION_VERSION =
  "early.confidential-input-attestation/v2" as const;
export const ELIGIBILITY_AUTHORIZATION_VERSION =
  "early.eligibility-authorization/v2" as const;

export type DiscoveryPlatform = "x" | "youtube";

export type ProviderConfiguration = {
  id: string;
  version: string;
  hash: `0x${string}`;
  schemaVersion: 2;
};

export type InteractionClaims =
  | {
      platform: "x";
      liked: true;
      replied: true;
      replyId: string;
      replyToSubjectId: string;
    }
  | {
      platform: "youtube";
      commented: true;
      commentId: string;
      videoId: string;
      engaged: true;
    };

export type VerifiedDiscovery = {
  version: typeof VERIFIED_DISCOVERY_VERSION;
  platform: DiscoveryPlatform;
  provider: ProviderConfiguration;
  proofIdentifier: `0x${string}`;
  sessionNullifier: `0x${string}`;
  wallet: `0x${string}`;
  subject: string;
  content: string;
  interactionClaims: InteractionClaims;
  timestamp: number;
  commitment: `0x${string}`;
};

export type PublicReceipt = {
  version: typeof PUBLIC_RECEIPT_VERSION;
  owner: `0x${string}`;
  proofId: `0x${string}`;
  platform: DiscoveryPlatform;
  subjectHash: `0x${string}`;
  contentHash: `0x${string}`;
  providerHash: `0x${string}`;
  commitment: `0x${string}`;
};

export type ConfidentialInputAttestation = {
  version: typeof CONFIDENTIAL_ATTESTATION_VERSION;
  vaultId: `0x${string}`;
  proofCommitment: `0x${string}`;
  subjectHash: `0x${string}`;
  ciphertextHash: `0x${string}`;
  ownerBinding: `0x${string}`;
  nonce: string;
  expiry: number;
  signer: `0x${string}`;
};

export type EligibilityAuthorization = {
  version: typeof ELIGIBILITY_AUTHORIZATION_VERSION;
  campaign: string;
  claimant: `0x${string}`;
  evaluationTransaction: `0x${string}`;
  nullifier: `0x${string}`;
  expiry: number;
};

type JsonRecord = Record<string, unknown>;

type CreateVerifiedDiscoveryInput = {
  platform: DiscoveryPlatform;
  provider: ProviderConfiguration;
  proofPayload: unknown;
  extractedParameters: unknown;
  sessionNullifier: string;
  wallet: string;
  subjectId: string;
  chainId: number;
  registryAddress: string;
};

const coder = AbiCoder.defaultAbiCoder();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: JsonRecord, keys: string[], label: string) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  throw new Error(`Verified provider output is missing ${label}.`);
}

function readBoolean(source: JsonRecord, keys: string[], label: string) {
  for (const key of keys) {
    const value = source[key];
    if (value === true || value === "true" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
  }
  throw new Error(`Verified provider output is missing ${label}.`);
}

function timestampToUnix(value: string) {
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : numeric;
  }
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) throw new Error("Verified interaction timestamp is invalid.");
  return Math.floor(milliseconds / 1000);
}

function proofIdentifier(payload: unknown): `0x${string}` {
  const firstProof = Array.isArray(payload)
    ? payload[0]
    : isRecord(payload) && Array.isArray(payload.proofs)
      ? payload.proofs[0]
      : payload;
  const claimData = isRecord(firstProof) && isRecord(firstProof.claimData)
    ? firstProof.claimData
    : {};
  const candidate =
    (isRecord(firstProof) && typeof firstProof.identifier === "string"
      ? firstProof.identifier
      : null) ??
    (typeof claimData.identifier === "string" ? claimData.identifier : null);
  if (!candidate) throw new Error("Verified Reclaim proof is missing its identifier.");
  return (isHexString(candidate, 32) ? candidate : keccak256(toUtf8Bytes(candidate))) as `0x${string}`;
}

function normalizeBytes32(value: string, label: string): `0x${string}` {
  if (!isHexString(value, 32)) throw new Error(`${label} must be a bytes32 value.`);
  return value.toLowerCase() as `0x${string}`;
}

export function createVerifiedDiscovery(
  input: CreateVerifiedDiscoveryInput
): VerifiedDiscovery {
  const extracted = isRecord(input.extractedParameters) ? input.extractedParameters : {};
  const wallet = getAddress(input.wallet) as `0x${string}`;
  const proofId = proofIdentifier(input.proofPayload);
  const sessionNullifier = normalizeBytes32(input.sessionNullifier, "Session nullifier");
  const providerHash = normalizeBytes32(input.provider.hash, "Provider configuration hash");

  let content: string;
  let timestamp: number;
  let interactionClaims: InteractionClaims;

  if (input.platform === "x") {
    const liked = readBoolean(extracted, ["liked", "is_liked", "favorited"], "the liked state");
    const replied = readBoolean(extracted, ["replied", "has_replied"], "the replied state");
    if (!liked || !replied) {
      throw new Error("An Early X proof must verify that the account both liked and replied.");
    }
    const replyId = readString(
      extracted,
      ["replyId", "reply_id_str", "id_str_84642", "rest_id_43767"],
      "the reply ID"
    );
    const replyToSubjectId = readString(
      extracted,
      ["replyToSubjectId", "in_reply_to_status_id_str", "conversation_id_str_13369"],
      "the focal post relationship"
    );
    if (replyToSubjectId !== input.subjectId) {
      throw new Error("The verified reply is not attached to the focal X post.");
    }
    timestamp = timestampToUnix(
      readString(
        extracted,
        ["replyTimestamp", "reply_created_at", "created_at"],
        "the reply timestamp"
      )
    );
    content = replyId;
    interactionClaims = {
      platform: "x",
      liked: true,
      replied: true,
      replyId,
      replyToSubjectId,
    };
  } else {
    const commented = readBoolean(extracted, ["commented", "has_commented"], "the comment state");
    const engaged = readBoolean(
      extracted,
      ["engaged", "liked", "has_required_engagement"],
      "the required engagement state"
    );
    if (!commented || !engaged) {
      throw new Error("An Early YouTube proof must verify the comment and required engagement.");
    }
    const videoId = readString(extracted, ["videoId", "video_id"], "the video ID");
    if (videoId !== input.subjectId) {
      throw new Error("The verified comment is not attached to the focal YouTube video.");
    }
    const commentId = readString(extracted, ["commentId", "comment_id"], "the comment ID");
    timestamp = timestampToUnix(
      readString(
        extracted,
        ["commentTimestamp", "comment_timestamp", "published_at"],
        "the comment timestamp"
      )
    );
    content = commentId;
    interactionClaims = {
      platform: "youtube",
      commented: true,
      commentId,
      videoId,
      engaged: true,
    };
  }

  const commitment = keccak256(
    coder.encode(
      [
        "bytes32",
        "uint256",
        "address",
        "address",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
      ],
      [
        keccak256(toUtf8Bytes(VERIFIED_DISCOVERY_VERSION)),
        input.chainId,
        getAddress(input.registryAddress),
        wallet,
        proofId,
        keccak256(toUtf8Bytes(input.platform)),
        keccak256(toUtf8Bytes(input.subjectId)),
        keccak256(toUtf8Bytes(content)),
        providerHash,
      ]
    )
  ) as `0x${string}`;

  return {
    version: VERIFIED_DISCOVERY_VERSION,
    platform: input.platform,
    provider: { ...input.provider, hash: providerHash },
    proofIdentifier: proofId,
    sessionNullifier,
    wallet,
    subject: input.subjectId,
    content,
    interactionClaims,
    timestamp,
    commitment,
  };
}

export function toPublicReceipt(discovery: VerifiedDiscovery): PublicReceipt {
  return {
    version: PUBLIC_RECEIPT_VERSION,
    owner: discovery.wallet,
    proofId: discovery.proofIdentifier,
    platform: discovery.platform,
    subjectHash: keccak256(toUtf8Bytes(discovery.subject)) as `0x${string}`,
    contentHash: keccak256(toUtf8Bytes(discovery.content)) as `0x${string}`,
    providerHash: discovery.provider.hash,
    commitment: discovery.commitment,
  };
}
