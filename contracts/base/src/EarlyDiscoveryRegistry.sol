// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IReclaimVerifier, ReclaimTypes } from "./interfaces/IReclaimVerifier.sol";
import { ProofFields } from "./lib/ProofFields.sol";
import { OwnedPausable } from "./security/OwnedPausable.sol";

contract EarlyDiscoveryRegistry is OwnedPausable {
    using ProofFields for string;

    bytes32 public constant PLATFORM_X = keccak256("x");
    bytes32 public constant PLATFORM_YOUTUBE = keccak256("youtube");
    bytes32 public constant RECEIPT_DOMAIN = keccak256("early.public-receipt/v2");

    error InvalidVerifier();
    error WalletContextMismatch();
    error ClaimOwnerMismatch();
    error ProviderNotAllowed();
    error SchemaVersionMismatch();
    error InvalidPlatformClaim();
    error DuplicateProof();
    error DuplicateSession();
    error DuplicateCommitment();

    struct ProviderConfiguration {
        bytes32 platform;
        uint16 schemaVersion;
        bool enabled;
    }

    struct PublicReceipt {
        address owner;
        bytes32 proofId;
        bytes32 platform;
        bytes32 subjectHash;
        bytes32 contentHash;
        bytes32 providerHash;
        uint64 verifiedAt;
    }

    IReclaimVerifier public immutable reclaimVerifier;

    mapping(bytes32 => ProviderConfiguration) public providerConfigurations;
    mapping(bytes32 => PublicReceipt) private receipts;
    mapping(bytes32 => bool) public usedProofIds;
    mapping(bytes32 => bool) public usedSessionNullifiers;
    mapping(bytes32 => bool) public usedCommitments;

    event ProviderConfigurationSet(
        bytes32 indexed providerHash, bytes32 indexed platform, uint16 schemaVersion, bool enabled
    );
    event DiscoveryRegistered(
        bytes32 indexed commitment,
        address indexed owner,
        bytes32 indexed proofId,
        bytes32 platform,
        bytes32 subjectHash,
        bytes32 contentHash,
        bytes32 providerHash,
        uint64 verifiedAt
    );

    constructor(address verifier, address initialOwner) OwnedPausable(initialOwner) {
        if (verifier == address(0)) revert InvalidVerifier();
        reclaimVerifier = IReclaimVerifier(verifier);
    }

    function setProviderConfiguration(
        bytes32 providerHash,
        bytes32 platform,
        uint16 schemaVersion,
        bool enabled
    ) external onlyOwner {
        if (providerHash == bytes32(0) || platform == bytes32(0)) revert ProviderNotAllowed();
        providerConfigurations[providerHash] =
            ProviderConfiguration({ platform: platform, schemaVersion: schemaVersion, enabled: enabled });
        emit ProviderConfigurationSet(providerHash, platform, schemaVersion, enabled);
    }

    function verifyAndRegister(ReclaimTypes.Proof calldata proof)
        external
        whenNotPaused
        returns (bytes32 commitment)
    {
        reclaimVerifier.verifyProof(proof);

        string memory claimDocument =
            string.concat(proof.claimInfo.context, proof.claimInfo.parameters);
        address contextAddress = claimDocument.addressField("contextAddress");
        if (contextAddress != msg.sender) revert WalletContextMismatch();
        if (proof.signedClaim.claim.owner != msg.sender) revert ClaimOwnerMismatch();

        bytes32 providerHash = claimDocument.bytes32Field("providerConfigHash");
        ProviderConfiguration memory provider = providerConfigurations[providerHash];
        if (!provider.enabled) revert ProviderNotAllowed();

        uint256 schemaVersion = claimDocument.uintField("schemaVersion");
        if (schemaVersion != provider.schemaVersion) revert SchemaVersionMismatch();

        bytes32 platform = keccak256(bytes(claimDocument.stringField("platform")));
        if (platform != provider.platform) revert InvalidPlatformClaim();

        string memory subject = claimDocument.stringField("subjectId");
        bytes32 sessionNullifier = claimDocument.bytes32Field("sessionNullifier");
        string memory content = _enforcePlatformRules(platform, claimDocument, subject);

        bytes32 proofId = proof.signedClaim.claim.identifier;
        if (usedProofIds[proofId]) revert DuplicateProof();
        if (usedSessionNullifiers[sessionNullifier]) revert DuplicateSession();

        bytes32 subjectHash = keccak256(bytes(subject));
        bytes32 contentHash = keccak256(bytes(content));
        commitment = keccak256(
            abi.encode(
                RECEIPT_DOMAIN,
                block.chainid,
                address(this),
                msg.sender,
                proofId,
                platform,
                subjectHash,
                contentHash,
                providerHash
            )
        );
        if (usedCommitments[commitment]) revert DuplicateCommitment();

        usedProofIds[proofId] = true;
        usedSessionNullifiers[sessionNullifier] = true;
        usedCommitments[commitment] = true;
        receipts[commitment] = PublicReceipt({
            owner: msg.sender,
            proofId: proofId,
            platform: platform,
            subjectHash: subjectHash,
            contentHash: contentHash,
            providerHash: providerHash,
            verifiedAt: uint64(block.timestamp)
        });

        emit DiscoveryRegistered(
            commitment,
            msg.sender,
            proofId,
            platform,
            subjectHash,
            contentHash,
            providerHash,
            uint64(block.timestamp)
        );
    }

    function getReceipt(bytes32 commitment) external view returns (PublicReceipt memory) {
        return receipts[commitment];
    }

    function _enforcePlatformRules(
        bytes32 platform,
        string memory document,
        string memory subject
    ) private pure returns (string memory content) {
        if (platform == PLATFORM_X) {
            if (!document.boolField("liked") || !document.boolField("replied")) {
                revert InvalidPlatformClaim();
            }
            string memory replyToSubject = document.stringField("replyToSubjectId");
            if (keccak256(bytes(replyToSubject)) != keccak256(bytes(subject))) {
                revert InvalidPlatformClaim();
            }
            content = document.stringField("replyId");
            document.uintField("replyTimestamp");
            return content;
        }

        if (platform == PLATFORM_YOUTUBE) {
            if (!document.boolField("commented") || !document.boolField("engaged")) {
                revert InvalidPlatformClaim();
            }
            string memory videoId = document.stringField("videoId");
            if (keccak256(bytes(videoId)) != keccak256(bytes(subject))) {
                revert InvalidPlatformClaim();
            }
            content = document.stringField("commentId");
            document.uintField("commentTimestamp");
            return content;
        }

        revert InvalidPlatformClaim();
    }
}
