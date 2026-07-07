"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

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
  stellarReceipt: {
    walletAddress: string | null;
    network: string | null;
    contractId: string | null;
    txHash: string | null;
    status: "prepared" | "pending" | "published" | "failed" | null;
    createdAt: string | null;
  };
  stellarVerifier: {
    contractId: string | null;
    txHash: string | null;
    status: "prepared" | "pending" | "verified" | "failed" | null;
    createdAt: string | null;
    errorMessage: string | null;
  };
  zamaReceipt: {
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
  completedAt: string | null;
};

type WalletState = {
  address: string;
  network: "testnet";
  isConnecting: boolean;
  error: string;
};

type StellarPublishState = {
  status: "idle" | "preparing" | "awaiting-signature" | "submitting" | "prepared" | "pending" | "published" | "failed";
  message: string;
  txHash: string;
  explorerUrl: string;
};

type StellarVerifierState = {
  status: "idle" | "preparing" | "awaiting-signature" | "submitting" | "prepared" | "pending" | "verified" | "failed";
  message: string;
  txHash: string;
  explorerUrl: string;
};

type EvmWalletState = {
  address: string;
  chainId: number | null;
  isConnecting: boolean;
  error: string;
};

type ZamaSealState = {
  status: "idle" | "preparing" | "encrypting" | "awaiting-signature" | "submitting" | "prepared" | "pending" | "sealed" | "failed";
  message: string;
  txHash: string;
  explorerUrl: string;
};

type StellarWalletKitApi = {
  authModal: () => Promise<{ address: string }>;
  getAddress: () => Promise<{ address: string }>;
  signTransaction: (xdr: string, opts?: { networkPassphrase?: string; address?: string }) => Promise<{ signedTxXdr: string }>;
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

type ProofStage = {
  state: Extract<ProofState, "zktls" | "fhe">;
  label: string;
  caption: string;
  target: number;
};

type VerifiedChapter = "receipt" | "private";

const ease = [0.16, 1, 0.3, 1] as const;

const stages: Record<"zktls" | "fhe", ProofStage> = {
  zktls: {
    state: "zktls",
    label: "PULLING THE RECEIPT",
    caption: "Reclaim is checking the moment from X's servers.",
    target: 40
  },
  fhe: {
    state: "fhe",
    label: "MAKING IT YOURS",
    caption: "Early is turning the proof into a card and a Stellar receipt path.",
    target: 85
  }
};

const platformStories = [
  {
    name: "X",
    icon: "https://cdn.simpleicons.org/x/F2EAD8",
    status: "live now",
    title: "You had to be there.",
    lines: [
      "Someone posted before the quote tweets, before the lore, before everyone pretended they knew.",
      "If you liked it and replied early, paste that original post URL.",
      "Early proves your account showed up from X's servers."
    ]
  },
  {
    name: "YouTube",
    icon: "https://cdn.simpleicons.org/youtube/F2EAD8",
    status: "coming soon",
    title: "You commented before it became a moment.",
    lines: [
      "You were in the comments before the algorithm turned it into a memory.",
      "Early will pull the timestamp from your YouTube session.",
      "Comment #7 deserves a receipt."
    ]
  },
  {
    name: "Instagram",
    icon: "https://cdn.simpleicons.org/instagram/F2EAD8",
    status: "coming soon",
    title: "You found them before the crowd did.",
    lines: [
      "They said, \"POV: you discover me before I'm famous.\"",
      "You did.",
      "Early will turn that first signal into proof when Instagram support lands."
    ]
  }
] as const;

const proofSteps = [
  {
    title: "Find the moment",
    body: "Pick an X post where your account both liked and replied before the crowd arrived."
  },
  {
    title: "Paste the post URL",
    body: "Use the original post URL. Early uses your session to prove the interaction happened."
  },
  {
    title: "Keep the receipt",
    body: "Stellar makes it checkable. Zama can rank how early you were without exposing the exact timing."
  }
] as const;

const faqItems = [
  {
    question: "What kind of X post works?",
    answer: "Use a public X post where your account both liked and replied before it became obvious. Good examples are a \"you had to be there\" moment, an artist before the breakout, or a creator before the crowd."
  },
  {
    question: "Which link do I paste?",
    answer: "Paste the URL of the original X post you liked and replied to. Not a screenshot, not a manually typed timestamp, and not a story about being early."
  },
  {
    question: "What does Early prove?",
    answer: "Early proves your account interacted with that post at a real time from X's servers. Reclaim proves the web fact, Stellar makes the receipt checkable, and the proof becomes something you can show later."
  },
  {
    question: "Why does Zama matter here?",
    answer: "Zama does not hide a reply that is already public on X. Its job is to keep Early from publishing the raw timing or early-delta into the EVM contract. The contract computes a tier from encrypted timing and reveals only the tier."
  },
  {
    question: "Where does private ranking become useful?",
    answer: "It matters when early proof becomes eligibility, rewards, or multi-platform taste scoring. A creator can ask who was early without receiving every exact timestamp or raw interaction detail."
  }
] as const;

const manifestoLines = [
  "Every viral moment had a witness before it went viral.",
  "Every famous artist had a fan before the fame.",
  "Every idea had a believer before the world believed.",
  "The internet never built them a way to prove it.",
  "Until now."
] as const;

const headlineWords = "The internet never remembers who was first.".split(" ");

const revealContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.11
    }
  }
};

const revealItem = {
  hidden: { opacity: 0, y: 50, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.7, ease }
  }
};

const lineReveal = {
  hidden: { opacity: 0, x: -10 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease }
  }
};

const sessionStorageKey = "early.reclaim.sessionId";

const initialWalletState: WalletState = {
  address: "",
  network: "testnet",
  isConnecting: false,
  error: ""
};

const initialPublishState: StellarPublishState = {
  status: "idle",
  message: "",
  txHash: "",
  explorerUrl: ""
};

const initialVerifierState: StellarVerifierState = {
  status: "idle",
  message: "",
  txHash: "",
  explorerUrl: ""
};

const initialEvmWalletState: EvmWalletState = {
  address: "",
  chainId: null,
  isConnecting: false,
  error: ""
};

const initialZamaSealState: ZamaSealState = {
  status: "idle",
  message: "",
  txHash: "",
  explorerUrl: ""
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

let walletKitPromise: Promise<StellarWalletKitApi> | null = null;

function truncateMiddle(value: string, start = 6, end = 6) {
  if (!value) {
    return "";
  }

  return value.length <= start + end + 3 ? value : `${value.slice(0, start)}...${value.slice(-end)}`;
}

async function loadWalletKit() {
  if (!walletKitPromise) {
    walletKitPromise = Promise.all([
      import("@creit.tech/stellar-wallets-kit"),
      import("@creit.tech/stellar-wallets-kit/modules/utils")
    ]).then(([kitModule, modulesModule]) => {
      kitModule.StellarWalletsKit.init({
        modules: modulesModule.defaultModules(),
        network: kitModule.Networks.TESTNET
      });

      return kitModule.StellarWalletsKit;
    });
  }

  return walletKitPromise;
}

function readInitialSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("sessionId") ?? window.localStorage.getItem(sessionStorageKey) ?? "";
}

