// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { CampaignClaims } from "../src/CampaignClaims.sol";
import { TestBase } from "./TestBase.sol";

contract CampaignClaimsTest is TestBase {
    uint256 internal constant BRIDGE_KEY = 0xB01D63;
    address internal bridgeSigner;
    address internal claimant;
    CampaignClaims internal claims;
    uint256 internal campaignId;

    function setUp() public {
        bridgeSigner = vm.addr(BRIDGE_KEY);
        claimant = vm.addr(0xC1A1);
        claims = new CampaignClaims(bridgeSigner, address(this));
        vm.warp(1_720_000_000);
        campaignId =
            claims.createCampaign(keccak256("subject"), 1_719_999_000, 1_720_010_000);
    }

    function testValidAuthorizationClaimsOnce() public {
        CampaignClaims.EligibilityAuthorization memory authorization = _authorization();
        bytes memory signature = _sign(authorization);

        vm.prank(claimant);
        claims.claim(authorization, signature);
        assertTrue(claims.consumedNullifiers(authorization.nullifier), "nullifier");

        vm.prank(claimant);
        vm.expectRevert(CampaignClaims.NullifierConsumed.selector);
        claims.claim(authorization, signature);
    }

    function testWrongClaimantReverts() public {
        CampaignClaims.EligibilityAuthorization memory authorization = _authorization();
        bytes memory signature = _sign(authorization);
        vm.prank(vm.addr(0xBAD));
        vm.expectRevert(CampaignClaims.WrongClaimant.selector);
        claims.claim(authorization, signature);
    }

    function testExpiredAuthorizationReverts() public {
        CampaignClaims.EligibilityAuthorization memory authorization = _authorization();
        authorization.expiry = block.timestamp - 1;
        bytes memory signature = _sign(authorization);
        vm.prank(claimant);
        vm.expectRevert(CampaignClaims.AuthorizationExpired.selector);
        claims.claim(authorization, signature);
    }

    function testModifiedAuthorizationRejectsSignature() public {
        CampaignClaims.EligibilityAuthorization memory authorization = _authorization();
        bytes memory signature = _sign(authorization);
        authorization.evaluationTxHash = keccak256("modified");
        vm.prank(claimant);
        vm.expectRevert(CampaignClaims.InvalidSignature.selector);
        claims.claim(authorization, signature);
    }

    function _authorization()
        private
        view
        returns (CampaignClaims.EligibilityAuthorization memory)
    {
        return CampaignClaims.EligibilityAuthorization({
            campaignId: campaignId,
            claimant: claimant,
            evaluationTxHash: keccak256("zama-evaluation"),
            nullifier: keccak256("claim-nullifier"),
            expiry: block.timestamp + 1 hours
        });
    }

    function _sign(CampaignClaims.EligibilityAuthorization memory authorization)
        private
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                claims.AUTHORIZATION_TYPEHASH(),
                authorization.campaignId,
                authorization.claimant,
                authorization.evaluationTxHash,
                authorization.nullifier,
                authorization.expiry
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", claims.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BRIDGE_KEY, digest);
        return abi.encodePacked(r, s, v);
    }
}
