import { verifyProof, type Proof } from "@reclaimprotocol/js-sdk";

export const X_CONFORMANCE_PROVIDER = {
  id: "fe0767e9-8172-48c0-ba64-702703c4c745",
  version: "1.0.5",
  configurationHash:
    "0xdb76bb8e162fc399e141014598275636830660fee7a64511ee86b5b21310a40c",
  providerHashes: [
    "0x8e7188e68658202bd064f5b88e6ef23df249f2f9fd9d0fafb8bea60dccd97098",
    "0x7ae9e7cb8b638d1b6b114b392d0590bb6977d29bbd2070e109689d6afa5f61c4",
  ],
} as const;

export type XConformanceScenario = "own-reply" | "different-account-reply";
export type XConformanceStatus = "pass" | "fail" | "missing";

type JsonRecord = Record<string, unknown>;

type TrustedProofData = {
  context: JsonRecord;
  extractedParameters: JsonRecord;
};

export type XConformanceEvidence = {
  field: string | null;
  present: boolean;
  type: string | null;
};

export type XConformanceCheck = {
  status: XConformanceStatus;
  evidenceFields: string[];
  message: string;
};

export type XProofConformanceReport = {
  schema: "early.x-proof-conformance-report/v1";
  scenario: XConformanceScenario;
  provider: {
    id: typeof X_CONFORMANCE_PROVIDER.id;
    version: typeof X_CONFORMANCE_PROVIDER.version;
    configurationHash: typeof X_CONFORMANCE_PROVIDER.configurationHash;
    expectedProviderHashes: typeof X_CONFORMANCE_PROVIDER.providerHashes;
  };
  cryptographicProofVerified: true;
  proofCount: number;
  fieldInventory: Array<{ name: string; type: string }>;
  evidence: {
    providerHash: XConformanceEvidence;
    favorite: XConformanceEvidence;
    parentPost: XConformanceEvidence;
    replyParent: XConformanceEvidence;
    replyConversation: XConformanceEvidence;
    replyId: XConformanceEvidence;
    replyTimestamp: XConformanceEvidence;
    replyAuthor: XConformanceEvidence;
    authenticatedAccount: XConformanceEvidence;
  };
  checks: {
    providerHashMatches: XConformanceCheck;
    favoriteIsTrue: XConformanceCheck;
    parentPostMatchesSubmittedPost: XConformanceCheck;
    replyParentMatchesSubmittedPost: XConformanceCheck;
    replyConversationMatchesSubmittedPost: XConformanceCheck;
    replyIdIsPresentAndConsistent: XConformanceCheck;
    replyTimestampIsValid: XConformanceCheck;
    replyAuthorIsPresent: XConformanceCheck;
    authenticatedAccountIsPresent: XConformanceCheck;
    authenticatedAccountEqualsReplyAuthor: XConformanceCheck;
  };
  secureClaimAccepted: boolean;
  failureCodes: string[];
};

export class XProofConformanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "XProofConformanceError";
    this.code = code;
  }
}

const fields = {
  providerHash: ["providerHash"],
  favorite: ["favorited"],
  parentPost: ["id_str"],
  replyParent: ["in_reply_to_status_id_str"],
  replyConversation: ["conversation_id_str_13369"],
  replyId: ["id_str_84642", "rest_id_43767"],
  replyTimestamp: ["created_at"],
  replyAuthor: ["user_id_str_62220", "replyAuthorId", "reply_author_id"],
  replyAuthorScreenName: [
    "reply_author_screen_name",
    "replyAuthorScreenName",
    "reply_author_screenName",
  ],
  authenticatedAccount: [
    "authenticatedAccountId",
    "authenticated_account_id",
    "authenticatedUserId",
    "authenticated_user_id",
    "viewerUserId",
    "viewer_user_id",
    "viewerId",
    "viewer_id",
  ],
  authenticatedAccountScreenName: [
    "viewer_screen_name",
    "viewerScreenName",
    "authenticatedScreenName",
    "authenticated_screen_name",
  ],
} as const;

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

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function findField(source: JsonRecord, candidates: readonly string[]) {
  for (const field of candidates) {
    if (!(field in source)) continue;
    const value = source[field];
    return {
      field,
      value,
      evidence: {
        field,
        present: value !== undefined && value !== null && value !== "",
        type: valueType(value),
      } satisfies XConformanceEvidence,
    };
  }
  return {
    field: null,
    value: undefined,
    evidence: { field: null, present: false, type: null } satisfies XConformanceEvidence,
  };
}

