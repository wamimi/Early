import assert from "node:assert/strict";
import { keccak256, toUtf8Bytes } from "ethers";
import { test } from "vitest";
import {
  VERIFIED_DISCOVERY_VERSION,
  createVerifiedDiscovery,
  toPublicReceipt,
} from "../src/lib/proof-model.ts";

const provider = {
  id: "early-x-v2",
  version: "2.0.0",
  hash: keccak256(toUtf8Bytes("early-x-v2")),
  schemaVersion: 2,
};
const registry = "0x0000000000000000000000000000000000001234";
const wallet = "0x1111111111111111111111111111111111111111";
const sessionNullifier = keccak256(toUtf8Bytes("session-1"));

function xDiscovery(overrides = {}) {
  return createVerifiedDiscovery({
    platform: "x",
    provider,
    proofPayload: { identifier: "reclaim-proof-1" },
    extractedParameters: {
      liked: "true",
      replied: true,
      replyId: "1900000000000000001",
      replyToSubjectId: "1900000000000000000",
      replyTimestamp: "1720000000000",
      ...overrides,
    },
    sessionNullifier,
    wallet,
    subjectId: "1900000000000000000",
    chainId: 84532,
    registryAddress: registry,
  });
}

test("normalizes a valid X liked-and-replied proof", () => {
  const discovery = xDiscovery();

  assert.equal(discovery.version, VERIFIED_DISCOVERY_VERSION);
  assert.equal(discovery.platform, "x");
  assert.equal(discovery.content, "1900000000000000001");
  assert.equal(discovery.timestamp, 1_720_000_000);
  assert.deepEqual(discovery.interactionClaims, {
    platform: "x",
    liked: true,
    replied: true,
    replyId: "1900000000000000001",
    replyToSubjectId: "1900000000000000000",
  });
});

test("rejects X proofs without both required interactions", () => {
  assert.throws(
    () => xDiscovery({ liked: false }),
    /both liked and replied/
  );
  assert.throws(
    () => xDiscovery({ replied: false }),
    /both liked and replied/
  );
});

test("rejects a reply attached to a different focal post", () => {
  assert.throws(
    () => xDiscovery({ replyToSubjectId: "different-post" }),
    /not attached to the focal X post/
  );
});

test("normalizes a YouTube comment and engagement proof", () => {
  const discovery = createVerifiedDiscovery({
    platform: "youtube",
    provider: { ...provider, id: "early-youtube-v2" },
    proofPayload: { identifier: "reclaim-proof-youtube" },
    extractedParameters: {
      commented: true,
      engaged: "true",
      videoId: "dQw4w9WgXcQ",
      commentId: "comment-7",
      published_at: "2026-07-23T10:00:00.000Z",
    },
    sessionNullifier: keccak256(toUtf8Bytes("session-youtube")),
    wallet,
    subjectId: "dQw4w9WgXcQ",
    chainId: 84532,
    registryAddress: registry,
  });

  assert.equal(discovery.content, "comment-7");
  assert.equal(discovery.interactionClaims.platform, "youtube");
  assert.equal(discovery.timestamp, 1_784_800_800);
});

test("public receipts contain only the minimal Base-safe projection", () => {
  const receipt = toPublicReceipt(xDiscovery());

  assert.equal(receipt.owner, wallet);
  assert.equal(receipt.platform, "x");
  assert.equal("timestamp" in receipt, false);
  assert.equal("interactionClaims" in receipt, false);
  assert.equal("subject" in receipt, false);
  assert.equal("content" in receipt, false);
});

test("commitments are domain-separated by chain and registry", () => {
  const original = xDiscovery();
  const otherChain = createVerifiedDiscovery({
    platform: "x",
    provider,
    proofPayload: { identifier: "reclaim-proof-1" },
    extractedParameters: {
      liked: true,
      replied: true,
      replyId: "1900000000000000001",
      replyToSubjectId: "1900000000000000000",
      replyTimestamp: "1720000000",
    },
    sessionNullifier,
    wallet,
    subjectId: "1900000000000000000",
    chainId: 8453,
    registryAddress: registry,
  });

  assert.notEqual(original.commitment, otherChain.commitment);
});
