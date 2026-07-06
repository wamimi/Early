// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract EarlyPrivateTaste is ZamaEthereumConfig {
    error DuplicateTasteProof(bytes32 publicCommitment);
    error TasteProofNotFound(bytes32 publicCommitment);

    struct PrivateTasteProof {
        address owner;
        bytes32 proofHash;
        uint32 campaignWindowMinutes;
        euint32 encryptedEarlyDeltaMinutes;
        euint8 tier;
        ebool eligible;
        bool exists;
    }

    mapping(bytes32 publicCommitment => PrivateTasteProof proof) private tasteProofs;

    event PrivateTasteProofSealed(
        address indexed owner,
        bytes32 indexed publicCommitment,
        bytes32 indexed proofHash,
        uint32 campaignWindowMinutes
    );

    function sealTasteProof(
        bytes32 publicCommitment,
        bytes32 proofHash,
        externalEuint32 encryptedEarlyDeltaMinutes,
        bytes calldata inputProof,
        uint32 campaignWindowMinutes
    ) external {
        if (tasteProofs[publicCommitment].exists) {
            revert DuplicateTasteProof(publicCommitment);
        }

        euint32 earlyDeltaMinutes = FHE.fromExternal(encryptedEarlyDeltaMinutes, inputProof);
        ebool firstHour = FHE.le(earlyDeltaMinutes, FHE.asEuint32(60));
        ebool dayOne = FHE.le(earlyDeltaMinutes, FHE.asEuint32(1_440));
        ebool weekOne = FHE.le(earlyDeltaMinutes, FHE.asEuint32(10_080));
        ebool eligible = FHE.le(earlyDeltaMinutes, FHE.asEuint32(campaignWindowMinutes));
        euint8 tier = FHE.select(
            firstHour,
            FHE.asEuint8(4),
            FHE.select(
                dayOne,
                FHE.asEuint8(3),
                FHE.select(weekOne, FHE.asEuint8(2), FHE.select(eligible, FHE.asEuint8(1), FHE.asEuint8(0)))
            )
        );

        FHE.allowThis(earlyDeltaMinutes);
        FHE.allowThis(tier);
        FHE.allowThis(eligible);
        FHE.allow(earlyDeltaMinutes, msg.sender);
        FHE.allow(tier, msg.sender);
        FHE.allow(eligible, msg.sender);
        FHE.makePubliclyDecryptable(tier);
        FHE.makePubliclyDecryptable(eligible);

        tasteProofs[publicCommitment] = PrivateTasteProof({
            owner: msg.sender,
            proofHash: proofHash,
            campaignWindowMinutes: campaignWindowMinutes,
            encryptedEarlyDeltaMinutes: earlyDeltaMinutes,
            tier: tier,
            eligible: eligible,
            exists: true
        });

        emit PrivateTasteProofSealed(msg.sender, publicCommitment, proofHash, campaignWindowMinutes);
    }

    function hasTasteProof(bytes32 publicCommitment) external view returns (bool) {
        return tasteProofs[publicCommitment].exists;
    }

    function getTasteProofMeta(bytes32 publicCommitment)
        external
        view
        returns (address owner, bytes32 proofHash, uint32 campaignWindowMinutes, bool exists)
    {
        PrivateTasteProof storage proof = tasteProofs[publicCommitment];
        return (proof.owner, proof.proofHash, proof.campaignWindowMinutes, proof.exists);
    }

    function getEncryptedEarlyDeltaMinutes(bytes32 publicCommitment) external view returns (euint32) {
        PrivateTasteProof storage proof = tasteProofs[publicCommitment];

        if (!proof.exists) {
            revert TasteProofNotFound(publicCommitment);
        }

        return proof.encryptedEarlyDeltaMinutes;
    }

    function getTasteTier(bytes32 publicCommitment) external view returns (euint8) {
        PrivateTasteProof storage proof = tasteProofs[publicCommitment];

        if (!proof.exists) {
            revert TasteProofNotFound(publicCommitment);
        }

        return proof.tier;
    }

    function getEligibility(bytes32 publicCommitment) external view returns (ebool) {
        PrivateTasteProof storage proof = tasteProofs[publicCommitment];

        if (!proof.exists) {
            revert TasteProofNotFound(publicCommitment);
        }

        return proof.eligible;
    }
}
