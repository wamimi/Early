#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  XProofConformanceError,
  verifyAndAnalyzeXProof,
  type XProofConformanceReport,
} from "../src/lib/x-proof-conformance.ts";

const MAX_PROOF_FILE_BYTES = 20 * 1024 * 1024;

type Arguments = {
  ownPath?: string;
  adversarialPath?: string;
  adversarialNoProof: boolean;
  expectedSubjectId?: string;
  outputPath?: string;
  help: boolean;
};

function usage() {
  return `Usage:
  pnpm audit:x-proof -- --own <proof.json> --adversarial <proof.json> [--subject-id <id>] [--output <report.json>]
  pnpm audit:x-proof -- --own <proof.json> --adversarial-no-proof [--subject-id <id>] [--output <report.json>]

The command verifies proofs in memory and emits only a sanitized conformance report.
Place raw proof inputs under .local/x-proof-conformance/ so Git ignores them.

Options:
  --own <path>             Real proof produced while opening your own reply.
  --adversarial <path>     Proof produced while authenticated as A but opening B's reply.
  --adversarial-no-proof   Record that the A/B attempt produced no proof.
  --subject-id <id>        Optional expected parent post ID. Values are never printed.
  --output <path>          Write the sanitized report without overwriting an existing file.
  --help                   Show this help text.`;
}

function parseArguments(argv: string[]): Arguments {
  const parsed: Arguments = {
    adversarialNoProof: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    if (argument === "--adversarial-no-proof") {
      parsed.adversarialNoProof = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new XProofConformanceError(
        "ARGUMENT_VALUE_MISSING",
        `Missing value for ${argument}.`
      );
    }
    index += 1;

    if (argument === "--own") parsed.ownPath = value;
    else if (argument === "--adversarial") parsed.adversarialPath = value;
    else if (argument === "--subject-id") parsed.expectedSubjectId = value;
    else if (argument === "--output") parsed.outputPath = value;
    else {
      throw new XProofConformanceError(
        "ARGUMENT_UNKNOWN",
        `Unknown argument ${argument}.`
      );
    }
  }

  if (parsed.help) return parsed;
  if (!parsed.ownPath) {
    throw new XProofConformanceError(
      "OWN_PROOF_REQUIRED",
      "Provide the real own-reply proof with --own."
    );
  }
  if (Boolean(parsed.adversarialPath) === parsed.adversarialNoProof) {
    throw new XProofConformanceError(
      "ADVERSARIAL_RESULT_REQUIRED",
      "Provide exactly one of --adversarial or --adversarial-no-proof."
    );
  }
  return parsed;
}

async function readProofPayload(filePath: string) {
  const absolutePath = resolve(filePath);
  let metadata;
  try {
    metadata = await stat(absolutePath);
  } catch {
    throw new XProofConformanceError(
      "PROOF_INPUT_UNREADABLE",
      "A proof input could not be read from the local filesystem."
    );
  }
  if (!metadata.isFile()) {
    throw new XProofConformanceError(
      "PROOF_INPUT_NOT_FILE",
      "A proof input path does not point to a file."
    );
  }
  if (metadata.size > MAX_PROOF_FILE_BYTES) {
    throw new XProofConformanceError(
      "PROOF_INPUT_TOO_LARGE",
      "A proof input exceeds the 20 MiB safety limit."
    );
  }

  try {
    return JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
  } catch {
    throw new XProofConformanceError(
      "PROOF_INPUT_INVALID_JSON",
      "A proof input is not valid JSON."
    );
  }
}

function safelyRejectedAdversarialProof(report: XProofConformanceReport) {
  return (
    report.checks.authenticatedAccountIsPresent.status === "pass" &&
    report.checks.replyAuthorIsPresent.status === "pass" &&
    report.checks.authenticatedAccountEqualsReplyAuthor.status === "fail"
  );
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const ownReply = await verifyAndAnalyzeXProof({
    scenario: "own-reply",
    payload: await readProofPayload(arguments_.ownPath!),
    expectedSubjectId: arguments_.expectedSubjectId,
  });

  const adversarial = arguments_.adversarialNoProof
    ? {
        outcome: "no-proof-observed" as const,
        independentlyVerified: false,
        message:
          "The manual A/B attempt produced no proof. This observation is not independently verifiable from a proof artifact.",
      }
    : await verifyAndAnalyzeXProof({
        scenario: "different-account-reply",
        payload: await readProofPayload(arguments_.adversarialPath!),
        expectedSubjectId: arguments_.expectedSubjectId,
      });

  const adversarialSafelyRejected =
    "outcome" in adversarial
      ? false
      : safelyRejectedAdversarialProof(adversarial);
  const readyForCanonicalClaim =
    ownReply.secureClaimAccepted && adversarialSafelyRejected;

  const report = {
    schema: "early.x-proof-conformance-suite/v1",
    generatedAt: new Date().toISOString(),
    privacy: {
      rawProofIncluded: false,
      fieldValuesIncluded: false,
      identifiersIncluded: false,
    },
    ownReply,
    adversarial,
    conclusion: {
      readyForCanonicalClaim,
      ownReplyAccepted: ownReply.secureClaimAccepted,
      adversarialSafelyRejected,
      manualAdversarialRejectionObserved: "outcome" in adversarial,
      message: readyForCanonicalClaim
        ? "The observed proof schema can enforce that the authenticated viewer authored the reply."
        : "outcome" in adversarial && ownReply.secureClaimAccepted
          ? "The own-reply schema conforms, but a no-proof A/B observation cannot independently prove why the provider refused the attempt."
        : "Do not deploy the Base registry for this claim: the observed proof schema does not yet establish all required relationships.",
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (arguments_.outputPath) {
    await writeFile(resolve(arguments_.outputPath), serialized, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(
      `${JSON.stringify({
        schema: report.schema,
        reportWritten: true,
        readyForCanonicalClaim,
      })}\n`
    );
  } else {
    process.stdout.write(serialized);
  }

  if (!readyForCanonicalClaim) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const safeError =
    error instanceof XProofConformanceError
      ? { code: error.code, message: error.message }
      : {
          code: "CONFORMANCE_HARNESS_FAILED",
          message:
            "The conformance harness failed without printing raw proof contents. Check the local input and retry.",
        };
  process.stderr.write(`${JSON.stringify({ error: safeError }, null, 2)}\n`);
  process.exitCode = 1;
});
