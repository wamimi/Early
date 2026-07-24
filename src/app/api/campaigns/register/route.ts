import { NextRequest, NextResponse } from "next/server";
import {
  Interface,
  JsonRpcProvider,
  getAddress,
  isHexString,
} from "ethers";
import {
  CAMPAIGN_CLAIMS_ABI,
  baseCampaignClaimsAddress,
  baseChainId,
  baseExplorerTransaction,
} from "@/lib/base-contracts";
import { configurePrivateCampaign } from "@/lib/campaign-bridge";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import type { DiscoveryPlatform } from "@/lib/proof-model";
import {
  activateCampaignRecord,
  createCampaignRecord,
} from "@/lib/v2-store";

export const runtime = "nodejs";
export const maxDuration = 120;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    assertAllowedOrigin(request.headers.get("origin"));
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.walletAddress !== "string" ||
      typeof body.transactionHash !== "string" ||
      !isHexString(body.transactionHash, 32) ||
      typeof body.name !== "string" ||
      typeof body.platform !== "string" ||
      typeof body.subjectId !== "string" ||
      typeof body.subjectUrl !== "string" ||
      typeof body.subjectHash !== "string" ||
      !isHexString(body.subjectHash, 32)
    ) {
      throw new Error("The campaign registration payload is invalid.");
    }

    const user = await authenticatePrivyRequest(request, body.walletAddress);
    const opensAt = Number(body.opensAt);
    const closesAt = Number(body.closesAt);
    const maximumDiscoveryMinutes = Number(body.maximumDiscoveryMinutes);
    const minimumInteractions = Number(body.minimumInteractions);
    if (
      ![opensAt, closesAt, maximumDiscoveryMinutes, minimumInteractions].every(
        Number.isSafeInteger
      )
    ) {
      throw new Error("The campaign rule contains invalid numbers.");
    }

    const provider = new JsonRpcProvider(required("BASE_RPC_URL"));
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== baseChainId()) {
      throw new Error("BASE_RPC_URL is connected to the wrong chain.");
    }
    const receipt = await provider.getTransactionReceipt(body.transactionHash);
    if (!receipt) {
      return NextResponse.json(
        { error: "The Base campaign transaction is still pending." },
        { status: 202 }
      );
    }
    if (
      receipt.status !== 1 ||
      getAddress(receipt.to ?? "") !== getAddress(baseCampaignClaimsAddress())
    ) {
      throw new Error("The Base campaign transaction is invalid.");
    }

    const contractInterface = new Interface(CAMPAIGN_CLAIMS_ABI);
    const event = receipt.logs
      .map((log) => {
        try {
          return contractInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((candidate) => candidate?.name === "CampaignCreated");
    if (
      !event ||
      getAddress(event.args.creator) !== getAddress(user.wallet) ||
      event.args.subjectHash.toLowerCase() !== body.subjectHash.toLowerCase() ||
      Number(event.args.opensAt) !== opensAt ||
      Number(event.args.closesAt) !== closesAt
    ) {
      throw new Error("The Base campaign event does not match this rule.");
    }

    const record = await createCampaignRecord({
      name: body.name,
      privyUserId: user.user_id,
      creatorWallet: user.wallet,
      platform: body.platform as DiscoveryPlatform,
      subjectId: body.subjectId,
      subjectUrl: body.subjectUrl,
      subjectHash: body.subjectHash,
      opensAt,
      closesAt,
      maximumDiscoveryMinutes,
      minimumInteractions,
      baseCampaignId: event.args.campaignId.toString(),
      baseTransactionHash: body.transactionHash,
    });

    try {
      const privateCampaign = await configurePrivateCampaign({
        baseCampaignId: event.args.campaignId.toString(),
        subjectHash: body.subjectHash,
        maximumDiscoveryMinutes,
        minimumInteractions,
      });
      const active = await activateCampaignRecord(
        record.id,
        privateCampaign.zamaCampaignId,
        privateCampaign.zamaTransactionHash
      );
      return NextResponse.json({
        status: "active",
        campaign: active,
        baseExplorerUrl: baseExplorerTransaction(body.transactionHash),
        zamaExplorerUrl: `${(
          process.env.NEXT_PUBLIC_ZAMA_EXPLORER_URL ??
          "https://sepolia.etherscan.io"
        ).replace(/\/$/, "")}/tx/${privateCampaign.zamaTransactionHash}`,
      });
    } catch (bridgeError) {
      return NextResponse.json({
        status: "draft",
        campaign: record,
        baseExplorerUrl: baseExplorerTransaction(body.transactionHash),
        warning:
          bridgeError instanceof Error
            ? `Base campaign created, but private configuration is pending: ${bridgeError.message}`
            : "Base campaign created, but private configuration is pending.",
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to register the campaign.";
    const status = message.includes("access token")
      ? 401
      : message.includes("origin") || message.includes("not linked")
        ? 403
        : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
