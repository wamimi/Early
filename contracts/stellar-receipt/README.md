# Early Stellar Receipt Contract

This Soroban contract stores one privacy-safe Early receipt per `public_commitment`.

It stores:

- the owning Stellar `Address`,
- `public_commitment: BytesN<32>`,
- `proof_hash: BytesN<32>`,
- `platform: Symbol`,
- `content_hash: BytesN<32>`,
- `created_ledger`.

It does not store raw X handles, raw timestamps, raw Reclaim payloads, or full extracted parameters.

## Deploy To Testnet

Install the Stellar CLI and WASM target:

```bash
cargo install --locked stellar-cli
rustup target add wasm32v1-none
```

From this directory:

```bash
stellar keys generate early-deployer --network testnet --fund
stellar keys address early-deployer
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/early_stellar_receipt.wasm \
  --source-account early-deployer \
  --network testnet
```

Copy the printed contract ID into `.env.local` and Vercel:

```bash
STELLAR_RECEIPT_CONTRACT_ID=YOUR_DEPLOYED_CONTRACT_ID
```

The app can then prepare a receipt transaction for the connected wallet, ask the wallet to sign it, submit it through `STELLAR_RPC_URL`, and store the resulting transaction hash in Supabase.

## Local Checks

```bash
cargo test
stellar contract build
```
