"use client";

import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LandingPage } from "@/components/landing-page";
import { useEarlyAuth } from "@/components/early-auth";

type ProofState = "idle" | "zktls" | "building" | "verified";
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

type ZamaReceipt = {
  walletAddress: string | null;
  network: string | null;
  contractAddress: string | null;
  txHash: string | null;
  status: "prepared" | "pending" | "sealed" | "failed" | null;
  encryptedTimestampHandle: string | null;
  encryptedEarlyDeltaHandle: string | null;
  tierHandle: string | null;
  publicTier: number | null;
  publicTierLabel: string | null;
  campaignWindowMinutes: number | null;
  eligibilityHandle: string | null;
  publicEligible: boolean | null;
  createdAt: string | null;
  errorMessage: string | null;
};

type ProofSessionResponse = {
  sessionId: string;
  tweetId: string;
  tweetUrl: string;
  status: ProofSessionStatus;
  extractedParameters: Record<string, string> | null;
  proofArtifact: EarlyProofArtifact | null;
  errorMessage: string | null;
  zamaReceipt: ZamaReceipt;
  completedAt: string | null;
};

type ZamaSealState = {
  status: "idle" | "preparing" | "encrypting" | "awaiting-signature" | "submitting" | "sealed" | "failed";
  message: string;
  txHash: string;
  explorerUrl: string;
  debug?: string;
};

type ZamaEncryptedPayload = {
  handles: Array<Uint8Array | string>;
  inputProof: Uint8Array | string;
};

type ZamaSdkModule = {
  RelayerWeb: new (config: {
    transports: Record<number, Record<string, unknown>>;
    getChainId: () => Promise<number>;
  }) => {
    encrypt: (params: {
      values: [{ value: bigint; type: "euint32" }];
      contractAddress: string;
      userAddress: string;
    }) => Promise<ZamaEncryptedPayload>;
    publicDecrypt: (handles: string[]) => Promise<{ clearValues?: Record<string, boolean | bigint | number | string> } | Record<string, unknown>>;
    terminate?: () => void;
  };
  SepoliaConfig: Record<string, unknown>;
};

const sessionStorageKey = "early.reclaim.sessionId";
const ease = [0.16, 1, 0.3, 1] as const;

const initialZamaState: ZamaSealState = {
  status: "idle",
  message: "",
  txHash: "",
  explorerUrl: "",
  debug: ""
};

