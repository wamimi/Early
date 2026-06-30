"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";

type ProofState = "idle" | "zktls" | "fhe" | "verified";
type ProofSessionStatus = "pending" | "succeeded" | "failed";

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

type ProofSessionResponse = {
  sessionId: string;
  tweetId: string;
  tweetUrl: string;
  status: ProofSessionStatus;
  extractedParameters: Record<string, string> | null;
  proofArtifact: EarlyProofArtifact | null;
  errorMessage: string | null;
  completedAt: string | null;
};

type ProofStage = {
  state: Extract<ProofState, "zktls" | "fhe">;
  label: string;
  caption: string;
  target: number;
};

const ease = [0.16, 1, 0.3, 1] as const;

const stages: Record<"zktls" | "fhe", ProofStage> = {
  zktls: {
    state: "zktls",
    label: "zkTLS EXTRACTION",
    caption: "Initializing local zkTLS session container...",
    target: 40
  },
  fhe: {
    state: "fhe",
    label: "ZAMA FHE BLINDING",
    caption: "Encrypting social handle & timestamp client-side via fhevmjs...",
    target: 85
  }
};

const sessionStorageKey = "early.reclaim.sessionId";

function readInitialSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("sessionId") ?? window.localStorage.getItem(sessionStorageKey) ?? "";
}

function getCardRows(session: ProofSessionResponse | null) {
  const parameters = session?.extractedParameters;
  const artifact = session?.proofArtifact;
  const identity = artifact?.screenName ?? parameters?.screen_name ?? parameters?.in_reply_to_screen_name ?? "unknown";
  const timestamp = artifact?.replyTimestamp ?? parameters?.created_at ?? "pending";
  const commitment = artifact?.publicCommitment ? `${artifact.publicCommitment.slice(0, 19)}...${artifact.publicCommitment.slice(-8)}` : "pending";

  return [
    ["Identity Target", `@${identity.replace(/^@/, "")} (Blinded)`],
    ["Discovery Timestamp", `${timestamp} (Hidden)`],
    ["Public Commitment", commitment]
  ] as const;
}

function AmbientField() {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fieldRef.current) {
      return;
    }

    const context = gsap.context(() => {
      gsap.to(".ambient-orbit", {
        y: -26,
        x: 18,
        rotation: 8,
        duration: 8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.7
      });

      gsap.to(".ambient-thread", {
        strokeDashoffset: -420,
        duration: 18,
        ease: "none",
        repeat: -1
      });
    }, fieldRef);

    return () => context.revert();
  }, []);

  return (
    <div ref={fieldRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-velvet-radial" />
      <div className="absolute left-[-18%] top-[-16%] h-[34rem] w-[34rem] rounded-full bg-apothecary-fern/20 blur-[120px]" />
      <div className="absolute bottom-[-18%] right-[-16%] h-[32rem] w-[32rem] rounded-full bg-apothecary-lotus/10 blur-[120px]" />

      <svg className="absolute inset-0 h-full w-full opacity-45" viewBox="0 0 1440 900" fill="none">
        <path
          className="ambient-thread"
          d="M-60 635 C185 548 254 762 458 650 C704 516 716 252 945 319 C1114 368 1172 541 1508 384"
          stroke="rgba(143,182,157,0.28)"
          strokeWidth="1"
          strokeDasharray="8 18"
        />
        <path
          className="ambient-thread"
          d="M-80 214 C128 324 306 134 512 234 C734 342 825 554 1046 485 C1214 432 1260 271 1506 246"
          stroke="rgba(109,255,156,0.18)"
          strokeWidth="1"
          strokeDasharray="4 24"
        />
      </svg>

      <div className="ambient-orbit absolute right-[10%] top-[18%] h-36 w-36 rounded-full border border-apothecary-sage/20 bg-apothecary-moss/20 blur-[1px]" />
      <div className="ambient-orbit absolute bottom-[15%] left-[8%] h-24 w-24 rounded-full border border-apothecary-lotus/20 bg-white/[0.03]" />
      <div className="ambient-orbit absolute left-[48%] top-[8%] h-3 w-3 rounded-full bg-apothecary-neon shadow-garden-glow" />
      <div className="ambient-orbit absolute bottom-[27%] right-[32%] h-2 w-2 rounded-full bg-apothecary-lotus shadow-lotus-glow" />
    </div>
  );
}

