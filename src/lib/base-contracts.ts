export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const EARLY_DISCOVERY_REGISTRY_ABI = [
  {
    type: "function",
    name: "verifyAndRegister",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        components: [
          {
            name: "claimInfo",
            type: "tuple",
            components: [
              { name: "provider", type: "string" },
              { name: "parameters", type: "string" },
              { name: "context", type: "string" },
            ],
          },
          {
            name: "signedClaim",
            type: "tuple",
            components: [
              {
                name: "claim",
                type: "tuple",
                components: [
                  { name: "identifier", type: "bytes32" },
                  { name: "owner", type: "address" },
                  { name: "timestampS", type: "uint32" },
                  { name: "epoch", type: "uint32" },
                ],
              },
              { name: "signatures", type: "bytes[]" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "commitment", type: "bytes32" }],
  },
  {
    type: "event",
    name: "DiscoveryRegistered",
    anonymous: false,
    inputs: [
      { indexed: true, name: "commitment", type: "bytes32" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "proofId", type: "bytes32" },
      { indexed: false, name: "platform", type: "bytes32" },
      { indexed: false, name: "subjectHash", type: "bytes32" },
      { indexed: false, name: "contentHash", type: "bytes32" },
      { indexed: false, name: "providerHash", type: "bytes32" },
      { indexed: false, name: "verifiedAt", type: "uint64" },
    ],
  },
] as const;

export const CAMPAIGN_CLAIMS_ABI = [
  {
    type: "function",
    name: "createCampaign",
    stateMutability: "nonpayable",
    inputs: [
      { name: "subjectHash", type: "bytes32" },
      { name: "opensAt", type: "uint64" },
      { name: "closesAt", type: "uint64" },
    ],
    outputs: [{ name: "campaignId", type: "uint256" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "authorization",
        type: "tuple",
        components: [
          { name: "campaignId", type: "uint256" },
          { name: "claimant", type: "address" },
          { name: "evaluationTxHash", type: "bytes32" },
          { name: "nullifier", type: "bytes32" },
          { name: "expiry", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "bridgeSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "CampaignCreated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "campaignId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: true, name: "subjectHash", type: "bytes32" },
      { indexed: false, name: "opensAt", type: "uint64" },
      { indexed: false, name: "closesAt", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "EligibilityClaimed",
    anonymous: false,
    inputs: [
      { indexed: true, name: "campaignId", type: "uint256" },
      { indexed: true, name: "claimant", type: "address" },
      { indexed: true, name: "nullifier", type: "bytes32" },
      { indexed: false, name: "evaluationTxHash", type: "bytes32" },
    ],
  },
] as const;

export function baseRegistryAddress() {
  const address = process.env.NEXT_PUBLIC_BASE_REGISTRY_ADDRESS;
  if (!address) throw new Error("Missing NEXT_PUBLIC_BASE_REGISTRY_ADDRESS.");
  return address;
}

export function baseChainId() {
  return Number(
    process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? BASE_SEPOLIA_CHAIN_ID
  );
}

export function baseCampaignClaimsAddress() {
  const address = process.env.NEXT_PUBLIC_BASE_CAMPAIGN_CLAIMS_ADDRESS;
  if (!address) {
    throw new Error("Missing NEXT_PUBLIC_BASE_CAMPAIGN_CLAIMS_ADDRESS.");
  }
  return address;
}

export function baseExplorerTransaction(transactionHash: string) {
  const root =
    process.env.NEXT_PUBLIC_BASE_EXPLORER_URL ??
    "https://sepolia.basescan.org";
  return `${root.replace(/\/$/, "")}/tx/${transactionHash}`;
}
