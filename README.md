# Early — You were early. Now prove it.

> A retroactive proof-of-discovery protocol. Prove you interacted with content before it went viral: cryptographically, permanently, privately.

Early is a protocol that turns the feeling of **"I was there before anyone else"** into a verifiable, unforgeable fact.

You scroll past a tweet. You like it, reply with something genuine, and move on. Weeks later it has 50 million impressions. You remember seeing it early. Right now there is no clean way to prove that. Screenshots are fakeable. Public comments are easy to point at, but anyone can claim they always had taste.

The same thing happens everywhere culture starts.

You comment under a music video before the artist becomes unavoidable. You are one of the first people to notice a new Rihanna song after years of silence, or an Adele performance, or a tiny creator's first video before the audience arrives. You find an Instagram artist when their caption says, "POV: you discovered me before I was famous." You save the reel, leave a comment, and become part of the earliest circle around the work.

Today, those moments disappear into feeds and screenshots. Early turns them into proof.

Using zkTLS through Reclaim Protocol, your own authenticated platform session proves what you did and when. Using Zama FHE, the longer-term protocol keeps sensitive identity and timestamp data private before it touches chain. The proof is anchored in the platform's own server record, not your memory, not your screenshot, not your device clock.

This is a curator's resume for the internet. It is also a reward layer for creators who want to recognize the people who believed first.

## The Core Primitive: The Endorsed Contribution Bundle

A bare like is too passive. It is easy to farm, easy to bot, and often too thin to mean anything.

Early requires two concurrent signals:

**The Taste Signal**  
A like or favorite on the post. This proves positive intentional alignment with the content.

**The Time Anchor**  
A reply or comment on the same post. Replies are assigned a permanent timestamp by the platform itself. On X, this is the `created_at` field baked into the tweet object returned by X's authenticated servers.

Together these form an **Endorsed Contribution Bundle**: a coupled signal that is harder to fake and more meaningful as cultural discovery.

You did not just see the thing. You endorsed it.

## Why The Timestamp Cannot Be Faked

This is the most important thing to understand.

The reply timestamp comes from the platform's authenticated servers. It does not come from your laptop. It does not come from a screenshot. It does not come from Early.

For X, the relevant field is the reply tweet's `created_at` timestamp. X recorded it when the reply was created. You cannot go back and make that reply older.

Reclaim Protocol turns that authenticated HTTPS response into a proof. The proof says, in effect:

> This specific data was returned by `x.com` inside an authenticated session, and it matched the required fields.

That makes the server record portable and verifiable without handing Early your X password, cookies, or full browsing history.

## The Retroactive Model

Early does not require you to run a tracker while browsing.

The model is:

```txt
interact naturally -> forget about it -> come back when it matters
```

When a post blows up and you remember you were early:

1. Open Early.
2. Paste the post URL.
3. Prove your authenticated account liked and replied to that post.
4. Extract the reply timestamp from the platform's server response.
5. Generate a zkTLS proof.
6. Privately bind the proof to your cryptographic identity.
7. Receive a shareable proof card.

No friction until the moment the proof matters.

## Discovery Delta

Early does not reward bot-like speed for its own sake.

It measures the **Discovery Delta**: the difference between the footprint of a piece of content when you interacted with it and the cultural footprint it has later.

The dream is simple:

> Taste should compound.

People who consistently find important work before the algorithm does should have a cryptographic record of that taste. Not a clout screenshot. Not a vague claim. A verifiable history.

That history can become useful. A creator, artist, or community could decide to reward early believers: concert access, allowlist spots, private drops, fan badges, backstage moments, community roles, or whatever else makes sense for the culture around the work.

If Rihanna releases a new music video after a long silence and you were one of the first people to comment, Early should let you prove that. If she later wants to reward early fans, she should not have to trust screenshots or noisy comment archaeology. She should be able to ask for proofs.

## Current V1

This repository currently implements the first working slice of Early:

- A polished Next.js proof flow.
- A custom Reclaim provider for X endorsed contributions.
- A server-side Reclaim proof-session starter.
- A Reclaim callback endpoint that verifies returned proofs.
- Supabase-backed proof session tracking.
- A frontend that only reveals the Early Card after a real proof callback succeeds.

Current provider:

```txt
Name: Early X Endorsed Contribution
Provider ID: fe0767e9-8172-48c0-ba64-702703c4c745
Version: 1.0.0
```

The current X provider verifies that an authenticated X user has:

- liked the parent post,
- replied under that same parent post,
- a reply timestamp from X's server response,
- account identity fields needed for proof extraction.

## How The Current App Works

