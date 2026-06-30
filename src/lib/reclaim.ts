export type ReclaimStartInput = {
  tweetUrl: string;
  origin?: string;
};

export type ReclaimStartResult = {
  sessionId: string;
  requestUrl: string;
  mobileRequestUrl: string;
  statusUrl?: string;
  configJson?: string;
  callbackUrl: string;
  redirectUrl: string;
  tweetId: string;
};

type ReclaimRequest = {
  setAppCallbackUrl?: (url: string, jsonProofResponse?: boolean) => Promise<void> | void;
  setRedirectUrl?: (url: string) => Promise<void> | void;
  setCancelRedirectUrl?: (url: string) => Promise<void> | void;
  addContext?: (context: string, message?: string) => Promise<void> | void;
  setParams?: (params: Record<string, string>) => Promise<void> | void;
  getRequestUrl?: (options?: { verificationMode?: "portal" | "app" }) => Promise<string> | string;
  getStatusUrl?: () => Promise<string> | string;
  getSessionId?: () => string;
  toJsonString?: () => string;
};

type ReclaimProofRequestConstructor = {
  init: (appId: string, appSecret: string, providerId: string, options?: { acceptTeeAttestation?: boolean }) => Promise<ReclaimRequest>;
};

type ReclaimSdkModule = {
  ReclaimProofRequest?: ReclaimProofRequestConstructor;
};

const tweetIdPattern = /(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i;

export function getTweetId(tweetUrl: string) {
  const trimmedUrl = tweetUrl.trim();
  const match = trimmedUrl.match(tweetIdPattern);

  if (!match?.[1]) {
    throw new Error("Paste a valid X tweet URL containing /status/{tweetId}.");
  }

  return match[1];
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value || value.includes("paste_your")) {
    throw new Error(`Missing ${name}. Add it to .env.local before starting a proof.`);
  }

  return value;
}

function getAppUrl(origin?: string) {
  if (process.env.NODE_ENV !== "production" && origin) {
    return origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? origin ?? "http://localhost:3000";
}

function shouldRequireTeeAttestation() {
  return process.env.RECLAIM_REQUIRE_TEE_ATTESTATION === "true";
}

export async function createReclaimProofRequest(input: ReclaimStartInput): Promise<ReclaimStartResult> {
  const appId = getRequiredEnv("RECLAIM_APP_ID");
  const appSecret = getRequiredEnv("RECLAIM_APP_SECRET");
  const providerId = getRequiredEnv("RECLAIM_PROVIDER_ID");
  const tweetId = getTweetId(input.tweetUrl);
  const appUrl = getAppUrl(input.origin).replace(/\/$/, "");
  const callbackUrl = `${appUrl}/api/reclaim/callback`;

  const reclaimSdk = (await import("@reclaimprotocol/js-sdk")) as ReclaimSdkModule;
  const ReclaimProofRequest = reclaimSdk.ReclaimProofRequest;

  if (!ReclaimProofRequest) {
    throw new Error("ReclaimProofRequest was not exported by @reclaimprotocol/js-sdk.");
  }

  const proofRequest = await ReclaimProofRequest.init(appId, appSecret, providerId, {
    acceptTeeAttestation: shouldRequireTeeAttestation()
  });
  const sessionId = proofRequest.getSessionId?.();

  if (!sessionId) {
    throw new Error("Reclaim SDK did not return a session id.");
  }

  const redirectUrl = `${appUrl}/?sessionId=${encodeURIComponent(sessionId)}`;

  await proofRequest.setAppCallbackUrl?.(callbackUrl, true);
  await proofRequest.setRedirectUrl?.(redirectUrl);
  await proofRequest.setCancelRedirectUrl?.(redirectUrl);
  await proofRequest.addContext?.(
    JSON.stringify({
      product: "Early",
      proofType: "x-endorsed-contribution",
      tweetUrl: input.tweetUrl,
      tweetId
    }),
    "Early X proof-of-discovery"
  );

  await proofRequest.setParams?.({
    tweetUrl: input.tweetUrl,
    tweetId,
    focalTweetId: tweetId
  });

  const requestUrl = await proofRequest.getRequestUrl?.({ verificationMode: "portal" });
  const mobileRequestUrl = await proofRequest.getRequestUrl?.({ verificationMode: "app" });

  if (!requestUrl || !mobileRequestUrl) {
    throw new Error("Reclaim SDK did not return a verification URL.");
  }

  const statusUrl = await proofRequest.getStatusUrl?.();
  const configJson = proofRequest.toJsonString?.();

  return {
    sessionId,
    requestUrl,
    mobileRequestUrl,
    statusUrl,
    configJson,
    callbackUrl,
    redirectUrl,
    tweetId
  };
}
