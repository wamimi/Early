# Early Zama Private Taste

This workspace contains the FHEVM contract for Early's private taste computation layer.

Reclaim proves that a user endorsed an X post. Stellar verifies and receipts the public commitment. This contract receives an encrypted early-delta value in minutes, computes a taste tier with Zama, and reveals only the tier/eligibility result without publishing the exact timing or X identity on-chain.

## Install

```bash
cd contracts/zama-private-receipt
pnpm install
```

## Test

```bash
pnpm test
```

## Deploy To Sepolia

```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
pnpm deploy:sepolia
```

After deployment, copy the contract address into the app:

```bash
NEXT_PUBLIC_ZAMA_CONTRACT_ADDRESS=
```

The contract stores only commitment-style metadata and encrypted handles. It does not store raw X handles, raw reply timestamps, or full Reclaim proof payloads.