1. The user pastes an X post URL into Early.
2. Early creates a Reclaim proof session on the server.
3. The session is inserted into Supabase as `pending`.
4. The user is redirected to the Reclaim portal.
5. The user completes authenticated X verification.
6. Reclaim POSTs the proof payload to Early's callback endpoint.
7. Early verifies the proof with `@reclaimprotocol/js-sdk`.
8. Early normalizes the verified callback into an Early Proof Artifact.
9. Supabase updates the session to `succeeded` or `failed`.
10. The frontend polls the session endpoint and only shows the Early Card after success.

## The Early Proof Artifact

Reclaim proves the authenticated Web2 fact. The Early Proof Artifact turns that proof into a chain-neutral object that future Zama and Stellar integrations can consume without understanding every provider-specific response field.

For X v1, the artifact shape is:

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

The artifact has two jobs:

- give the frontend a stable receipt format,
- give future chain integrations a privacy-aware boundary.

`proofHash` commits to the full callback payload. `identityHash` commits to the normalized Web2 identity. `publicCommitment` commits to the artifact's core public facts without requiring a chain to store the raw X handle, raw proof payload, or exact provider response.

The raw Reclaim proof payload is currently stored in Supabase for development and debugging. Before production, this should be minimized or moved into a stricter retention path.

## The X Endpoint

The current provider is based on X's web GraphQL `TweetDetail` request:

```txt
GET https://x.com/i/api/graphql/{queryId}/TweetDetail
```

This response can include:

- the parent tweet's `favorited` status,
- replies in the thread,
- the authenticated user's reply,
- the reply's `created_at` timestamp,
- the user's screen name and account identifiers.

Important maintenance note: X can rotate the `queryId` when they ship new frontend bundles. If the provider breaks, the likely first repair is to capture the latest `TweetDetail` request and update the provider.

## Privacy Model

Early's intended privacy stack has two layers:

**Reclaim Protocol / zkTLS**  
Proves authenticated Web2 data came from the platform without exposing the user's full account history to Early.

**Zama FHE / fhEVM**  
Planned next. Encrypts sensitive identity and timestamp values before on-chain submission, so public chain state does not dox the user's Web2 identity.

**Early Proof Artifact**  
Implemented now. Normalizes the verified Reclaim result into a stable bridge object for receipts, Zama encryption, and future public commitments.

The current repository has the Reclaim proof layer and artifact layer wired. Zama FHE is part of the protocol roadmap and has not yet been production-wired into this app.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- GSAP
- Reclaim Protocol JS SDK
- Supabase Postgres via REST API

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
cp .env.example .env.local
```

Required values:

```txt
RECLAIM_APP_ID=
RECLAIM_APP_SECRET=
RECLAIM_PROVIDER_ID=
RECLAIM_PROVIDER_VERSION=1.0.0
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Notes:

- `RECLAIM_APP_SECRET` must stay server-side.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side.
- For Vercel, set `NEXT_PUBLIC_APP_URL` to the deployed URL, for example `https://early-psi.vercel.app`.

## Supabase Setup

Run the SQL in:

```txt
supabase/reclaim_proof_sessions.sql
```

The table stores Reclaim proof sessions and enables Row Level Security. The app accesses this table only from server routes using the Supabase service role key.

For this development milestone, the full Reclaim proof payload is stored as `jsonb`. A later privacy hardening pass should minimize or redact stored proof data before production use.

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

For local proof callbacks, Reclaim may not be able to POST back to `localhost`. Use the deployed Vercel URL or a tunnel when testing the full callback flow.

## Scripts

```bash
pnpm lint
pnpm build
pnpm start
pnpm dev
```

## Deployment

The app is Vercel-ready.

Use:

```txt
Framework Preset: Next.js
Install Command: pnpm install
Build Command: pnpm build
Output Directory: leave blank
```

Add all required environment variables in Vercel before deploying.

## Platform Roadmap

Early is not meant to be an X-only proof app. X is the first surface because it gives us the cleanest primitive to validate: a like as endorsement, a reply as timestamp, and an authenticated server response as proof.

The larger protocol is multi-platform. Anywhere people discover, endorse, and participate before the crowd arrives can become part of a curator's resume.

### X: The First Proof Surface

X is the current working platform.

The story is simple: you see a post before the algorithm turns it into consensus. You like it. You reply. Later, the post becomes part of the culture. Early lets you prove that your endorsement happened before the rest of the network caught up.

The proof primitive:

- **Like as endorsement**: `favorited: true` proves positive interaction with the parent post.
- **Reply as timestamp**: the reply's `created_at` field anchors when you showed up.
- **Server record as source of truth**: the timestamp comes from X's authenticated response, not from a screenshot or local clock.

Near-term X work:

- Parse and display real extracted proof fields more cleanly.
- Add proof payload minimization before storage.
- Add stronger retry, failure, and timeout states.
- Explore Reclaim browser extension UX to reduce repeated portal logins.

### YouTube: The First Comment Before The World Arrived