function asNonemptyString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asBoolean(value: unknown) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function validTimestamp(value: unknown) {
  const stringValue = asNonemptyString(value);
  if (!stringValue) return false;
  if (/^\d+$/.test(stringValue)) {
    const numeric = Number(stringValue);
    return Number.isSafeInteger(numeric) && numeric > 0;
  }
  return !Number.isNaN(Date.parse(stringValue));
}

function canonicalScreenName(value: unknown) {
  const stringValue = asNonemptyString(value)?.replace(/^@/, "");
  if (!stringValue || !/^[A-Za-z0-9_]{1,15}$/.test(stringValue)) return null;
  return stringValue.toLowerCase();
}

function valuesMatch(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeExtractedParameters(items: TrustedProofData[]) {
  const merged: JsonRecord = {};
  for (const item of items) {
    for (const [field, value] of Object.entries(item.extractedParameters)) {
      if (field in merged && !valuesMatch(merged[field], value)) {
        throw new XProofConformanceError(
          "CONFLICTING_EXTRACTED_FIELD",
          `Verified proofs disclosed conflicting values for ${field}.`
        );
      }
      merged[field] = value;
    }
  }
  return merged;
}

function check(
  status: XConformanceStatus,
  evidenceFields: Array<string | null>,
  message: string
): XConformanceCheck {
  return {
    status,
    evidenceFields: evidenceFields.filter((field): field is string => Boolean(field)),
    message,
  };
}

function parseContextMessage(context: JsonRecord) {
  const parsed = parseMaybeJson(context.contextMessage);
  return isRecord(parsed) ? parsed : {};
}

function proofFrom(value: unknown): value is Proof {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    isRecord(value.claimData) &&
    Array.isArray(value.signatures)
  );
}

export function getProofsForConformance(payload: unknown): Proof[] {
  const parsed = parseMaybeJson(payload);
  if (Array.isArray(parsed)) return parsed.filter(proofFrom);
  if (!isRecord(parsed)) return [];
  const session = isRecord(parsed.session) ? parsed.session : null;

  const candidates = [
    parsed.proofs,
    parsed.proof,
    parsed.claims,
    parsed.data,
    parsed.response,
    session?.proofs,
  ].map(parseMaybeJson);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const proofs = candidate.filter(proofFrom);
      if (proofs.length > 0) return proofs;
    }
    if (proofFrom(candidate)) return [candidate];
  }

  return proofFrom(parsed) ? [parsed] : [];
}

