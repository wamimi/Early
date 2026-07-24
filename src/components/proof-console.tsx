"use client";

import {
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  LockKeyhole,
  Radio,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Contract, BrowserProvider } from "ethers";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BASE_SEPOLIA_CHAIN_ID,
  EARLY_DISCOVERY_REGISTRY_ABI,
} from "@/lib/base-contracts";
import type { VerifiedDiscovery } from "@/lib/proof-model";
import { useEarlyAuth } from "./early-auth";

type SessionStatus = "pending" | "verifying" | "verified" | "failed" | "finalized";

type StartedSession = {
  sessionId: string;
  requestUrl: string;
  mobileRequestUrl: string;
  subjectId: string;
  platform: "x";
};

type SessionResponse = {
  sessionId: string;
  subjectId: string;
  subjectUrl: string;
  requestUrl?: string;
  status: SessionStatus;
  discovery: VerifiedDiscovery | null;
  errorMessage: string | null;
};

type ResultState = {
  title: string;
  description: string;
  explorerUrl?: string;
  identifier?: string;
};

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Early could not complete this request.");
  }
  return body;
}

function shortHash(value: string) {
  return value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

type ProofConsoleProps = {
  initialSessionId?: string;
  initialUrl?: string;
};

export function ProofConsole({
  initialSessionId = "",
  initialUrl = "",
}: ProofConsoleProps) {
  const auth = useEarlyAuth();
  const [subjectUrl, setSubjectUrl] = useState(initialUrl);
  const [started, setStarted] = useState<StartedSession | null>(() =>
    initialSessionId
      ? {
          sessionId: initialSessionId,
          requestUrl: "",
          mobileRequestUrl: "",
          subjectId: "",
          platform: "x",
        }
      : null
  );
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [busy, setBusy] = useState<"start" | "public" | "private" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultState | null>(null);
  const pollFailures = useRef(0);

  const authHeaders = useCallback(async () => {
    const token = await auth.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, [auth]);

  const loadSession = useCallback(async () => {
    if (!started || !auth.walletAddress) return;
    const response = await fetch(
      `/api/reclaim/session/${encodeURIComponent(started.sessionId)}?wallet=${encodeURIComponent(auth.walletAddress)}`,
      { headers: await authHeaders(), cache: "no-store" }
    );
    const next = await responseJson<SessionResponse>(response);
    pollFailures.current = 0;
    setSession(next);
  }, [auth.walletAddress, authHeaders, started]);

  useEffect(() => {
    if (!started || session?.status === "verified" || session?.status === "failed") {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        await loadSession();
      } catch (pollError) {
        pollFailures.current += 1;
        if (!cancelled && pollFailures.current >= 3) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Early could not refresh this proof session."
          );
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadSession, session?.status, started]);

  async function startProof() {
    setError("");
    setResult(null);
    if (!auth.authenticated) {
      auth.login();
      return;
    }
    if (!auth.walletAddress) {
      setError("Your Early wallet is still loading. Try again in a moment.");
      return;
    }

    setBusy("start");
    try {
      const response = await fetch("/api/reclaim/start", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          platform: "x",
          subjectUrl,
          walletAddress: auth.walletAddress,
        }),
      });
      const next = await responseJson<StartedSession>(response);
      setStarted(next);
      setSession({
        sessionId: next.sessionId,
        subjectId: next.subjectId,
        subjectUrl,
        status: "pending",
        discovery: null,
        errorMessage: null,
      });
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Early could not start the proof."
      );
    } finally {
      setBusy(null);
    }
  }

  async function registerPublicReceipt() {
    if (!started || !session?.discovery || !auth.walletAddress) return;
    setBusy("public");
    setError("");
    try {
      const preparedResponse = await fetch("/api/base/receipt/prepare", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          sessionId: started.sessionId,
          walletAddress: auth.walletAddress,
        }),
      });
      const prepared = await responseJson<{
        chainId: number;
        registryAddress: string;
        proof: unknown;
      }>(preparedResponse);

      await auth.switchChain(prepared.chainId || BASE_SEPOLIA_CHAIN_ID);
      const ethereumProvider = await auth.getEthereumProvider();
      const provider = new BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const registry = new Contract(
        prepared.registryAddress,
        EARLY_DISCOVERY_REGISTRY_ABI,
        signer
      );
      const transaction = await registry.verifyAndRegister(prepared.proof);
      await transaction.wait();

      const submittedResponse = await fetch("/api/base/receipt/submit", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          sessionId: started.sessionId,
          walletAddress: auth.walletAddress,
          transactionHash: transaction.hash,
        }),
      });
      const submitted = await responseJson<{
        explorerUrl: string;
        commitment: string;
      }>(submittedResponse);
      setResult({
        title: "Public receipt sealed",
        description:
          "Base verified the Reclaim proof and created the receipt in one transaction.",
        explorerUrl: submitted.explorerUrl,
        identifier: submitted.commitment,
      });
    } catch (publicError) {
      setError(
        publicError instanceof Error
          ? publicError.message
          : "Early could not register the Base receipt."
      );
    } finally {
      setBusy(null);
    }
  }

  async function sealPrivateArtifact() {
    if (!started || !session?.discovery || !auth.walletAddress) return;
    setBusy("private");
    setError("");
    try {
      const response = await fetch("/api/vault/attestation", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          sessionId: started.sessionId,
          walletAddress: auth.walletAddress,
        }),
      });
      const sealed = await responseJson<{
        explorerUrl: string;
        artifact: { proofCommitment: string };
      }>(response);
      setResult({
        title: "Private artifact sealed",
        description:
          "Your verified discovery was encrypted for the Zama vault. Only campaign eligibility can be revealed.",
        explorerUrl: sealed.explorerUrl,
        identifier: sealed.artifact.proofCommitment,
      });
    } catch (privateError) {
      setError(
        privateError instanceof Error
          ? privateError.message
          : "Early could not seal the private artifact."
      );
    } finally {
      setBusy(null);
    }
  }

  const discovery =
    session?.status === "verified" && session.discovery
      ? session.discovery
      : null;

  return (
    <div className="proof-console">
      <section className="proof-stage" aria-live="polite">
        {!started && !result ? (
          <div className="proof-form">
            <label htmlFor="proof-url">Original X post</label>
            <div className="proof-input-row">
              <input
                id="proof-url"
                type="url"
                value={subjectUrl}
                onChange={(event) => setSubjectUrl(event.target.value)}
                placeholder="https://x.com/creator/status/..."
                autoComplete="url"
                required
              />
              <button
                className="button button-dark"
                type="button"
                onClick={() => void startProof()}
                disabled={busy !== null || !subjectUrl.trim() || !auth.ready}
              >
                {busy === "start" ? "Starting..." : "Create proof"}
                <ArrowUpRight size={17} />
              </button>
            </div>
            <p className="privacy-caption">
              Use a public post your account both liked and replied to. Early
              verifies those facts from X, not from a screenshot.
            </p>
          </div>
        ) : null}

        {started && !discovery && !result ? (
          <div className="reclaim-session">
            <div className="qr-shell" aria-label="Reclaim verification QR code">
              {session?.requestUrl || started.requestUrl ? (
                <QRCodeSVG
                  value={session?.requestUrl || started.requestUrl}
                  size={164}
                />
              ) : (
                <LockKeyhole size={36} />
              )}
            </div>
            <div>
              <span className="status-badge">
                <i />
                {session?.status === "verifying"
                  ? "Verifying proof"
                  : "Waiting for Reclaim"}
              </span>
              <h2>Continue on your device</h2>
              <p>
                Open Reclaim, sign in to X, and approve the verification. Early
                will update this page when the proof arrives.
              </p>
              {!auth.authenticated ? (
                <button className="text-link" type="button" onClick={auth.login}>
                  Sign in to resume
                  <ArrowUpRight size={14} />
                </button>
              ) : (
                <a
                  className="text-link"
                  href={
                    started.mobileRequestUrl ||
                    session?.requestUrl ||
                    started.requestUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open verification
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        ) : null}

        {discovery && !result ? (
          <div className="verified-summary">
            <span className="verified-marker" aria-hidden="true">
              <Check size={23} />
            </span>
            <h2>Your discovery is verified.</h2>
            <p>
              X confirmed that your account liked the focal post and replied to
              it. Choose how this proof should live.
            </p>
            <div className="discovery-facts">
              <div>
                <span>Platform</span>
                <strong>X</strong>
              </div>
              <div>
                <span>Post</span>
                <strong>{discovery.subject}</strong>
              </div>
              <div>
                <span>Proof commitment</span>
                <strong title={discovery.commitment}>
                  {shortHash(discovery.commitment)}
                </strong>
              </div>
            </div>
            <div className="proof-choice">
              <article>
                <ReceiptText size={28} />
                <h3>Public receipt</h3>
                <p>
                  Base verifies the proof and creates a minimal, shareable
                  receipt. Selected proof fields remain visible in calldata.
                </p>
                <button
                  className="button button-dark"
                  type="button"
                  onClick={() => void registerPublicReceipt()}
                  disabled={busy !== null}
                >
                  {busy === "public" ? "Confirming..." : "Register on Base"}
                </button>
              </article>
              <i aria-hidden="true" />
              <article>
                <LockKeyhole size={28} />
                <h3>Private vault</h3>
                <p>
                  An Early attestor verifies the proof, then encrypts the
                  discovery for private campaign eligibility on Zama.
                </p>
                <button
                  className="button button-dark"
                  type="button"
                  onClick={() => void sealPrivateArtifact()}
                  disabled={busy !== null}
                >
                  {busy === "private" ? "Encrypting..." : "Seal privately"}
                </button>
              </article>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="verified-summary result-summary">
            <span className="verified-marker" aria-hidden="true">
              <ShieldCheck size={24} />
            </span>
            <h2>{result.title}</h2>
            <p>{result.description}</p>
            {result.identifier ? (
              <code className="result-commitment">{result.identifier}</code>
            ) : null}
            <div className="result-actions">
              {result.explorerUrl ? (
                <a
                  className="button button-dark"
                  href={result.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                  <ExternalLink size={16} />
                </a>
              ) : null}
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  setStarted(null);
                  setSession(null);
                  setResult(null);
                  setSubjectUrl("");
                }}
              >
                Create another proof
              </button>
            </div>
          </div>
        ) : null}

        {session?.status === "failed" ? (
          <div className="inline-alert" role="alert">
            <CircleAlert size={18} />
            <div>
              <strong>Proof not accepted</strong>
              <p>{session.errorMessage ?? "Reclaim could not verify this activity."}</p>
            </div>
          </div>
        ) : null}
        {error ? <p className="error-line">{error}</p> : null}
      </section>

      <aside className="proof-aside">
        <h2>What happens</h2>
        <ol>
          <li>
            <span>1</span>
            <p>Reclaim verifies your signed-in X activity with zkTLS.</p>
          </li>
          <li>
            <span>2</span>
            <p>Early checks the wallet, provider version, post, like, and reply.</p>
          </li>
          <li>
            <span>3</span>
            <p>You choose a public Base receipt or an encrypted Zama artifact.</p>
          </li>
        </ol>
        <div className="aside-signal">
          <Radio size={17} />
          <span>No screenshot can create a valid receipt.</span>
        </div>
      </aside>
    </div>
  );
}
