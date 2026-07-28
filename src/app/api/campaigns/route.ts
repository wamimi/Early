import { NextResponse } from "next/server";
import { listCampaigns } from "@/lib/v2-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const campaigns = await listCampaigns("active");
    return NextResponse.json({
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        platform: campaign.platform,
        subjectUrl: campaign.subject_url,
        maximumDiscoveryMinutes: campaign.maximum_discovery_minutes,
        minimumInteractions: campaign.minimum_interactions,
        baseCampaignId: campaign.base_campaign_id,
        closesAt: campaign.closes_at,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load campaigns.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
