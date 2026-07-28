// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IReclaimVerifier, ReclaimTypes } from "../../src/interfaces/IReclaimVerifier.sol";

contract MockReclaimVerifier is IReclaimVerifier {
    error ForgedProof();

    bool public shouldReject;

    function setShouldReject(bool value) external {
        shouldReject = value;
    }

    function verifyProof(ReclaimTypes.Proof memory) external view {
        if (shouldReject) revert ForgedProof();
    }
}
