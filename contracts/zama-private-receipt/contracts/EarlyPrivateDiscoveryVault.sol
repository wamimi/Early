// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { FHE, ebool, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EarlyPrivateDiscoveryVault is ZamaEthereumConfig {
    bytes32 public constant INPUT_ATTESTATION_TYPEHASH = keccak256(
        "ConfidentialInputAttestation(bytes32 vaultId,bytes32 proofCommitment,bytes32 subjectHash,bytes32 ciphertextHash,bytes32 ownerBinding,uint256 nonce,uint256 expiry)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Early Private Discovery Vault");
    bytes32 private constant VERSION_HASH = keccak256("2");

    error Unauthorized();
    error InvalidAddress();
    error ExpiredAttestation();
    error InvalidAttestation();
    error DuplicateProofCommitment();
    error ConsumedNonce();
    error VaultBindingMismatch();
    error VaultArtifactNotFound();
    error InvalidCampaign();
    error DuplicateEvaluation();

    struct VaultArtifact {
        bytes32 ownerBinding;
        euint32 earliestDiscoveryMinutes;
        euint32 qualifyingInteractionCount;
        bool exists;
    }

    struct Campaign {
        bytes32 subjectHash;
        uint32 maximumDiscoveryMinutes;
        uint32 minimumInteractions;
        bool active;
    }

    struct Evaluation {
        ebool eligible;
        bool exists;
    }

    address public owner;
    address public pendingOwner;
    address public attestor;
    address public trustedRelayer;
    uint256 public nextCampaignId = 1;

    mapping(bytes32 => VaultArtifact) private artifacts;
    mapping(uint256 => Campaign) public campaigns;
    mapping(bytes32 => Evaluation) private evaluations;
    mapping(bytes32 => bool) public usedProofCommitments;
    mapping(bytes32 => bool) public consumedNonces;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AttestorChanged(address indexed attestor);
    event TrustedRelayerChanged(address indexed relayer);
    event DiscoveryAccepted(
        bytes32 indexed vaultId,
        bytes32 indexed subjectHash,
        bytes32 indexed proofCommitment
    );
    event CampaignConfigured(
        uint256 indexed campaignId,
        bytes32 indexed subjectHash,
        uint32 maximumDiscoveryMinutes,
        uint32 minimumInteractions,
        bool active
    );
    event EligibilityRequested(
        bytes32 indexed evaluationId, bytes32 indexed vaultId, uint256 indexed campaignId
    );

    constructor(address initialOwner, address initialAttestor, address initialRelayer) {
        if (
            initialOwner == address(0) || initialAttestor == address(0)
                || initialRelayer == address(0)
        ) revert InvalidAddress();
        owner = initialOwner;
        attestor = initialAttestor;
        trustedRelayer = initialRelayer;
        emit OwnershipTransferred(address(0), initialOwner);
        emit AttestorChanged(initialAttestor);
        emit TrustedRelayerChanged(initialRelayer);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != trustedRelayer) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function setAttestor(address newAttestor) external onlyOwner {
        if (newAttestor == address(0)) revert InvalidAddress();
        attestor = newAttestor;
        emit AttestorChanged(newAttestor);
    }

    function setTrustedRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert InvalidAddress();
        trustedRelayer = newRelayer;
        emit TrustedRelayerChanged(newRelayer);
    }

    function configureCampaign(
        bytes32 subjectHash,
        uint32 maximumDiscoveryMinutes,
        uint32 minimumInteractions,
        bool active
    ) external onlyOwner returns (uint256 campaignId) {
        if (subjectHash == bytes32(0) || minimumInteractions == 0) revert InvalidCampaign();
        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign({
            subjectHash: subjectHash,
            maximumDiscoveryMinutes: maximumDiscoveryMinutes,
            minimumInteractions: minimumInteractions,
            active: active
        });
        emit CampaignConfigured(
            campaignId,
            subjectHash,
            maximumDiscoveryMinutes,
            minimumInteractions,
            active
        );
    }

    function registerDiscovery(
        bytes32 vaultId,
        bytes32 proofCommitment,
        bytes32 subjectHash,
        bytes32 ownerBinding,
        uint256 nonce,
        uint256 expiry,
        externalEuint32 encryptedDiscoveryMinutes,
        bytes calldata inputProof,
        bytes calldata attestationSignature
    ) external onlyRelayer {
        if (expiry < block.timestamp) revert ExpiredAttestation();
        if (usedProofCommitments[proofCommitment]) revert DuplicateProofCommitment();

        bytes32 nonceKey = keccak256(abi.encode(ownerBinding, nonce));
        if (consumedNonces[nonceKey]) revert ConsumedNonce();

        bytes32 ciphertextHash = keccak256(
            abi.encode(externalEuint32.unwrap(encryptedDiscoveryMinutes), keccak256(inputProof))
        );
        bytes32 structHash = keccak256(
            abi.encode(
                INPUT_ATTESTATION_TYPEHASH,
                vaultId,
                proofCommitment,
                subjectHash,
                ciphertextHash,
                ownerBinding,
                nonce,
                expiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (_recover(digest, attestationSignature) != attestor) revert InvalidAttestation();

        euint32 discoveryMinutes = FHE.fromExternal(encryptedDiscoveryMinutes, inputProof);
        bytes32 artifactKey = keccak256(abi.encode(vaultId, subjectHash));
        VaultArtifact storage artifact = artifacts[artifactKey];
        if (artifact.exists && artifact.ownerBinding != ownerBinding) {
            revert VaultBindingMismatch();
        }

        if (artifact.exists) {
            artifact.earliestDiscoveryMinutes =
                FHE.min(artifact.earliestDiscoveryMinutes, discoveryMinutes);
            artifact.qualifyingInteractionCount =
                FHE.add(artifact.qualifyingInteractionCount, uint32(1));
        } else {
            artifact.ownerBinding = ownerBinding;
            artifact.earliestDiscoveryMinutes = discoveryMinutes;
            artifact.qualifyingInteractionCount = FHE.asEuint32(1);
            artifact.exists = true;
        }

        FHE.allowThis(artifact.earliestDiscoveryMinutes);
        FHE.allowThis(artifact.qualifyingInteractionCount);

        usedProofCommitments[proofCommitment] = true;
        consumedNonces[nonceKey] = true;
        emit DiscoveryAccepted(vaultId, subjectHash, proofCommitment);
    }

    function requestEligibility(bytes32 vaultId, bytes32 ownerBinding, uint256 campaignId)
        external
        onlyRelayer
        returns (bytes32 evaluationId)
    {
        Campaign memory campaign = campaigns[campaignId];
        if (!campaign.active) revert InvalidCampaign();

        bytes32 artifactKey = keccak256(abi.encode(vaultId, campaign.subjectHash));
        VaultArtifact storage artifact = artifacts[artifactKey];
        if (!artifact.exists) revert VaultArtifactNotFound();
        if (artifact.ownerBinding != ownerBinding) revert VaultBindingMismatch();

        evaluationId = keccak256(abi.encode(vaultId, campaignId));
        if (evaluations[evaluationId].exists) revert DuplicateEvaluation();

        ebool earlyEnough =
            FHE.le(artifact.earliestDiscoveryMinutes, campaign.maximumDiscoveryMinutes);
        ebool enoughInteractions =
            FHE.ge(artifact.qualifyingInteractionCount, campaign.minimumInteractions);
        ebool eligible = FHE.and(earlyEnough, enoughInteractions);

        FHE.allowThis(eligible);
        FHE.makePubliclyDecryptable(eligible);
        evaluations[evaluationId] = Evaluation({ eligible: eligible, exists: true });

        emit EligibilityRequested(evaluationId, vaultId, campaignId);
    }

    function hasVaultArtifact(bytes32 vaultId, bytes32 subjectHash)
        external
        view
        returns (bool)
    {
        return artifacts[keccak256(abi.encode(vaultId, subjectHash))].exists;
    }

    function getEncryptedVaultArtifact(bytes32 vaultId, bytes32 subjectHash)
        external
        view
        returns (euint32 earliestDiscoveryMinutes, euint32 qualifyingInteractionCount)
    {
        VaultArtifact storage artifact = artifacts[keccak256(abi.encode(vaultId, subjectHash))];
        if (!artifact.exists) revert VaultArtifactNotFound();
        return (artifact.earliestDiscoveryMinutes, artifact.qualifyingInteractionCount);
    }

    function getEligibility(bytes32 evaluationId) external view returns (ebool) {
        Evaluation storage evaluation = evaluations[evaluationId];
        if (!evaluation.exists) revert VaultArtifactNotFound();
        return evaluation.eligible;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidAttestation();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidAttestation();
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            revert InvalidAttestation();
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidAttestation();
        return signer;
    }
}