function getXPostCreatedAt(tweetId: string | null | undefined) {
  if (!tweetId || !/^\d+$/.test(tweetId)) {
    return null;
  }

  try {
    const twitterEpochMs = BigInt("1288834974657");
    const timestampMs = (BigInt(tweetId) >> BigInt(22)) + twitterEpochMs;
    const date = new Date(Number(timestampMs));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function getReplyCreatedAt(timestamp: string | null | undefined) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEarlyDelta(parentDate: Date | null, replyDate: Date | null) {
  if (!parentDate || !replyDate) {
    return "timestamp locked";
  }

  const minutes = Math.max(0, Math.round((replyDate.getTime() - parentDate.getTime()) / 60000));

  if (minutes < 2) {
    return "inside the first minute";
  }

  if (minutes < 60) {
    return `${minutes}m after the post`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `${hours}h after the post`;
  }

  const days = Math.round(hours / 24);
  return `${days}d after the post`;
}

function getTargetHandle(session: ProofSessionResponse | null) {
  const parameters = session?.extractedParameters;
  const identity = session?.proofArtifact?.screenName ?? parameters?.screen_name ?? parameters?.in_reply_to_screen_name ?? "this";
  return `@${String(identity).replace(/^@/, "")}`;
}

function getProofDetails(session: ProofSessionResponse | null) {
  const artifact = session?.proofArtifact;
  const timestamp = artifact?.replyTimestamp ?? session?.extractedParameters?.created_at ?? "pending";
  const commitment = artifact?.publicCommitment ? `${artifact.publicCommitment.slice(0, 18)}...${artifact.publicCommitment.slice(-8)}` : "pending";

  return [
    ["Reply proved", timestamp],
    ["Public commitment", commitment]
  ] as const;
}

function getZamaChainId() {
  const chainId = Number.parseInt(process.env.NEXT_PUBLIC_ZAMA_CHAIN_ID ?? "11155111", 10);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : 11155111;
}

function getZamaExplorerUrl(txHash: string) {
  const baseUrl = process.env.NEXT_PUBLIC_ZAMA_EXPLORER_URL ?? "https://sepolia.etherscan.io";
  return `${baseUrl.replace(/\/$/, "")}/tx/${txHash}`;
}

function toHexChainId(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

function toBytes32(hex: string) {
  return `0x${hex.replace(/^0x/, "")}`;
}

function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function bytesToHex(value: Uint8Array | string) {
  if (typeof value === "string") {
    return value.startsWith("0x") ? value : `0x${value}`;
  }

  return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function getTasteTierLabel(tier: number | null | undefined) {
  switch (tier) {
    case 4:
      return "First Hour";
    case 3:
      return "Day One";
    case 2:
      return "Week One";
    case 1:
      return "Still Early";
    case 0:
      return "Late";
    default:
      return null;
  }
}

function parseDecryptedNumber(value: unknown) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return null;
}

function parseDecryptedBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value !== BigInt(0);
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return null;
}

function getDecryptedValue(result: unknown, handle: string, fallbackIndex = 0) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const clearValues = "clearValues" in result && result.clearValues && typeof result.clearValues === "object" ? result.clearValues : result;
  const values = clearValues as Record<string, unknown>;

  return values[handle] ?? values[handle.toLowerCase()] ?? values[handle.toUpperCase()] ?? Object.values(values)[fallbackIndex] ?? null;
}

function isEvmWalletAvailable() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

async function switchToZamaChain() {
  if (!window.ethereum) {
    throw new Error("Install MetaMask or another EVM wallet to compute the private taste tier with Zama.");
  }

  const chainId = getZamaChainId();

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(chainId) }]
    });
  } catch (error) {
    const maybeError = error as { code?: number };

    if (maybeError.code !== 4902) {
      throw error;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: toHexChainId(chainId),
          chainName: "Sepolia",
          nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
          blockExplorerUrls: [process.env.NEXT_PUBLIC_ZAMA_EXPLORER_URL ?? "https://sepolia.etherscan.io"]
        }
      ]
    });
  }
}

function getShareCardCopy(session: ProofSessionResponse | null) {
  const artifact = session?.proofArtifact;
  const parentDate = getXPostCreatedAt(artifact?.parentContentId ?? session?.tweetId);
  const replyDate = getReplyCreatedAt(artifact?.replyTimestamp ?? session?.extractedParameters?.created_at);

  return {
    handle: getTargetHandle(session),
    delta: formatEarlyDelta(parentDate, replyDate)
  };
}

function isBusyStatus(status: string | null | undefined) {
  return status === "preparing" || status === "awaiting-signature" || status === "submitting" || status === "pending";
}

function humanizeStatus(status: string | null | undefined) {
  if (!status) {
    return "Waiting";
  }

  return status.replace(/-/g, " ");
}

function StatusBadge({
  status,
  tone = "default"
}: {
  status: string | null | undefined;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-medium capitalize",
        tone === "success" && "border-apothecary-neon/30 bg-apothecary-moss/40 text-apothecary-mint",
        tone === "warning" && "border-apothecary-sage/25 bg-white/[0.045] text-apothecary-sage",
        tone === "danger" && "border-apothecary-lotus/35 bg-apothecary-lotus/10 text-apothecary-lotus",
        tone === "default" && "border-white/10 bg-white/[0.04] text-zinc-400"
      )}
    >
      {humanizeStatus(status)}
    </span>
  );
}

