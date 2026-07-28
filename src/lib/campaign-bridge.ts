import {
  Contract,
  Interface,
  JsonRpcProvider,
  getAddress,
  isHexString,
  verifyTypedData,
} from "ethers";
import {
  CAMPAIGN_CLAIMS_ABI,
  baseCampaignClaimsAddress,
  baseChainId,
} from "./base-contracts";

const ZAMA_CAMPAIGN_ABI = [
  {
    type: "event",
    name: "CampaignConfigured",
    anonymous: false,
    inputs: [
      { indexed: true, name: "campaignId", type: "uint256" },
      { indexed: true, name: "subjectHash", type: "bytes32" },
      {
        indexed: false,
        name: "maximumDiscoveryMinutes",
        type: "uint32",
      },
      { indexed: false, name: "minimumInteractions", type: "uint32" },
      { indexed: false, name: "active", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "EligibilityRequested",
    anonymous: false,
    inputs: [
      { indexed: true, name: "evaluationId", type: "bytes32" },
      { indexed: true, name: "vaultId", type: "bytes32" },
      { indexed: true, name: "campaignId", type: "uint256" },
    ],
  },
] as const;

export type EligibilityResult = {
  eligible: boolean;
  evaluationId: `0x${string}`;
  evaluationTransaction: `0x${string}`;
  authorization?: {
    campaignId: string;
    claimant: `0x${string}`;
    evaluationTxHash: `0x${string}`;
    nullifier: `0x${string}`;
    expiry: number;
  };
  signature?: `0x${string}`;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function bridgeHeaders() {
  return {
    Authorization: `Bearer ${required("EARLY_BRIDGE_SERVICE_TOKEN")}`,
    "Content-Type": "application/json",
  };
}

async function bridgeRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(
    `${required("EARLY_BRIDGE_SERVICE_URL").replace(/\/$/, "")}${path}`,
    {
      method: "POST",
      headers: bridgeHeaders(),
      body: JSON.stringify(body),
    }
  );
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The Early bridge service rejected this request."
    );
  }
  return payload;
}

function bytes32(value: unknown, label: string) {
  if (typeof value !== "string" || !isHexString(value, 32)) {
    throw new Error(`The bridge returned an invalid ${label}.`);
  }
  return value.toLowerCase() as `0x${string}`;
}

function transactionHash(value: unknown, label: string) {
  return bytes32(value, label);
}

async function zamaReceipt(transaction: string) {
  const provider = new JsonRpcProvider(required("ZAMA_RPC_URL"));
  const expectedChain = Number(
    process.env.NEXT_PUBLIC_ZAMA_CHAIN_ID ?? "11155111"
  );
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== expectedChain) {
    throw new Error("ZAMA_RPC_URL is connected to the wrong chain.");
  }
  const receipt = await provider.waitForTransaction(transaction, 1, 90_000);
  if (!receipt || receipt.status !== 1) {
    throw new Error("The bridge transaction was not confirmed on Zama.");
  }
  if (
    getAddress(receipt.to ?? "") !==
    getAddress(required("NEXT_PUBLIC_ZAMA_VAULT_ADDRESS"))
  ) {
    throw new Error("The bridge transaction did not call the Early vault.");
  }
  return receipt;
}

