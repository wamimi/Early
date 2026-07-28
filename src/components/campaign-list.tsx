"use client";

import {
  Check,
  ExternalLink,
  LockKeyhole,
  ShieldQuestion,
  X,
} from "lucide-react";
import { BrowserProvider, Contract } from "ethers";
import { useEffect, useState } from "react";
import {
  CAMPAIGN_CLAIMS_ABI,
  BASE_SEPOLIA_CHAIN_ID,
} from "@/lib/base-contracts";
import { useEarlyAuth } from "./early-auth";

type Campaign = {
  id: string;
  name: string;
  platform: "x" | "youtube";
  subjectUrl: string;
  maximumDiscoveryMinutes: number;
  minimumInteractions: number;
  baseCampaignId: string;
  closesAt: string;
};

type Eligibility = {
  eligible: boolean;
  evaluationId: string;
  authorization?: {
    campaignId: string;
    claimant: string;
    evaluationTxHash: string;
    nullifier: string;
    expiry: number;
  };
  signature?: string;
};

export function CampaignList() {
  const auth = useEarlyAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");
  const [results, setResults] = useState<Record<string, Eligibility>>({});
  const [claimLinks, setClaimLinks] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/campaigns", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          campaigns?: Campaign[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Unable to load campaigns.");
        }
        return body.campaigns ?? [];
      })
      .then(setCampaigns)
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadError("Campaign listings are temporarily unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  async function evaluate(campaign: Campaign) {
    if (!auth.authenticated) {
      auth.login();
      return;
    }
    if (!auth.walletAddress) return;
    setActiveId(campaign.id);
    setError("");
    try {
      const token = await auth.getAccessToken();
      const response = await fetch("/api/campaigns/evaluate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          walletAddress: auth.walletAddress,
        }),
      });
      const result = (await response.json()) as Eligibility & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to evaluate this vault.");
      }
      setResults((current) => ({ ...current, [campaign.id]: result }));
    } catch (evaluationError) {
      setError(
        evaluationError instanceof Error
          ? evaluationError.message
          : "Unable to evaluate this vault."
      );
    } finally {
      setActiveId("");
    }
  }

  async function claim(campaign: Campaign, eligibility: Eligibility) {
    if (
      !eligibility.authorization ||
      !eligibility.signature ||
      !auth.walletAddress
    ) {
      return;
    }
    setActiveId(campaign.id);
    setError("");
    try {
      await auth.switchChain(BASE_SEPOLIA_CHAIN_ID);
      const ethereumProvider = await auth.getEthereumProvider();
      const provider = new BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const address = process.env.NEXT_PUBLIC_BASE_CAMPAIGN_CLAIMS_ADDRESS;
      if (!address) throw new Error("The Base campaign contract is not configured.");
      const claims = new Contract(address, CAMPAIGN_CLAIMS_ABI, signer);
      const transaction = await claims.claim(
        eligibility.authorization,
        eligibility.signature
      );
      await transaction.wait();

      const token = await auth.getAccessToken();
      const response = await fetch("/api/campaigns/claim/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationId: eligibility.evaluationId,
          walletAddress: auth.walletAddress,
          transactionHash: transaction.hash,
        }),
      });
      const submitted = (await response.json()) as {
        error?: string;
        explorerUrl?: string;
      };
      if (!response.ok) throw new Error(submitted.error ?? "Unable to confirm claim.");
      if (submitted.explorerUrl) {
        setClaimLinks((current) => ({
          ...current,
          [campaign.id]: submitted.explorerUrl as string,
        }));
      }
    } catch (claimError) {
      setError(
        claimError instanceof Error ? claimError.message : "Unable to claim."
      );
    } finally {
      setActiveId("");
    }
  }

  return (
    <section className="campaign-directory" aria-labelledby="active-campaigns">
      <div>
        <span>PRIVATE ELIGIBILITY</span>
        <h2 id="active-campaigns">Active campaigns</h2>
      </div>
      <div className="campaign-rows">
        {loading ? <p className="directory-empty">Loading campaigns...</p> : null}
        {!loading && loadError ? (
          <p className="directory-empty" role="status">
            {loadError}
          </p>
        ) : null}
        {!loading && !loadError && campaigns.length === 0 ? (
          <p className="directory-empty">
            No campaigns are active yet. The first verified audience can start
            here.
          </p>
        ) : null}
        {campaigns.map((campaign) => {
          const result = results[campaign.id];
          const claimed = claimLinks[campaign.id];
          return (
            <article key={campaign.id}>
              <span className="campaign-platform">{campaign.platform}</span>
              <div>
                <h3>{campaign.name}</h3>
                <p>
                  Within {campaign.maximumDiscoveryMinutes} minutes
                  <i />
                  {campaign.minimumInteractions} qualifying proof
                </p>
              </div>
              <time dateTime={campaign.closesAt}>
                Closes {new Date(campaign.closesAt).toLocaleDateString()}
              </time>
              {!result ? (
                <button
                  className="button button-dark button-small"
                  type="button"
                  onClick={() => void evaluate(campaign)}
                  disabled={activeId === campaign.id}
                >
                  <ShieldQuestion size={16} />
                  {activeId === campaign.id ? "Evaluating..." : "Check vault"}
                </button>
              ) : result.eligible && !claimed ? (
                <button
                  className="button button-dark button-small"
                  type="button"
                  onClick={() => void claim(campaign, result)}
                  disabled={activeId === campaign.id}
                >
                  <Check size={16} />
                  {activeId === campaign.id ? "Claiming..." : "Claim eligibility"}
                </button>
              ) : claimed ? (
                <a
                  className="text-link"
                  href={claimed}
                  target="_blank"
                  rel="noreferrer"
                >
                  Claimed
                  <ExternalLink size={14} />
                </a>
              ) : (
                <span className="campaign-ineligible">
                  <X size={15} />
                  Not eligible
                </span>
              )}
            </article>
          );
        })}
      </div>
      <div className="campaign-boundary">
        <LockKeyhole size={18} />
        <p>
          Campaigns learn only whether your vault qualifies. They do not receive
          your discovery timeline.
        </p>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
    </section>
  );
}