function Header() {
  return (
    <header className="relative z-10 flex w-full items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <div className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-300/80">Early v1.0.0-beta</div>
      <button className="focus-garden rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-md transition duration-300 hover:border-apothecary-sage/40 hover:bg-apothecary-moss/20">
        Connect Identity
      </button>
    </header>
  );
}

function IdleView({
  tweetUrl,
  setTweetUrl,
  onSubmit,
  proofError
}: {
  tweetUrl: string;
  setTweetUrl: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  proofError: string;
}) {
  return (
    <motion.section
      key="idle"
      initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
      transition={{ duration: 0.8, ease }}
      className="relative z-10 mx-auto flex min-h-[calc(100svh-86px)] w-full max-w-7xl flex-col justify-center px-5 pb-16 pt-8 sm:px-8 lg:px-12"
    >
      <div className="grid items-end gap-10 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="max-w-6xl">
          <motion.h1
            layout
            className="max-w-6xl text-balance text-[clamp(3.2rem,8.4vw,8.8rem)] font-semibold leading-[0.88] tracking-normal text-receipt-bone"
          >
            Prove you found them first. Privately.
          </motion.h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
            Early turns your authenticated X activity into a zkTLS proof, then blinds the sensitive handle and timestamp with Zama FHE before anything touches chain.
          </p>
        </div>

        <div className="hidden 2xl:block">
          <div className="glass-panel relative overflow-hidden rounded-[2rem] p-6">
            <div className="mb-16 h-32 rounded-[1.4rem] border border-apothecary-sage/20 bg-[radial-gradient(circle_at_30%_20%,rgba(109,255,156,0.18),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
            <div className="space-y-3 font-mono text-xs uppercase tracking-[0.22em] text-zinc-400">
              <div className="flex justify-between border-t border-white/10 pt-4">
                <span>Transport</span>
                <span className="text-apothecary-sage">zkTLS</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-4">
                <span>Privacy</span>
                <span className="text-apothecary-mint">FHE</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-4">
                <span>Dox surface</span>
                <span className="text-apothecary-lotus">Shielded</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-12 w-full max-w-4xl">
        <div className="glass-panel group flex flex-col gap-3 rounded-[1.65rem] p-3 transition duration-300 focus-within:border-apothecary-sage/40 focus-within:shadow-garden-glow sm:flex-row sm:items-center">
          <input
            value={tweetUrl}
            onChange={(event) => setTweetUrl(event.target.value)}
            placeholder="Paste an X thread reply URL..."
            aria-label="X thread reply URL"
            className="focus-garden min-h-16 flex-1 rounded-[1.2rem] bg-transparent px-4 text-base text-zinc-100 placeholder:text-zinc-500 sm:text-lg"
          />
          <button
            type="submit"
            disabled={!tweetUrl.trim()}
            className="focus-garden min-h-14 rounded-[1.15rem] bg-receipt-bone px-6 text-sm font-semibold text-receipt-ink transition duration-300 hover:bg-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            Generate Proof
          </button>
        </div>
        {proofError && (
          <p className="mt-4 max-w-2xl font-mono text-xs uppercase tracking-[0.16em] text-apothecary-lotus">
            {proofError}
          </p>
        )}
      </form>
    </motion.section>
  );
}