export async function configurePrivateCampaign(input: {
  baseCampaignId: string;
  subjectHash: string;
  maximumDiscoveryMinutes: number;
  minimumInteractions: number;
}) {
  const payload = await bridgeRequest("/v1/campaigns", {
    ...input,
    baseChainId: baseChainId(),
    baseContractAddress: baseCampaignClaimsAddress(),
    zamaChainId: Number(
      process.env.NEXT_PUBLIC_ZAMA_CHAIN_ID ?? "11155111"
    ),
    zamaContractAddress: required("NEXT_PUBLIC_ZAMA_VAULT_ADDRESS"),
  });
  const zamaCampaignId =
    typeof payload.zamaCampaignId === "string" &&
    /^\d+$/.test(payload.zamaCampaignId)
      ? payload.zamaCampaignId
      : (() => {
          throw new Error("The bridge returned an invalid Zama campaign ID.");
        })();
  const zamaTransactionHash = transactionHash(
    payload.transactionHash,
    "campaign transaction"
  );
  const receipt = await zamaReceipt(zamaTransactionHash);
  const contractInterface = new Interface(ZAMA_CAMPAIGN_ABI);
  const event = receipt.logs
    .map((log) => {
      try {
        return contractInterface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((candidate) => candidate?.name === "CampaignConfigured");

  if (
    !event ||
    event.args.campaignId.toString() !== zamaCampaignId ||
    event.args.subjectHash.toLowerCase() !== input.subjectHash.toLowerCase() ||
    Number(event.args.maximumDiscoveryMinutes) !==
      input.maximumDiscoveryMinutes ||
    Number(event.args.minimumInteractions) !== input.minimumInteractions ||
    event.args.active !== true
  ) {
    throw new Error("The Zama campaign transaction does not match the rule.");
  }

  return { zamaCampaignId, zamaTransactionHash };
}

export async function evaluatePrivateCampaign(input: {
  baseCampaignId: string;
  zamaCampaignId: string;
  claimant: string;
  vaultId: string;
  ownerBinding: string;
}): Promise<EligibilityResult> {
  const payload = await bridgeRequest("/v1/evaluations", {
    ...input,
    baseChainId: baseChainId(),
    baseContractAddress: baseCampaignClaimsAddress(),
    zamaChainId: Number(
      process.env.NEXT_PUBLIC_ZAMA_CHAIN_ID ?? "11155111"
    ),
    zamaContractAddress: required("NEXT_PUBLIC_ZAMA_VAULT_ADDRESS"),
  });

  const evaluationId = bytes32(payload.evaluationId, "evaluation ID");
  const evaluationTransaction = transactionHash(
    payload.evaluationTransaction,
    "evaluation transaction"
  );
  if (typeof payload.eligible !== "boolean" || payload.gatewayVerified !== true) {
    throw new Error("The bridge did not return a verified decryption result.");
  }

  const result: EligibilityResult = {
    eligible: payload.eligible,
    evaluationId,
    evaluationTransaction,
  };

  const receipt = await zamaReceipt(evaluationTransaction);
  const zamaInterface = new Interface(ZAMA_CAMPAIGN_ABI);
  const requested = receipt.logs
    .map((log) => {
      try {
        return zamaInterface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((candidate) => candidate?.name === "EligibilityRequested");
  if (
    !requested ||
    requested.args.evaluationId.toLowerCase() !== evaluationId ||
    requested.args.vaultId.toLowerCase() !== input.vaultId.toLowerCase() ||
    requested.args.campaignId.toString() !== input.zamaCampaignId
  ) {
    throw new Error("The Zama evaluation transaction is not bound to this vault.");
  }

  if (!result.eligible) return result;

  const authorization = payload.authorization as
    | Record<string, unknown>
    | undefined;
  if (!authorization) throw new Error("The bridge omitted the authorization.");
  result.authorization = {
      campaignId:
        typeof authorization.campaignId === "string" &&
        /^\d+$/.test(authorization.campaignId)
          ? authorization.campaignId
          : (() => {
              throw new Error("The bridge returned an invalid campaign ID.");
            })(),
      claimant: getAddress(String(authorization.claimant)) as `0x${string}`,
      evaluationTxHash: bytes32(
        authorization.evaluationTxHash,
        "evaluation hash"
      ),
      nullifier: bytes32(authorization.nullifier, "claim nullifier"),
      expiry:
        typeof authorization.expiry === "number" &&
        Number.isSafeInteger(authorization.expiry)
          ? authorization.expiry
          : (() => {
              throw new Error("The bridge returned an invalid expiry.");
            })(),
  };
  result.signature =
    typeof payload.signature === "string" && isHexString(payload.signature)
      ? (payload.signature as `0x${string}`)
      : (() => {
          throw new Error("The bridge returned an invalid signature.");
        })();

  if (
    result.authorization.campaignId !== input.baseCampaignId ||
    result.authorization.claimant !== getAddress(input.claimant) ||
    result.authorization.evaluationTxHash !== evaluationTransaction ||
    result.authorization.expiry <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("The eligibility authorization is invalid.");
  }

  const baseProvider = new JsonRpcProvider(required("BASE_RPC_URL"));
  const claims = new Contract(
    baseCampaignClaimsAddress(),
    CAMPAIGN_CLAIMS_ABI,
    baseProvider
  );
  const bridgeSigner = getAddress(await claims.bridgeSigner());
  const recovered = getAddress(
    verifyTypedData(
      {
        name: "Early Campaign Claims",
        version: "2",
        chainId: baseChainId(),
        verifyingContract: baseCampaignClaimsAddress(),
      },
      {
        EligibilityAuthorization: [
          { name: "campaignId", type: "uint256" },
          { name: "claimant", type: "address" },
          { name: "evaluationTxHash", type: "bytes32" },
          { name: "nullifier", type: "bytes32" },
          { name: "expiry", type: "uint256" },
        ],
      },
      result.authorization,
      result.signature
    )
  );
  if (recovered !== bridgeSigner) {
    throw new Error("The eligibility authorization has an unknown signer.");
  }

  return result;
}
