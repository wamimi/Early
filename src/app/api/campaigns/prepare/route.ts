import { NextRequest, NextResponse } from "next/server";
import { keccak256, toUtf8Bytes } from "ethers";
import {
  baseCampaignClaimsAddress,
  baseChainId,
} from "@/lib/base-contracts";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import type { DiscoveryPlatform } from "@/lib/proof-model";
import { getSubjectId } from "@/lib/reclaim";

export const runtime = "nodejs";

function integer(value: unknown, label: string, minimum: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > 4_294_967_295) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  try {
    assertAllowedOrigin(request.headers.get("origin"));
    const body = (await request.json()) as Record<string, unknown>;
    const platform = body.platform as DiscoveryPlatform;
    if (platform !== "x" && platform !== "youtube") {
      throw new Error("A supported platform is required.");
    }
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 80 ||
      typeof body.subjectUrl !== "string" ||
      typeof body.walletAddress !== "string" ||
      typeof body.closesAt !== "string"
    ) {
      throw new Error("Complete every required campaign field.");
    }

    const user = await authenticatePrivyRequest(request, body.walletAddress);
    const subjectId = getSubjectId(platform, body.subjectUrl);
    const opensAt = Math.floor(Date.now() / 1000);
    const closesAt = Math.floor(new Date(body.closesAt).getTime() / 1000);
    if (!Number.isSafeInteger(closesAt) || closesAt <= opensAt + 300) {
      throw new Error("The campaign must remain open for at least five minutes.");
    }

    const maximumDiscoveryMinutes = integer(
      body.maximumDiscoveryMinutes,
      "Discovery threshold",
      0
    );
    const minimumInteractions = integer(
      body.minimumInteractions,
      "Minimum interactions",
      1
    );
    const subjectHash = keccak256(toUtf8Bytes(subjectId));

    return NextResponse.json({
      chainId: baseChainId(),
      contractAddress: baseCampaignClaimsAddress(),
      method: "createCampaign",
      campaign: {
        name: body.name.trim(),
        platform,
        subjectId,
        subjectUrl: body.subjectUrl.trim(),
        subjectHash,
        opensAt,
        closesAt,
        maximumDiscoveryMinutes,
        minimumInteractions,
        creatorWallet: user.wallet,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to prepare the campaign.";
    const status = message.includes("access token")
      ? 401
      : message.includes("origin") || message.includes("not linked")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
