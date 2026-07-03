# Early: The internet never remembers who was first. You do.

What if you could prove that your taste was already there?

Early is a proof-of-discovery protocol for the internet. It turns early cultural endorsement into a cryptographic receipt: you saw the post, liked it, replied to it, and can prove that moment came from the platform's own authenticated records.

The first working surface is X. The larger idea is not X-specific.

An artist drops a video before the algorithm wakes up. A creator posts the reel that later becomes the thing everyone quotes. A builder shares an idea while it still looks tiny. You were there early because the work actually hit.

Early gives that moment a receipt.

For creators, that receipt can become a reward layer. Early fans can prove they showed up before the crowd. Artists, communities, and builders can recognize the people who believed first: concert access, fan passes, allowlists, private drops, community roles, or whatever the culture around the work decides to make valuable.

This project is built for that feeling: the quiet, very online knowledge that you had taste before the timeline agreed.

## What Works Now

The current app proves an X endorsement and carries it all the way to Stellar testnet.

Today, Early can:

- start a real Reclaim proof session from the app,
- use a custom X Reclaim provider to prove an authenticated account liked and replied to a parent post,
- receive and verify the Reclaim callback,
- normalize the callback into an Early Proof Artifact,
- show an Early card only after the proof succeeds,
- connect a Stellar wallet,
- verify the Reclaim proof on Stellar testnet,
- publish a privacy-safe receipt on Stellar testnet.

Current Reclaim provider:

```txt
Name: Early X Endorsed Contribution
Provider ID: fe0767e9-8172-48c0-ba64-702703c4c745
Version: 1.0.0
```

Current Stellar contracts:

```txt
Reclaim verifier contract:
CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5

Early receipt contract:
CDBE7NFQPVD5LXU7TJVQTXZNBYIH75VXQW24DA7LARS3MA5XLT2V2VRM
```

## Why This Fits The Stellar ZK Track

Early is a real-world ZK application with an actual user-facing proof flow.

The ZK part starts with Reclaim zkTLS: an authenticated X server response becomes a verifiable proof of a real Web2 action. The Stellar part is not decorative. The app serializes the verified Reclaim proof material, sends it to a Stellar testnet verifier contract, and only then allows the user to publish a wallet-owned receipt.

For the demo, Stellar is doing two jobs:

- verifying the Reclaim witness signature on testnet,
- storing a public receipt that points to the private proof commitment.

That gives Early a clean bridge between social proof and public infrastructure. The user keeps the cultural story; Stellar keeps the durable receipt.

## The X Proof

For v1, Early proves a simple but meaningful bundle:

```txt
liked the parent X post + replied under the same parent X post
```

The like is the endorsement. The reply is the time anchor.

On X, a reply has a `created_at` timestamp in the authenticated `TweetDetail` response. That timestamp is already in X's record. Reclaim turns the authenticated response into a proof Early can verify.

That is what makes the moment portable. The user can come back later, paste the post URL, and prove they had already interacted with it.

## How The App Works

The full current flow:

1. A user pastes an X post URL into Early.
2. Early creates a Reclaim proof session on the server.
3. The session is stored in Supabase as `pending`.
4. The user completes the Reclaim verification flow.
5. Reclaim sends the proof callback to Early.
6. Early verifies the callback with `@reclaimprotocol/js-sdk`.
7. Early extracts the X proof fields and creates an Early Proof Artifact.
8. Supabase marks the session as `succeeded`.
9. The frontend polls the session and reveals the Early card.
10. The user connects a Stellar wallet.
11. The app prepares a Stellar transaction for the Reclaim verifier contract.
12. The user signs with Freighter or another Stellar wallet.
13. Stellar verifies the Reclaim witness signature on testnet.
14. The user publishes a public Early receipt that points to the proof commitment.

The proof card is for humans. The Stellar receipt is for permanence and public verification.

## Where ZK Is Used

Early uses zkTLS through Reclaim Protocol.

Reclaim lets the user prove that specific data appeared in an authenticated HTTPS response from X. Early's provider targets the X web GraphQL `TweetDetail` request and extracts only the fields needed for the proof.

The important part is that Early does not need the user's X password or cookies. The proof is generated through Reclaim's flow, and Early receives a callback payload that can be verified server-side.

In this app, zkTLS is used to prove:

- the parent X post was favorited by the authenticated account,
- the authenticated account has a reply under that same parent post,
- the reply has a real X server timestamp,
- the reply points back to the parent post.

Then Stellar enters.