function FlowStep({
  marker,
  title,
  detail,
  status,
  isActive
}: {
  marker: string;
  title: string;
  detail: string;
  status: string;
  isActive?: boolean;
}) {
  const complete = status === "complete";
  const failed = status === "failed";

  return (
    <div
      className={clsx(
        "grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 rounded-[1.25rem] border p-4 transition duration-300",
        complete && "border-apothecary-neon/25 bg-apothecary-moss/25",
        isActive && !complete && !failed && "border-apothecary-sage/35 bg-white/[0.055] shadow-garden-glow",
        failed && "border-apothecary-lotus/35 bg-apothecary-lotus/10",
        !complete && !isActive && !failed && "border-white/10 bg-white/[0.03]"
      )}
    >
      <span
        className={clsx(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full border font-mono text-[0.65rem]",
          complete && "border-apothecary-neon/40 bg-apothecary-fern/35 text-apothecary-mint",
          isActive && !complete && "border-apothecary-sage/40 bg-white/[0.06] text-receipt-bone",
          failed && "border-apothecary-lotus/40 bg-apothecary-lotus/10 text-apothecary-lotus",
          !complete && !isActive && !failed && "border-white/10 text-zinc-500"
        )}
      >
        {complete ? "OK" : marker}
      </span>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-receipt-bone">{title}</p>
          {failed ? <StatusBadge status="failed" tone="danger" /> : complete ? <StatusBadge status="complete" tone="success" /> : <StatusBadge status={isActive ? "active" : "queued"} tone="warning" />}
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{detail}</p>
      </div>
    </div>
  );
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

function Header({ wallet, onConnectWallet }: { wallet: WalletState; onConnectWallet: () => void }) {
  return (
    <header className="relative z-10 flex w-full items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <div className="flex items-center gap-3">
        <div className="relative h-8 w-8 overflow-hidden rounded-full border border-apothecary-sage/30 bg-apothecary-moss/35 shadow-garden-glow">
          <span className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-apothecary-neon" />
          <span className="absolute left-[1.05rem] top-1/2 h-px w-3 -translate-y-1/2 bg-apothecary-sage/80" />
          <span className="absolute right-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-receipt-bone/80" />
        </div>
        <div className="text-lg font-semibold tracking-normal text-receipt-bone">Early</div>
      </div>
      <button
        type="button"
        onClick={onConnectWallet}
        disabled={wallet.isConnecting}
        className="focus-garden rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur-md transition duration-300 hover:border-apothecary-sage/40 hover:bg-apothecary-moss/20 disabled:cursor-wait disabled:text-zinc-500"
      >
        {wallet.address ? truncateMiddle(wallet.address) : wallet.isConnecting ? "Connecting..." : "Connect Wallet"}
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
  const heroRef = useRef<HTMLElement>(null);
  const manifestoRef = useRef<HTMLElement>(null);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (!heroRef.current) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        ".hero-word",
        { opacity: 0, y: 60, filter: "blur(4px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out", stagger: 0.08, delay: 0.2 }
      );

      gsap.fromTo(
        ".hero-you",
        { opacity: 0, y: 24, filter: "blur(5px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out", delay: 0.86 }
      );

      gsap.fromTo(
        ".hero-body",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 1.06 }
      );

      gsap.fromTo(
        ".hero-form",
        { opacity: 0, y: 34 },
        { opacity: 1, y: 0, duration: 0.75, ease: "power3.out", delay: 1.22 }
      );
    }, heroRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    if (!manifestoRef.current) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      return;
    }

    const context = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".manifesto-line").forEach((line) => {
        gsap.fromTo(
          line,
          { opacity: 0.16, y: 22, filter: "blur(2px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            ease: "none",
            scrollTrigger: {
              trigger: line,
              start: "top 82%",
              end: "top 48%",
              scrub: 0.45
            }
          }
        );
      });

      gsap.fromTo(
        ".footer-proof-cta",
        { opacity: 0.55, scale: 0.98 },
        {
          opacity: 1,
          scale: 1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".footer-proof-cta",
            start: "top 88%",
            once: true
          }
        }
      );
    }, manifestoRef);

    return () => context.revert();
  }, []);

  return (
    <motion.section
      key="idle"
      ref={heroRef}
      initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
      transition={{ duration: 0.8, ease }}
      className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-5 pb-24 pt-10 sm:px-8 lg:px-12"
    >
      <div className="grid min-h-[calc(100svh-120px)] items-center gap-10 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="max-w-6xl">
          <motion.h1
            layout
            className="max-w-6xl text-balance text-[clamp(3.25rem,8.5vw,8rem)] font-semibold leading-[0.9] tracking-normal text-receipt-bone"
          >
            {headlineWords.map((word, index) => (
              <span key={`${word}-${index}`} className="hero-word inline-block">
                {word}
                {index < headlineWords.length - 1 ? "\u00A0" : ""}
              </span>
            ))}
          </motion.h1>
          <p className="hero-you mt-8 text-4xl font-semibold tracking-normal text-apothecary-mint sm:text-6xl">
            You do.
          </p>
          <p className="hero-body mt-7 max-w-2xl text-xl leading-8 text-zinc-300 sm:text-2xl">
            Paste the X post you liked and replied to early. Early proves the moment straight from X.
          </p>
        </div>

        <div className="hidden 2xl:block">
          <div className="glass-panel relative overflow-hidden rounded-[2rem] p-6">
            <div className="mb-12 min-h-36 rounded-[1.4rem] border border-apothecary-sage/20 bg-[radial-gradient(circle_at_20%_22%,rgba(109,255,156,0.2),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5">
              <p className="max-w-[14rem] text-2xl font-semibold leading-tight text-receipt-bone">proof for the people who were there first.</p>
            </div>
            <div className="space-y-3 text-sm text-zinc-400">
              <div className="flex justify-between border-t border-white/10 pt-4">
                <span>prove the reply</span>
                <span className="font-mono text-apothecary-sage">Reclaim</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-4">
                <span>verify the proof</span>
                <span className="font-mono text-apothecary-mint">Stellar</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-4">
                <span>keep the signal</span>
                <span className="font-mono text-apothecary-lotus">private</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="hero-form -mt-20 w-full max-w-4xl 2xl:-mt-32">
        <div className="glass-panel group flex flex-col gap-3 rounded-[1.65rem] p-3 transition duration-300 focus-within:border-apothecary-sage/40 focus-within:shadow-garden-glow sm:flex-row sm:items-center">
          <input
            value={tweetUrl}
            onChange={(event) => setTweetUrl(event.target.value)}
            placeholder="Paste the X post URL you liked and replied to"
            aria-label="X post URL you liked and replied to"
            className="focus-garden min-h-16 flex-1 rounded-[1.2rem] bg-transparent px-4 text-base text-zinc-100 placeholder:text-zinc-500 sm:text-lg"
          />
          <button
            type="submit"
            disabled={!tweetUrl.trim()}
            className="proof-cta focus-garden min-h-14 rounded-[1.15rem] px-6 text-sm font-semibold text-velvet-950 transition duration-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            Prove the Moment
          </button>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">
          Current demo: use the original X post URL your account liked and replied to before it mattered.
        </p>
        {proofError && (
          <p className="mt-4 max-w-2xl font-mono text-xs uppercase tracking-[0.16em] text-apothecary-lotus">
            {proofError}
          </p>
        )}
      </form>

      <motion.div
        variants={revealContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-16 grid w-full gap-4 lg:grid-cols-[1.1fr_0.95fr_0.95fr]"
      >
        {platformStories.map((story, index) => (
          <motion.div
            key={story.name}
            variants={revealItem}
            className={clsx(
              "group rounded-[1.6rem] border p-5 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-apothecary-neon/35 hover:shadow-garden-glow",
              index === 0 ? "border-apothecary-sage/25 bg-apothecary-moss/25 shadow-garden-glow" : "border-white/10 bg-white/[0.035]"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={story.icon} alt={`${story.name} icon`} className="h-6 w-6 opacity-90 transition duration-300 group-hover:opacity-100" />
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[0.65rem] text-zinc-400">
                {story.status === "live now" && <span className="live-dot" />}
                {story.status}
              </span>
            </div>
            <h2 className="mt-7 text-2xl font-semibold leading-tight text-receipt-bone">{story.title}</h2>
            <motion.div variants={revealContainer} className="mt-5 space-y-3 text-sm leading-6 text-zinc-400">
              {story.lines.map((line) => (
                <motion.p key={line} variants={lineReveal}>
                  {line}
                </motion.p>
              ))}
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      <motion.section
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.25 }}
        variants={revealContainer}
        className="mt-28 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start"
      >
        <motion.div variants={{ hidden: { opacity: 0, x: -40 }, show: { opacity: 1, x: 0, transition: { duration: 0.7, ease } } }}>
          <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-receipt-bone sm:text-6xl">
            What you are proving is simple.
          </h2>
          <p className="mt-6 max-w-xl text-xl leading-8 text-zinc-300">
            You liked it. You replied. Early proves that timing from the platform itself.
          </p>
        </motion.div>

        <motion.div variants={revealContainer} className="grid gap-3">
          {proofSteps.map((step, index) => (
            <motion.div key={step.title} variants={{ hidden: { opacity: 0, x: 30 }, show: { opacity: 1, x: 0, transition: { duration: 0.62, ease } } }} className="group rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-md transition duration-300 hover:border-apothecary-sage/35 hover:bg-white/[0.055]">
              <div className="font-mono text-xs text-zinc-500 transition duration-300 group-hover:text-apothecary-neon">{String(index + 1).padStart(2, "0")}</div>
              <h3 className="mt-4 text-2xl font-semibold text-receipt-bone">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{step.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      <section ref={manifestoRef} className="mx-auto mt-28 max-w-5xl text-center">
        <div className="space-y-7 text-balance text-3xl font-semibold leading-tight text-receipt-bone sm:text-5xl">
          {manifestoLines.map((line) => (
            <p key={line} className={clsx("manifesto-line", line === "Until now." && "text-apothecary-mint drop-shadow-[0_0_22px_rgba(109,255,156,0.22)]")}>
              {line}
            </p>
          ))}
        </div>
        <div className="mt-14">
          <p className="text-2xl font-semibold text-apothecary-mint sm:text-4xl">Your taste has receipts now.</p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="footer-proof-cta proof-cta focus-garden mt-7 rounded-full px-7 py-3 text-sm font-semibold text-velvet-950 transition"
          >
            Prove the Moment
          </button>
        </div>
      </section>

      <motion.section
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={revealContainer}
        className="mt-28 grid gap-8 border-t border-white/10 pt-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start"
      >
        <motion.div variants={{ hidden: { opacity: 0, x: -28 }, show: { opacity: 1, x: 0, transition: { duration: 0.65, ease } } }}>
          <p className="font-mono text-xs text-apothecary-sage">FAQ</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-receipt-bone sm:text-5xl">
            Before you paste.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400">
            Bring the right X post, then let Early turn the interaction into something checkable.
          </p>
        </motion.div>

        <motion.div variants={revealContainer} className="grid gap-3">
          {faqItems.map((item, index) => {
            const isOpen = openFaq === index;

            return (
              <motion.div
                key={item.question}
                variants={revealItem}
                layout
                className={clsx(
                  "overflow-hidden rounded-[1.35rem] border backdrop-blur-md transition duration-300",
                  isOpen ? "border-apothecary-sage/30 bg-apothecary-moss/20 shadow-garden-glow" : "border-white/10 bg-white/[0.035]"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  aria-expanded={isOpen}
                  className="focus-garden flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-base font-semibold text-receipt-bone">{item.question}</span>
                  <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-sm transition", isOpen ? "border-apothecary-neon/35 bg-apothecary-fern/30 text-apothecary-mint" : "border-white/10 text-zinc-500")}>
                    {isOpen ? "-" : "+"}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease }}
                    >
                      <p className="px-5 pb-5 text-sm leading-6 text-zinc-400">{item.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </motion.section>
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
      setCopyStatus("Phone link copied.");
    } catch {
      setCopyStatus("Could not copy. Open the phone link and send it to your device.");
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
                  Open Reclaim
                </a>
              )}
              {mobileReclaimUrl && (
                <a
                  href={mobileReclaimUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-garden rounded-full border border-apothecary-sage/30 bg-apothecary-moss/30 px-5 py-3 text-sm font-semibold text-apothecary-mint transition duration-300 hover:border-apothecary-neon/50 hover:bg-apothecary-fern/30"
                >
                  Open on phone
                </a>
              )}
              {mobileReclaimUrl && (
                <button
                  type="button"
                  onClick={copyMobileLink}
                  className="focus-garden rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 transition duration-300 hover:border-apothecary-sage/40 hover:text-apothecary-mint"
                >
                  Copy phone link
                </button>
              )}
              <button
                type="button"
                onClick={onReset}
                className="focus-garden rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 transition duration-300 hover:border-apothecary-sage/40 hover:text-apothecary-mint"
              >
                Start again
              </button>
            </div>
            {(sessionId || copyStatus) && (
              <div className="mt-6 grid gap-2 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-zinc-500">
                {sessionId && (
                  <p>
                    Early is waiting here. Finish the proof on your phone, then come back to this tab.
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
            <span>Proof path</span>
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

function VerifiedView({
  onReset,
  session,
  wallet,
  evmWallet,
  publishState,
  verifierState,
  zamaState,
  onConnectWallet,
  onConnectEvmWallet,
  onVerifyReclaimProof,
  onPublishReceipt,
  onSealPrivateSignal
}: {
  onReset: () => void;
  session: ProofSessionResponse | null;
  wallet: WalletState;
  evmWallet: EvmWalletState;
  publishState: StellarPublishState;
  verifierState: StellarVerifierState;
  zamaState: ZamaSealState;
  onConnectWallet: () => void;
  onConnectEvmWallet: () => void;
  onVerifyReclaimProof: () => void;
  onPublishReceipt: () => void;
  onSealPrivateSignal: () => void;
}) {
  const shareCard = getShareCardCopy(session);
  const proofDetails = getProofDetails(session);
  const receiptStatus = publishState.status !== "idle" ? publishState.status : session?.stellarReceipt?.status;
  const txHash = publishState.txHash || session?.stellarReceipt?.txHash || "";
  const explorerUrl = publishState.explorerUrl || (txHash ? `https://testnet.stellarchain.io/transactions/${txHash}` : "");
  const verifierStatus = verifierState.status !== "idle" ? verifierState.status : session?.stellarVerifier?.status;
  const verifierTxHash = verifierState.txHash || session?.stellarVerifier?.txHash || "";
  const verifierExplorerUrl = verifierState.explorerUrl || (verifierTxHash ? `https://testnet.stellarchain.io/transactions/${verifierTxHash}` : "");
  const zamaStatus = zamaState.status !== "idle" ? zamaState.status : session?.zamaReceipt?.status;
  const zamaTxHash = zamaState.txHash || session?.zamaReceipt?.txHash || "";
  const zamaExplorerUrl = zamaState.explorerUrl || (zamaTxHash ? getZamaExplorerUrl(zamaTxHash) : "");
  const tasteTierLabel = session?.zamaReceipt?.publicTierLabel ?? getTasteTierLabel(session?.zamaReceipt?.publicTier) ?? null;
  const isVerifierBusy = isBusyStatus(verifierState.status);
  const isReceiptBusy = isBusyStatus(publishState.status);
  const isZamaBusy = isBusyStatus(zamaState.status) || zamaState.status === "encrypting";
  const hasOnchainVerifier = verifierStatus === "verified";
  const hasPublishedReceipt = receiptStatus === "published";
  const hasSealedPrivateSignal = zamaStatus === "sealed";
  const canVerify = Boolean(session?.proofArtifact?.publicCommitment && wallet.address && !isVerifierBusy);
  const canPublish = Boolean(session?.proofArtifact?.publicCommitment && wallet.address && hasOnchainVerifier && !isReceiptBusy);
  const canSealWithZama = Boolean(
    session?.proofArtifact?.replyTimestampUnix &&
      session.proofArtifact.parentContentId &&
      evmWallet.address &&
      !isZamaBusy &&
      !hasSealedPrivateSignal
  );
  const [selectedChapter, setSelectedChapter] = useState<VerifiedChapter | null>(null);
  const autoChapter: VerifiedChapter = hasPublishedReceipt && !hasSealedPrivateSignal ? "private" : "receipt";
  const activeChapter = selectedChapter ?? autoChapter;

  const primaryAction =
    !wallet.address
      ? {
          label: wallet.isConnecting ? "Connecting..." : "Connect Wallet",
          onClick: onConnectWallet,
          disabled: wallet.isConnecting,
          message: "Your wallet owns the receipt. Your X identity stays off-chain."
        }
      : !hasOnchainVerifier
        ? {
            label: isVerifierBusy ? "Checking..." : "Verify on Stellar",
            onClick: onVerifyReclaimProof,
            disabled: !canVerify,
            message: "First, Stellar checks that the Reclaim proof is real."
          }
        : !hasPublishedReceipt
          ? {
              label: isReceiptBusy ? "Keeping..." : "Keep the Receipt",
              onClick: onPublishReceipt,
              disabled: !canPublish,
              message: "Now keep the moment as a public receipt without exposing the private details."
            }
          : {
              label: "Receipt Kept",
              onClick: onPublishReceipt,
              disabled: true,
              message: "This one is yours now."
            };
  const verifierTone = verifierStatus === "verified" ? "success" : verifierStatus === "failed" ? "danger" : wallet.address ? "warning" : "default";
  const actionMessage = publishState.message || verifierState.message || primaryAction.message;
  const zamaTone = hasSealedPrivateSignal ? "success" : zamaStatus === "failed" ? "danger" : evmWallet.address ? "warning" : "default";
  const zamaAction = !evmWallet.address
    ? {
        label: evmWallet.isConnecting ? "Connecting..." : "Connect EVM Wallet",
        onClick: onConnectEvmWallet,
        disabled: evmWallet.isConnecting,
        message: "Zama uses an EVM wallet on Sepolia. Your exact timing is encrypted before the contract ranks it."
      }
    : hasSealedPrivateSignal
      ? {
          label: tasteTierLabel ? `${tasteTierLabel} computed` : "Private Taste Computed",
          onClick: onSealPrivateSignal,
          disabled: true,
          message: "Zama computed the taste tier from encrypted timing data."
        }
      : {
          label: isZamaBusy ? "Computing..." : "Compute private taste tier",
          onClick: onSealPrivateSignal,
          disabled: !canSealWithZama,
          message: "Encrypt how early you were and reveal only the tier, not the exact timing."
        };
  const receiptChapterDone = hasOnchainVerifier && hasPublishedReceipt;
  const privateChapterLocked = !hasPublishedReceipt;
  const receiptChapterStatus = receiptChapterDone ? "Receipt live" : hasOnchainVerifier ? "Verifier passed" : wallet.address ? "Ready to check" : "Wallet needed";
  const privateChapterStatus = privateChapterLocked ? "After receipt" : hasSealedPrivateSignal ? tasteTierLabel ?? "Tier computed" : evmWallet.address ? "Ready to rank" : "EVM wallet needed";
  const receiptError =
    wallet.error ||
    (verifierState.status === "failed" && verifierState.message) ||
    (publishState.status === "failed" && publishState.message) ||
    session?.stellarVerifier?.errorMessage;
  const privateError = evmWallet.error || session?.zamaReceipt?.errorMessage || (zamaState.status === "failed" && zamaState.message);

  return (
    <motion.section
      key="verified"
      initial={{ opacity: 0, y: 26, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      className="relative z-10 mx-auto grid min-h-[calc(100svh-86px)] w-full max-w-7xl items-center gap-8 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:px-12"
    >
      <div className="relative w-full">
        <div className="absolute -inset-6 rounded-[2.6rem] bg-apothecary-neon/10 blur-[80px]" />
        <motion.div
          initial={{ rotateX: 8, rotateZ: -1.2 }}
          animate={{ rotateX: 0, rotateZ: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className="relative overflow-hidden rounded-[2.1rem] border border-white/15 bg-[linear-gradient(135deg,rgba(242,234,216,0.16),rgba(255,255,255,0.05)_46%,rgba(47,109,77,0.2))] p-5 shadow-ticket backdrop-blur-xl sm:p-8"
        >
          <div className="absolute inset-y-8 left-0 w-4 -translate-x-1/2 rounded-full bg-velvet-950" />
          <div className="absolute inset-y-8 right-0 w-4 translate-x-1/2 rounded-full bg-velvet-950" />
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="absolute right-8 top-8 h-28 w-28 rounded-full border border-apothecary-sage/15 bg-apothecary-neon/10 blur-sm" />

          <div className="relative z-10 flex items-start justify-between gap-6">
            <div>
              <p className="font-mono text-xs text-zinc-400">Early card</p>
              <h2 className="mt-8 max-w-3xl text-[clamp(3.5rem,8vw,7rem)] font-semibold leading-[0.86] tracking-normal text-receipt-bone">
                I was early to this
              </h2>
            </div>
            <span className="rounded-full border border-apothecary-neon/25 bg-apothecary-moss/45 px-3 py-1.5 font-mono text-xs text-apothecary-mint">
              {hasOnchainVerifier ? "Stellar verified" : "Proof ready"}
            </span>
          </div>

          <div className="relative z-10 mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="rounded-[1.75rem] border border-apothecary-neon/25 bg-apothecary-fern/20 p-5 shadow-garden-glow">
              <p className="break-words text-4xl font-semibold tracking-normal text-apothecary-mint sm:text-6xl">{shareCard.handle}</p>
              <p className="mt-5 max-w-xl text-2xl leading-tight text-receipt-bone sm:text-3xl">{shareCard.delta}</p>
              <p className="mt-4 text-lg text-zinc-300">while the timeline was still asleep.</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5">
              <p className="text-sm leading-6 text-zinc-300">
                Reclaim proves the web fact. Stellar makes it checkable. Zama ranks the timing privately.
              </p>
              <div className="mt-8 h-px bg-white/10" />
              <p className="mt-5 font-mono text-xs text-zinc-500">Public proof. Private taste.</p>
            </div>
          </div>

          <div className="relative z-10 mt-4 grid gap-3 sm:grid-cols-2">
            {proofDetails.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-velvet-900/50 p-4">
                <p className="font-mono text-xs text-zinc-500">{label}</p>
                <p className="mt-2 min-w-0 break-words font-mono text-sm text-zinc-200">{value}</p>
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-10 flex items-center justify-between border-t border-dashed border-white/15 pt-5 font-mono text-xs text-zinc-500">
            <span>Early proof</span>
            <span>{hasPublishedReceipt ? "receipt live" : hasOnchainVerifier ? "proof verified" : "ready for Stellar"}</span>
          </div>
        </motion.div>
      </div>

      <aside className="glass-panel w-full overflow-hidden rounded-[2rem] p-5 sm:p-6">
        <div>
          <p className="font-mono text-xs text-zinc-500">After the card</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-normal text-receipt-bone">Make it checkable. Then make it private.</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Stellar gives judges a public receipt. Zama computes the taste tier from encrypted timing.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-1.5" role="tablist" aria-label="Proof chapters">
          <button
            type="button"
            role="tab"
            aria-selected={activeChapter === "receipt"}
            onClick={() => setSelectedChapter("receipt")}
            className={clsx(
              "focus-garden rounded-[1.05rem] px-3 py-3 text-left transition",
              activeChapter === "receipt" ? "bg-receipt-bone text-receipt-ink" : "text-zinc-400 hover:bg-white/[0.04] hover:text-receipt-bone"
            )}
          >
            <span className="block text-sm font-semibold">Receipt</span>
            <span className={clsx("mt-1 block text-[0.7rem]", activeChapter === "receipt" ? "text-receipt-ink/65" : "text-zinc-500")}>{receiptChapterStatus}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeChapter === "private"}
            onClick={() => setSelectedChapter("private")}
            className={clsx(
              "focus-garden rounded-[1.05rem] px-3 py-3 text-left transition",
              activeChapter === "private" ? "bg-apothecary-neon text-velvet-950" : "text-zinc-400 hover:bg-white/[0.04] hover:text-receipt-bone"
            )}
          >
            <span className="block text-sm font-semibold">Private rank</span>
            <span className={clsx("mt-1 block text-[0.7rem]", activeChapter === "private" ? "text-velvet-950/70" : "text-zinc-500")}>{privateChapterStatus}</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeChapter === "receipt" ? (
            <motion.div
              key="receipt-chapter"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.3, ease }}
              className="mt-5 border-t border-white/10 pt-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-500">Stellar receipt</p>
                  <h4 className="mt-2 text-2xl font-semibold text-receipt-bone">Make it checkable.</h4>
                </div>
                <StatusBadge status={receiptChapterDone ? "complete" : receiptStatus ?? verifierStatus ?? "next"} tone={receiptChapterDone ? "success" : verifierTone} />
              </div>

              <div className="mt-5 space-y-3">
                <FlowStep marker="X" title="Reclaim proves it" detail="Early receives a valid proof from the authenticated X session." status="complete" />
                <FlowStep
                  marker="ST"
                  title="Stellar checks it"
                  detail={hasOnchainVerifier ? "The Reclaim witness signature is verified on Stellar testnet." : "Your Stellar wallet signs the verifier transaction."}
                  status={verifierStatus === "failed" ? "failed" : hasOnchainVerifier ? "complete" : "queued"}
                  isActive={Boolean(wallet.address && !hasOnchainVerifier)}
                />
                <FlowStep
                  marker="REC"
                  title="The receipt is kept"
                  detail={hasPublishedReceipt ? "The public commitment now has a wallet-owned receipt." : "Publish the commitment after Stellar verifies the proof."}
                  status={receiptStatus === "failed" ? "failed" : hasPublishedReceipt ? "complete" : "queued"}
                  isActive={hasOnchainVerifier && !hasPublishedReceipt}
                />
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="text-sm leading-6 text-zinc-300">{actionMessage}</p>
                {wallet.address && (
                  <p className="mt-3 font-mono text-[0.72rem] text-zinc-500">
                    Stellar wallet <span className="text-zinc-300">{truncateMiddle(wallet.address)}</span>
                  </p>
                )}
                {receiptError && (
                  <p className="mt-3 rounded-2xl border border-apothecary-lotus/25 bg-apothecary-lotus/10 p-3 font-mono text-xs leading-5 text-apothecary-lotus">
                    {receiptError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled}
                  className="proof-cta focus-garden mt-5 min-h-12 w-full rounded-full px-5 py-3 text-sm font-semibold text-velvet-950 transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
                >
                  {primaryAction.label}
                </button>
              </div>

              {(verifierExplorerUrl || explorerUrl) && (
                <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
                  {verifierExplorerUrl && (
                    <a
                      href={verifierExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-apothecary-sage/20 bg-apothecary-moss/20 p-3 font-mono text-xs text-apothecary-mint transition hover:border-apothecary-neon/40 hover:text-white"
                    >
                      Verifier transaction {truncateMiddle(verifierTxHash)}
                    </a>
                  )}
                  {explorerUrl && (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-apothecary-sage/20 bg-apothecary-moss/20 p-3 font-mono text-xs text-apothecary-mint transition hover:border-apothecary-neon/40 hover:text-white"
                    >
                      Receipt transaction {truncateMiddle(txHash)}
                    </a>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="private-chapter"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease }}
              className="mt-5 border-t border-white/10 pt-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-500">Zama private rank</p>
                  <h4 className="mt-2 text-2xl font-semibold text-receipt-bone">Rank the taste, not the identity.</h4>
                </div>
                <StatusBadge status={privateChapterLocked ? "locked" : zamaStatus ?? "ready"} tone={privateChapterLocked ? "default" : zamaTone} />
              </div>

              <div className="mt-5">
                <p className="text-sm leading-6 text-zinc-300">
                  Zama computes how early you were from encrypted timing data. It reveals only the final tier.
                </p>
                {tasteTierLabel ? (
                  <div className="mt-5 rounded-[1.2rem] border border-apothecary-neon/25 bg-apothecary-fern/25 p-4 shadow-garden-glow">
                    <p className="font-mono text-[0.7rem] text-apothecary-sage">Private taste tier</p>
                    <p className="mt-2 text-4xl font-semibold tracking-normal text-apothecary-mint">{tasteTierLabel}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">Computed from encrypted timing.</p>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3 text-zinc-400">
                      <span>Input</span>
                      <span className="text-right text-zinc-200">Encrypted timing</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3 text-zinc-400">
                      <span>Output</span>
                      <span className="text-right text-zinc-200">Taste tier only</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="text-sm leading-6 text-zinc-300">
                  {privateChapterLocked ? "Keep the Stellar receipt first. Then this layer becomes available." : zamaState.message || zamaAction.message}
                </p>
                {evmWallet.address && (
                  <p className="mt-3 font-mono text-[0.72rem] text-zinc-500">
                    EVM wallet <span className="text-zinc-300">{truncateMiddle(evmWallet.address)}</span>
                  </p>
                )}
                {privateError && (
                  <p className="mt-3 rounded-2xl border border-apothecary-lotus/25 bg-apothecary-lotus/10 p-3 font-mono text-xs leading-5 text-apothecary-lotus">
                    {privateError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={privateChapterLocked ? () => setSelectedChapter("receipt") : zamaAction.onClick}
                  disabled={privateChapterLocked ? false : zamaAction.disabled}
                  className="focus-garden mt-5 min-h-12 w-full rounded-full border border-apothecary-neon/30 bg-apothecary-neon px-5 py-3 text-sm font-semibold text-velvet-950 transition hover:bg-receipt-bone disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-zinc-500"
                >
                  {privateChapterLocked ? "Finish the receipt first" : zamaAction.label}
                </button>
              </div>

              {zamaExplorerUrl && (
                <a
                  href={zamaExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 block rounded-2xl border border-apothecary-lotus/20 bg-apothecary-lotus/10 p-3 font-mono text-xs text-apothecary-lotus transition hover:border-apothecary-lotus/40 hover:text-white"
                >
                  Zama transaction {truncateMiddle(zamaTxHash)}
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onReset}
          className="focus-garden mt-4 min-h-11 w-full rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 transition hover:border-apothecary-sage/40 hover:text-apothecary-mint"
        >
          Prove another moment
        </button>
      </aside>
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
  const [wallet, setWallet] = useState<WalletState>(initialWalletState);
  const [evmWallet, setEvmWallet] = useState<EvmWalletState>(initialEvmWalletState);
  const [publishState, setPublishState] = useState<StellarPublishState>(initialPublishState);
  const [verifierState, setVerifierState] = useState<StellarVerifierState>(initialVerifierState);
  const [zamaState, setZamaState] = useState<ZamaSealState>(initialZamaSealState);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true
    });
    let animationFrame = 0;

    function raf(time: number) {
      lenis.raf(time);
      animationFrame = window.requestAnimationFrame(raf);
    }

    animationFrame = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      lenis.destroy();
    };
  }, []);

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
          setPublishState((current) => (current.status === "idle" && session.stellarReceipt?.status ? { ...current, status: session.stellarReceipt.status } : current));
          setVerifierState((current) => (current.status === "idle" && session.stellarVerifier?.status ? { ...current, status: session.stellarVerifier.status } : current));
          setZamaState((current) => (current.status === "idle" && session.zamaReceipt?.status ? { ...current, status: session.zamaReceipt.status } : current));
          setProgress(85);
          setLiveStatus("Reclaim proved you were there. Building the card...");
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
          setProofError("Still waiting for the Reclaim callback. Keep this tab open or start again.");
          setLiveStatus("Early is still waiting for the receipt.");
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
    setLiveStatus("Opening the proof path...");
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
      setLiveStatus("Copy the phone link, complete Reclaim, and this page will catch the callback.");
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
    setPublishState(initialPublishState);
    setVerifierState(initialVerifierState);
    setZamaState(initialZamaSealState);
    window.localStorage.removeItem(sessionStorageKey);
    setProofState("idle");
  }

  async function handleConnectWallet() {
    setWallet((current) => ({ ...current, isConnecting: true, error: "" }));

    try {
      const kit = await loadWalletKit();
      const { address } = await kit.authModal();
      setWallet({
        address,
        network: "testnet",
        isConnecting: false,
        error: ""
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect Stellar wallet.";
      setWallet((current) => ({ ...current, isConnecting: false, error: message }));
    }
  }

  async function handleConnectEvmWallet() {
    setEvmWallet((current) => ({ ...current, isConnecting: true, error: "" }));

    try {
      if (!isEvmWalletAvailable() || !window.ethereum) {
        throw new Error("Install MetaMask or another EVM wallet to use Zama.");
      }

      const accounts = await window.ethereum.request<string[]>({ method: "eth_requestAccounts" });
      const address = accounts[0];

      if (!address) {
        throw new Error("No EVM wallet address was returned.");
      }

      await switchToZamaChain();
      const { getAddress } = await import("ethers");
      const normalizedAddress = getAddress(address);

      setEvmWallet({
        address: normalizedAddress,
        chainId: getZamaChainId(),
        isConnecting: false,
        error: ""
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect EVM wallet.";
      setEvmWallet((current) => ({ ...current, isConnecting: false, error: message }));
    }
  }

  async function handleVerifyReclaimProof() {
    if (!verifiedSession?.sessionId || !wallet.address) {
      setVerifierState({
        status: "failed",
        message: "Connect a Stellar wallet after Early builds your proof card.",
        txHash: "",
        explorerUrl: ""
      });
      return;
    }

    try {
      setVerifierState({
        status: "preparing",
        message: "Preparing the Stellar check...",
        txHash: "",
        explorerUrl: ""
      });

      const prepareResponse = await fetch("/api/stellar/reclaim-verifier/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: verifiedSession.sessionId,
          walletAddress: wallet.address
        })
      });
      const preparation = (await prepareResponse.json()) as {
        error?: string;
        unsignedXdr?: string;
        message?: string;
        verifier?: {
          contractId: string;
          networkPassphrase: string;
        };
      };

      if (!prepareResponse.ok || !preparation.unsignedXdr || !preparation.verifier) {
        throw new Error(preparation.error ?? "Unable to prepare Stellar Reclaim verifier transaction.");
      }

      setVerifierState({
        status: "awaiting-signature",
        message: "Confirm the Stellar check in your wallet...",
        txHash: "",
        explorerUrl: ""
      });

      const kit = await loadWalletKit();
      const { signedTxXdr } = await kit.signTransaction(preparation.unsignedXdr, {
        networkPassphrase: preparation.verifier.networkPassphrase,
        address: wallet.address
      });

      setVerifierState({
        status: "submitting",
        message: "Sending the proof check to Stellar...",
        txHash: "",
        explorerUrl: ""
      });

      const submitResponse = await fetch("/api/stellar/reclaim-verifier/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: verifiedSession.sessionId,
          walletAddress: wallet.address,
          contractId: preparation.verifier.contractId,
          signedTxXdr
        })
      });
      const submission = (await submitResponse.json()) as {
        error?: string;
        txHash?: string;
        explorerUrl?: string;
      };

      if (!submitResponse.ok || !submission.txHash) {
        throw new Error(submission.error ?? "Unable to submit Stellar Reclaim verifier transaction.");
      }

      setVerifiedSession((current) =>
        current
          ? {
              ...current,
              stellarVerifier: {
                contractId: preparation.verifier?.contractId ?? null,
                txHash: submission.txHash ?? null,
                status: "verified",
                createdAt: new Date().toISOString(),
                errorMessage: null
              }
            }
          : current
      );
      setVerifierState({
        status: "verified",
        message: "Stellar agrees. The proof is real.",
        txHash: submission.txHash,
        explorerUrl: submission.explorerUrl ?? ""
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify Reclaim proof on Stellar.";
      setVerifierState({
        status: "failed",
        message,
        txHash: "",
        explorerUrl: ""
      });
    }
  }

  async function handlePublishReceipt() {
    if (!verifiedSession?.sessionId || !wallet.address) {
      setPublishState({
        status: "failed",
        message: "Connect a Stellar wallet after Early builds your proof card.",
        txHash: "",
        explorerUrl: ""
      });
      return;
    }

    const verifierStatus = verifierState.status !== "idle" ? verifierState.status : verifiedSession.stellarVerifier?.status;

    if (verifierStatus !== "verified") {
      setPublishState({
        status: "failed",
        message: "Verify the Reclaim proof on Stellar before keeping the receipt.",
        txHash: "",
        explorerUrl: ""
      });
      return;
    }

    try {
      setPublishState({
        status: "preparing",
        message: "Preparing the public receipt without the private details...",
        txHash: "",
        explorerUrl: ""
      });

      const prepareResponse = await fetch("/api/stellar/receipt/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: verifiedSession.sessionId,
          walletAddress: wallet.address
        })
      });
      const preparation = (await prepareResponse.json()) as {
        error?: string;
        contractConfigured?: boolean;
        unsignedXdr?: string | null;
        message?: string;
        receipt?: {
          contractId: string | null;
          networkPassphrase: string;
        };
      };

      if (!prepareResponse.ok) {
        throw new Error(preparation.error ?? "Unable to prepare Stellar receipt.");
      }

      if (!preparation.contractConfigured || !preparation.unsignedXdr || !preparation.receipt) {
        setPublishState({
          status: "prepared",
          message: preparation.message ?? "Receipt payload is prepared. Deploy the Soroban contract to publish on-chain.",
          txHash: "",
          explorerUrl: ""
        });
        return;
      }

      setPublishState({
        status: "awaiting-signature",
        message: "Confirm the receipt in your wallet...",
        txHash: "",
        explorerUrl: ""
      });

      const kit = await loadWalletKit();
      const { signedTxXdr } = await kit.signTransaction(preparation.unsignedXdr, {
        networkPassphrase: preparation.receipt.networkPassphrase,
        address: wallet.address
      });

      setPublishState({
        status: "submitting",
        message: "Sending your receipt to Stellar testnet...",
        txHash: "",
        explorerUrl: ""
      });

      const submitResponse = await fetch("/api/stellar/receipt/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: verifiedSession.sessionId,
          walletAddress: wallet.address,
          contractId: preparation.receipt.contractId,
          signedTxXdr
        })
      });
      const submission = (await submitResponse.json()) as {
        error?: string;
        txHash?: string;
        explorerUrl?: string;
      };

      if (!submitResponse.ok || !submission.txHash) {
        throw new Error(submission.error ?? "Unable to submit Stellar receipt.");
      }

      setVerifiedSession((current) =>
        current
          ? {
              ...current,
              stellarReceipt: {
                walletAddress: wallet.address,
                network: "testnet",
                contractId: preparation.receipt?.contractId ?? null,
                txHash: submission.txHash ?? null,
                status: "published",
                createdAt: new Date().toISOString()
              }
            }
          : current
      );
      setPublishState({
        status: "published",
        message: "Published on Stellar testnet. The moment has a receipt.",
        txHash: submission.txHash,
        explorerUrl: submission.explorerUrl ?? ""
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish Stellar receipt.";
      setPublishState({
        status: "failed",
        message,
        txHash: "",
        explorerUrl: ""
      });
    }
  }

  async function handleSealPrivateSignal() {
    if (!verifiedSession?.sessionId || !evmWallet.address) {
      setZamaState({
        status: "failed",
        message: "Connect an EVM wallet after Early builds your proof card.",
        txHash: "",
        explorerUrl: ""
      });
      return;
    }

    try {
      if (!window.ethereum) {
        throw new Error("Install MetaMask or another EVM wallet to use Zama.");
      }

      setZamaState({
        status: "preparing",
        message: "Preparing the private taste computation...",
        txHash: "",
        explorerUrl: ""
      });

      await switchToZamaChain();
      const { BrowserProvider, Contract, getAddress } = await import("ethers");
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signerAddress = getAddress(await signer.getAddress());

      setEvmWallet({
        address: signerAddress,
        chainId: getZamaChainId(),
        isConnecting: false,
        error: ""
      });

      const prepareResponse = await fetch("/api/zama/receipt/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: verifiedSession.sessionId,
          walletAddress: signerAddress
        })
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

      if (!prepareResponse.ok || !preparation.receipt) {
        throw new Error(preparation.error ?? "Unable to prepare Zama private taste proof.");
      }

      const zamaReceipt = preparation.receipt;
      const encryptionUserAddress = signerAddress.toLowerCase();
      const encryptionContractAddress = zamaReceipt.contractAddress.toLowerCase();

      if (!isEvmAddress(encryptionUserAddress)) {
        throw new Error(`MetaMask returned an invalid EVM address: ${signerAddress}`);
      }

      if (!isEvmAddress(encryptionContractAddress)) {
        throw new Error(`Zama contract address is invalid: ${zamaReceipt.contractAddress}`);
      }

      setZamaState({
        status: "encrypting",
        message: "Encrypting your early delta locally...",
        txHash: "",
        explorerUrl: ""
      });

      const zamaModule = (await import("@zama-fhe/sdk")) as ZamaSdkModule;
      const fhevm = new zamaModule.RelayerWeb({
        transports: {
          [zamaReceipt.chainId]: {
            ...zamaModule.SepoliaConfig,
            chainId: zamaReceipt.chainId,
            relayerUrl: zamaReceipt.relayerUrl
          }
        },
        getChainId: async () => zamaReceipt.chainId
      });
      const encrypted = await fhevm.encrypt({
        values: [{ value: BigInt(zamaReceipt.earlyDeltaMinutes), type: "euint32" }],
        contractAddress: encryptionContractAddress,
        userAddress: encryptionUserAddress
      });
      const encryptedEarlyDeltaInput = encrypted.handles[0] ? bytesToHex(encrypted.handles[0]) : "";
      const inputProof = encrypted.inputProof ? bytesToHex(encrypted.inputProof) : "";

      if (!encryptedEarlyDeltaInput || !inputProof) {
        fhevm.terminate?.();
        throw new Error("Zama did not return an encrypted early-delta handle.");
      }

      setZamaState({
        status: "awaiting-signature",
        message: "Confirm the Zama transaction in your EVM wallet...",
        txHash: "",
        explorerUrl: ""
      });

      const contract = new Contract(zamaReceipt.contractAddress, zamaReceiptAbi, signer);
      const transaction = await contract.sealTasteProof(
        toBytes32(zamaReceipt.publicCommitmentHex),
        toBytes32(zamaReceipt.proofHashHex),
        encryptedEarlyDeltaInput,
        inputProof,
        BigInt(zamaReceipt.campaignWindowMinutes)
      );

      setZamaState({
        status: "submitting",
        message: "Waiting for Sepolia to seal the private signal...",
        txHash: transaction.hash,
        explorerUrl: getZamaExplorerUrl(transaction.hash)
      });

      await transaction.wait();

      let encryptedEarlyDeltaHandle = encryptedEarlyDeltaInput;
      let tierHandle = "";
      let eligibilityHandle = "";
      let publicTier: number | null = null;
      let publicEligible: boolean | null = null;

      try {
        encryptedEarlyDeltaHandle = String(await contract.getEncryptedEarlyDeltaMinutes(toBytes32(zamaReceipt.publicCommitmentHex)));
        tierHandle = String(await contract.getTasteTier(toBytes32(zamaReceipt.publicCommitmentHex)));
        eligibilityHandle = String(await contract.getEligibility(toBytes32(zamaReceipt.publicCommitmentHex)));
        const publicResult = await fhevm.publicDecrypt([tierHandle, eligibilityHandle]);
        publicTier = parseDecryptedNumber(getDecryptedValue(publicResult, tierHandle, 0));
        publicEligible = parseDecryptedBoolean(getDecryptedValue(publicResult, eligibilityHandle, 1));
      } catch {
        tierHandle = "";
        eligibilityHandle = "";
      } finally {
        fhevm.terminate?.();
      }

      const publicTierLabel = getTasteTierLabel(publicTier);

      const submitResponse = await fetch("/api/zama/receipt/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: verifiedSession.sessionId,
          walletAddress: signerAddress,
          contractAddress: zamaReceipt.contractAddress,
          txHash: transaction.hash,
          encryptedEarlyDeltaHandle,
          tierHandle,
          eligibilityHandle,
          publicTier,
          publicTierLabel,
          publicEligible,
          campaignWindowMinutes: zamaReceipt.campaignWindowMinutes
        })
      });
      const submission = (await submitResponse.json()) as {
        error?: string;
        txHash?: string;
        explorerUrl?: string;
      };

      if (!submitResponse.ok || !submission.txHash) {
        throw new Error(submission.error ?? "Unable to record Zama private taste proof.");
      }

      setVerifiedSession((current) =>
        current
          ? {
              ...current,
              zamaReceipt: {
                walletAddress: signerAddress,
                network: "sepolia",
                contractAddress: zamaReceipt.contractAddress,
                txHash: submission.txHash ?? null,
                status: "sealed",
                encryptedTimestampHandle: null,
                encryptedEarlyDeltaHandle,
                tierHandle,
                eligibilityHandle,
                publicEligible,
                publicTier,
                publicTierLabel,
                campaignWindowMinutes: zamaReceipt.campaignWindowMinutes,
                createdAt: new Date().toISOString(),
                errorMessage: null
              }
            }
          : current
      );
      setZamaState({
        status: "sealed",
        message: publicTierLabel
          ? `Zama computed your private taste tier: ${publicTierLabel}.`
          : "Zama computed the private taste tier from encrypted timing data.",
        txHash: submission.txHash,
        explorerUrl: submission.explorerUrl ?? getZamaExplorerUrl(submission.txHash)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to seal the private signal with Zama.";
      setZamaState({
        status: "failed",
        message,
        txHash: "",
        explorerUrl: ""
      });
    }
  }

  return (
    <main className="grain-field relative min-h-svh w-full max-w-full overflow-x-hidden bg-velvet-950">
      <AmbientField />
      <Header wallet={wallet} onConnectWallet={handleConnectWallet} />
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
        {proofState === "verified" && (
          <VerifiedView
            onReset={handleReset}
            session={verifiedSession}
            wallet={wallet}
            evmWallet={evmWallet}
            publishState={publishState}
            verifierState={verifierState}
            zamaState={zamaState}
            onConnectWallet={handleConnectWallet}
            onConnectEvmWallet={handleConnectEvmWallet}
            onVerifyReclaimProof={handleVerifyReclaimProof}
            onPublishReceipt={handlePublishReceipt}
            onSealPrivateSignal={handleSealPrivateSignal}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