YouTube is where Early starts to feel less like a crypto primitive and more like cultural memory.

An artist drops a video. A producer posts a beat breakdown. A filmmaker uploads a strange little short with 300 views. You watch it early, leave a comment, maybe like it, and move on. Months later that video has millions of views, the artist is everywhere, and the comments are full of people saying they always knew.

This is where reward mechanics become obvious. Imagine Drake, Adele, Rihanna, or a completely unknown future star releasing a new video. You are there in the first hour, not because a campaign told you to farm engagement, but because you genuinely found it. Later, if the artist wants to reward the first wave of real fans with concert access, merch, private listening sessions, or a one-off fan pass, Early can become the proof layer.

Early should let you prove something more precise:

> I commented on this video in the first hour. I was there before the crowd arrived.

And for creators:

> These are the people who showed up before the world did.

The proof target:

- authenticated YouTube session,
- comment tied to a specific `videoId`,
- comment timestamp,
- eventually current video metrics for Discovery Delta,
- future reward eligibility derived from a verified early interaction.

The likely technical path is YouTube's InnerTube browser API and comment history surfaces, especially requests around:

```txt
POST https://www.youtube.com/youtubei/v1/browse
https://www.youtube.com/feed/history/comment_history
```

Technical status: future provider. This needs live validation before implementation because YouTube often returns relative timestamps like `"2 years ago"`, which are too weak for Early. The provider should only move forward if the authenticated response exposes an absolute timestamp or another strong time anchor.

### Instagram: "You Found Me Before I Was Famous"

Instagram is the emotional heart of the creator version of Early.

There is a whole genre of posts from artists, musicians, stylists, designers, dancers, and small creators saying things like:

> POV: you discovered me before I was famous.

Or:

> If you bring this video to one of my concerts one day, you get a free pass because you were here early.

Or simply:

> You are interacting with my art before anyone knows my name.

Early turns that feeling into something creators and fans can actually keep. Not as a gimmick, but as a mutual receipt: the creator can recognize early believers, and the early believers can prove they were part of the story before the audience became obvious.

For Instagram, that matters because the promise is often already social. The creator is already saying, "remember you were here." Early gives both sides a way to actually remember.

The proof target:

- authenticated Instagram session,
- comment, save, or like on a post or reel,
- creator/post identity,
- timestamp where available,
- optional public post metadata for Discovery Delta.

Technical status: research phase. Instagram is more fragile than X and YouTube. It rate-limits aggressively, changes internal endpoints often, and may not expose stable authenticated history in a clean web response. Comments may be more realistic than likes or saves at first because comments are public objects attached to posts. Likes and saves are still desirable, but they need separate validation.

### Farcaster And Other Cultural Surfaces

The same pattern can extend anywhere endorsement and timestamped participation exist:

- Farcaster casts and reactions.
- Music platforms where early listeners leave timestamped interactions.
- Writing platforms where early comments signal attention before an essay spreads.
- Niche communities where early participation matters more than raw follower count.

The long-term protocol is platform-agnostic. Each provider only needs a trustworthy way to prove:

```txt
who interacted -> with what -> when -> before what later scale
```

### Zama FHE

Once Early has stable proof artifacts, Zama becomes the privacy layer.

Zama protects the parts of the proof that should not be permanently exposed on a public chain: the user's Web2 handle, exact timestamp, and private taste graph.

The next major protocol layer is private computation:

- consume the Early Proof Artifact as the input boundary,
- encrypt the user's handle,
- encrypt or transform the reply timestamp,
- submit encrypted values to an fhEVM contract,
- compute early-status without exposing the user's Web2 identity publicly.

### Stellar / Soroban

Stellar/Soroban can make private taste publicly legible without exposing the sensitive parts.

The first Stellar shape should be a receipt layer, not the whole privacy system. Zama protects private curator identity. Stellar can publish commitments, proof hashes, and receipt metadata that make Early artifacts portable in the Stellar ecosystem.

For ZK-on-Stellar work, Early can add a public receipt or verifier layer:

- store `publicCommitment`,
- store `proofHash`,
- register cultural discovery receipts,
- verify proof artifacts or proof hashes in a Soroban contract,
- make the proof-of-discovery legible inside the Stellar ecosystem.

This is roadmap work. The current app does not yet verify Reclaim proofs on Stellar.

## Security Notes

- Do not commit `.env.local`.
- Do not paste `RECLAIM_APP_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` in chat, issues, commits, or frontend code.
- Keep Supabase Row Level Security enabled.
- Use dedicated test X accounts during repeated Reclaim portal testing to avoid X login throttling.

## Why Early Matters

The internet remembers what went viral. It does not remember who believed first.

Early is for the people who find signal before consensus, who notice the artist before the chart, the thought before the trend, the builder before the market.

You were early.

Now prove it.
