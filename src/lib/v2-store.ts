import type { EncryptedProofEnvelope } from "./proof-encryption";
import type {
  DiscoveryPlatform,
  ProviderConfiguration,
  VerifiedDiscovery,
} from "./proof-model";
import { hexlify, randomBytes } from "ethers";

export type ProofSessionStatus =
  | "pending"
  | "verifying"
  | "verified"
  | "failed"
  | "finalized";

export type ProofSessionV2 = {
  session_id: string;
  privy_user_id: string;
  wallet_address: string;
  platform: DiscoveryPlatform;
  subject_id: string;
  subject_url: string;
  provider_configuration: ProviderConfiguration;
  provider_hash: string;
  session_nullifier: string;
  request_url: string;
  status_url: string | null;
  status: ProofSessionStatus;
  proof_ciphertext: EncryptedProofEnvelope | null;
  raw_proof_expires_at: string | null;
  verified_discovery: VerifiedDiscovery | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type CreateProofSessionInput = {
  sessionId: string;
  privyUserId: string;
  walletAddress: string;
  platform: DiscoveryPlatform;
  subjectId: string;
  subjectUrl: string;
  provider: ProviderConfiguration;
  sessionNullifier: string;
  requestUrl: string;
  statusUrl?: string;
};

const sessionsTable = "proof_sessions_v2";
const receiptsTable = "chain_receipts_v2";
const vaultIdentitiesTable = "vault_identities_v2";
const confidentialInputsTable = "confidential_inputs_v2";
const campaignsTable = "campaigns_v2";
const evaluationsTable = "evaluations_v2";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function tableUrl(table: string) {
  return `${required("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${table}`;
}

function headers(extra?: HeadersInit) {
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function json<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase request failed with ${response.status}.`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function createProofSession(input: CreateProofSessionInput) {
  const response = await fetch(tableUrl(sessionsTable), {
    method: "POST",
    headers: headers({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      session_id: input.sessionId,
      privy_user_id: input.privyUserId,
      wallet_address: input.walletAddress,
      platform: input.platform,
      subject_id: input.subjectId,
      subject_url: input.subjectUrl,
      provider_configuration: input.provider,
      provider_hash: input.provider.hash,
      session_nullifier: input.sessionNullifier,
      request_url: input.requestUrl,
      status_url: input.statusUrl ?? null,
      status: "pending",
    }),
  });
  await json<null>(response);
}

export async function getProofSession(sessionId: string) {
  const response = await fetch(
    `${tableUrl(sessionsTable)}?session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`,
    { headers: headers() }
  );
  const rows = await json<ProofSessionV2[]>(response);
  return rows[0] ?? null;
}

export async function getOwnedProofSession(sessionId: string, privyUserId: string) {
  const response = await fetch(
    `${tableUrl(sessionsTable)}?session_id=eq.${encodeURIComponent(sessionId)}&privy_user_id=eq.${encodeURIComponent(privyUserId)}&select=*&limit=1`,
    { headers: headers() }
  );
  const rows = await json<ProofSessionV2[]>(response);
  return rows[0] ?? null;
}

export async function claimSessionForVerification(sessionId: string) {
  const response = await fetch(
    `${tableUrl(sessionsTable)}?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.pending`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({ status: "verifying" }),
    }
  );
  const rows = await json<ProofSessionV2[]>(response);
  return rows[0] ?? null;
}

export async function completeProofSession(
  sessionId: string,
  proofCiphertext: EncryptedProofEnvelope,
  verifiedDiscovery: VerifiedDiscovery
) {
  const retentionHours = Number(process.env.RAW_PROOF_RETENTION_HOURS ?? "24");
  const rawProofExpiresAt = new Date(
    Date.now() + Math.max(1, retentionHours) * 60 * 60 * 1000
  ).toISOString();
  const response = await fetch(
    `${tableUrl(sessionsTable)}?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.verifying`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({
        status: "verified",
        proof_ciphertext: proofCiphertext,
        raw_proof_expires_at: rawProofExpiresAt,
        verified_discovery: verifiedDiscovery,
        error_message: null,
        completed_at: new Date().toISOString(),
      }),
    }
  );
  const rows = await json<ProofSessionV2[]>(response);
  if (!rows[0]) throw new Error("The proof session was not in a verifiable state.");
  return rows[0];
}

export async function failProofSession(sessionId: string, errorMessage: string) {
  const response = await fetch(
    `${tableUrl(sessionsTable)}?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.verifying`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({
        status: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      }),
    }
  );
  const rows = await json<ProofSessionV2[]>(response);
  return rows[0] ?? null;
}

export async function finalizeProofSession(sessionId: string) {
  const response = await fetch(
    `${tableUrl(sessionsTable)}?session_id=eq.${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({
        status: "finalized",
        proof_ciphertext: null,
        raw_proof_expires_at: null,
      }),
    }
  );
  const rows = await json<ProofSessionV2[]>(response);
  return rows[0] ?? null;
}

