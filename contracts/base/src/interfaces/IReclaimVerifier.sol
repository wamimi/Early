// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

library ReclaimTypes {
    struct CompleteClaimData {
        bytes32 identifier;
        address owner;
        uint32 timestampS;
        uint32 epoch;
    }

    struct ClaimInfo {
        string provider;
        string parameters;
        string context;
    }

    struct SignedClaim {
        CompleteClaimData claim;
        bytes[] signatures;
    }

    struct Proof {
        ClaimInfo claimInfo;
        SignedClaim signedClaim;
    }
}

interface IReclaimVerifier {
    function verifyProof(ReclaimTypes.Proof memory proof) external view;
}
