import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

describe("EarlyPrivateDiscoveryVault", function () {
  const SUBJECT = ethers.keccak256(ethers.toUtf8Bytes("youtube:video-1"));
  const VAULT_ID = ethers.keccak256(ethers.toUtf8Bytes("opaque-vault-id"));
  const OWNER_BINDING = ethers.keccak256(ethers.toUtf8Bytes("opaque-owner-binding"));

  async function deployFixture() {
    const [owner, attestor, relayer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EarlyPrivateDiscoveryVault");
    const vault = await Factory.deploy(owner.address, attestor.address, relayer.address);
    await vault.waitForDeployment();
    return { vault, owner, attestor, relayer, other };
  }

  async function encryptedAttestation(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    discoveryMinutes: bigint,
    proofCommitment: string,
    nonce: bigint,
    overrides: Partial<{
      ownerBinding: string;
      expiry: bigint;
      domainContract: string;
    }> = {}
  ) {
    const contractAddress = await fixture.vault.getAddress();
    const input = fhevm.createEncryptedInput(contractAddress, fixture.relayer.address);
    input.add32(discoveryMinutes);
    const encrypted = await input.encrypt();
    const block = await ethers.provider.getBlock("latest");
    const expiry = overrides.expiry ?? BigInt((block?.timestamp ?? 0) + 3_600);
    const ownerBinding = overrides.ownerBinding ?? OWNER_BINDING;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const ciphertextHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32"],
        [encrypted.handles[0], ethers.keccak256(encrypted.inputProof)]
      )
    );

    const signature = await fixture.attestor.signTypedData(
      {
        name: "Early Private Discovery Vault",
        version: "2",
        chainId,
        verifyingContract: overrides.domainContract ?? contractAddress,
      },
      {
        ConfidentialInputAttestation: [
          { name: "vaultId", type: "bytes32" },
          { name: "proofCommitment", type: "bytes32" },
          { name: "subjectHash", type: "bytes32" },
          { name: "ciphertextHash", type: "bytes32" },
          { name: "ownerBinding", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "expiry", type: "uint256" },
        ],
      },
      {
        vaultId: VAULT_ID,
        proofCommitment,
        subjectHash: SUBJECT,
        ciphertextHash,
        ownerBinding,
        nonce,
        expiry,
      }
    );

    return { encrypted, expiry, ownerBinding, signature };
  }

  async function register(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    discoveryMinutes: bigint,
    label: string,
    nonce: bigint
  ) {
    const proofCommitment = ethers.keccak256(ethers.toUtf8Bytes(label));
    const signed =
      await encryptedAttestation(fixture, discoveryMinutes, proofCommitment, nonce);
    await fixture.vault.connect(fixture.relayer).registerDiscovery(
      VAULT_ID,
      proofCommitment,
      SUBJECT,
      OWNER_BINDING,
      nonce,
      signed.expiry,
      signed.encrypted.handles[0],
      signed.encrypted.inputProof,
      signed.signature
    );
    return proofCommitment;
  }

  it("accepts only an attestor-bound encrypted discovery input", async function () {
    const fixture = await deployFixture();
    const commitment = await register(fixture, 52n, "proof-1", 1n);
    expect(await fixture.vault.hasVaultArtifact(VAULT_ID, SUBJECT)).to.equal(true);
    expect(await fixture.vault.usedProofCommitments(commitment)).to.equal(true);
  });

  it("rejects a modified ciphertext or input proof", async function () {
    const fixture = await deployFixture();
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("proof-modified"));
    const signed = await encryptedAttestation(fixture, 52n, commitment, 2n);
    const replacement = fhevm.createEncryptedInput(
      await fixture.vault.getAddress(),
      fixture.relayer.address
    );
    replacement.add32(5_000n);
    const modified = await replacement.encrypt();

    await expect(
      fixture.vault.connect(fixture.relayer).registerDiscovery(
        VAULT_ID,
        commitment,
        SUBJECT,
        OWNER_BINDING,
        2n,
        signed.expiry,
        modified.handles[0],
        modified.inputProof,
        signed.signature
      )
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidAttestation");
  });

  it("rejects a changed owner binding", async function () {
    const fixture = await deployFixture();
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("proof-owner"));
    const signed = await encryptedAttestation(fixture, 52n, commitment, 3n);

    await expect(
      fixture.vault.connect(fixture.relayer).registerDiscovery(
        VAULT_ID,
        commitment,
        SUBJECT,
        ethers.keccak256(ethers.toUtf8Bytes("different-owner")),
        3n,
        signed.expiry,
        signed.encrypted.handles[0],
        signed.encrypted.inputProof,
        signed.signature
      )
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidAttestation");
  });

  it("rejects signatures for a different contract domain", async function () {
    const fixture = await deployFixture();
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("proof-domain"));
    const signed = await encryptedAttestation(fixture, 52n, commitment, 4n, {
      domainContract: fixture.other.address,
    });

    await expect(
      fixture.vault.connect(fixture.relayer).registerDiscovery(
        VAULT_ID,
        commitment,
        SUBJECT,
        OWNER_BINDING,
        4n,
        signed.expiry,
        signed.encrypted.handles[0],
        signed.encrypted.inputProof,
        signed.signature
      )
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidAttestation");
  });

  it("rejects expired attestations and duplicate commitments", async function () {
    const fixture = await deployFixture();
    const block = await ethers.provider.getBlock("latest");
    const expiredCommitment = ethers.keccak256(ethers.toUtf8Bytes("proof-expired"));
    const expired = await encryptedAttestation(fixture, 52n, expiredCommitment, 5n, {
      expiry: BigInt((block?.timestamp ?? 0) - 1),
    });
    await expect(
      fixture.vault.connect(fixture.relayer).registerDiscovery(
        VAULT_ID,
        expiredCommitment,
        SUBJECT,
        OWNER_BINDING,
        5n,
        expired.expiry,
        expired.encrypted.handles[0],
        expired.encrypted.inputProof,
        expired.signature
      )
    ).to.be.revertedWithCustomError(fixture.vault, "ExpiredAttestation");

    const commitment = await register(fixture, 52n, "proof-duplicate", 6n);
    const duplicate = await encryptedAttestation(fixture, 40n, commitment, 7n);
    await expect(
      fixture.vault.connect(fixture.relayer).registerDiscovery(
        VAULT_ID,
        commitment,
        SUBJECT,
        OWNER_BINDING,
        7n,
        duplicate.expiry,
        duplicate.encrypted.handles[0],
        duplicate.encrypted.inputProof,
        duplicate.signature
      )
    ).to.be.revertedWithCustomError(fixture.vault, "DuplicateProofCommitment");
  });

  it("aggregates privately and reveals only final eligibility", async function () {
    const fixture = await deployFixture();
    await register(fixture, 90n, "proof-aggregate-1", 8n);
    await register(fixture, 30n, "proof-aggregate-2", 9n);
    await fixture.vault.configureCampaign(SUBJECT, 60, 2, true);

    await fixture.vault.connect(fixture.relayer).requestEligibility(
      VAULT_ID,
      OWNER_BINDING,
      1n
    );
    const evaluationId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [VAULT_ID, 1n])
    );
    const eligibility = await fixture.vault.getEligibility(evaluationId);
    expect(await fhevm.publicDecryptEbool(eligibility)).to.equal(true);

    const [earliest, count] =
      await fixture.vault.getEncryptedVaultArtifact(VAULT_ID, SUBJECT);
    expect(earliest).to.match(/^0x[a-fA-F0-9]{64}$/);
    expect(count).to.match(/^0x[a-fA-F0-9]{64}$/);
    expect(earliest).to.not.equal(30n);
    expect(count).to.not.equal(2n);
  });
});
