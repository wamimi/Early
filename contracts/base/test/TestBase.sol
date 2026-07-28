// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool value, string memory message) internal pure {
        require(value, message);
    }

    function assertEq(bytes32 left, bytes32 right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertEq(address left, address right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertEq(uint256 left, uint256 right, string memory message) internal pure {
        require(left == right, message);
    }
}