export async function clearExpiredRawProofs() {
  const response = await fetch(
    `${tableUrl(sessionsTable)}?raw_proof_expires_at=lt.${encodeURIComponent(new Date().toISOString())}&proof_ciphertext=not.is.null`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({
        proof_ciphertext: null,
        raw_proof_expires_at: null,
      }),
    }
  );
  return json<ProofSessionV2[]>(response);
}

export async function recordBaseReceipt(input: {
  sessionId: string;
  privyUserId: string;
  chainId: number;
  contractAddress: string;
  transactionHash: string;
  commitment: string;
  status?: "submitted" | "confirmed" | "failed";
}) {
  const response = await fetch(
    `${tableUrl(receiptsTable)}?on_conflict=transaction_hash`,
    {
      method: "POST",
      headers: headers({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify({
        session_id: input.sessionId,
        privy_user_id: input.privyUserId,
        chain_id: input.chainId,
        contract_address: input.contractAddress,
        transaction_hash: input.transactionHash,
        commitment: input.commitment,
        status: input.status ?? "submitted",
        ...(input.status === "confirmed"
          ? { confirmed_at: new Date().toISOString() }
          : {}),
      }),
    }
  );
  const rows = await json<Array<Record<string, unknown>>>(response);
  return rows[0] ?? null;
}

export type VaultIdentityV2 = {
  privy_user_id: string;
  vault_id: `0x${string}`;
  owner_binding: `0x${string}`;
  created_at: string;
};

export async function getOrCreateVaultIdentity(privyUserId: string) {
  const existingResponse = await fetch(
    `${tableUrl(vaultIdentitiesTable)}?privy_user_id=eq.${encodeURIComponent(privyUserId)}&select=*&limit=1`,
    { headers: headers() }
  );
  const existing = await json<VaultIdentityV2[]>(existingResponse);
  if (existing[0]) return existing[0];

  const candidate = {
    privy_user_id: privyUserId,
    vault_id: hexlify(randomBytes(32)),
    owner_binding: hexlify(randomBytes(32)),
  };
  const response = await fetch(
    `${tableUrl(vaultIdentitiesTable)}?on_conflict=privy_user_id`,
    {
      method: "POST",
      headers: headers({
        Prefer: "resolution=ignore-duplicates,return=representation",
      }),
      body: JSON.stringify(candidate),
    }
  );
  const created = await json<VaultIdentityV2[]>(response);
  if (created[0]) return created[0];

  const racedResponse = await fetch(
    `${tableUrl(vaultIdentitiesTable)}?privy_user_id=eq.${encodeURIComponent(privyUserId)}&select=*&limit=1`,
    { headers: headers() }
  );
  const raced = await json<VaultIdentityV2[]>(racedResponse);
  if (!raced[0]) throw new Error("Unable to create an opaque vault identity.");
  return raced[0];
}

export async function recordConfidentialInput(input: {
  sessionId: string;
  privyUserId: string;
  vaultId: string;
  ownerBinding: string;
  proofCommitment: string;
  subjectHash: string;
  ciphertextHash: string;
  nonce: string;
  expiry: number;
  transactionHash: string;
  status: "attested" | "submitted" | "confirmed" | "failed";
}) {
  const response = await fetch(
    `${tableUrl(confidentialInputsTable)}?on_conflict=proof_commitment`,
    {
      method: "POST",
      headers: headers({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify({
        session_id: input.sessionId,
        privy_user_id: input.privyUserId,
        vault_id: input.vaultId,
        owner_binding: input.ownerBinding,
        proof_commitment: input.proofCommitment,
        subject_hash: input.subjectHash,
        ciphertext_hash: input.ciphertextHash,
        nonce: input.nonce,
        expiry: new Date(input.expiry * 1000).toISOString(),
        zama_transaction_hash: input.transactionHash,
        status: input.status,
      }),
    }
  );
  const rows = await json<Array<Record<string, unknown>>>(response);
  return rows[0] ?? null;
}

export async function listConfidentialInputs(privyUserId: string) {
  const response = await fetch(
    `${tableUrl(confidentialInputsTable)}?privy_user_id=eq.${encodeURIComponent(privyUserId)}&select=vault_id,proof_commitment,subject_hash,ciphertext_hash,zama_transaction_hash,status,created_at&order=created_at.desc`,
    { headers: headers() }
  );
  return json<Array<Record<string, unknown>>>(response);
}

export type CampaignV2 = {
  id: string;
  name: string;
  creator_privy_user_id: string;
  creator_wallet: string;
  platform: DiscoveryPlatform;
  subject_id: string;
  subject_url: string;
  subject_hash: string;
  opens_at: string;
  closes_at: string;
  maximum_discovery_minutes: number;
  minimum_interactions: number;
  base_campaign_id: string | null;
  base_transaction_hash: string | null;
  zama_campaign_id: string | null;
  zama_transaction_hash: string | null;
  status: "draft" | "active" | "closed";
  created_at: string;
};

export async function createCampaignRecord(input: {
  name: string;
  privyUserId: string;
  creatorWallet: string;
  platform: DiscoveryPlatform;
  subjectId: string;
  subjectUrl: string;
  subjectHash: string;
  opensAt: number;
  closesAt: number;
  maximumDiscoveryMinutes: number;
  minimumInteractions: number;
  baseCampaignId: string;
  baseTransactionHash: string;
}) {
  const response = await fetch(campaignsTableUrl(), {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({
      name: input.name,
      creator_privy_user_id: input.privyUserId,
      creator_wallet: input.creatorWallet,
      platform: input.platform,
      subject_id: input.subjectId,
      subject_url: input.subjectUrl,
      subject_hash: input.subjectHash,
      opens_at: new Date(input.opensAt * 1000).toISOString(),
      closes_at: new Date(input.closesAt * 1000).toISOString(),
      maximum_discovery_minutes: input.maximumDiscoveryMinutes,
      minimum_interactions: input.minimumInteractions,
      base_campaign_id: input.baseCampaignId,
      base_transaction_hash: input.baseTransactionHash,
      status: "draft",
    }),
  });
  const rows = await json<CampaignV2[]>(response);
  if (!rows[0]) throw new Error("Unable to record the campaign.");
  return rows[0];
}

function campaignsTableUrl() {
  return tableUrl(campaignsTable);
}

export async function activateCampaignRecord(
  id: string,
  zamaCampaignId: string,
  zamaTransactionHash: string
) {
  const response = await fetch(
    `${campaignsTableUrl()}?id=eq.${encodeURIComponent(id)}&status=eq.draft`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({
        zama_campaign_id: zamaCampaignId,
        zama_transaction_hash: zamaTransactionHash,
        status: "active",
      }),
    }
  );
  const rows = await json<CampaignV2[]>(response);
  if (!rows[0]) throw new Error("Unable to activate the campaign.");
  return rows[0];
}

export async function getCampaign(id: string) {
  const response = await fetch(
    `${campaignsTableUrl()}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: headers() }
  );
  const rows = await json<CampaignV2[]>(response);
  return rows[0] ?? null;
}

export async function listCampaigns(status: "active" | "draft" = "active") {
  const response = await fetch(
    `${campaignsTableUrl()}?status=eq.${status}&select=*&order=created_at.desc&limit=100`,
    { headers: headers() }
  );
  return json<CampaignV2[]>(response);
}

export async function recordEvaluation(input: {
  campaignId: string;
  privyUserId: string;
  vaultId: string;
  evaluationId: string;
  zamaTransactionHash: string;
  eligible: boolean;
  nullifier?: string;
  status: "requested" | "evaluated" | "authorized" | "claimed" | "failed";
  baseClaimTransactionHash?: string;
}) {
  const response = await fetch(
    `${tableUrl(evaluationsTable)}?on_conflict=evaluation_id`,
    {
      method: "POST",
      headers: headers({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify({
        campaign_id: input.campaignId,
        privy_user_id: input.privyUserId,
        vault_id: input.vaultId,
        evaluation_id: input.evaluationId,
        zama_transaction_hash: input.zamaTransactionHash,
        public_eligible: input.eligible,
        authorization_nullifier: input.nullifier ?? null,
        base_claim_transaction_hash: input.baseClaimTransactionHash ?? null,
        status: input.status,
      }),
    }
  );
  const rows = await json<Array<Record<string, unknown>>>(response);
  return rows[0] ?? null;
}

export type EvaluationV2 = {
  id: string;
  campaign_id: string;
  privy_user_id: string;
  vault_id: string;
  evaluation_id: string;
  zama_transaction_hash: string;
  public_eligible: boolean | null;
  authorization_nullifier: string | null;
  base_claim_transaction_hash: string | null;
  status: "requested" | "evaluated" | "authorized" | "claimed" | "failed";
};

export async function getOwnedEvaluation(
  evaluationId: string,
  privyUserId: string
) {
  const response = await fetch(
    `${tableUrl(evaluationsTable)}?evaluation_id=eq.${encodeURIComponent(evaluationId)}&privy_user_id=eq.${encodeURIComponent(privyUserId)}&select=*&limit=1`,
    { headers: headers() }
  );
  const rows = await json<EvaluationV2[]>(response);
  return rows[0] ?? null;
}

export async function confirmEvaluationClaim(
  evaluationId: string,
  privyUserId: string,
  transactionHash: string
) {
  const response = await fetch(
    `${tableUrl(evaluationsTable)}?evaluation_id=eq.${encodeURIComponent(evaluationId)}&privy_user_id=eq.${encodeURIComponent(privyUserId)}&status=eq.authorized`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({
        base_claim_transaction_hash: transactionHash,
        status: "claimed",
        updated_at: new Date().toISOString(),
      }),
    }
  );
  const rows = await json<EvaluationV2[]>(response);
  if (!rows[0]) throw new Error("The evaluation was not claimable.");
  return rows[0];
}
