"use client";

import {
  ArrowUpRight,
  CalendarRange,
  Check,
  ExternalLink,
  LockKeyhole,
  RadioTower,
} from "lucide-react";
import { BrowserProvider, Contract } from "ethers";
import { FormEvent, useState } from "react";
import { CAMPAIGN_CLAIMS_ABI } from "@/lib/base-contracts";
import { useEarlyAuth } from "./early-auth";

type CampaignDraft = {
  name: string;
  platform: "x" | "youtube";
  subjectUrl: string;
  closesAt: string;
  maximumDiscoveryMinutes: number;
  minimumInteractions: number;
};

const initialDraft: CampaignDraft = {
  name: "",
  platform: "x",
  subjectUrl: "",
  closesAt: "",
  maximumDiscoveryMinutes: 60,
  minimumInteractions: 1,
};

export function CampaignBuilder() {
  const auth = useEarlyAuth();
  const [draft, setDraft] = useState(initialDraft);
  const [preview, setPreview] = useState<CampaignDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deployed, setDeployed] = useState<{
    status: "active" | "draft";
    baseExplorerUrl: string;
    zamaExplorerUrl?: string;
    warning?: string;
  } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.authenticated) {
      auth.login();
      return;
    }
    setPreview(draft);
  }

  async function deployCampaign() {
    if (!preview || !auth.walletAddress) return;
    setBusy(true);
    setError("");
    try {
      const token = await auth.getAccessToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const preparedResponse = await fetch("/api/campaigns/prepare", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...preview, walletAddress: auth.walletAddress }),
      });
      const preparedBody = (await preparedResponse.json()) as {
        error?: string;
        chainId: number;
        contractAddress: string;
        campaign: CampaignDraft & {
          subjectId: string;
          subjectHash: string;
          opensAt: number;
          closesAt: number;
          creatorWallet: string;
        };
      };
      if (!preparedResponse.ok) {
        throw new Error(preparedBody.error ?? "Unable to prepare the campaign.");
      }

      await auth.switchChain(preparedBody.chainId);
      const ethereumProvider = await auth.getEthereumProvider();
      const provider = new BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const claims = new Contract(
        preparedBody.contractAddress,
        CAMPAIGN_CLAIMS_ABI,
        signer
      );
      const transaction = await claims.createCampaign(
        preparedBody.campaign.subjectHash,
        preparedBody.campaign.opensAt,
        preparedBody.campaign.closesAt
      );
      await transaction.wait();

      const registeredResponse = await fetch("/api/campaigns/register", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...preparedBody.campaign,
          walletAddress: auth.walletAddress,
          transactionHash: transaction.hash,
        }),
      });
      const registered = (await registeredResponse.json()) as {
        error?: string;
        status: "active" | "draft";
        baseExplorerUrl: string;
        zamaExplorerUrl?: string;
        warning?: string;
      };
      if (!registeredResponse.ok) {
        throw new Error(registered.error ?? "Unable to register the campaign.");
      }
      setDeployed(registered);
    } catch (deployError) {
      setError(
        deployError instanceof Error
          ? deployError.message
          : "Unable to deploy the campaign."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="campaign-workspace">
      <form className="campaign-form" onSubmit={submit}>
        <div className="field field-wide">
          <label htmlFor="campaign-name">Campaign name</label>
          <input
            id="campaign-name"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Day one listeners"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="campaign-platform">Provider</label>
          <select
            id="campaign-platform"
            value={draft.platform}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                platform: event.target.value as CampaignDraft["platform"],
              }))
            }
          >
            <option value="x">X</option>
            <option value="youtube" disabled>
              YouTube (next)
            </option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="campaign-close">Claim closes</label>
          <input
            id="campaign-close"
            type="date"
            value={draft.closesAt}
            onChange={(event) =>
              setDraft((current) => ({ ...current, closesAt: event.target.value }))
            }
            required
          />
        </div>
        <div className="field field-wide">
          <label htmlFor="campaign-subject">Post or video URL</label>
          <input
            id="campaign-subject"
            type="url"
            value={draft.subjectUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                subjectUrl: event.target.value,
              }))
            }
            placeholder="https://x.com/creator/status/..."
            required
          />
        </div>
        <div className="field">
          <label htmlFor="campaign-threshold">Early window in minutes</label>
          <input
            id="campaign-threshold"
            type="number"
            min="0"
            max="4294967295"
            value={draft.maximumDiscoveryMinutes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                maximumDiscoveryMinutes: Number(event.target.value),
              }))
            }
            required
          />
        </div>
        <div className="field">
          <label htmlFor="campaign-count">Required qualifying proofs</label>
          <input
            id="campaign-count"
            type="number"
            min="1"
            max="100"
            value={draft.minimumInteractions}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                minimumInteractions: Number(event.target.value),
              }))
            }
            required
          />
        </div>
        <div className="field campaign-window">
          <label>Eligibility window</label>
          <span>
            <CalendarRange size={17} />
            Before the campaign threshold
          </span>
        </div>
        <button className="button button-dark" type="submit">
          {auth.authenticated ? "Preview campaign" : "Sign in to continue"}
          <ArrowUpRight size={17} />
        </button>
        {error ? <p className="error-line field-wide">{error}</p> : null}
      </form>

      <aside className="campaign-preview">
        <span className="campaign-preview-label">PRIVATE RULE PREVIEW</span>
        {preview ? (
          <>
            <div className="campaign-preview-heading">
              <span>
                <RadioTower size={19} />
              </span>
              <div>
                <small>{preview.platform.toUpperCase()} CAMPAIGN</small>
                <h2>{preview.name}</h2>
              </div>
            </div>
            <div className="campaign-rule">
              <span>Subject</span>
              <strong>{preview.subjectUrl}</strong>
            </div>
            <div className="campaign-rule">
              <span>Minimum</span>
              <strong>{preview.minimumInteractions} qualifying proof</strong>
            </div>
            <div className="campaign-rule">
              <span>Early window</span>
              <strong>
                Within {preview.maximumDiscoveryMinutes} minutes of publication
              </strong>
            </div>
            <div className="campaign-rule">
              <span>Public result</span>
              <strong>Eligible / Not eligible</strong>
            </div>
            <div className="campaign-ready">
              <Check size={17} />
              Rule ready for Base and Zama
            </div>
            {!deployed ? (
              <button
                className="button button-dark campaign-deploy"
                type="button"
                onClick={() => void deployCampaign()}
                disabled={busy}
              >
                {busy ? "Deploying..." : "Deploy campaign"}
              </button>
            ) : (
              <div className="campaign-deployed">
                <strong>
                  {deployed.status === "active"
                    ? "Campaign active"
                    : "Base campaign created"}
                </strong>
                {deployed.warning ? <p>{deployed.warning}</p> : null}
                <div>
                  <a
                    className="text-link"
                    href={deployed.baseExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Base transaction
                    <ExternalLink size={14} />
                  </a>
                  {deployed.zamaExplorerUrl ? (
                    <a
                      className="text-link"
                      href={deployed.zamaExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Zama transaction
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="campaign-preview-empty">
            <LockKeyhole size={27} />
            <p>
              Set a subject and window. Early will reveal only whether a vault
              qualifies, never the history used to decide.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
