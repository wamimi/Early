import { AbiCoder, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { applicationUrl } from "./origins";
import type {
  DiscoveryPlatform,
  ProviderConfiguration,
} from "./proof-model";

export type ReclaimStartInput = {
  platform: DiscoveryPlatform;
  subjectUrl: string;
  walletAddress: string;
};

export type ReclaimStartResult = {
  sessionId: string;
  requestUrl: string;
  mobileRequestUrl: string;
  statusUrl: string;
  callbackUrl: string;
  redirectUrl: string;
  subjectId: string;
  subjectUrl: string;
  provider: ProviderConfiguration;
  sessionNullifier: `0x${string}`;
};

const coder = AbiCoder.defaultAbiCoder();
const xStatusPattern = /(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i;

function required(name: string) {
  const value = process.env[name];
  if (!value || value.includes("paste_your")) {
    throw new Error(`Missing ${name}. Add it to .env.local before starting a proof.`);
  }
  return value;
}

function providerEnvironment(platform: DiscoveryPlatform) {
  const prefix = platform === "x" ? "RECLAIM_X" : "RECLAIM_YOUTUBE";
  const legacyProviderId =
    platform === "x" ? process.env.RECLAIM_PROVIDER_ID : undefined;
  const id = process.env[`${prefix}_PROVIDER_ID`] ?? legacyProviderId;
  const version =
    process.env[`${prefix}_PROVIDER_VERSION`] ??
    (platform === "x" ? process.env.RECLAIM_PROVIDER_VERSION : undefined) ??
    (platform === "x" ? "1.0.1" : "1.0.0");

  if (!id) {
    throw new Error(`Missing ${prefix}_PROVIDER_ID.`);
  }

  return { id, version };
}

export function getSubjectId(
  platform: DiscoveryPlatform,
  subjectUrl: string
) {
  const value = subjectUrl.trim();

  if (platform === "x") {
    const match = value.match(xStatusPattern);
    if (!match?.[1]) {
      throw new Error("Paste a public X post URL containing /status/{postId}.");
    }
    return match[1];
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Paste a valid YouTube video URL.");
  }

  const hostname = url.hostname.replace(/^www\./, "");
  const videoId =
    hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") ??
        (url.pathname.startsWith("/shorts/")
          ? url.pathname.split("/")[2]
          : null);

  if (!videoId || !/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    throw new Error("Paste a YouTube watch, Shorts, or youtu.be URL.");
  }

  return videoId;
}

export function providerConfiguration(
  platform: DiscoveryPlatform
): ProviderConfiguration {
  const configured = providerEnvironment(platform);
  const explicitHash =
    process.env[
      platform === "x"
        ? "RECLAIM_X_PROVIDER_CONFIGURATION_HASH"
        : "RECLAIM_YOUTUBE_PROVIDER_CONFIGURATION_HASH"
    ];
  const hash =
    explicitHash ??
    keccak256(
      coder.encode(
        ["bytes32", "string", "string", "string", "uint16"],
        [
          keccak256(toUtf8Bytes("early.provider-configuration/v2")),
          platform,
          configured.id,
          configured.version,
          2,
        ]
      )
    );

  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error(`The configured ${platform} provider hash must be bytes32.`);
  }

  return {
    id: configured.id,
    version: configured.version,
    hash: hash.toLowerCase() as `0x${string}`,
    schemaVersion: 2,
  };
}

function sessionNullifier(sessionId: string) {
  return keccak256(
    coder.encode(
      ["bytes32", "string"],
      [keccak256(toUtf8Bytes("early.reclaim-session/v2")), sessionId]
    )
  ) as `0x${string}`;
}

function shouldRequireTeeAttestation() {
  return process.env.RECLAIM_REQUIRE_TEE_ATTESTATION === "true";
}

export async function createReclaimProofRequest(
  input: ReclaimStartInput
): Promise<ReclaimStartResult> {
  const appId = required("RECLAIM_APP_ID");
  const appSecret = required("RECLAIM_APP_SECRET");
  const walletAddress = getAddress(input.walletAddress);
  const subjectUrl = input.subjectUrl.trim();
  const subjectId = getSubjectId(input.platform, subjectUrl);
  const provider = providerConfiguration(input.platform);
  const appUrl = applicationUrl().replace(/\/$/, "");
  const callbackUrl = `${appUrl}/api/reclaim/callback`;

  const proofRequest = await ReclaimProofRequest.init(
    appId,
    appSecret,
    provider.id,
    { acceptTeeAttestation: shouldRequireTeeAttestation() }
  );
  const resolvedProvider = proofRequest.getProviderVersion();
  if (resolvedProvider.providerVersion !== provider.version) {
    throw new Error(
      `Reclaim resolved provider ${resolvedProvider.providerVersion}, but Early allowlists ${provider.version}.`
    );
  }

  const sessionId = proofRequest.getSessionId();
  const nullifier = sessionNullifier(sessionId);
  const redirectUrl = `${appUrl}/proof?sessionId=${encodeURIComponent(sessionId)}`;
  const contextMessage = JSON.stringify({
    product: "Early",
    proofType:
      input.platform === "x"
        ? "x-liked-and-replied"
        : "youtube-engaged-comment",
    version: "2",
    schemaVersion: "2",
    platform: input.platform,
    providerConfigHash: provider.hash,
    sessionNullifier: nullifier,
    subjectId,
  });

  proofRequest.setAppCallbackUrl(callbackUrl, true);
  proofRequest.setRedirectUrl(redirectUrl);
  proofRequest.setCancelRedirectUrl(redirectUrl);
  proofRequest.setContext(walletAddress, contextMessage);
  proofRequest.setParams(
    input.platform === "x"
      ? {
          tweetUrl: subjectUrl,
          tweetId: subjectId,
          focalTweetId: subjectId,
        }
      : {
          videoUrl: subjectUrl,
          videoId: subjectId,
          focalVideoId: subjectId,
        }
  );

  const verifierAppUrl = await proofRequest.getRequestUrl({
    verificationMode: "app",
    canUseDeferredDeepLinksFlow: true,
  });

  return {
    sessionId,
    requestUrl: verifierAppUrl,
    mobileRequestUrl: verifierAppUrl,
    statusUrl: proofRequest.getStatusUrl(),
    callbackUrl,
    redirectUrl,
    subjectId,
    subjectUrl,
    provider,
    sessionNullifier: nullifier,
  };
}
