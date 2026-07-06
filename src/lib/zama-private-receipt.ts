type JsonRecord = Record<string, unknown>;

export type ZamaPrivateTastePayload = {
  walletAddress: string;
  network: "sepolia";
  chainId: number;
  contractAddress: string;
  relayerUrl: string;
  explorerUrl: string;
  campaignWindowMinutes: number;
  earlyDeltaMinutes: number;
  publicCommitment: string;
  publicCommitmentHex: string;
  proofHash: string;
  proofHashHex: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Missing ${name}. Add it to .env.local and Vercel environment variables.`);
  }

  return value.trim();
}

function getPublicEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim();
  return value || fallback || "";
}

function getAppUrl() {
  return getPublicEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(/\/$/, "");
}

export function assertValidEvmAddress(walletAddress: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new Error("Connect a valid EVM wallet before sealing the private signal.");
  }
}

function unwrapSha256(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} is missing from the proof artifact.`);
  }

  const hex = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;

  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Error(`${label} must be a sha256 hex digest.`);
  }

  return hex.toLowerCase();
}

function getRequiredIntegerEnv(name: string) {
  const value = Number.parseInt(getRequiredEnv(name), 10);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function getXPostUnixFromSnowflake(tweetId: unknown) {
  if (typeof tweetId !== "string" || !/^\d+$/.test(tweetId)) {
    throw new Error("The proof artifact is missing a valid parent X post id.");
  }

  const twitterEpochMs = BigInt("1288834974657");
  const timestampMs = (BigInt(tweetId) >> BigInt(22)) + twitterEpochMs;
  const timestampSeconds = Number(timestampMs / BigInt(1000));

  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
    throw new Error("Unable to derive the parent X post timestamp.");
  }

  return timestampSeconds;
}

function getEarlyDeltaMinutes(proofArtifact: JsonRecord) {
  if (!Number.isSafeInteger(proofArtifact.replyTimestampUnix) || Number(proofArtifact.replyTimestampUnix) < 0) {
    throw new Error("The proof artifact is missing a valid reply timestamp.");
  }

  const parentTimestampUnix = getXPostUnixFromSnowflake(proofArtifact.parentContentId);
  const replyTimestampUnix = Number(proofArtifact.replyTimestampUnix);
  const earlyDeltaMinutes = Math.max(0, Math.floor((replyTimestampUnix - parentTimestampUnix) / 60));

  if (!Number.isSafeInteger(earlyDeltaMinutes) || earlyDeltaMinutes > 4_294_967_295) {
    throw new Error("The derived early delta does not fit in euint32 minutes.");
  }

  return earlyDeltaMinutes;
}

export function getTasteTierLabel(tier: number | null | undefined) {
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

export function createZamaPrivateTastePayload(proofArtifact: unknown, walletAddress: string): ZamaPrivateTastePayload {
  assertValidEvmAddress(walletAddress);

  if (!isRecord(proofArtifact)) {
    throw new Error("A successful Early proof artifact is required before computing a Zama private taste tier.");
  }

  if (proofArtifact.platform !== "x") {
    throw new Error("Only X proof artifacts are supported in this Zama milestone.");
  }

  const contractAddress = getPublicEnv("NEXT_PUBLIC_ZAMA_CONTRACT_ADDRESS");
  assertValidEvmAddress(contractAddress);

  const chainId = Number.parseInt(getPublicEnv("NEXT_PUBLIC_ZAMA_CHAIN_ID", "11155111"), 10);

  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("NEXT_PUBLIC_ZAMA_CHAIN_ID must be a positive integer.");
  }

  return {
    walletAddress,
    network: "sepolia",
    chainId,
    contractAddress,
    relayerUrl: getPublicEnv("NEXT_PUBLIC_ZAMA_RELAYER_URL", `${getAppUrl()}/api/zama/relayer/${chainId}`),
    explorerUrl: getPublicEnv("NEXT_PUBLIC_ZAMA_EXPLORER_URL", "https://explorer.testnet.zama.org"),
    campaignWindowMinutes: getRequiredIntegerEnv("ZAMA_CAMPAIGN_WINDOW_MINUTES"),
    earlyDeltaMinutes: getEarlyDeltaMinutes(proofArtifact),
    publicCommitment: String(proofArtifact.publicCommitment),
    publicCommitmentHex: unwrapSha256(proofArtifact.publicCommitment, "publicCommitment"),
    proofHash: String(proofArtifact.proofHash),
    proofHashHex: unwrapSha256(proofArtifact.proofHash, "proofHash")
  };
}

export function getZamaExplorerTxUrl(txHash: string) {
  const baseUrl = getPublicEnv("NEXT_PUBLIC_ZAMA_EXPLORER_URL", "https://explorer.testnet.zama.org");
  return `${baseUrl.replace(/\/$/, "")}/tx/${txHash}`;
}