const zamaReceiptAbi = [
  {
    type: "function",
    name: "sealTasteProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "publicCommitment", type: "bytes32" },
      { name: "proofHash", type: "bytes32" },
      { name: "encryptedEarlyDeltaMinutes", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
      { name: "campaignWindowMinutes", type: "uint32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getEncryptedEarlyDeltaMinutes",
    stateMutability: "view",
    inputs: [{ name: "publicCommitment", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "getTasteTier",
    stateMutability: "view",
    inputs: [{ name: "publicCommitment", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "getEligibility",
    stateMutability: "view",
    inputs: [{ name: "publicCommitment", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }]
  }
] as const;

function readInitialSessionId() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("sessionId") ?? window.localStorage.getItem(sessionStorageKey) ?? "";
}

function getXPostCreatedAt(tweetId: string | null | undefined) {
  if (!tweetId || !/^\d+$/.test(tweetId)) return null;
  try {
    const timestampMs = (BigInt(tweetId) >> BigInt(22)) + BigInt("1288834974657");
    const date = new Date(Number(timestampMs));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function getReplyCreatedAt(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEarlyDelta(parentDate: Date | null, replyDate: Date | null) {
  if (!parentDate || !replyDate) return "Timing verified";
  const minutes = Math.max(0, Math.round((replyDate.getTime() - parentDate.getTime()) / 60000));
  if (minutes < 2) return "Inside the first minute";
  if (minutes < 60) return `${minutes} minutes after the post`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours after the post`;
  return `${Math.round(hours / 24)} days after the post`;
}

function getShareCard(session: ProofSessionResponse | null) {
  const artifact = session?.proofArtifact;
  const identity = artifact?.screenName ?? session?.extractedParameters?.screen_name ?? session?.extractedParameters?.in_reply_to_screen_name ?? "creator";
  return {
    handle: `@${String(identity).replace(/^@/, "")}`,
    delta: formatEarlyDelta(
      getXPostCreatedAt(artifact?.parentContentId ?? session?.tweetId),
      getReplyCreatedAt(artifact?.replyTimestamp ?? session?.extractedParameters?.created_at)
    )
  };
}

function truncate(value: string, start = 8, end = 6) {
  if (!value) return "";
  return value.length <= start + end + 3 ? value : `${value.slice(0, start)}...${value.slice(-end)}`;
}

function getZamaChainId() {
  const value = Number.parseInt(process.env.NEXT_PUBLIC_ZAMA_CHAIN_ID ?? "11155111", 10);
  return Number.isSafeInteger(value) && value > 0 ? value : 11155111;
}

function getZamaExplorerUrl(txHash: string) {
  const base = process.env.NEXT_PUBLIC_ZAMA_EXPLORER_URL ?? "https://sepolia.etherscan.io";
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
}

function getTasteTierLabel(tier: number | null | undefined) {
  return ({ 4: "First Hour", 3: "Day One", 2: "Week One", 1: "Still Early", 0: "Late" } as Record<number, string>)[tier ?? -1] ?? null;
}

function toBytes32(value: string) {
  return `0x${value.replace(/^0x/, "")}`;
}

function bytesToHex(value: Uint8Array | string) {
  if (typeof value === "string") return value.startsWith("0x") ? value : `0x${value}`;
  return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function getErrorDebug(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function parseDecryptedNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function parseDecryptedBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value !== BigInt(0);
  if (typeof value === "number") return value !== 0;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function getDecryptedValue(result: unknown, handle: string, fallbackIndex: number) {
  if (!result || typeof result !== "object") return null;
  const values = "clearValues" in result && result.clearValues && typeof result.clearValues === "object" ? result.clearValues : result;
  const record = values as Record<string, unknown>;
  return record[handle] ?? record[handle.toLowerCase()] ?? Object.values(record)[fallbackIndex] ?? null;
}

function Header({ isLanding }: { isLanding: boolean }) {
  const auth = useEarlyAuth();

  return (
    <header className="clean-site-header">
      <a className="clean-wordmark" href={isLanding ? "#top" : "/"}><span className="wordmark-symbol"><i /><i /></span><strong>Early</strong></a>
      {isLanding && <nav aria-label="Primary navigation"><a className="is-active" href="#top">Home</a><a href="#providers">Providers</a><a href="#enterprise">Enterprise</a><a href="#developers">Developers</a><a href="#about">About</a></nav>}
      <div className="header-account">
        {auth.authenticated ? (
          <><span>{auth.displayName || "Signed in"}</span><button type="button" onClick={() => void auth.logout()}>Log out</button></>
        ) : (
          <button type="button" onClick={auth.login} disabled={!auth.ready}>{auth.ready ? "Get started" : "Loading..."}</button>
        )}
      </div>
    </header>
  );
}

function LoadingView({
  state,
  progress,
  liveStatus,
  reclaimUrl,
  mobileReclaimUrl,
  onReset
}: {
  state: Extract<ProofState, "zktls" | "building">;
  progress: number;
  liveStatus: string;
  reclaimUrl: string;
  mobileReclaimUrl: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const checking = state === "zktls";

  async function copyLink() {
    if (!mobileReclaimUrl) return;
    await navigator.clipboard.writeText(mobileReclaimUrl);
    setCopied(true);
  }

  return (
    <motion.section className="proof-workspace loading-workspace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="loading-panel">
        <div className="loading-status"><span className="loading-spinner" /><small>{checking ? "RECLAIM VERIFICATION" : "BUILDING RECEIPT"}</small></div>
        <h1>{checking ? "Scan. Verify. Return." : "Proof received."}</h1>
        <p>{checking ? "Use the Reclaim Verifier on your phone. Early updates automatically." : "Creating your Early proof."}</p>
        {checking && reclaimUrl && (
          <div className="reclaim-handoff">
            <div className="reclaim-qr" aria-label="QR code for the Reclaim verification session">
              <QRCodeSVG value={mobileReclaimUrl || reclaimUrl} size={208} level="M" bgColor="#ffffff" fgColor="#101722" />
            </div>
            <div>
              <strong>Open Reclaim</strong>
              <span>Scan with your phone or continue on this device.</span>
              <a href={reclaimUrl} target="_blank" rel="noreferrer">Open verifier</a>
              {mobileReclaimUrl && <button type="button" onClick={() => void copyLink()}>{copied ? "Link copied" : "Copy phone link"}</button>}
            </div>
          </div>
        )}
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div className="progress-meta"><span>{liveStatus || "Preparing a secure proof session..."}</span><strong>{Math.round(progress)}%</strong></div>
        <button className="text-action" type="button" onClick={onReset}>Cancel and start again</button>
      </div>
    </motion.section>
  );
}

function VerifiedView({
  session,
  zamaState,
  onSeal,
  onReset
}: {
  session: ProofSessionResponse | null;
  zamaState: ZamaSealState;
  onSeal: () => void;
  onReset: () => void;
}) {
  const auth = useEarlyAuth();
  const share = getShareCard(session);
  const artifact = session?.proofArtifact;
  const zamaStatus = zamaState.status !== "idle" ? zamaState.status : session?.zamaReceipt?.status;
  const tier = session?.zamaReceipt?.publicTierLabel ?? getTasteTierLabel(session?.zamaReceipt?.publicTier);
  const txHash = zamaState.txHash || session?.zamaReceipt?.txHash || "";
  const explorerUrl = zamaState.explorerUrl || (txHash ? getZamaExplorerUrl(txHash) : "");
  const busy = ["preparing", "encrypting", "awaiting-signature", "submitting", "pending"].includes(zamaState.status);
  const [copyLabel, setCopyLabel] = useState("Copy proof link");

  async function copyProof() {
    await navigator.clipboard.writeText(window.location.href);
    setCopyLabel("Copied");
  }

  return (
    <motion.section className="proof-workspace verified-workspace" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
      <div className="verified-heading"><div><small>PROOF COMPLETE</small><h1>Your moment is verifiable.</h1><p>Reclaim returned an authenticated proof from X.</p></div><button type="button" onClick={onReset}>Create another proof</button></div>
      <div className="verified-layout">
        <article className="clean-receipt">
          <div className="receipt-top"><div className="receipt-brand"><span className="wordmark-symbol"><i /><i /></span><strong>Early</strong></div><span className="verified-pill"><i />Verified source</span></div>
          <div className="receipt-main"><small>PROOF OF DISCOVERY</small><h2>You were there before the crowd.</h2><div className="receipt-highlight"><strong>{share.handle}</strong><span>{share.delta}</span></div></div>
          <div className="receipt-data">
            <div><small>Interaction</small><strong>Liked + replied</strong></div>
            <div><small>Platform</small><strong>X</strong></div>
            <div><small>Proof source</small><strong>Reclaim zkTLS</strong></div>
            <div><small>Private tier</small><strong>{tier ?? "Not computed"}</strong></div>
          </div>
          <div className="receipt-bottom"><span>Commitment</span><code>{truncate(artifact?.publicCommitment ?? "pending", 14, 10)}</code></div>
        </article>

        <aside className="proof-actions-panel">
          <div className="action-heading"><small>NEXT</small><h2>Make the proof useful.</h2><p>Your public receipt is ready. Private ranking is optional.</p></div>
          <div className="action-step complete"><span>✓</span><div><strong>Source verified</strong><p>X activity proved through Reclaim.</p></div></div>
          <div className="action-step"><span>2</span><div><strong>Compute a private tier</strong><p>Zama encrypts the exact timing and reveals only a useful result.</p></div></div>
          {tier && <div className="tier-result"><small>PRIVATE RESULT</small><strong>{tier}</strong><span>{session?.zamaReceipt?.publicEligible === false ? "Not eligible" : "Eligible"}</span></div>}
          {zamaState.message && <p className={zamaState.status === "failed" ? "action-error" : "action-message"}>{zamaState.message}</p>}
          {!auth.authenticated ? (
            <button className="panel-primary" type="button" onClick={auth.login}>Sign in to continue</button>
          ) : (
            <button className="panel-primary" type="button" onClick={onSeal} disabled={busy || zamaStatus === "sealed" || !auth.walletAddress}>
              {busy ? "Computing privately..." : zamaStatus === "sealed" ? `${tier ?? "Private tier"} computed` : "Compute private tier"}
            </button>
          )}
          <button className="panel-secondary" type="button" onClick={() => void copyProof()}>{copyLabel}</button>
          {auth.walletAddress && <p className="wallet-caption">Wallet {truncate(auth.walletAddress)}</p>}
          {explorerUrl && <a className="transaction-link" href={explorerUrl} target="_blank" rel="noreferrer">View private computation transaction ↗</a>}
        </aside>
      </div>
    </motion.section>
  );
}

export default function Home() {
  const auth = useEarlyAuth();
  const [initialSessionId] = useState(readInitialSessionId);
  const [proofState, setProofState] = useState<ProofState>(() => initialSessionId ? "zktls" : "idle");
  const [tweetUrl, setTweetUrl] = useState("");
  const [progress, setProgress] = useState(() => initialSessionId ? 38 : 0);
  const [proofError, setProofError] = useState("");
  const [liveStatus, setLiveStatus] = useState(() => initialSessionId ? "Waiting for the Reclaim callback..." : "");
  const [reclaimUrl, setReclaimUrl] = useState("");
  const [mobileReclaimUrl, setMobileReclaimUrl] = useState("");
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [verifiedSession, setVerifiedSession] = useState<ProofSessionResponse | null>(null);
  const [zamaState, setZamaState] = useState<ZamaSealState>(initialZamaState);

  const activeProgressTarget = useMemo(() => proofState === "zktls" ? 72 : proofState === "building" ? 96 : null, [proofState]);

  useEffect(() => {
    if (activeProgressTarget === null) return;
    const interval = window.setInterval(() => setProgress((current) => Math.min(activeProgressTarget, current + 2)), 180);
    return () => window.clearInterval(interval);
  }, [activeProgressTarget]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("sessionId")) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!activeSessionId || proofState !== "zktls") return;
    let cancelled = false;
    let attempts = 0;

    async function pollSession() {
      attempts += 1;
      try {
        const response = await fetch(`/api/reclaim/session/${encodeURIComponent(activeSessionId)}`, { cache: "no-store" });
        const payload = (await response.json()) as ProofSessionResponse | { error?: string };
        if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Unable to load the proof session.");
        if (cancelled) return;
        const session = payload as ProofSessionResponse;
        if (session.status === "succeeded") {
          window.localStorage.removeItem(sessionStorageKey);
          setVerifiedSession(session);
          setZamaState((current) => {
            const savedStatus = session.zamaReceipt?.status;
            if (current.status !== "idle" || !savedStatus) return current;
            if (savedStatus === "sealed" || savedStatus === "failed") return { ...current, status: savedStatus };
            return { ...current, status: savedStatus === "pending" ? "submitting" : "preparing" };
          });
          setProgress(82);
          setLiveStatus("Source verified. Creating your receipt...");
          setProofState("building");
        } else if (session.status === "failed") {
          window.localStorage.removeItem(sessionStorageKey);
          setProofError(session.errorMessage ?? "Reclaim could not verify this interaction.");
          setProofState("idle");
          setProgress(0);
        } else if (attempts > 100) {
          setLiveStatus("Still waiting. Keep this tab open or start again.");
        }
      } catch (error) {
        if (!cancelled) setProofError(error instanceof Error ? error.message : "Unable to load the proof session.");
      }
    }

    void pollSession();
    const interval = window.setInterval(pollSession, 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activeSessionId, proofState]);

  useEffect(() => {
    if (proofState !== "building" || !verifiedSession) return;
    const timeout = window.setTimeout(() => { setProgress(100); setProofState("verified"); }, 1000);
    return () => window.clearTimeout(timeout);
  }, [proofState, verifiedSession]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tweetUrl.trim()) return;
    setProofError("");
    setLiveStatus("Opening a secure Reclaim session...");
    setProgress(6);
    setProofState("zktls");

    try {
      const response = await fetch("/api/reclaim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetUrl })
      });
      const payload = (await response.json()) as { sessionId?: string; requestUrl?: string; mobileRequestUrl?: string; error?: string };
      if (!response.ok || !payload.requestUrl || !payload.sessionId) throw new Error(payload.error ?? "Reclaim verification could not be started.");
      window.localStorage.setItem(sessionStorageKey, payload.sessionId);
      setActiveSessionId(payload.sessionId);
      setReclaimUrl(payload.requestUrl);
      setMobileReclaimUrl(payload.mobileRequestUrl ?? payload.requestUrl);
      setLiveStatus("Complete the Reclaim flow. This page will update automatically.");
    } catch (error) {
      setProofError(error instanceof Error ? error.message : "Reclaim verification could not be started.");
      setProofState("idle");
      setProgress(0);
    }
  }

  function handleReset() {
    setTweetUrl("");
    setProofError("");
    setProgress(0);
    setLiveStatus("");
    setReclaimUrl("");
    setMobileReclaimUrl("");
    setActiveSessionId("");
    setVerifiedSession(null);
    setZamaState(initialZamaState);
    window.localStorage.removeItem(sessionStorageKey);
    setProofState("idle");
  }

  async function handleSealPrivateSignal() {
    if (!verifiedSession?.sessionId) return;
    if (!auth.authenticated) { auth.login(); return; }
    if (!auth.walletAddress) {
      setZamaState({ ...initialZamaState, status: "failed", message: "Your Privy wallet is still loading. Try again in a moment." });
      return;
    }

    try {
      setZamaState({ ...initialZamaState, status: "preparing", message: "Preparing the private computation..." });
      const chainId = getZamaChainId();
      await auth.switchChain(chainId);
      const eip1193Provider = await auth.getEthereumProvider();
      const { BrowserProvider, Contract, getAddress } = await import("ethers");
      const provider = new BrowserProvider(eip1193Provider);
      const signer = await provider.getSigner();
      const signerAddress = getAddress(await signer.getAddress());

      const prepareResponse = await fetch("/api/zama/receipt/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: verifiedSession.sessionId, walletAddress: signerAddress })
      });
      const preparation = (await prepareResponse.json()) as {
        error?: string;
        receipt?: {
          contractAddress: string;
          chainId: number;
          relayerUrl: string;
          campaignWindowMinutes: number;
          earlyDeltaMinutes: number;
          publicCommitmentHex: string;
          proofHashHex: string;
        };
      };
      if (!prepareResponse.ok || !preparation.receipt) throw new Error(preparation.error ?? "Unable to prepare the private tier.");
      const receipt = preparation.receipt;

      setZamaState({ ...initialZamaState, status: "encrypting", message: "Encrypting the exact timing locally..." });
      const zamaModule = (await import("@zama-fhe/sdk")) as ZamaSdkModule;
      const fhevm = new zamaModule.RelayerWeb({
        transports: { [receipt.chainId]: { ...zamaModule.SepoliaConfig, chainId: receipt.chainId, relayerUrl: receipt.relayerUrl } },
        getChainId: async () => receipt.chainId
      });

      const encrypted = await fhevm.encrypt({
        values: [{ value: BigInt(receipt.earlyDeltaMinutes), type: "euint32" }],
        contractAddress: getAddress(receipt.contractAddress),
        userAddress: signerAddress
      });
      const encryptedInput = encrypted.handles[0] ? bytesToHex(encrypted.handles[0]) : "";
      const inputProof = encrypted.inputProof ? bytesToHex(encrypted.inputProof) : "";
      if (!encryptedInput || !inputProof) throw new Error("Zama did not return an encrypted timing handle.");

      setZamaState({ ...initialZamaState, status: "awaiting-signature", message: "Confirm the private computation in your wallet..." });
      const contract = new Contract(receipt.contractAddress, zamaReceiptAbi, signer);
      const transaction = await contract.sealTasteProof(
        toBytes32(receipt.publicCommitmentHex),
        toBytes32(receipt.proofHashHex),
        encryptedInput,
        inputProof,
        BigInt(receipt.campaignWindowMinutes)
      );
      setZamaState({ status: "submitting", message: "Computing the encrypted tier on Sepolia...", txHash: transaction.hash, explorerUrl: getZamaExplorerUrl(transaction.hash) });
      await transaction.wait();

      let encryptedEarlyDeltaHandle = encryptedInput;
      let tierHandle = "";
      let eligibilityHandle = "";
      let publicTier: number | null = null;
      let publicEligible: boolean | null = null;
      try {
        encryptedEarlyDeltaHandle = String(await contract.getEncryptedEarlyDeltaMinutes(toBytes32(receipt.publicCommitmentHex)));
        tierHandle = String(await contract.getTasteTier(toBytes32(receipt.publicCommitmentHex)));
        eligibilityHandle = String(await contract.getEligibility(toBytes32(receipt.publicCommitmentHex)));
        const decrypted = await fhevm.publicDecrypt([tierHandle, eligibilityHandle]);
        publicTier = parseDecryptedNumber(getDecryptedValue(decrypted, tierHandle, 0));
        publicEligible = parseDecryptedBoolean(getDecryptedValue(decrypted, eligibilityHandle, 1));
      } finally {
        fhevm.terminate?.();
      }
      const publicTierLabel = getTasteTierLabel(publicTier);

      const submitResponse = await fetch("/api/zama/receipt/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: verifiedSession.sessionId,
          walletAddress: signerAddress,
          contractAddress: receipt.contractAddress,
          txHash: transaction.hash,
          encryptedEarlyDeltaHandle,
          tierHandle,
          eligibilityHandle,
          publicTier,
          publicTierLabel,
          publicEligible,
          campaignWindowMinutes: receipt.campaignWindowMinutes
        })
      });
      const submission = (await submitResponse.json()) as { error?: string; txHash?: string; explorerUrl?: string };
      if (!submitResponse.ok || !submission.txHash) throw new Error(submission.error ?? "Unable to save the private tier.");

      setVerifiedSession((current) => current ? {
        ...current,
        zamaReceipt: {
          walletAddress: signerAddress,
          network: "sepolia",
          contractAddress: receipt.contractAddress,
          txHash: submission.txHash ?? null,
          status: "sealed",
          encryptedTimestampHandle: null,
          encryptedEarlyDeltaHandle,
          tierHandle,
          publicTier,
          publicTierLabel,
          campaignWindowMinutes: receipt.campaignWindowMinutes,
          eligibilityHandle,
          publicEligible,
          createdAt: new Date().toISOString(),
          errorMessage: null
        }
      } : current);
      setZamaState({ status: "sealed", message: publicTierLabel ? `Private tier computed: ${publicTierLabel}.` : "Private tier computed.", txHash: submission.txHash, explorerUrl: submission.explorerUrl ?? getZamaExplorerUrl(submission.txHash) });
    } catch (error) {
      setZamaState({ ...initialZamaState, status: "failed", message: error instanceof Error ? error.message : "Unable to compute the private tier.", debug: getErrorDebug(error) });
    }
  }

  return (
    <div className="early-app">
      <Header isLanding={proofState === "idle"} />
      <main>
        <AnimatePresence mode="wait">
          {proofState === "idle" && <LandingPage tweetUrl={tweetUrl} setTweetUrl={setTweetUrl} onSubmit={handleSubmit} proofError={proofError} />}
          {(proofState === "zktls" || proofState === "building") && <LoadingView state={proofState} progress={progress} liveStatus={liveStatus} reclaimUrl={reclaimUrl} mobileReclaimUrl={mobileReclaimUrl} onReset={handleReset} />}
          {proofState === "verified" && <VerifiedView session={verifiedSession} zamaState={zamaState} onSeal={handleSealPrivateSignal} onReset={handleReset} />}
        </AnimatePresence>
      </main>
    </div>
  );
}
