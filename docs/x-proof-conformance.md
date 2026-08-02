# X proof conformance harness

This local-only harness answers one narrow question before the Base registry is deployed:

> Does a cryptographically verified proof establish that the authenticated X viewer also authored the disclosed reply?

It verifies each raw proof in memory with Reclaim provider `fe0767e9-8172-48c0-ba64-702703c4c745`, exact version `1.0.0`, and pinned provider hash `0x4539b3d184875ce0ea3d12695a9857670bdb685891e4e4eaa9e5be8e16d92dd8`.

The report contains field names, field types, pass/fail checks, and equality results only. It never contains proof signatures, cookies, post IDs, account IDs, reply IDs, timestamps, context addresses, or extracted field values.

## Keep proof inputs local

Create the ignored directory:

```bash
mkdir -p .local/x-proof-conformance
chmod 700 .local/x-proof-conformance
```

Place the two raw Reclaim callback/status JSON payloads there. The start-route
response contains a private `statusUrl`; after the verifier finishes, its JSON
response can be saved locally in this directory. Treat that URL and response as
sensitive capability data and never paste either one into chat or source code.

```text
.local/x-proof-conformance/own-reply.json
.local/x-proof-conformance/different-account-reply.json
```

Do not paste these files into chat, commit them, upload them to an issue, or include them in a pull request. The directory is covered by `.gitignore`.

## Run with two generated proofs

```bash
pnpm audit:x-proof -- \
  --own .local/x-proof-conformance/own-reply.json \
  --adversarial .local/x-proof-conformance/different-account-reply.json \
  --output .local/x-proof-conformance/sanitized-report.json
```

You may add `--subject-id <parent-post-id>` to independently compare both proofs with the intended parent. The subject ID is used only in memory and is not included in the report.

## Run when the A/B attempt produces no proof

```bash
pnpm audit:x-proof -- \
  --own .local/x-proof-conformance/own-reply.json \
  --adversarial-no-proof \
  --output .local/x-proof-conformance/sanitized-report.json
```

`--adversarial-no-proof` records a manual observation. It cannot independently prove why Reclaim refused or timed out, so the report labels that result accordingly and does not mark the complete claim ready.

The command intentionally exits with status `1` whenever the observed schema cannot establish every required relationship. With the currently published provider fields, `AUTHENTICATED_ACCOUNT_ID_MISSING` is the expected blocker. A nonzero exit is a security result, not a harness crash.

The output file is created with owner-only permissions and is never overwritten. Delete or archive the raw local files after completing the investigation.