function LoadingView({
  stage,
  progress,
  liveStatus,
  reclaimUrl,
  mobileReclaimUrl,
  sessionId,
  onReset
}: {
  stage: ProofStage;
  progress: number;
  liveStatus: string;
  reclaimUrl: string;
  mobileReclaimUrl: string;
  sessionId: string;
  onReset: () => void;
}) {
  const isFhe = stage.state === "fhe";
  const [copyStatus, setCopyStatus] = useState("");

  async function copyMobileLink() {
    if (!mobileReclaimUrl) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(mobileReclaimUrl);
      setCopyStatus("Mobile verification link copied.");
    } catch {
      setCopyStatus("Copy failed. Open the mobile link and share it to your phone.");
    }
  }

  return (
    <motion.section
      key={stage.state}
      initial={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.02, filter: "blur(8px)" }}
      transition={{ duration: 0.7, ease }}
      className="relative z-10 mx-auto flex min-h-[calc(100svh-86px)] w-full max-w-5xl items-center px-5 pb-16 sm:px-8"
    >
      <div className={clsx("glass-panel w-full overflow-hidden rounded-[2rem] p-6 sm:p-10", isFhe && "border-apothecary-neon/20 shadow-garden-glow")}>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-apothecary-sage">{stage.label}</p>
            <h2 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight text-receipt-bone sm:text-5xl">
              {stage.caption}
            </h2>
            {liveStatus && <p className="mt-5 max-w-2xl font-mono text-xs uppercase tracking-[0.16em] text-zinc-400">{liveStatus}</p>}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {reclaimUrl && (
                <a
                  href={reclaimUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-garden rounded-full bg-receipt-bone px-5 py-3 text-sm font-semibold text-receipt-ink transition duration-300 hover:bg-white"
                >
                  Open portal
                </a>
              )}
              {mobileReclaimUrl && (
                <a
                  href={mobileReclaimUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-garden rounded-full border border-apothecary-sage/30 bg-apothecary-moss/30 px-5 py-3 text-sm font-semibold text-apothecary-mint transition duration-300 hover:border-apothecary-neon/50 hover:bg-apothecary-fern/30"
                >
                  Open mobile verifier
                </a>
              )}
              {mobileReclaimUrl && (
                <button
                  type="button"
                  onClick={copyMobileLink}
                  className="focus-garden rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 transition duration-300 hover:border-apothecary-sage/40 hover:text-apothecary-mint"
                >
                  Copy mobile link
                </button>
              )}
              <button
                type="button"
                onClick={onReset}
                className="focus-garden rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 transition duration-300 hover:border-apothecary-sage/40 hover:text-apothecary-mint"
              >
                Start over
              </button>
            </div>
            {(sessionId || copyStatus) && (
              <div className="mt-6 grid gap-2 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-zinc-500">
                {sessionId && (
                  <p>
                    Session <span className="text-zinc-300">{sessionId}</span> is polling in Early. Complete the proof on any device and leave this tab open.
                  </p>
                )}
                {copyStatus && <p className="text-apothecary-sage">{copyStatus}</p>}
              </div>
            )}
          </div>
          <div className="relative h-16 w-16 shrink-0 rounded-full border border-white/10 bg-white/[0.04]">
            <div className="absolute inset-2 animate-spin-soft rounded-full border border-transparent border-t-apothecary-neon" />
            <div className="absolute inset-[1.15rem] rounded-full bg-apothecary-neon/70 blur-sm" />
          </div>
        </div>

        <div className="mt-12">
          <div className="mb-4 flex items-center justify-between font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            <span>Local proof pipeline</span>
            <span className={clsx(isFhe ? "text-apothecary-neon" : "text-apothecary-sage")}>{Math.round(progress)}%</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className={clsx(
                "absolute inset-y-0 left-0 rounded-full",
                isFhe
                  ? "bg-gradient-to-r from-apothecary-fern via-apothecary-neon to-apothecary-mint"
                  : "bg-gradient-to-r from-apothecary-moss via-apothecary-sage to-apothecary-mint"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.45, ease }}
            />
            <div className="absolute inset-y-0 w-1/2 animate-scan bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function VerifiedView({ onReset, session }: { onReset: () => void; session: ProofSessionResponse | null }) {
  const rows = getCardRows(session);

  return (
    <motion.section
      key="verified"
      initial={{ opacity: 0, y: 26, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      className="relative z-10 mx-auto flex min-h-[calc(100svh-86px)] w-full max-w-5xl flex-col items-center justify-center px-5 pb-16 sm:px-8"
    >
      <div className="relative w-full max-w-3xl">
        <div className="absolute -inset-6 rounded-[2.6rem] bg-apothecary-neon/10 blur-[80px]" />
        <motion.div
          initial={{ rotateX: 8, rotateZ: -1.2 }}
          animate={{ rotateX: 0, rotateZ: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className="relative overflow-hidden rounded-[2.1rem] border border-white/15 bg-[linear-gradient(135deg,rgba(242,234,216,0.14),rgba(255,255,255,0.045)_42%,rgba(47,109,77,0.18))] p-5 shadow-ticket backdrop-blur-xl sm:p-8"
        >
          <div className="absolute inset-y-8 left-0 w-4 -translate-x-1/2 rounded-full bg-velvet-950" />
          <div className="absolute inset-y-8 right-0 w-4 translate-x-1/2 rounded-full bg-velvet-950" />
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          <div className="relative z-10 flex items-start justify-between gap-6">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-zinc-400">Early Card</p>
              <h2 className="mt-4 font-mono text-3xl font-semibold tracking-normal text-receipt-bone sm:text-5xl">
                CULTURAL_SCOUT_01
              </h2>
            </div>
            <span className="rounded-full border border-apothecary-neon/25 bg-apothecary-moss/45 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-apothecary-mint">
              Encrypted
            </span>
          </div>

          <div className="relative z-10 mt-12 space-y-3">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">{label} -&gt;</span>
                <span className="font-mono text-sm text-zinc-100 sm:text-base">{value}</span>
              </div>
            ))}

            <div className="rounded-2xl border border-apothecary-neon/30 bg-apothecary-fern/20 p-4 shadow-garden-glow">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-apothecary-sage">Scale Multiplication -&gt;</span>
                <span className="text-2xl font-semibold text-apothecary-mint sm:text-3xl">Top 0.04% Curator</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-10 flex items-center justify-between border-t border-dashed border-white/15 pt-5 font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
            <span>zkTLS attested</span>
            <span>FHE shielded</span>
          </div>
        </motion.div>
      </div>

      <button
        onClick={onReset}
        className="focus-garden mt-8 rounded-full px-5 py-3 text-sm font-medium text-zinc-300 transition duration-300 hover:text-apothecary-mint"
      >
        Process another proof
      </button>
    </motion.section>
  );
}

export default function Home() {
  const [initialSessionId] = useState(readInitialSessionId);
  const [proofState, setProofState] = useState<ProofState>(() => (initialSessionId ? "zktls" : "idle"));
  const [tweetUrl, setTweetUrl] = useState("");
  const [progress, setProgress] = useState(() => (initialSessionId ? 40 : 0));
  const [proofError, setProofError] = useState("");
  const [liveStatus, setLiveStatus] = useState(() => (initialSessionId ? "Waiting for Reclaim proof callback..." : ""));
  const [reclaimUrl, setReclaimUrl] = useState("");
  const [mobileReclaimUrl, setMobileReclaimUrl] = useState("");
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [verifiedSession, setVerifiedSession] = useState<ProofSessionResponse | null>(null);

  const activeStage = useMemo(() => {
    if (proofState === "zktls" || proofState === "fhe") {
      return stages[proofState];
    }

    return null;
  }, [proofState]);

  useEffect(() => {
    if (!activeStage) {
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = current + (activeStage.state === "zktls" ? 4 : 3);
        return Math.min(next, activeStage.target);
      });
    }, 160);

    return () => window.clearInterval(interval);
  }, [activeStage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.has("sessionId")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!activeSessionId || proofState !== "zktls") {
      return;
    }

    let pollCount = 0;
    let isCancelled = false;

    async function pollSession() {
      pollCount += 1;

      try {
        const response = await fetch(`/api/reclaim/session/${encodeURIComponent(activeSessionId)}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as ProofSessionResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload && payload.error ? payload.error : "Unable to load Reclaim proof session.");
        }

        if (isCancelled) {
          return;
        }

        const session = payload as ProofSessionResponse;

        if (session.status === "succeeded") {
          window.localStorage.removeItem(sessionStorageKey);
          setVerifiedSession(session);
          setProgress(85);
          setLiveStatus("Reclaim proof received. Preparing private receipt...");
          setProofState("fhe");
          return;
        }

        if (session.status === "failed") {
          window.localStorage.removeItem(sessionStorageKey);
          setProofError(session.errorMessage ?? "Reclaim verification failed. Please try another proof session.");
          setLiveStatus("");
          setReclaimUrl("");
          setMobileReclaimUrl("");
          setProgress(0);
          setProofState("idle");
          return;
        }

        if (pollCount >= 100) {
          setProofError("Still waiting for the Reclaim callback. You can retry after completing the portal flow.");
          setLiveStatus("Proof session is still pending.");
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to load Reclaim proof session.";
        setProofError(message);
      }
    }

    pollSession();
    const interval = window.setInterval(pollSession, 3000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [activeSessionId, proofState]);

  useEffect(() => {
    if (proofState !== "fhe" || !verifiedSession) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setProgress(100);
      setProofState("verified");
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [proofState, verifiedSession]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tweetUrl.trim()) {
      return;
    }

    setProofError("");
    setReclaimUrl("");
    setMobileReclaimUrl("");
    setLiveStatus("Preparing Reclaim verification session...");
    setProgress(0);
    setProofState("zktls");

    try {
      const response = await fetch("/api/reclaim/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ tweetUrl })
      });

      const payload = (await response.json()) as { sessionId?: string; requestUrl?: string; mobileRequestUrl?: string; error?: string };

      if (!response.ok || !payload.requestUrl || !payload.sessionId) {
        throw new Error(payload.error ?? "Reclaim verification could not be started.");
      }

      window.localStorage.setItem(sessionStorageKey, payload.sessionId);
      setActiveSessionId(payload.sessionId);
      setReclaimUrl(payload.requestUrl);
      setMobileReclaimUrl(payload.mobileRequestUrl ?? payload.requestUrl);
      setLiveStatus("Reclaim session is ready. Open the portal here, or send the mobile verifier link to your phone.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reclaim verification could not be started.";
      setProofError(message);
      setLiveStatus("");
      setReclaimUrl("");
      setMobileReclaimUrl("");
      setProgress(0);
      setProofState("idle");
    }
  }

  function handleReset() {
    setTweetUrl("");
    setProgress(0);
    setProofError("");
    setLiveStatus("");
    setReclaimUrl("");
    setMobileReclaimUrl("");
    setActiveSessionId("");
    setVerifiedSession(null);
    window.localStorage.removeItem(sessionStorageKey);
    setProofState("idle");
  }

  return (
    <main className="grain-field relative min-h-svh w-full max-w-full overflow-x-hidden bg-velvet-950">
      <AmbientField />
      <Header />
      <AnimatePresence mode="wait">
        {proofState === "idle" && <IdleView tweetUrl={tweetUrl} setTweetUrl={setTweetUrl} onSubmit={handleSubmit} proofError={proofError} />}
        {activeStage && (
          <LoadingView
            stage={activeStage}
            progress={progress}
            liveStatus={liveStatus}
            reclaimUrl={reclaimUrl}
            mobileReclaimUrl={mobileReclaimUrl}
            sessionId={activeSessionId}
            onReset={handleReset}
          />
        )}
        {proofState === "verified" && <VerifiedView onReset={handleReset} session={verifiedSession} />}
      </AnimatePresence>
    </main>
  );
}
