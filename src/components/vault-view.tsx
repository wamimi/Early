"use client";

import { ExternalLink, Fingerprint, LockKeyhole, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useEarlyAuth } from "./early-auth";

type Artifact = {
  vault_id: string;
  proof_commitment: string;
  subject_hash: string;
  ciphertext_hash: string;
  zama_transaction_hash: string;
  status: string;
  created_at: string;
};

function short(value: string) {
  return value.length > 22 ? `${value.slice(0, 11)}...${value.slice(-8)}` : value;
}

export function VaultView() {
  const auth = useEarlyAuth();
  const { authenticated, getAccessToken, walletAddress } = auth;
  const [vaultId, setVaultId] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authenticated || !walletAddress) return;
    const controller = new AbortController();

    getAccessToken()
      .then((token) =>
        fetch(
          `/api/vault/artifacts?wallet=${encodeURIComponent(walletAddress)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          }
        )
      )
      .then(async (response) => {
        const body = (await response.json()) as {
          vaultId?: string;
          artifacts?: Artifact[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Unable to load the vault.");
        }
        return body;
      })
      .then((body) => {
        setError("");
        setVaultId(body.vaultId ?? "");
        setArtifacts(body.artifacts ?? []);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the vault."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [authenticated, getAccessToken, walletAddress]);

  if (!auth.ready) {
    return <div className="empty-state">Loading your Early account...</div>;
  }

  if (!auth.authenticated) {
    return (
      <div className="vault-signin">
        <span>
          <LockKeyhole size={23} />
        </span>
        <h2>Your private discoveries live here.</h2>
        <p>Sign in to open the opaque vault linked to your Early account.</p>
        <button className="button button-dark" type="button" onClick={auth.login}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="vault-identity">
        <span>
          <Fingerprint size={19} />
        </span>
        <div>
          <small>Opaque vault ID</small>
          <code title={vaultId}>{vaultId ? short(vaultId) : "Creating..."}</code>
        </div>
        <p>Public observers cannot map this identifier to your Privy account.</p>
      </div>

      <div className="artifact-list">
        <div className="artifact-list-head">
          <span>Artifact</span>
          <span>Subject</span>
          <span>Ciphertext</span>
          <span>Status</span>
        </div>
        {loading ? <div className="empty-state">Opening encrypted vault...</div> : null}
        {!loading && artifacts.length === 0 ? (
          <div className="empty-state">
            <div>
              <LockKeyhole size={28} />
              <h2>No private artifacts yet</h2>
              <p>Create a proof and choose the private vault path.</p>
              <Link className="button button-dark" href="/proof">
                <Plus size={17} />
                Create proof
              </Link>
            </div>
          </div>
        ) : null}
        {artifacts.map((artifact) => (
          <article className="artifact-row" key={artifact.proof_commitment}>
            <span>{new Date(artifact.created_at).toLocaleDateString()}</span>
            <code title={artifact.subject_hash}>{short(artifact.subject_hash)}</code>
            <code title={artifact.ciphertext_hash}>
              {short(artifact.ciphertext_hash)}
            </code>
            <span className="status-badge">
              <i />
              {artifact.status}
            </span>
            <a
              className="artifact-explorer"
              href={`https://sepolia.etherscan.io/tx/${artifact.zama_transaction_hash}`}
              target="_blank"
              rel="noreferrer"
              aria-label="View vault transaction"
              title="View transaction"
            >
              <ExternalLink size={15} />
            </a>
          </article>
        ))}
      </div>
      {error ? <p className="error-line">{error}</p> : null}
    </>
  );
}
