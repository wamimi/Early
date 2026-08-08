# X proof conformance harness

This local-only harness answers one narrow question before the Base registry is deployed:

> Does a cryptographically verified proof establish that the authenticated X viewer also authored the disclosed reply?

It verifies each proof set in memory with Reclaim provider `fe0767e9-8172-48c0-ba64-702703c4c745`, exact version `1.0.5`, and both required Reclaim request hashes:

- `0x8e7188e68658202bd064f5b88e6ef23df249f2f9fd9d0fafb8bea60dccd97098`
- `0x7ae9e7cb8b638d1b6b114b392d0590bb6977d29bbd2070e109689d6afa5f61c4`

Version `1.0.5` has two required requests: `TweetDetail` proves the parent and reply fields, while authenticated account settings proves `viewer_screen_name`. Only `TweetDetail` runs as a normal request. The provider script waits for a reply-focused `TweetDetail`, then creates the viewer claim through the required allowed-injected settings request using the complete safe intercepted header set and the authenticated cookie session. A complete verification is therefore expected to contain two proofs with the same Early session context. The harness merges only non-conflicting extracted fields and checks `viewer_screen_name == reply_author_screen_name` after canonicalizing case and an optional leading `@`.

Early's application-side provider configuration hash is `0xdb76bb8e162fc399e141014598275636830660fee7a64511ee86b5b21310a40c`. It binds the provider ID, version, platform, and schema to an Early session. It is not a Reclaim proof `providerHash` and must not be substituted for either request hash above.

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

The command intentionally exits with status `1` whenever the observed schema cannot establish every required relationship. For an own-reply proof, missing `viewer_screen_name`, missing `reply_author_screen_name`, a mismatch between them, a missing request proof, or any other failed relationship is a security failure. A nonzero exit is a security result, not a harness crash.

The output file is created with owner-only permissions and is never overwritten. Delete or archive the raw local files after completing the investigation.
