import {
  AbiCoder,
  Interface,
  JsonRpcProvider,
  getAddress,
  isHexString,
  keccak256,
} from "ethers";

export const EARLY_PRIVATE_DISCOVERY_VAULT_ABI = [
  {
    type: "event",
    name: "DiscoveryAccepted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "vaultId", type: "bytes32" },
      { indexed: true, name: "subjectHash", type: "bytes32" },
      { indexed: true, name: "proofCommitment", type: "bytes32" },
    ],
  },
] as const;

export type AttestedVaultRegistration = {
  vaultId: `0x${string}`;
  ownerBinding: `0x${string}`;
  proofCommitment: `0x${string}`;
  subjectHash: `0x${string}`;
  ciphertextHash: `0x${string}`;
  nonce: string;
  expiry: number;
  transactionHash: `0x${string}`;
  attestor: `0x${string}`;
};

const coder = AbiCoder.defaultAbiCoder();

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function bytes32(value: unknown, label: string) {
  if (typeof value !== "string" || !isHexString(value, 32)) {
    throw new Error(`The attestor returned an invalid ${label}.`);
  }
  return value.toLowerCase() as `0x${string}`;
}

export async function requestAttestedVaultRegistration(input: {
  proofPayload: unknown;
  providerId: string;
  providerVersion: string;
  vaultId: string;
  ownerBinding: string;
  expectedProofCommitment: string;
  expectedSubjectHash: string;
}) {
  const response = await fetch(
    `${required("EARLY_ATTESTOR_SERVICE_URL").replace(/\/$/, "")}/v1/discoveries`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${required("EARLY_ATTESTOR_SERVICE_TOKEN")}`,
      },
      body: JSON.stringify({
        proof: input.proofPayload,
        provider: {
          id: input.providerId,
          version: input.providerVersion,
        },
        vaultId: input.vaultId,
        ownerBinding: input.ownerBinding,
        expectedProofCommitment: input.expectedProofCommitment,
        expectedSubjectHash: input.expectedSubjectHash,
        chainId: Number(process.env.NEXT_PUBLIC_ZAMA_CHAIN_ID ?? "11155111"),
        contractAddress: required("NEXT_PUBLIC_ZAMA_VAULT_ADDRESS"),
      }),
    }
  );
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The Early attestor rejected this proof."
    );
  }

  const registration: AttestedVaultRegistration = {
    vaultId: bytes32(payload.vaultId, "vault ID"),
    ownerBinding: bytes32(payload.ownerBinding, "owner binding"),
    proofCommitment: bytes32(payload.proofCommitment, "proof commitment"),
    subjectHash: bytes32(payload.subjectHash, "subject hash"),
    ciphertextHash: bytes32(payload.ciphertextHash, "ciphertext hash"),
    nonce:
      typeof payload.nonce === "string" && /^\d+$/.test(payload.nonce)
        ? payload.nonce
        : (() => {
            throw new Error("The attestor returned an invalid nonce.");
          })(),
    expiry:
      typeof payload.expiry === "number" && Number.isSafeInteger(payload.expiry)
        ? payload.expiry
        : (() => {
            throw new Error("The attestor returned an invalid expiry.");
          })(),
    transactionHash:
      typeof payload.transactionHash === "string" &&
      isHexString(payload.transactionHash, 32)
        ? (payload.transactionHash as `0x${string}`)
        : (() => {
            throw new Error("The attestor did not return a relayed transaction.");
          })(),
    attestor:
      typeof payload.attestor === "string"
        ? (getAddress(payload.attestor) as `0x${string}`)
        : (() => {
            throw new Error("The attestor identity is missing.");
          })(),
  };

  if (
    registration.vaultId !== input.vaultId.toLowerCase() ||
    registration.ownerBinding !== input.ownerBinding.toLowerCase() ||
    registration.proofCommitment !==
      input.expectedProofCommitment.toLowerCase() ||
    registration.subjectHash !== input.expectedSubjectHash.toLowerCase()
  ) {
    throw new Error("The attestor response is not bound to this Early session.");
  }

  return registration;
}

export async function confirmVaultRegistration(
  registration: AttestedVaultRegistration
) {
  const provider = new JsonRpcProvider(required("ZAMA_RPC_URL"));
  const expectedChainId = Number(
    process.env.NEXT_PUBLIC_ZAMA_CHAIN_ID ?? "11155111"
  );
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error("ZAMA_RPC_URL is connected to the wrong chain.");
  }

  const receipt = await provider.waitForTransaction(
    registration.transactionHash,
    1,
    90_000
  );
  if (!receipt || receipt.status !== 1) {
    throw new Error("The relayed Zama vault transaction was not confirmed.");
  }
  if (
    getAddress(receipt.to ?? "") !==
    getAddress(required("NEXT_PUBLIC_ZAMA_VAULT_ADDRESS"))
  ) {
    throw new Error("The relayed transaction did not call the Early vault.");
  }

  const contractInterface = new Interface(
    EARLY_PRIVATE_DISCOVERY_VAULT_ABI
  );
  const event = receipt.logs
    .map((log) => {
      try {
        return contractInterface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((candidate) => candidate?.name === "DiscoveryAccepted");

  if (
    !event ||
    event.args.vaultId.toLowerCase() !== registration.vaultId ||
    event.args.subjectHash.toLowerCase() !== registration.subjectHash ||
    event.args.proofCommitment.toLowerCase() !==
      registration.proofCommitment
  ) {
    throw new Error("The Zama transaction emitted an unexpected vault artifact.");
  }

  return receipt;
}

export function ciphertextCommitment(
  encryptedHandle: string,
  inputProof: string
) {
  return keccak256(
    coder.encode(
      ["bytes32", "bytes32"],
      [encryptedHandle, keccak256(inputProof)]
    )
  );
}
