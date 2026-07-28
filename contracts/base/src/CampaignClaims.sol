// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OwnedPausable } from "./security/OwnedPausable.sol";

contract CampaignClaims is OwnedPausable {
    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "EligibilityAuthorization(uint256 campaignId,address claimant,bytes32 evaluationTxHash,bytes32 nullifier,uint256 expiry)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Early Campaign Claims");
    bytes32 private constant VERSION_HASH = keccak256("2");

    error InvalidSigner();
    error InvalidCampaign();
    error CampaignClosed();
    error WrongClaimant();
    error AuthorizationExpired();
    error NullifierConsumed();
    error InvalidSignature();

    struct Campaign {
        address creator;
        bytes32 subjectHash;
        uint64 opensAt;
        uint64 closesAt;
        bool active;
    }

    struct EligibilityAuthorization {
        uint256 campaignId;
        address claimant;
        bytes32 evaluationTxHash;
        bytes32 nullifier;
        uint256 expiry;
    }

    address public bridgeSigner;
    uint256 public nextCampaignId = 1;
    mapping(uint256 => Campaign) public campaigns;
    mapping(bytes32 => bool) public consumedNullifiers;

    event BridgeSignerChanged(address indexed signer);
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        bytes32 indexed subjectHash,
        uint64 opensAt,
        uint64 closesAt
    );
    event CampaignStatusChanged(uint256 indexed campaignId, bool active);
    event EligibilityClaimed(
        uint256 indexed campaignId,
        address indexed claimant,
        bytes32 indexed nullifier,
        bytes32 evaluationTxHash
    );

    constructor(address signer, address initialOwner) OwnedPausable(initialOwner) {
        if (signer == address(0)) revert InvalidSigner();
        bridgeSigner = signer;
        emit BridgeSignerChanged(signer);
    }

    function setBridgeSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert InvalidSigner();
        bridgeSigner = signer;
        emit BridgeSignerChanged(signer);
    }

    function createCampaign(bytes32 subjectHash, uint64 opensAt, uint64 closesAt)
        external
        whenNotPaused
        returns (uint256 campaignId)
    {
        if (subjectHash == bytes32(0) || closesAt <= opensAt) revert InvalidCampaign();
        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            subjectHash: subjectHash,
            opensAt: opensAt,
            closesAt: closesAt,
            active: true
        });
        emit CampaignCreated(campaignId, msg.sender, subjectHash, opensAt, closesAt);
    }

    function setCampaignActive(uint256 campaignId, bool active) external {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator != msg.sender) revert InvalidCampaign();
        campaign.active = active;
        emit CampaignStatusChanged(campaignId, active);
    }

    function claim(EligibilityAuthorization calldata authorization, bytes calldata signature)
        external
        whenNotPaused
    {
        Campaign memory campaign = campaigns[authorization.campaignId];
        if (campaign.creator == address(0) || !campaign.active) revert InvalidCampaign();
        if (block.timestamp < campaign.opensAt || block.timestamp > campaign.closesAt) {
            revert CampaignClosed();
        }
        if (authorization.claimant != msg.sender) revert WrongClaimant();
        if (authorization.expiry < block.timestamp) revert AuthorizationExpired();
        if (consumedNullifiers[authorization.nullifier]) revert NullifierConsumed();

        bytes32 structHash = keccak256(
            abi.encode(
                AUTHORIZATION_TYPEHASH,
                authorization.campaignId,
                authorization.claimant,
                authorization.evaluationTxHash,
                authorization.nullifier,
                authorization.expiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (_recover(digest, signature) != bridgeSigner) revert InvalidSignature();

        consumedNullifiers[authorization.nullifier] = true;
        emit EligibilityClaimed(
            authorization.campaignId,
            authorization.claimant,
            authorization.nullifier,
            authorization.evaluationTxHash
        );
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
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            revert InvalidSignature();
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}
