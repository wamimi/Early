# Early Private Discovery Vault

The FHEVM vault stores encrypted earliest-discovery time and qualifying
interaction count under opaque vault identifiers. Public campaign rules evaluate
the encrypted history and make only eligibility publicly decryptable.

The trusted relayer can register only inputs carrying a valid attestor EIP-712
signature. The signature binds ciphertext, proof commitment, subject, opaque
owner, nonce, expiry, chain, and contract.

```bash
pnpm install
pnpm test
pnpm deploy:sepolia
```

Set `EARLY_ATTESTOR_ADDRESS` and `EARLY_RELAYER_ADDRESS` to separately managed
KMS-backed identities before deployment.