Early serializes the verified Reclaim proof material and sends it through a Stellar testnet verifier contract. That verifier checks the Reclaim witness signature on-chain. After that succeeds, Early lets the wallet publish a receipt to a separate Soroban receipt contract.

So the current path is:

```txt
X authenticated server data
-> Reclaim zkTLS proof
-> Early callback verification
-> Early Proof Artifact
-> Reclaim proof verification on Stellar testnet
-> Early receipt on Stellar testnet
```

This is the working end-to-end demo.

## What Goes On Stellar

The receipt is intentionally small.

Stellar stores public proof references and wallet-owned receipt data, not raw social identity. The on-chain receipt path uses:

- wallet address,
- proof hash,
- public commitment,
- platform marker,
- content hash,
- transaction hashes for verifier and receipt steps.

It does not publish the raw X handle, raw Reclaim callback payload, or full provider response.

That matters because Early is about proving taste without turning someone's Web2 identity into permanent public chain exhaust.

## The Early Proof Artifact

The app normalizes each successful Reclaim callback into a stable object. That object is the bridge between the Web2 proof and everything that happens next.

For X v1:

```ts
type EarlyProofArtifact = {
  version: "early-proof-artifact/v1";
  platform: "x";
  sessionId: string;
  parentContentId: string | null;
  replyContentId: string | null;
  replyTimestamp: string | null;
  replyTimestampUnix: number | null;
  screenName: string | null;
  proofHash: string;
  identityHash: string | null;
  publicCommitment: string;
};
```

The artifact lets the frontend show a clean receipt, lets the server prepare Stellar transactions, and gives future privacy layers one stable shape to consume.

For development, the raw Reclaim proof payload is still stored in Supabase so the proof pipeline can be debugged. A production hardening pass should reduce retention and store only what the app truly needs.

## The Reclaim Provider Work

The custom provider is a real part of the build.

This project does not use an existing public Reclaim provider for X. The Early X provider was built from scratch for this app, then tested with real proof sessions until it could reliably prove the like, reply, timestamp, and reply-to relationship needed for Early.

For X, the useful data is buried inside authenticated web requests. The provider had to be built around X's `TweetDetail` GraphQL request:

```txt
GET https://x.com/i/api/graphql/{queryId}/TweetDetail
```

The provider extracts parent tweet data, reply data, favorited status, reply relationship fields, timestamps, and identity fields from the authenticated response. This is what lets Early prove a real endorsed contribution instead of asking the user to upload screenshots.

Maintenance note: X can rotate the GraphQL query ID when its frontend changes. If the provider breaks, the first thing to recapture is the latest `TweetDetail` request from an authenticated X session.

## Testing The Reclaim Flow

Early creates the Reclaim session. That part is important. Even when the proof is completed on mobile, the callback still returns to Early.

The app exposes two handoff paths:

- **Open Reclaim**: opens the Reclaim portal in a browser tab.
- **Open on phone / Copy phone link**: sends the same Early-created session to the mobile Reclaim Verifier flow.

For the current demo, the mobile path has been the most reliable. Install the official Reclaim Verifier app on your phone, start the proof from Early, copy the phone link, complete X verification on mobile, and keep the Early browser tab open. When Reclaim posts the callback, the desktop app detects it and continues to the card and Stellar steps.

If the portal works for your account, use it. If X throttles portal logins, use the mobile verifier path.

## Platform Roadmap

Early starts with X because it gives the cleanest proof surface: a like as endorsement, a reply as timestamp, and an authenticated server response as proof.

The protocol is meant to travel anywhere culture starts.

### X: Live Now

The X version proves you liked and replied before a post became culturally important.

This is useful for builders, writers, researchers, founders, artists, and people who find ideas before they become consensus. A tweet can become a reference point months later. Early lets the person who genuinely engaged with it prove they were already there.

Technical status: working provider, working Reclaim callback, working Stellar verification, working Stellar receipt.

### YouTube: Future Provider

YouTube is the fan version of Early.

Imagine a new Rihanna video after years of silence. Or an unknown artist uploading the song that later becomes unavoidable. You are there in the first hour, leaving one of the first real comments before the algorithm pushes it everywhere.

If that artist later wants to reward early fans with tickets, merch, private listening access, or a fan pass, Early can become the proof layer.

Target proof:

- authenticated YouTube session,
- comment tied to a specific `videoId`,
- comment timestamp,
- current video metrics for later scale,
- proof that the user was part of the early audience.

