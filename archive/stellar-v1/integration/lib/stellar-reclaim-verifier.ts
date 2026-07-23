import {
  BASE_FEE,
  Contract,
  TimeoutInfinite,
  TransactionBuilder,
  rpc
} from "@stellar/stellar-sdk";
import { createReclaimOnchainProof, reclaimOnchainProofToScVals, type ReclaimOnchainProof } from "@/lib/reclaim-onchain-proof";
import {
  assertValidStellarAddress,
  getStellarExplorerUrl,
  getStellarNetworkPassphrase,
  getStellarRpcUrl
} from "@/lib/stellar-receipt";

export type StellarReclaimVerifierPayload = {
  owner: string;
  network: "testnet";
  networkPassphrase: string;
  contractId: string;
  functionName: string;
  onchainProof: ReclaimOnchainProof;
};

export type StellarReclaimVerifierPreparation = {
  verifier: StellarReclaimVerifierPayload;
  unsignedXdr: string;
  message: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Missing ${name}. Add it to .env.local and Vercel environment variables.`);
  }

  return value.trim();
}

async function waitForStellarTransaction(server: rpc.Server, hash: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await server.getTransaction(hash);

    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return result;
    }

    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Stellar verifier transaction failed after submission: ${hash}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Stellar verifier transaction is still pending: ${hash}`);
}

export function createStellarReclaimVerifierPayload(proofPayload: unknown, walletAddress: string): StellarReclaimVerifierPayload {
  assertValidStellarAddress(walletAddress);

  return {
    owner: walletAddress,
    network: "testnet",
    networkPassphrase: getStellarNetworkPassphrase(),
    contractId: getRequiredEnv("STELLAR_RECLAIM_VERIFIER_CONTRACT_ID"),
    functionName: process.env.STELLAR_RECLAIM_VERIFIER_FUNCTION_NAME?.trim() || "verify_proof",
    onchainProof: createReclaimOnchainProof(proofPayload)
  };
}

export async function prepareStellarReclaimVerifierTransaction(
  verifier: StellarReclaimVerifierPayload
): Promise<StellarReclaimVerifierPreparation> {
  const server = new rpc.Server(getStellarRpcUrl());
  const account = await server.getAccount(verifier.owner);
  const contract = new Contract(verifier.contractId);
  const scVals = reclaimOnchainProofToScVals(verifier.onchainProof);
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: verifier.networkPassphrase
  })
    .addOperation(
      contract.call(
        verifier.functionName,
        scVals.messageDigest,
        scVals.signature,
        scVals.recoveryId
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const preparedTransaction = await server.prepareTransaction(transaction);

  return {
    verifier,
    unsignedXdr: preparedTransaction.toXDR(),
    message: "Reclaim verifier transaction prepared. Sign with the connected Stellar wallet to verify the proof on-chain."
  };
}

export async function submitSignedStellarReclaimVerifier(signedXdr: string) {
  const server = new rpc.Server(getStellarRpcUrl());
  const transaction = TransactionBuilder.fromXDR(signedXdr, getStellarNetworkPassphrase());
  const result = await server.sendTransaction(transaction);

  if (result.status === "ERROR") {
    throw new Error(result.errorResult?.toXDR("base64") ?? "Stellar Reclaim verifier transaction failed.");
  }

  await waitForStellarTransaction(server, result.hash);

  return {
    txHash: result.hash,
    status: "SUCCESS",
    explorerUrl: getStellarExplorerUrl(result.hash)
  };
}
