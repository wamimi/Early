import { createHash } from "node:crypto";
import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  StrKey,
  TimeoutInfinite,
  TransactionBuilder,
  nativeToScVal,
  rpc
} from "@stellar/stellar-sdk";

type JsonRecord = Record<string, unknown>;

export type StellarReceiptPayload = {
  owner: string;
  network: "testnet";
  networkPassphrase: string;
  contractId: string | null;
  platform: "x";
  publicCommitment: string;
  publicCommitmentHex: string;
  proofHash: string;
  proofHashHex: string;
  contentHashHex: string;
};

export type StellarReceiptPreparation = {
  contractConfigured: boolean;
  receipt: StellarReceiptPayload;
  unsignedXdr: string | null;
  message: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOptionalEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function getStellarNetworkPassphrase() {
  return process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
}

export function getStellarRpcUrl() {
  return process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
}

export function getStellarExplorerUrl(txHash: string) {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

function sha256Hex(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function unwrapSha256(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} is missing from the proof artifact.`);
  }

  const hex = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;

  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Error(`${label} must be a sha256 hex digest.`);
  }

  return hex.toLowerCase();
}

function hexToBytes(hex: string) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function assertValidStellarAddress(walletAddress: string) {
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new Error("Connect a valid Stellar public key before publishing a receipt.");
  }
}

export function createStellarReceiptPayload(proofArtifact: unknown, walletAddress: string): StellarReceiptPayload {
  assertValidStellarAddress(walletAddress);

  if (!isRecord(proofArtifact)) {
    throw new Error("A successful Early proof artifact is required before publishing a Stellar receipt.");
  }

  const publicCommitment = proofArtifact.publicCommitment;
  const proofHash = proofArtifact.proofHash;
  const platform = proofArtifact.platform === "x" ? "x" : null;

  if (!platform) {
    throw new Error("Only X proof artifacts are supported in this receipt milestone.");
  }

  const publicCommitmentHex = unwrapSha256(publicCommitment, "publicCommitment");
  const proofHashHex = unwrapSha256(proofHash, "proofHash");
  const contentHashHex = sha256Hex({
    platform,
    parentContentId: proofArtifact.parentContentId ?? null
  });

  return {
    owner: walletAddress,
    network: "testnet",
    networkPassphrase: getStellarNetworkPassphrase(),
    contractId: getOptionalEnv("STELLAR_RECEIPT_CONTRACT_ID"),
    platform,
    publicCommitment: String(publicCommitment),
    publicCommitmentHex,
    proofHash: String(proofHash),
    proofHashHex,
    contentHashHex
  };
}

export async function prepareStellarReceiptTransaction(receipt: StellarReceiptPayload): Promise<StellarReceiptPreparation> {
  if (!receipt.contractId) {
    return {
      contractConfigured: false,
      receipt,
      unsignedXdr: null,
      message: "Receipt payload is ready. Set STELLAR_RECEIPT_CONTRACT_ID after deploying the Soroban receipt contract to enable on-chain publishing."
    };
  }

  const server = new rpc.Server(getStellarRpcUrl());
  const account = await server.getAccount(receipt.owner);
  const contract = new Contract(receipt.contractId);
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: receipt.networkPassphrase
  })
    .addOperation(
      contract.call(
        "publish_receipt",
        new Address(receipt.owner).toScVal(),
        nativeToScVal(hexToBytes(receipt.publicCommitmentHex)),
        nativeToScVal(hexToBytes(receipt.proofHashHex)),
        nativeToScVal(receipt.platform, { type: "symbol" }),
        nativeToScVal(hexToBytes(receipt.contentHashHex))
      )
    )
    .setTimeout(TimeoutInfinite)
    .build();
  const preparedTransaction = await server.prepareTransaction(transaction);

  return {
    contractConfigured: true,
    receipt,
    unsignedXdr: preparedTransaction.toXDR(),
    message: "Receipt transaction prepared. Sign with the connected Stellar wallet to publish on testnet."
  };
}

export async function submitSignedStellarReceipt(signedXdr: string) {
  const server = new rpc.Server(getStellarRpcUrl());
  const transaction = TransactionBuilder.fromXDR(signedXdr, getStellarNetworkPassphrase());
  const result = await server.sendTransaction(transaction);

  if (result.status === "ERROR") {
    throw new Error(result.errorResult?.toXDR("base64") ?? "Stellar receipt transaction failed.");
  }

  return {
    txHash: result.hash,
    status: result.status,
    explorerUrl: getStellarExplorerUrl(result.hash)
  };
}
