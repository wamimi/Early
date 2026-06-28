export type ReclaimStartInput = {
  tweetUrl: string;
  origin?: string;
};

export type ReclaimStartResult = {
  requestUrl: string;
  statusUrl?: string;
  configJson?: string;
  callbackUrl: string;
  tweetId: string;
};

type ReclaimRequest = {
  setAppCallbackUrl?: (url: string) => Promise<void> | void;
  addContext?: (context: string, message?: string) => Promise<void> | void;
  setParams?: (params: Record<string, string>) => Promise<void> | void;
  getRequestUrl?: () => Promise<string> | string;
  getStatusUrl?: () => Promise<string> | string;
  toJsonString?: () => string;
};

type ReclaimProofRequestConstructor = {
  init: (appId: string, appSecret: string, providerId: string) => Promise<ReclaimRequest>;
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
  return process.env.NEXT_PUBLIC_APP_URL ?? origin ?? "http://localhost:3000";
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

  const proofRequest = await ReclaimProofRequest.init(appId, appSecret, providerId);

  await proofRequest.setAppCallbackUrl?.(callbackUrl);
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

  const requestUrl = await proofRequest.getRequestUrl?.();

  if (!requestUrl) {
    throw new Error("Reclaim SDK did not return a verification URL.");
  }

  const statusUrl = await proofRequest.getStatusUrl?.();
  const configJson = proofRequest.toJsonString?.();

  return {
    requestUrl,
    statusUrl,
    configJson,
    callbackUrl,
    tweetId
  };
}
