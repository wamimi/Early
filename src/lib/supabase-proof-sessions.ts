export type ProofSessionStatus = "pending" | "succeeded" | "failed";

export type ProofSession = {
  session_id: string;
  tweet_id: string;
  tweet_url: string;
  request_url: string;
  status_url: string | null;
  status: ProofSessionStatus;
  proof_payload: unknown | null;
  extracted_parameters: unknown | null;
  proof_artifact: unknown | null;
  error_message: string | null;
  stellar_wallet_address: string | null;
  stellar_network: string | null;
  stellar_contract_id: string | null;
  stellar_receipt_tx_hash: string | null;
  stellar_receipt_status: string | null;
  stellar_receipt_created_at: string | null;
  stellar_verifier_contract_id: string | null;
  stellar_verifier_tx_hash: string | null;
  stellar_verifier_status: string | null;
  stellar_verifier_created_at: string | null;
  stellar_verifier_error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CreateProofSessionInput = {
  sessionId: string;
  tweetId: string;
  tweetUrl: string;
  requestUrl: string;
  statusUrl?: string;
};

export type CompleteProofSessionInput = {
  sessionId: string;
  status: Extract<ProofSessionStatus, "succeeded" | "failed">;
  proofPayload: unknown;
  extractedParameters?: unknown;
  proofArtifact?: unknown;
  errorMessage?: string;
};

export type RecordStellarReceiptInput = {
  sessionId: string;
  walletAddress: string;
  network: string;
  contractId?: string | null;
  txHash?: string | null;
  status: "prepared" | "pending" | "published" | "failed";
};

export type RecordStellarVerifierInput = {
  sessionId: string;
  contractId?: string | null;
  txHash?: string | null;
  status: "prepared" | "pending" | "verified" | "failed";
  errorMessage?: string | null;
};

const tableName = "reclaim_proof_sessions";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local and Vercel environment variables.`);
  }

  return value;
}

function getSupabaseBaseUrl() {
  return `${getRequiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${tableName}`;
}

function getSupabaseHeaders(extra?: HeadersInit) {
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function readSupabaseJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

export async function createProofSession(input: CreateProofSessionInput) {
  const response = await fetch(getSupabaseBaseUrl(), {
    method: "POST",
    headers: getSupabaseHeaders({
      Prefer: "return=minimal"
    }),
    body: JSON.stringify({
      session_id: input.sessionId,
      tweet_id: input.tweetId,
      tweet_url: input.tweetUrl,
      request_url: input.requestUrl,
      status_url: input.statusUrl ?? null,
      status: "pending"
    })
  });

  await readSupabaseJson<null>(response);
}

export async function completeProofSession(input: CompleteProofSessionInput) {
  const response = await fetch(`${getSupabaseBaseUrl()}?session_id=eq.${encodeURIComponent(input.sessionId)}`, {
    method: "PATCH",
    headers: getSupabaseHeaders({
      Prefer: "return=representation"
    }),
    body: JSON.stringify({
      status: input.status,
      proof_payload: input.proofPayload,
      extracted_parameters: input.extractedParameters ?? null,
      proof_artifact: input.proofArtifact ?? null,
      error_message: input.errorMessage ?? null,
      completed_at: new Date().toISOString()
    })
  });

  const rows = await readSupabaseJson<ProofSession[]>(response);

  if (rows.length === 0) {
    throw new Error(`No Reclaim proof session found for ${input.sessionId}.`);
  }

  return rows[0];
}

export async function getProofSession(sessionId: string) {
  const select = [
    "session_id",
    "tweet_id",
    "tweet_url",
    "request_url",
    "status_url",
    "status",
    "extracted_parameters",
    "proof_artifact",
    "error_message",
    "stellar_wallet_address",
    "stellar_network",
    "stellar_contract_id",
    "stellar_receipt_tx_hash",
    "stellar_receipt_status",
    "stellar_receipt_created_at",
    "stellar_verifier_contract_id",
    "stellar_verifier_tx_hash",
    "stellar_verifier_status",
    "stellar_verifier_created_at",
    "stellar_verifier_error_message",
    "created_at",
    "updated_at",
    "completed_at"
  ].join(",");
  const response = await fetch(`${getSupabaseBaseUrl()}?session_id=eq.${encodeURIComponent(sessionId)}&select=${select}&limit=1`, {
    headers: getSupabaseHeaders()
  });
  const rows = await readSupabaseJson<ProofSession[]>(response);

  return rows[0] ?? null;
}

export async function recordStellarReceipt(input: RecordStellarReceiptInput) {
  const response = await fetch(`${getSupabaseBaseUrl()}?session_id=eq.${encodeURIComponent(input.sessionId)}`, {
    method: "PATCH",
    headers: getSupabaseHeaders({
      Prefer: "return=representation"
    }),
    body: JSON.stringify({
      stellar_wallet_address: input.walletAddress,
      stellar_network: input.network,
      stellar_contract_id: input.contractId ?? null,
      stellar_receipt_tx_hash: input.txHash ?? null,
      stellar_receipt_status: input.status,
      stellar_receipt_created_at: new Date().toISOString()
    })
  });
  const rows = await readSupabaseJson<ProofSession[]>(response);

  if (rows.length === 0) {
    throw new Error(`No Reclaim proof session found for ${input.sessionId}.`);
  }

  return rows[0];
}

export async function recordStellarVerifier(input: RecordStellarVerifierInput) {
  const response = await fetch(`${getSupabaseBaseUrl()}?session_id=eq.${encodeURIComponent(input.sessionId)}`, {
    method: "PATCH",
    headers: getSupabaseHeaders({
      Prefer: "return=representation"
    }),
    body: JSON.stringify({
      stellar_verifier_contract_id: input.contractId ?? null,
      stellar_verifier_tx_hash: input.txHash ?? null,
      stellar_verifier_status: input.status,
      stellar_verifier_created_at: new Date().toISOString(),
      stellar_verifier_error_message: input.errorMessage ?? null
    })
  });
  const rows = await readSupabaseJson<ProofSession[]>(response);

  if (rows.length === 0) {
    throw new Error(`No Reclaim proof session found for ${input.sessionId}.`);
  }

  return rows[0];
}
