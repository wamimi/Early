import { NextRequest, NextResponse } from "next/server";
import { evaluatePrivateCampaign } from "@/lib/campaign-bridge";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import {
  getCampaign,
  getOrCreateVaultIdentity,
  recordEvaluation,
} from "@/lib/v2-store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    assertAllowedOrigin(request.headers.get("origin"));
    const body = (await request.json()) as {
      campaignId?: unknown;
      walletAddress?: unknown;
    };
    if (
      typeof body.campaignId !== "string" ||
      typeof body.walletAddress !== "string"
    ) {
      return NextResponse.json(
        { error: "campaignId and walletAddress are required." },
        { status: 400 }
      );
    }

    const user = await authenticatePrivyRequest(request, body.walletAddress);
    const campaign = await getCampaign(body.campaignId);
    if (
      !campaign ||
      campaign.status !== "active" ||
      !campaign.base_campaign_id ||
      !campaign.zama_campaign_id
    ) {
      return NextResponse.json(
        { error: "This campaign is not active on both Base and Zama." },
        { status: 409 }
      );
    }

    const identity = await getOrCreateVaultIdentity(user.user_id);
    const result = await evaluatePrivateCampaign({
      baseCampaignId: campaign.base_campaign_id,
      zamaCampaignId: campaign.zama_campaign_id,
      claimant: user.wallet,
      vaultId: identity.vault_id,
      ownerBinding: identity.owner_binding,
    });
    await recordEvaluation({
      campaignId: campaign.id,
      privyUserId: user.user_id,
      vaultId: identity.vault_id,
      evaluationId: result.evaluationId,
      zamaTransactionHash: result.evaluationTransaction,
      eligible: result.eligible,
      nullifier: result.authorization?.nullifier,
      status: result.eligible ? "authorized" : "evaluated",
    });

    return NextResponse.json({
      eligible: result.eligible,
      evaluationId: result.evaluationId,
      evaluationTransaction: result.evaluationTransaction,
      authorization: result.authorization,
      signature: result.signature,
      privacyNotice:
        "Only this eligibility result was decrypted. Early did not reveal the vault history used to compute it.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to evaluate the campaign.";
    const status = message.includes("access token")
      ? 401
      : message.includes("origin") || message.includes("not linked")
        ? 403
        : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
