import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "vitest";
import {
  decryptRawProof,
  encryptRawProof,
} from "../src/lib/proof-encryption.ts";
import { assertAllowedOrigin } from "../src/lib/origins.ts";
import {
  getReclaimProofs,
  getReclaimSessionId,
  parseReclaimCallback,
} from "../src/lib/reclaim-proof.ts";
import { getSubjectId } from "../src/lib/reclaim.ts";

test("raw proof envelopes round-trip and reject tampering", () => {
  process.env.RAW_PROOF_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const proof = {
    identifier: "proof-1",
    claimData: { owner: "0x1111111111111111111111111111111111111111" },
  };
  const encrypted = encryptRawProof(proof);

  assert.deepEqual(decryptRawProof(encrypted), proof);
  assert.throws(() =>
    decryptRawProof({
      ...encrypted,
      ciphertext: Buffer.from("tampered").toString("base64"),
    })
  );
});

test("origin checks require an exact configured origin", () => {
  process.env.NODE_ENV = "production";
  process.env.NEXT_PUBLIC_APP_URL = "https://early.example";
  process.env.ALLOWED_APP_ORIGINS = "https://preview.early.example";

  assert.doesNotThrow(() => assertAllowedOrigin("https://early.example"));
  assert.doesNotThrow(() =>
    assertAllowedOrigin("https://preview.early.example/path")
  );
  assert.throws(
    () => assertAllowedOrigin("https://early.example.attacker.test"),
    /not allowed/
  );
  assert.throws(() => assertAllowedOrigin(null), /not allowed/);
});

test("provider subject parsing accepts canonical X and YouTube URLs", () => {
  assert.equal(
    getSubjectId("x", "https://x.com/early/status/1900000000000000000"),
    "1900000000000000000"
  );
  assert.equal(
    getSubjectId("youtube", "https://youtu.be/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
  assert.equal(
    getSubjectId(
      "youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ),
    "dQw4w9WgXcQ"
  );
  assert.throws(() => getSubjectId("x", "https://x.com/home"), /public X post/);
});

test("callback parsing supports form payloads without logging or string slicing", async () => {
  const proof = {
    identifier: "proof-1",
    signatures: ["0x01"],
    claimData: {
      owner: "0x1111111111111111111111111111111111111111",
      context: JSON.stringify({
        contextAddress: "0x1111111111111111111111111111111111111111",
        contextMessage: "{}",
        reclaimSessionId: "session-1",
      }),
    },
  };
  const request = new Request("https://early.example/api/reclaim/callback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      sessionId: "session-1",
      proofs: JSON.stringify([proof]),
    }),
  });
  const payload = await parseReclaimCallback(request);
  const proofs = getReclaimProofs(payload);

  assert.equal(proofs.length, 1);
  assert.equal(getReclaimSessionId(payload, proofs), "session-1");
  assert.equal(getReclaimProofs({ proofs: "not-json" }).length, 0);
});