Likely research path:

```txt
POST https://www.youtube.com/youtubei/v1/browse
https://www.youtube.com/feed/history/comment_history
```

Technical status: future provider. YouTube often exposes relative timestamps like `"2 years ago"`, which are not strong enough by themselves. The provider needs an absolute timestamp or another stable time anchor.

### Instagram: Research Phase

Instagram is where Early becomes emotionally obvious.

Creators already say it:

```txt
POV: you discovered me before I was famous.
```

Sometimes they even promise the future reward directly: bring this video to a concert one day, and you get in because you were here early.

Early turns that social promise into proof. A creator can recognize the people who commented, saved, or supported the work before the crowd arrived. A fan can keep a receipt of being part of the earliest circle.

Target proof:

- authenticated Instagram session,
- comment, save, or like on a post or reel,
- creator/post identity,
- timestamp where available,
- future reward eligibility from a verified early interaction.

Technical status: research phase. Instagram is more fragile and rate-limited than X. Comments may be the first realistic primitive because they are public timestamped objects attached to posts. Likes and saves need separate validation.

### Other Cultural Surfaces

The same pattern can extend to Farcaster casts, music platforms, writing platforms, niche communities, and any place where timestamped participation becomes meaningful later.

The core question stays the same:

```txt
What did you endorse, when did you endorse it, and can the platform prove it?
```

## Zama FHE Roadmap

Zama is not wired into the current production flow yet.

It remains part of the privacy roadmap because Early should eventually support private identity and private timestamp computation. The goal is to encrypt sensitive curator data before any public chain interaction can reveal it.

Planned Zama work:

- consume the Early Proof Artifact,
- encrypt or encode the user's Web2 identity,
- encrypt or transform the timestamp,
- compare encrypted timestamps against campaign cutoffs,
- support private eligibility for creator rewards.

The current privacy model is commitment-based. The next privacy model is FHE-backed.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- GSAP
- Lenis
- Reclaim Protocol JS SDK
- Supabase Postgres via REST API
- Stellar Wallets Kit
- Stellar SDK
- Soroban smart contracts

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
cp .env.example .env.local
```

Required values:

```txt
RECLAIM_APP_ID=
RECLAIM_APP_SECRET=
RECLAIM_PROVIDER_ID=fe0767e9-8172-48c0-ba64-702703c4c745
RECLAIM_PROVIDER_VERSION=1.0.0
RECLAIM_REQUIRE_TEE_ATTESTATION=false

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000

STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_EXPLORER_URL=https://testnet.stellarchain.io
STELLAR_RECEIPT_CONTRACT_ID=CDBE7NFQPVD5LXU7TJVQTXZNBYIH75VXQW24DA7LARS3MA5XLT2V2VRM
STELLAR_RECLAIM_VERIFIER_CONTRACT_ID=CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5
STELLAR_RECLAIM_VERIFIER_FUNCTION_NAME=verify_proof
```

Keep these secret:

- `RECLAIM_APP_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

For deployed testing, set `NEXT_PUBLIC_APP_URL` to your deployed app URL so Reclaim callbacks return to the correct domain.

## Supabase Setup

Run the SQL in:

```txt
supabase/reclaim_proof_sessions.sql
```

The table stores proof session state, the verified artifact, verifier transaction data, receipt transaction data, and callback metadata. The app reads and writes it only from server routes using the Supabase service role key.

Keep Row Level Security enabled.

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the dev server:

```bash
pnpm dev
```

Open:

```txt
http://localhost:3000
```

Local UI work is fine on `localhost`. For full Reclaim callbacks, use a deployed HTTPS URL or a tunnel, because Reclaim needs to POST the proof callback back to the app.

## Scripts

```bash
pnpm lint
pnpm build
pnpm start
pnpm dev
```

## Deploy

Deploy to any host that supports Next.js App Router server routes.

For Vercel:

```txt
Framework Preset: Next.js
Install Command: pnpm install
Build Command: pnpm build
Output Directory: leave blank
```

Add the environment variables before deploying.

## Security Notes

- Do not commit `.env.local`.
- Do not expose `RECLAIM_APP_SECRET`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`.
- Keep Supabase Row Level Security enabled.
- Use test accounts while repeatedly testing X login flows.
- Keep raw proof payload retention short before production.

## Why Early Matters

Every viral moment had a witness before it went viral.

Every famous artist had a fan before the fame.

Every idea had a believer before the world believed.

Early is for those people.

Your taste has receipts now.
