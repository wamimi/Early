import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  X_CONFORMANCE_PROVIDER,
  analyzeTrustedXProofData,
  getProofsForConformance,
} from "../src/lib/x-proof-conformance";

const subjectId = "1900000000000000000";
const replyId = "1900000000000000001";
const accountA = "111111111111111111";
const accountB = "222222222222222222";

function trustedData(overrides: Record<string, unknown> = {}) {
  return {
    context: {
      providerHash: X_CONFORMANCE_PROVIDER.providerHash,
      contextAddress: "0x1111111111111111111111111111111111111111",
      contextMessage: JSON.stringify({ subjectId }),
    },
    extractedParameters: {
      screen_name: "redacted-parent-screen-name",
      rest_id: "redacted-parent-author",
      conversation_id_str: subjectId,
      favorited: "true",
      id_str: subjectId,
      user_id_str: "redacted-parent-author",
      entryId: "redacted-parent-entry",
      count: "1",
      conversation_id_str_13369: subjectId,
      created_at: "Wed Jul 23 10:00:00 +0000 2026",
      id_str_84642: replyId,
      in_reply_to_screen_name: "redacted-parent-screen-name",
      in_reply_to_status_id_str: subjectId,
      in_reply_to_user_id_str: "redacted-parent-author",
      user_id_str_62220: accountA,
      entryId_54976: "redacted-reply-entry",
      rest_id_43767: replyId,
      ...overrides,
    },
  };
}

describe("X proof conformance", () => {
  test("pins the manifest to the actual provider ID, version, hash, and published shape", () => {
    const fixturePath = fileURLToPath(
      new URL("../fixtures/providers/x-v1.0.0-conformance.json", import.meta.url)
    );
    const manifest = JSON.parse(readFileSync(fixturePath, "utf8"));

    assert.deepEqual(manifest.provider, {
      id: X_CONFORMANCE_PROVIDER.id,
      version: X_CONFORMANCE_PROVIDER.version,
      providerHash: X_CONFORMANCE_PROVIDER.providerHash,
      verificationType: "WITNESS",
    });
    assert.equal(manifest.publishedFields.length, 17);
    assert.equal(
      manifest.publishedFields.some(
        (field: { name: string }) => field.name === "authenticatedAccountId"
      ),
      false
    );
  });

  test("fails explicitly when the current provider omits authenticated viewer identity", () => {
    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: trustedData(),
    });

    assert.equal(report.checks.favoriteIsTrue.status, "pass");
    assert.equal(report.checks.replyParentMatchesSubmittedPost.status, "pass");
    assert.equal(report.checks.replyIdIsPresentAndConsistent.status, "pass");
    assert.equal(report.checks.replyTimestampIsValid.status, "pass");
    assert.equal(report.checks.replyAuthorIsPresent.status, "pass");
    assert.equal(report.checks.authenticatedAccountIsPresent.status, "missing");
    assert.equal(
      report.checks.authenticatedAccountEqualsReplyAuthor.status,
      "missing"
    );
    assert.equal(report.secureClaimAccepted, false);
    assert.ok(report.failureCodes.includes("AUTHENTICATED_ACCOUNT_ID_MISSING"));
    assert.ok(
      report.failureCodes.includes(
        "AUTHENTICATED_ACCOUNT_REPLY_AUTHOR_EQUALITY_UNPROVEN"
      )
    );
  });

  test("accepts an own-reply claim only when authenticated viewer and reply author match", () => {
    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: trustedData({ authenticatedAccountId: accountA }),
    });

    assert.equal(report.checks.authenticatedAccountEqualsReplyAuthor.status, "pass");
    assert.equal(report.secureClaimAccepted, true);
    assert.deepEqual(report.failureCodes, []);
  });

  test("rejects the A-versus-B case when both account identities are disclosed", () => {
    const report = analyzeTrustedXProofData({
      scenario: "different-account-reply",
      trustedData: trustedData({ authenticatedAccountId: accountB }),
    });

    assert.equal(report.checks.authenticatedAccountEqualsReplyAuthor.status, "fail");
    assert.equal(report.secureClaimAccepted, false);
    assert.ok(
      report.failureCodes.includes("AUTHENTICATED_ACCOUNT_REPLY_AUTHOR_MISMATCH")
    );
  });

  test("rejects wrong provider, favorite, parent, reply ID, and timestamp evidence", () => {
    const base = trustedData({ authenticatedAccountId: accountA });
    (base.context as Record<string, unknown>).providerHash = `0x${"f".repeat(64)}`;
    Object.assign(base.extractedParameters, {
      favorited: false,
      id_str: "different-parent",
      in_reply_to_status_id_str: "different-parent",
      conversation_id_str_13369: "different-parent",
      rest_id_43767: "different-reply",
      created_at: "not-a-date",
    });

    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: base,
    });

    assert.equal(report.checks.providerHashMatches.status, "fail");
    assert.equal(report.checks.favoriteIsTrue.status, "fail");
    assert.equal(report.checks.parentPostMatchesSubmittedPost.status, "fail");
    assert.equal(report.checks.replyParentMatchesSubmittedPost.status, "fail");
    assert.equal(report.checks.replyConversationMatchesSubmittedPost.status, "fail");
    assert.equal(report.checks.replyIdIsPresentAndConsistent.status, "fail");
    assert.equal(report.checks.replyTimestampIsValid.status, "fail");
    assert.equal(report.secureClaimAccepted, false);
  });

  test("sanitized reports expose field names and types but never proof values", () => {
    const secretSentinels = {
      authenticatedAccountId: "private-authenticated-account-sentinel",
      user_id_str_62220: "private-reply-author-sentinel",
      id_str_84642: "private-reply-id-sentinel",
      rest_id_43767: "private-reply-id-sentinel",
      created_at: "2026-07-23T10:00:00.000Z",
    };
    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: trustedData(secretSentinels),
    });
    const serialized = JSON.stringify(report);

    for (const value of Object.values(secretSentinels)) {
      assert.equal(serialized.includes(value), false);
    }
    assert.ok(
      report.fieldInventory.some(
        (field) => field.name === "user_id_str_62220" && field.type === "string"
      )
    );
  });

  test("extracts proofs from direct, array, and callback wrapper payloads", () => {
    const proof = {
      identifier: "proof-identifier",
      claimData: {},
      signatures: [],
    };

    assert.equal(getProofsForConformance(proof).length, 1);
    assert.equal(getProofsForConformance([proof]).length, 1);
    assert.equal(getProofsForConformance({ proofs: [proof] }).length, 1);
    assert.equal(getProofsForConformance({ response: JSON.stringify([proof]) }).length, 1);
    assert.equal(getProofsForConformance({ session: { proofs: [proof] } }).length, 1);
    assert.equal(getProofsForConformance({ nope: true }).length, 0);
  });
});
