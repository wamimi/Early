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
const accountA = "early_account_a";
const accountB = "early_account_b";

function proofContext(providerHash: string) {
  return {
    providerHash,
    contextAddress: "0x1111111111111111111111111111111111111111",
    reclaimSessionId: "session-1",
    contextMessage: JSON.stringify({ subjectId }),
  };
}

function trustedData(
  tweetOverrides: Record<string, unknown> = {},
  viewerOverrides: Record<string, unknown> = {}
): Array<{
  context: Record<string, unknown>;
  extractedParameters: Record<string, unknown>;
}> {
  return [
    {
      context: proofContext(X_CONFORMANCE_PROVIDER.providerHashes[0]),
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
        user_id_str_62220: "111111111111111111",
        entryId_54976: "redacted-reply-entry",
        rest_id_43767: replyId,
        reply_author_screen_name: accountA,
        ...tweetOverrides,
      },
    },
    {
      context: proofContext(X_CONFORMANCE_PROVIDER.providerHashes[1]),
      extractedParameters: {
        viewer_screen_name: accountA,
        ...viewerOverrides,
      },
    },
  ];
}

describe("X proof conformance", () => {
  test("pins the manifest to the actual provider ID, version, hashes, and published shape", () => {
    const fixturePath = fileURLToPath(
      new URL("../fixtures/providers/x-v1.0.1-conformance.json", import.meta.url)
    );
    const manifest = JSON.parse(readFileSync(fixturePath, "utf8"));

    assert.deepEqual(manifest.provider, {
      id: X_CONFORMANCE_PROVIDER.id,
      version: X_CONFORMANCE_PROVIDER.version,
      configurationHash: X_CONFORMANCE_PROVIDER.configurationHash,
      providerHashes: X_CONFORMANCE_PROVIDER.providerHashes,
      verificationType: "WITNESS",
      requestCount: 2,
    });
    assert.equal(manifest.publishedFields.length, 19);
    assert.equal(
      manifest.publishedFields.some(
        (field: { name: string }) => field.name === "viewer_screen_name"
      ),
      true
    );
    assert.equal(
      manifest.publishedFields.some(
        (field: { name: string }) => field.name === "reply_author_screen_name"
      ),
      true
    );
  });

  test("accepts an own-reply claim when viewer and reply screen names match", () => {
    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: trustedData({}, { viewer_screen_name: `@${accountA.toUpperCase()}` }),
    });

    assert.equal(report.proofCount, 2);
    assert.equal(report.checks.providerHashMatches.status, "pass");
    assert.equal(report.checks.favoriteIsTrue.status, "pass");
    assert.equal(report.checks.replyParentMatchesSubmittedPost.status, "pass");
    assert.equal(report.checks.replyIdIsPresentAndConsistent.status, "pass");
    assert.equal(report.checks.replyTimestampIsValid.status, "pass");
    assert.equal(report.checks.replyAuthorIsPresent.status, "pass");
    assert.equal(report.checks.authenticatedAccountIsPresent.status, "pass");
    assert.equal(report.checks.authenticatedAccountEqualsReplyAuthor.status, "pass");
    assert.equal(report.evidence.replyAuthor.field, "reply_author_screen_name");
    assert.equal(report.evidence.authenticatedAccount.field, "viewer_screen_name");
    assert.equal(report.secureClaimAccepted, true);
    assert.deepEqual(report.failureCodes, []);
  });

  test("fails explicitly when authenticated viewer identity is absent", () => {
    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: trustedData({}, { viewer_screen_name: null }),
    });

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

  test("rejects the A-versus-B case", () => {
    const report = analyzeTrustedXProofData({
      scenario: "different-account-reply",
      trustedData: trustedData({}, { viewer_screen_name: accountB }),
    });

    assert.equal(report.checks.authenticatedAccountEqualsReplyAuthor.status, "fail");
    assert.equal(report.secureClaimAccepted, false);
    assert.ok(
      report.failureCodes.includes("AUTHENTICATED_ACCOUNT_REPLY_AUTHOR_MISMATCH")
    );
  });

  test("rejects wrong provider, favorite, parent, reply ID, and timestamp evidence", () => {
    const data = trustedData({
      favorited: false,
      id_str: "different-parent",
      in_reply_to_status_id_str: "different-parent",
      conversation_id_str_13369: "different-parent",
      rest_id_43767: "different-reply",
      created_at: "not-a-date",
    });
    data[0].context = {
      ...data[0].context,
      providerHash: `0x${"f".repeat(64)}`,
    };

    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: data,
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
      reply_author_screen_name: "private_reply_author",
      user_id_str_62220: "private-reply-author-sentinel",
      id_str_84642: "private-reply-id-sentinel",
      rest_id_43767: "private-reply-id-sentinel",
      created_at: "2026-07-23T10:00:00.000Z",
    };
    const report = analyzeTrustedXProofData({
      scenario: "own-reply",
      trustedData: trustedData(secretSentinels, {
        viewer_screen_name: "private_reply_author",
      }),
    });
    const serialized = JSON.stringify(report);

    for (const value of Object.values(secretSentinels)) {
      assert.equal(serialized.includes(value), false);
    }
    assert.equal(serialized.includes("private_reply_author"), false);
    assert.ok(
      report.fieldInventory.some(
        (field) => field.name === "viewer_screen_name" && field.type === "string"
      )
    );
  });

  test("rejects conflicting fields across the two proofs", () => {
    const data = trustedData();
    data[1].extractedParameters.id_str = "conflicting-parent";

    assert.throws(
      () =>
        analyzeTrustedXProofData({
          scenario: "own-reply",
          trustedData: data,
        }),
      /conflicting values/
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
