# Early Base Contracts

`EarlyDiscoveryRegistry` atomically verifies a Reclaim proof and registers a
minimal receipt. `CampaignClaims` consumes an expiring EIP-712 eligibility
authorization exactly once.

## Test

```bash
forge test -vv
```

## Build

```bash
forge build
```

## Deploy

Run `pnpm build:base` from the repository root, then:

```bash
BASE_RPC_URL=... \
BASE_DEPLOYER_PRIVATE_KEY=... \
EARLY_BRIDGE_SIGNER_ADDRESS=... \
pnpm deploy:base
```

The deployment script writes `deployments/base-sepolia.json`. Verify
`EarlyDiscoveryRegistry`, `CampaignClaims`, `OwnedPausable`, `ProofFields`, and
the Reclaim interface source on Basescan after deployment.
