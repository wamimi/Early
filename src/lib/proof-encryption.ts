import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export type EncryptedProofEnvelope = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
};

function encryptionKey() {
  const configured = process.env.RAW_PROOF_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("Missing RAW_PROOF_ENCRYPTION_KEY.");
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error("RAW_PROOF_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptRawProof(value: unknown): EncryptedProofEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptRawProof(envelope: EncryptedProofEnvelope): unknown {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as unknown;
}