export function analyzeTrustedXProofData(input: {
  scenario: XConformanceScenario;
  trustedData: TrustedProofData | TrustedProofData[];
  expectedSubjectId?: string;
}): XProofConformanceReport {
  const trustedData = Array.isArray(input.trustedData)
    ? input.trustedData
    : [input.trustedData];
  if (trustedData.length === 0) {
    throw new XProofConformanceError(
      "TRUSTED_DATA_MISSING",
      "Reclaim returned no trusted proof data."
    );
  }
  const context = trustedData[0].context;
  const extractedParameters = mergeExtractedParameters(trustedData);
  const message = parseContextMessage(context);
  const expectedSubjectId =
    asNonemptyString(input.expectedSubjectId) ?? asNonemptyString(message.subjectId);

  const providerHashes = trustedData.map((item) =>
    findField(item.context, fields.providerHash)
  );
  const favorite = findField(extractedParameters, fields.favorite);
  const parentPost = findField(extractedParameters, fields.parentPost);
  const replyParent = findField(extractedParameters, fields.replyParent);
  const replyConversation = findField(extractedParameters, fields.replyConversation);
  const replyId = findField(extractedParameters, fields.replyId);
  const replyTimestamp = findField(extractedParameters, fields.replyTimestamp);
  const replyAuthor = findField(extractedParameters, fields.replyAuthor);
  const replyAuthorScreenName = findField(
    extractedParameters,
    fields.replyAuthorScreenName
  );
  const authenticatedAccount = findField(
    extractedParameters,
    fields.authenticatedAccount
  );
  const authenticatedAccountScreenName = findField(
    extractedParameters,
    fields.authenticatedAccountScreenName
  );

  const alternateReplyId = findField(
    extractedParameters,
    fields.replyId.filter((field) => field !== replyId.field)
  );
  const replyIdValue = asNonemptyString(replyId.value);
  const alternateReplyIdValue = asNonemptyString(alternateReplyId.value);
  const replyAuthorValue = asNonemptyString(replyAuthor.value);
  const replyAuthorScreenNameValue = asNonemptyString(replyAuthorScreenName.value);
  const authenticatedAccountValue = asNonemptyString(authenticatedAccount.value);
  const authenticatedAccountScreenNameValue = asNonemptyString(
    authenticatedAccountScreenName.value
  );
  const observedProviderHashes = providerHashes
    .map((item) => asNonemptyString(item.value)?.toLowerCase())
    .filter((value): value is string => Boolean(value))
    .sort();
  const expectedProviderHashes = [...X_CONFORMANCE_PROVIDER.providerHashes].sort();
  const providerHashesMatch =
    observedProviderHashes.length === expectedProviderHashes.length &&
    observedProviderHashes.every(
      (value, index) => value === expectedProviderHashes[index]
    );
  const normalizedReplyAuthorScreenName = canonicalScreenName(
    replyAuthorScreenNameValue
  );
  const normalizedAuthenticatedScreenName = canonicalScreenName(
    authenticatedAccountScreenNameValue
  );

  const checks = {
    providerHashMatches:
      providerHashesMatch
        ? check(
            "pass",
            providerHashes.map((item) => item.field),
            "The proof set uses both expected Reclaim request hashes."
          )
        : check(
            observedProviderHashes.length > 0 ? "fail" : "missing",
            providerHashes.map((item) => item.field),
            observedProviderHashes.length > 0
              ? "The proof set does not match both pinned X request hashes."
              : "The verified proof contexts do not expose provider hashes."
          ),
    favoriteIsTrue:
      asBoolean(favorite.value) === true
        ? check("pass", [favorite.field], "The parent post is verified as favorited.")
        : check(
            favorite.evidence.present ? "fail" : "missing",
            [favorite.field],
            favorite.evidence.present
              ? "The parent post is not verified as favorited."
              : "The proof does not expose the parent favorite state."
          ),
    parentPostMatchesSubmittedPost:
      !expectedSubjectId
        ? check("missing", [parentPost.field], "The submitted parent post ID is unavailable.")
        : asNonemptyString(parentPost.value) === expectedSubjectId
          ? check("pass", [parentPost.field], "The captured parent post matches the submitted post.")
          : check(
              parentPost.evidence.present ? "fail" : "missing",
              [parentPost.field],
              "The captured parent post does not match the submitted post."
            ),
    replyParentMatchesSubmittedPost:
      !expectedSubjectId
        ? check("missing", [replyParent.field], "The submitted parent post ID is unavailable.")
        : asNonemptyString(replyParent.value) === expectedSubjectId
          ? check("pass", [replyParent.field], "The reply directly targets the submitted post.")
          : check(
              replyParent.evidence.present ? "fail" : "missing",
              [replyParent.field],
              "The reply does not directly target the submitted post."
            ),
    replyConversationMatchesSubmittedPost:
      !expectedSubjectId
        ? check(
            "missing",
            [replyConversation.field],
            "The submitted parent post ID is unavailable."
          )
        : asNonemptyString(replyConversation.value) === expectedSubjectId
          ? check(
              "pass",
              [replyConversation.field],
              "The reply belongs to the submitted post conversation."
            )
          : check(
              replyConversation.evidence.present ? "fail" : "missing",
              [replyConversation.field],
              "The reply conversation does not match the submitted post."
            ),
    replyIdIsPresentAndConsistent:
      !replyIdValue
        ? check("missing", [replyId.field], "The proof does not expose a reply ID.")
        : alternateReplyIdValue && alternateReplyIdValue !== replyIdValue
          ? check(
              "fail",
              [replyId.field, alternateReplyId.field],
              "The two disclosed reply ID fields disagree."
            )
          : check(
              "pass",
              [replyId.field, alternateReplyId.field],
              "The proof exposes a consistent reply ID."
            ),
    replyTimestampIsValid: validTimestamp(replyTimestamp.value)
      ? check("pass", [replyTimestamp.field], "The proof exposes a parseable reply timestamp.")
      : check(
          replyTimestamp.evidence.present ? "fail" : "missing",
          [replyTimestamp.field],
          "The proof does not expose a valid reply timestamp."
        ),
    replyAuthorIsPresent: replyAuthorValue || replyAuthorScreenNameValue
      ? check(
          "pass",
          [replyAuthor.field, replyAuthorScreenName.field],
          "The proof exposes the reply author's account."
        )
      : check(
          "missing",
          [replyAuthor.field, replyAuthorScreenName.field],
          "The proof does not expose the reply author."
        ),
    authenticatedAccountIsPresent:
      authenticatedAccountValue || authenticatedAccountScreenNameValue
      ? check(
          "pass",
          [authenticatedAccount.field, authenticatedAccountScreenName.field],
          "The proof exposes the authenticated viewer's account."
        )
      : check(
          "missing",
          [authenticatedAccount.field, authenticatedAccountScreenName.field],
          "The proof does not expose the authenticated viewer's account."
        ),
    authenticatedAccountEqualsReplyAuthor:
      authenticatedAccountValue && replyAuthorValue
        ? authenticatedAccountValue === replyAuthorValue
          ? check(
              "pass",
              [authenticatedAccount.field, replyAuthor.field],
              "The authenticated viewer is the reply author."
            )
          : check(
              "fail",
              [authenticatedAccount.field, replyAuthor.field],
              "The authenticated viewer is not the reply author."
            )
        : normalizedAuthenticatedScreenName && normalizedReplyAuthorScreenName
          ? normalizedAuthenticatedScreenName === normalizedReplyAuthorScreenName
            ? check(
                "pass",
                [authenticatedAccountScreenName.field, replyAuthorScreenName.field],
                "The authenticated viewer is the reply author."
              )
            : check(
                "fail",
                [authenticatedAccountScreenName.field, replyAuthorScreenName.field],
                "The authenticated viewer is not the reply author."
              )
          : check(
              "missing",
              [
                authenticatedAccount.field,
                authenticatedAccountScreenName.field,
                replyAuthor.field,
                replyAuthorScreenName.field,
              ],
              "Authenticated-viewer/reply-author equality cannot be established."
            ),
  } satisfies XProofConformanceReport["checks"];

  const failureCodes: string[] = [];
  const codeByCheck: Omit<
    Record<keyof typeof checks, string>,
    "authenticatedAccountEqualsReplyAuthor"
  > = {
    providerHashMatches: "PROVIDER_HASH_MISMATCH",
    favoriteIsTrue: "PARENT_NOT_FAVORITED",
    parentPostMatchesSubmittedPost: "PARENT_POST_MISMATCH",
    replyParentMatchesSubmittedPost: "REPLY_PARENT_MISMATCH",
    replyConversationMatchesSubmittedPost: "REPLY_CONVERSATION_MISMATCH",
    replyIdIsPresentAndConsistent: "REPLY_ID_INVALID",
    replyTimestampIsValid: "REPLY_TIMESTAMP_INVALID",
    replyAuthorIsPresent: "REPLY_AUTHOR_ID_MISSING",
    authenticatedAccountIsPresent: "AUTHENTICATED_ACCOUNT_ID_MISSING",
  };
  for (const [name, result] of Object.entries(checks) as Array<
    [keyof typeof checks, XConformanceCheck]
  >) {
    if (result.status === "pass") continue;
    if (name === "authenticatedAccountEqualsReplyAuthor") {
      failureCodes.push(
        result.status === "missing"
          ? "AUTHENTICATED_ACCOUNT_REPLY_AUTHOR_EQUALITY_UNPROVEN"
          : "AUTHENTICATED_ACCOUNT_REPLY_AUTHOR_MISMATCH"
      );
      continue;
    }
    failureCodes.push(codeByCheck[name]);
  }

  return {
    schema: "early.x-proof-conformance-report/v1",
    scenario: input.scenario,
    provider: {
      id: X_CONFORMANCE_PROVIDER.id,
      version: X_CONFORMANCE_PROVIDER.version,
      configurationHash: X_CONFORMANCE_PROVIDER.configurationHash,
      expectedProviderHashes: X_CONFORMANCE_PROVIDER.providerHashes,
    },
    cryptographicProofVerified: true,
    proofCount: trustedData.length,
    fieldInventory: Object.entries(extractedParameters)
      .map(([name, value]) => ({ name, type: valueType(value) }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    evidence: {
      providerHash: {
        field: providerHashes.some((item) => item.evidence.present)
          ? "providerHash"
          : null,
        present: providerHashes.every((item) => item.evidence.present),
        type: providerHashes.every((item) => item.evidence.type === "string")
          ? "string"
          : null,
      },
      favorite: favorite.evidence,
      parentPost: parentPost.evidence,
      replyParent: replyParent.evidence,
      replyConversation: replyConversation.evidence,
      replyId: replyId.evidence,
      replyTimestamp: replyTimestamp.evidence,
      replyAuthor: replyAuthorScreenName.evidence.present
        ? replyAuthorScreenName.evidence
        : replyAuthor.evidence,
      authenticatedAccount: authenticatedAccountScreenName.evidence.present
        ? authenticatedAccountScreenName.evidence
        : authenticatedAccount.evidence,
    },
    checks,
    secureClaimAccepted: failureCodes.length === 0,
    failureCodes,
  };
}

export async function verifyAndAnalyzeXProof(input: {
  scenario: XConformanceScenario;
  payload: unknown;
  expectedSubjectId?: string;
}) {
  const proofs = getProofsForConformance(input.payload);
  if (proofs.length === 0) {
    throw new XProofConformanceError(
      "PROOF_MISSING",
      "The input does not contain a Reclaim proof."
    );
  }

  const verification = await verifyProof(proofs, {
    providerId: X_CONFORMANCE_PROVIDER.id,
    providerVersion: X_CONFORMANCE_PROVIDER.version,
    allowedTags: [],
  });
  if (!verification.isVerified) {
    throw new XProofConformanceError(
      "PROOF_VERIFICATION_FAILED",
      "Reclaim rejected the proof for the pinned X provider and version."
    );
  }
  if (verification.data.length !== X_CONFORMANCE_PROVIDER.providerHashes.length) {
    throw new XProofConformanceError(
      "UNEXPECTED_PROOF_COUNT",
      "The X provider must produce one verified proof for each of its two required requests."
    );
  }

  const trustedData = verification.data.map((trusted) => {
    if (!isRecord(trusted.context) || !isRecord(trusted.extractedParameters)) {
      throw new XProofConformanceError(
        "TRUSTED_DATA_MALFORMED",
        "Reclaim returned malformed trusted proof data."
      );
    }
    return {
      context: trusted.context,
      extractedParameters: trusted.extractedParameters,
    };
  });
  const baselineContext = trustedData[0].context;
  for (const item of trustedData.slice(1)) {
    for (const field of ["contextAddress", "reclaimSessionId", "contextMessage"]) {
      if (!valuesMatch(item.context[field], baselineContext[field])) {
        throw new XProofConformanceError(
          "PROOF_CONTEXT_MISMATCH",
          "The verified proofs are not bound to the same Early session context."
        );
      }
    }
  }

  return analyzeTrustedXProofData({
    scenario: input.scenario,
    trustedData,
    expectedSubjectId: input.expectedSubjectId,
  });
}
