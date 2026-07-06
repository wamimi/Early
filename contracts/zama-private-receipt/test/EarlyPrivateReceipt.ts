import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

describe("EarlyPrivateTaste", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const EarlyPrivateTaste = await ethers.getContractFactory("EarlyPrivateTaste");
    const receipt = await EarlyPrivateTaste.deploy();
    await receipt.waitForDeployment();

    return { receipt, owner, other };
  }

  it("stores a private taste proof and marks the commitment as used", async function () {
    const { receipt, owner } = await deployFixture();
    const contractAddress = await receipt.getAddress();
    const publicCommitment = ethers.keccak256(ethers.toUtf8Bytes("early-public-commitment"));
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("early-proof-hash"));
    const earlyDeltaMinutes = 52n;
    const campaignWindowMinutes = 10_080n;
    const encryptedInput = fhevm.createEncryptedInput(contractAddress, owner.address);

    encryptedInput.add32(earlyDeltaMinutes);
    const encrypted = await encryptedInput.encrypt();

    await expect(
      receipt.sealTasteProof(
        publicCommitment,
        proofHash,
        encrypted.handles[0],
        encrypted.inputProof,
        campaignWindowMinutes
      )
    )
      .to.emit(receipt, "PrivateTasteProofSealed")
      .withArgs(owner.address, publicCommitment, proofHash, campaignWindowMinutes);

    expect(await receipt.hasTasteProof(publicCommitment)).to.equal(true);

    const [storedOwner, storedProofHash, storedCampaignWindow, exists] = await receipt.getTasteProofMeta(publicCommitment);
    expect(storedOwner).to.equal(owner.address);
    expect(storedProofHash).to.equal(proofHash);
    expect(storedCampaignWindow).to.equal(campaignWindowMinutes);
    expect(exists).to.equal(true);
  });

  it("rejects duplicate public commitments", async function () {
    const { receipt, owner } = await deployFixture();
    const contractAddress = await receipt.getAddress();
    const publicCommitment = ethers.keccak256(ethers.toUtf8Bytes("same-public-commitment"));
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("early-proof-hash"));
    const encryptedInput = fhevm.createEncryptedInput(contractAddress, owner.address);

    encryptedInput.add32(90n);
    const encrypted = await encryptedInput.encrypt();

    await receipt.sealTasteProof(publicCommitment, proofHash, encrypted.handles[0], encrypted.inputProof, 10_080n);

    await expect(
      receipt.sealTasteProof(publicCommitment, proofHash, encrypted.handles[0], encrypted.inputProof, 10_080n)
    )
      .to.be.revertedWithCustomError(receipt, "DuplicateTasteProof")
      .withArgs(publicCommitment);
  });

  it("keeps the early delta and tier accessible only as encrypted handles", async function () {
    const { receipt, owner } = await deployFixture();
    const contractAddress = await receipt.getAddress();
    const publicCommitment = ethers.keccak256(ethers.toUtf8Bytes("handle-check"));
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("early-proof-hash"));
    const encryptedInput = fhevm.createEncryptedInput(contractAddress, owner.address);

    encryptedInput.add32(1_200n);
    const encrypted = await encryptedInput.encrypt();
    await receipt.sealTasteProof(publicCommitment, proofHash, encrypted.handles[0], encrypted.inputProof, 10_080n);

    const encryptedDelta = await receipt.getEncryptedEarlyDeltaMinutes(publicCommitment);
    const tier = await receipt.getTasteTier(publicCommitment);
    const eligibility = await receipt.getEligibility(publicCommitment);

    expect(encryptedDelta).to.not.equal(1_200n);
    expect(tier).to.match(/^0x[a-fA-F0-9]{64}$/);
    expect(eligibility).to.match(/^0x[a-fA-F0-9]{64}$/);
  });
});
