// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { EarlyDiscoveryRegistry } from "../src/EarlyDiscoveryRegistry.sol";
import { ReclaimTypes } from "../src/interfaces/IReclaimVerifier.sol";
import { MockReclaimVerifier } from "./mocks/MockReclaimVerifier.sol";
import { TestBase } from "./TestBase.sol";

contract EarlyDiscoveryRegistryTest is TestBase {
    MockReclaimVerifier internal verifier;
    EarlyDiscoveryRegistry internal registry;

    address internal constant USER = 0x1111111111111111111111111111111111111111;
    address internal constant OTHER = 0x2222222222222222222222222222222222222222;
    bytes32 internal constant X_PROVIDER = keccak256("early-x-provider/v2");
    bytes32 internal constant YOUTUBE_PROVIDER = keccak256("early-youtube-provider/v2");
    bytes32 internal constant SESSION = keccak256("session-1");
    bytes32 internal constant PROOF_ID = keccak256("proof-1");

    function setUp() public {
        verifier = new MockReclaimVerifier();
        registry = new EarlyDiscoveryRegistry(address(verifier), address(this));
        registry.setProviderConfiguration(X_PROVIDER, registry.PLATFORM_X(), 2, true);
        registry.setProviderConfiguration(
            YOUTUBE_PROVIDER, registry.PLATFORM_YOUTUBE(), 2, true
        );
    }

    function testValidProofRegistersReceipt() public {
        ReclaimTypes.Proof memory proof = _xProof(USER, PROOF_ID, SESSION, true, true);
        vm.prank(USER);
        bytes32 commitment = registry.verifyAndRegister(proof);

        EarlyDiscoveryRegistry.PublicReceipt memory receipt = registry.getReceipt(commitment);
        assertEq(receipt.owner, USER, "owner");
        assertEq(receipt.proofId, PROOF_ID, "proof id");
        assertEq(receipt.platform, registry.PLATFORM_X(), "platform");
        assertTrue(registry.usedProofIds(PROOF_ID), "proof consumed");
        assertTrue(registry.usedSessionNullifiers(SESSION), "session consumed");
    }

    function testForgedProofRevertsBeforeRegistration() public {
        verifier.setShouldReject(true);
        ReclaimTypes.Proof memory proof = _xProof(USER, PROOF_ID, SESSION, true, true);
        vm.prank(USER);
        vm.expectRevert(MockReclaimVerifier.ForgedProof.selector);
        registry.verifyAndRegister(proof);
        assertTrue(!registry.usedProofIds(PROOF_ID), "forged proof consumed");
    }

    function testWrongWalletContextReverts() public {
        ReclaimTypes.Proof memory proof = _xProof(USER, PROOF_ID, SESSION, true, true);
        vm.prank(OTHER);
        vm.expectRevert(EarlyDiscoveryRegistry.WalletContextMismatch.selector);
        registry.verifyAndRegister(proof);
    }

    function testClaimOwnerMismatchReverts() public {
        ReclaimTypes.Proof memory proof = _xProof(USER, PROOF_ID, SESSION, true, true);
        proof.signedClaim.claim.owner = OTHER;
        vm.prank(USER);
        vm.expectRevert(EarlyDiscoveryRegistry.ClaimOwnerMismatch.selector);
        registry.verifyAndRegister(proof);
    }

    function testDisallowedProviderReverts() public {
        bytes32 unlistedProvider = keccak256("unlisted");
        ReclaimTypes.Proof memory proof = _xProof(USER, PROOF_ID, SESSION, true, true);
        proof.claimInfo.context = _context(USER, unlistedProvider, SESSION, true, true);
        vm.prank(USER);
        vm.expectRevert(EarlyDiscoveryRegistry.ProviderNotAllowed.selector);
        registry.verifyAndRegister(proof);
    }

    function testXRequiresLikedAndReplied() public {
        ReclaimTypes.Proof memory proof = _xProof(USER, PROOF_ID, SESSION, false, true);
        vm.prank(USER);
        vm.expectRevert(EarlyDiscoveryRegistry.InvalidPlatformClaim.selector);
        registry.verifyAndRegister(proof);
    }

    function testValidYouTubeProofRegistersReceipt() public {
        ReclaimTypes.Proof memory proof =
            _youtubeProof(USER, PROOF_ID, SESSION, true, true);
        vm.prank(USER);
        bytes32 commitment = registry.verifyAndRegister(proof);

        EarlyDiscoveryRegistry.PublicReceipt memory receipt =
            registry.getReceipt(commitment);
        assertEq(receipt.owner, USER, "owner");
        assertEq(receipt.platform, registry.PLATFORM_YOUTUBE(), "platform");
        assertEq(receipt.contentHash, keccak256("comment-7"), "comment hash");
    }

    function testYouTubeRequiresCommentAndEngagement() public {
        ReclaimTypes.Proof memory proof =
            _youtubeProof(USER, PROOF_ID, SESSION, true, false);
        vm.prank(USER);
        vm.expectRevert(EarlyDiscoveryRegistry.InvalidPlatformClaim.selector);
        registry.verifyAndRegister(proof);
    }

    function testDuplicateProofReverts() public {
        ReclaimTypes.Proof memory proof = _xProof(USER, PROOF_ID, SESSION, true, true);
        vm.prank(USER);
        registry.verifyAndRegister(proof);

        vm.prank(USER);
        vm.expectRevert(EarlyDiscoveryRegistry.DuplicateProof.selector);
        registry.verifyAndRegister(proof);
    }

    function testReplayedSessionReverts() public {
        vm.prank(USER);
        registry.verifyAndRegister(_xProof(USER, PROOF_ID, SESSION, true, true));

        vm.prank(USER);
        vm.expectRevert(EarlyDiscoveryRegistry.DuplicateSession.selector);
        registry.verifyAndRegister(
            _xProof(USER, keccak256("proof-2"), SESSION, true, true)
        );
    }

    function testPausedRegistryReverts() public {
        registry.setPaused(true);
        vm.prank(USER);
        vm.expectRevert(bytes4(keccak256("Paused()")));
        registry.verifyAndRegister(_xProof(USER, PROOF_ID, SESSION, true, true));
    }

    function testNoPublishReceiptBypassExists() public {
        vm.prank(USER);
        (bool success,) =
            address(registry).call(abi.encodeWithSignature("publishReceipt(bytes32)", PROOF_ID));
        assertTrue(!success, "publish bypass unexpectedly exists");
        assertTrue(!registry.usedProofIds(PROOF_ID), "bypass changed state");
    }

    function _xProof(
        address user,
        bytes32 proofId,
        bytes32 session,
        bool liked,
        bool replied
    ) private pure returns (ReclaimTypes.Proof memory proof) {
        proof.claimInfo = ReclaimTypes.ClaimInfo({
            provider: "early-x-provider-v2",
            parameters: "{}",
            context: _context(user, X_PROVIDER, session, liked, replied)
        });
        proof.signedClaim.claim = ReclaimTypes.CompleteClaimData({
            identifier: proofId,
            owner: user,
            timestampS: 1_720_000_000,
            epoch: 1
        });
        proof.signedClaim.signatures = new bytes[](1);
        proof.signedClaim.signatures[0] = hex"01";
    }

    function _youtubeProof(
        address user,
        bytes32 proofId,
        bytes32 session,
        bool commented,
        bool engaged
    ) private pure returns (ReclaimTypes.Proof memory proof) {
        proof.claimInfo = ReclaimTypes.ClaimInfo({
            provider: "early-youtube-provider-v2",
            parameters: "{}",
            context: string.concat(
                '{"contextAddress":"',
                _addressHex(user),
                '","schemaVersion":"2","platform":"youtube","providerConfigHash":"',
                _bytes32Hex(YOUTUBE_PROVIDER),
                '","sessionNullifier":"',
                _bytes32Hex(session),
                '","subjectId":"dQw4w9WgXcQ","commented":"',
                commented ? "true" : "false",
                '","engaged":"',
                engaged ? "true" : "false",
                '","videoId":"dQw4w9WgXcQ","commentId":"comment-7",',
                '"commentTimestamp":"1784800800"}'
            )
        });
        proof.signedClaim.claim = ReclaimTypes.CompleteClaimData({
            identifier: proofId,
            owner: user,
            timestampS: 1_784_800_800,
            epoch: 1
        });
        proof.signedClaim.signatures = new bytes[](1);
        proof.signedClaim.signatures[0] = hex"01";
    }

    function _context(
        address user,
        bytes32 provider,
        bytes32 session,
        bool liked,
        bool replied
    ) private pure returns (string memory) {
        return string.concat(
            '{"contextAddress":"',
            _addressHex(user),
            '","schemaVersion":"2","platform":"x","providerConfigHash":"',
            _bytes32Hex(provider),
            '","sessionNullifier":"',
            _bytes32Hex(session),
            '","subjectId":"1900000000000000000",',
            '"liked":"',
            liked ? "true" : "false",
            '","replied":"',
            replied ? "true" : "false",
            '","replyId":"1900000000000000001","replyToSubjectId":"1900000000000000000",',
            '"replyTimestamp":"1720000000"}'
        );
    }

    function _addressHex(address value) private pure returns (string memory) {
        return _hex(abi.encodePacked(value));
    }

    function _bytes32Hex(bytes32 value) private pure returns (string memory) {
        return _hex(abi.encodePacked(value));
    }

    function _hex(bytes memory data) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory output = new bytes(2 + data.length * 2);
        output[0] = "0";
        output[1] = "x";
        for (uint256 i; i < data.length; i++) {
            output[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            output[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(output);
    }
}
