import { Buffer } from "node:buffer";
import { keccak256 } from "@ethersproject/keccak256";
import { type Proof, transformForOnchain } from "@reclaimprotocol/js-sdk";
import { nativeToScVal } from "@stellar/stellar-sdk";

type JsonRecord = Record<string, unknown>;

export type ReclaimOnchainProof = {
  messageDigestHex: string;
  signatureHex: string;
  recoveryId: number;
  serializedClaim: string;
  identifier: string;
  owner: string;
  timestampS: string;
  epoch: string;
};

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

function getProofs(payload: unknown): unknown[] {
  const parsedPayload = parseMaybeJson(payload);

  if (Array.isArray(parsedPayload)) {
    return parsedPayload;
  }

  if (!isRecord(parsedPayload)) {
    return [];
  }

  if ("claimData" in parsedPayload && "signatures" in parsedPayload) {
    return [parsedPayload];
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

    if (isRecord(candidate) && "claimData" in candidate && "signatures" in candidate) {
      return [candidate];
    }
  }

  return [];
}

function asReclaimProof(value: unknown): Proof {
  if (!isRecord(value) || !isRecord(value.claimData) || !Array.isArray(value.signatures)) {
    throw new Error("Stored proof payload does not contain a Reclaim proof.");
  }

  return value as unknown as Proof;
}

function getRequiredString(value: unknown, label: string) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required on-chain claim field: ${label}.`);
  }

  return String(value);
}

function normalizeSignature(signature: unknown) {
  if (typeof signature !== "string") {
    throw new Error("Reclaim proof signature must be a hex string.");
  }

  const cleanSignature = signature.startsWith("0x") ? signature.slice(2) : signature;

  if (!/^[a-f0-9]{130}$/i.test(cleanSignature)) {
    throw new Error("Reclaim proof signature must be 65 bytes of hex data.");
  }

  const recoveryByte = Number.parseInt(cleanSignature.slice(128), 16);
  const recoveryId = recoveryByte >= 27 ? recoveryByte - 27 : recoveryByte;

  if (recoveryId < 0 || recoveryId > 3) {
    throw new Error(`Invalid Reclaim proof recovery id: ${recoveryId}.`);
  }

  return {
    signatureHex: cleanSignature.slice(0, 128).toLowerCase(),
    recoveryId
  };
}

function hashEthereumSignedMessage(message: string) {
  const prefixedMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;
  return keccak256(Buffer.from(prefixedMessage, "utf8")).slice(2).toLowerCase();
}

function hexToBytes(hex: string, expectedBytes: number, label: string) {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes of hex data.`);
  }

  return Buffer.from(hex, "hex");
}

export function getFirstReclaimProofPayload(proofPayload: unknown): Proof {
  const proofs = getProofs(proofPayload);

  if (proofs.length === 0) {
    throw new Error("Stored proof payload does not include any Reclaim proofs.");
  }

  return asReclaimProof(proofs[0]);
}

export function createReclaimOnchainProof(proofPayload: unknown): ReclaimOnchainProof {
  const proof = getFirstReclaimProofPayload(proofPayload);
  const transformed = transformForOnchain(proof);
  const claim = transformed.signedClaim?.claim;
  const signature = transformed.signedClaim?.signatures?.[0];

  if (!isRecord(claim)) {
    throw new Error("Reclaim transformForOnchain did not return signed claim data.");
  }

  const identifier = getRequiredString(claim.identifier, "identifier");
  const owner = getRequiredString(claim.owner, "owner").toLowerCase();
  const timestampS = getRequiredString(claim.timestampS, "timestampS");
  const epoch = getRequiredString(claim.epoch, "epoch");
  const serializedClaim = [identifier, owner, timestampS, epoch].join("\n");
  const messageDigestHex = hashEthereumSignedMessage(serializedClaim);
  const { signatureHex, recoveryId } = normalizeSignature(signature);

  return {
    messageDigestHex,
    signatureHex,
    recoveryId,
    serializedClaim,
    identifier,
    owner,
    timestampS,
    epoch
  };
}

export function reclaimOnchainProofToScVals(proof: ReclaimOnchainProof) {
  return {
    messageDigest: nativeToScVal(hexToBytes(proof.messageDigestHex, 32, "messageDigest"), {
      type: "bytes"
    }),
    signature: nativeToScVal(hexToBytes(proof.signatureHex, 64, "signature"), {
      type: "bytes"
    }),
    recoveryId: nativeToScVal(proof.recoveryId, { type: "u32" })
  };
}
