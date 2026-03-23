// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "./lib/ERC721.sol";
import {Ownable} from "./lib/Ownable.sol";

import {IBadgeAssetRegistry} from "./interfaces/IBadgeAssetRegistry.sol";
import {IBadgeMetadataRenderer} from "./interfaces/IBadgeMetadataRenderer.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";
import {AgenticPOAPMetadata} from "./libraries/AgenticPOAPMetadata.sol";
import {Base64} from "./libraries/Base64.sol";

/// @notice ERC-721 achievement badges for agents, backed by poster + looping video packages.
contract AgenticPOAP is ERC721, Ownable {
    error ZeroAddress(string field);
    error BadgeInactive(uint256 defId);
    error AssetInactive(uint256 assetId);
    error AlreadyClaimed(uint256 defId, address agent);
    error BadgeExpired(uint256 defId);
    error MaxSupplyReached(uint256 defId);
    error NotAttestor(address caller);
    error NotAuthorized(address caller, uint256 defId);
    error ManualAttestorOnly(uint256 defId);
    error TokenDoesNotExist(uint256 tokenId);
    error InvalidAttestation();
    error AttestationExpired(uint64 expiresAt);
    error StateCheckFailed();
    error ConditionNotMet();
    error AttestorReputationTooLow();

    enum BadgeType {
        EVENT,
        ACHIEVEMENT,
        CUSTOM
    }

    enum VerificationType {
        ONCHAIN_STATE,
        MERKLE_PROOF,
        ORACLE_ATTESTATION,
        AGENT_ATTESTATION
    }

    struct BadgeDefinition {
        uint256 id;
        string name;
        string description;
        uint256 assetId;
        BadgeType badgeType;
        VerificationType verificationType;
        bytes verificationData;
        address creator;
        uint256 maxSupply;
        uint256 minted;
        uint64 expiresAt;
        bool active;
    }

    struct MintedBadge {
        uint256 definitionId;
        uint64 mintedAt;
        bytes32 proofHash;
    }

    IBadgeAssetRegistry public immutable assetRegistry;
    IBadgeMetadataRenderer public immutable metadataRenderer;
    IIdentityRegistry public immutable identityRegistry;
    IReputationRegistry public immutable reputationRegistry;

    uint256 public nextDefinitionId;
    uint256 public nextTokenId;
    string public tokenPageBaseUri;

    mapping(uint256 => BadgeDefinition) public definitions;
    mapping(uint256 => MintedBadge) public mintedBadges;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(address => uint256[]) public agentBadges;
    mapping(address => bool) public attestors;

    event BadgeDefined(
        uint256 indexed defId, uint256 indexed assetId, string name, BadgeType badgeType, address creator
    );
    event BadgeAssetUpdated(uint256 indexed defId, uint256 indexed assetId);
    event BadgeClaimed(
        uint256 indexed tokenId, uint256 indexed defId, address indexed agent, VerificationType verificationType
    );
    event BadgeStatusUpdated(uint256 indexed defId, bool active);
    event AttestorUpdated(address indexed attestor, bool authorized);
    event TokenPageBaseUriUpdated(string tokenPageBaseUriValue);
    event ReputationWritten(address indexed agent, uint256 badgeCount);

    constructor(
        address assetRegistryAddress,
        address metadataRendererAddress,
        address identityRegistryAddress,
        address reputationRegistryAddress
    ) ERC721("Agentic POAP", "aPOAP") Ownable(msg.sender) {
        if (assetRegistryAddress == address(0)) {
            revert ZeroAddress("assetRegistry");
        }
        if (metadataRendererAddress == address(0)) {
            revert ZeroAddress("metadataRenderer");
        }

        assetRegistry = IBadgeAssetRegistry(assetRegistryAddress);
        metadataRenderer = IBadgeMetadataRenderer(metadataRendererAddress);
        identityRegistry = IIdentityRegistry(identityRegistryAddress);
        reputationRegistry = IReputationRegistry(reputationRegistryAddress);
    }

    function defineBadge(
        string calldata name,
        string calldata description,
        uint256 assetId,
        BadgeType badgeType,
        VerificationType verificationType,
        bytes calldata verificationData,
        uint256 maxSupply,
        uint64 expiresAt
    ) external returns (uint256 defId) {
        _requireActiveAsset(assetId);

        defId = nextDefinitionId++;
        definitions[defId] = BadgeDefinition({
            id: defId,
            name: name,
            description: description,
            assetId: assetId,
            badgeType: badgeType,
            verificationType: verificationType,
            verificationData: verificationData,
            creator: msg.sender,
            maxSupply: maxSupply,
            minted: 0,
            expiresAt: expiresAt,
            active: true
        });

        emit BadgeDefined(defId, assetId, name, badgeType, msg.sender);
    }

    function updateBadgeAsset(uint256 defId, uint256 assetId) external {
        BadgeDefinition storage definition = _getDefinitionStorage(defId);
        _checkBadgeEditor(definition);
        _requireActiveAsset(assetId);

        definition.assetId = assetId;
        emit BadgeAssetUpdated(defId, assetId);
    }

    function setBadgeActive(uint256 defId, bool active) external {
        BadgeDefinition storage definition = _getDefinitionStorage(defId);
        _checkBadgeEditor(definition);

        definition.active = active;
        emit BadgeStatusUpdated(defId, active);
    }

    function setAttestor(address attestor, bool authorized) external onlyOwner {
        attestors[attestor] = authorized;
        emit AttestorUpdated(attestor, authorized);
    }

    function setTokenPageBaseUri(string calldata tokenPageBaseUriValue) external onlyOwner {
        tokenPageBaseUri = tokenPageBaseUriValue;
        emit TokenPageBaseUriUpdated(tokenPageBaseUriValue);
    }

    function claim(uint256 defId, bytes calldata proof) external {
        BadgeDefinition storage definition = _prepareClaim(defId, msg.sender);

        if (definition.verificationType == VerificationType.ONCHAIN_STATE) {
            _verifyOnchainState(definition.verificationData, msg.sender);
        } else if (definition.verificationType == VerificationType.MERKLE_PROOF) {
            _verifyMerkleProof(definition.verificationData, msg.sender, proof);
        } else if (definition.verificationType == VerificationType.ORACLE_ATTESTATION) {
            _verifyOracleAttestation(defId, definition.verificationData, msg.sender, proof);
        } else if (definition.verificationType == VerificationType.AGENT_ATTESTATION) {
            _verifyAgentAttestation(defId, definition.verificationData, msg.sender, proof);
        }

        _mintBadge(defId, msg.sender, keccak256(proof));
    }

    function attestAndMint(uint256 defId, address agent) external {
        if (!attestors[msg.sender]) {
            revert NotAttestor(msg.sender);
        }

        BadgeDefinition storage definition = _prepareClaim(defId, agent);
        _requireManualAttestorBadge(defId, definition);
        _mintBadge(defId, agent, keccak256(abi.encodePacked(msg.sender, block.timestamp)));
    }

    function getAgentBadges(address agent) external view returns (uint256[] memory) {
        return agentBadges[agent];
    }

    function getAgentBadgeCount(address agent) external view returns (uint256) {
        return agentBadges[agent].length;
    }

    function hasBadge(address agent, uint256 defId) external view returns (bool) {
        return claimed[defId][agent];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) {
            revert TokenDoesNotExist(tokenId);
        }

        MintedBadge memory mintedBadge = mintedBadges[tokenId];
        BadgeDefinition memory definition = definitions[mintedBadge.definitionId];
        AgenticPOAPMetadata.TokenMetadataInput memory input = AgenticPOAPMetadata.TokenMetadataInput({
            tokenId: tokenId,
            definitionId: mintedBadge.definitionId,
            mintedAt: mintedBadge.mintedAt,
            name: definition.name,
            description: definition.description,
            badgeType: _badgeTypeName(definition.badgeType),
            verificationType: _verificationTypeName(definition.verificationType),
            externalUrl: _externalUrlForToken(tokenId),
            animationUrl: ""
        });

        string memory json = metadataRenderer.buildTokenMetadata(input, definition.assetId);
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _prepareClaim(uint256 defId, address agent) internal view returns (BadgeDefinition storage definition) {
        definition = _getDefinitionStorage(defId);
        if (!definition.active) {
            revert BadgeInactive(defId);
        }
        if (!assetRegistry.getAsset(definition.assetId).active) {
            revert AssetInactive(definition.assetId);
        }
        if (claimed[defId][agent]) {
            revert AlreadyClaimed(defId, agent);
        }
        if (definition.expiresAt != 0 && block.timestamp > definition.expiresAt) {
            revert BadgeExpired(defId);
        }
        if (definition.maxSupply != 0 && definition.minted >= definition.maxSupply) {
            revert MaxSupplyReached(defId);
        }
    }

    function _mintBadge(uint256 defId, address agent, bytes32 proofHash) internal {
        uint256 tokenId = nextTokenId++;

        definitions[defId].minted++;
        claimed[defId][agent] = true;
        mintedBadges[tokenId] =
            MintedBadge({definitionId: defId, mintedAt: uint64(block.timestamp), proofHash: proofHash});
        agentBadges[agent].push(tokenId);

        _mint(agent, tokenId);
        emit BadgeClaimed(tokenId, defId, agent, definitions[defId].verificationType);

        _writeReputation(agent);
    }

    function _requireManualAttestorBadge(uint256 defId, BadgeDefinition storage definition) internal view {
        if (definition.verificationType != VerificationType.ONCHAIN_STATE || definition.verificationData.length != 0) {
            revert ManualAttestorOnly(defId);
        }
    }

    function _verifyOnchainState(bytes memory data, address agent) internal view {
        (address target, bytes memory callData, bytes memory expected) = abi.decode(data, (address, bytes, bytes));

        bytes memory fullCall = abi.encodePacked(callData, agent);
        (bool success, bytes memory result) = target.staticcall(fullCall);

        if (!success) {
            revert StateCheckFailed();
        }
        if (keccak256(result) != keccak256(expected) && !_resultGte(result, expected)) {
            revert ConditionNotMet();
        }
    }

    function _verifyMerkleProof(bytes memory data, address agent, bytes calldata proof) internal pure {
        bytes32 root = abi.decode(data, (bytes32));
        bytes32 leaf = keccak256(abi.encodePacked(agent));
        bytes32[] memory proofArray = abi.decode(proof, (bytes32[]));

        if (!_verify(proofArray, root, leaf)) {
            revert InvalidAttestation();
        }
    }

    function _verifyOracleAttestation(uint256 defId, bytes memory data, address agent, bytes calldata proof)
        internal
        view
    {
        address expectedSigner = abi.decode(data, (address));
        address signer;

        if (proof.length == 96) {
            (bytes32 r, bytes32 s, uint8 v) = abi.decode(proof, (bytes32, bytes32, uint8));
            signer = ecrecover(_attestationDigest(defId, agent), v, r, s);
        } else {
            (uint64 issuedAt, uint64 expiresAt, bytes32 r, bytes32 s, uint8 v) =
                abi.decode(proof, (uint64, uint64, bytes32, bytes32, uint8));
            if (expiresAt == 0 || expiresAt <= issuedAt) {
                revert InvalidAttestation();
            }
            if (block.timestamp > expiresAt) {
                revert AttestationExpired(expiresAt);
            }

            signer = ecrecover(_expiringAttestationDigest(defId, agent, issuedAt, expiresAt), v, r, s);
        }

        if (signer != expectedSigner) {
            revert InvalidAttestation();
        }
    }

    function _verifyAgentAttestation(uint256 defId, bytes memory data, address agent, bytes calldata proof)
        internal
        view
    {
        uint256 minReputation = abi.decode(data, (uint256));
        (address attestorAgent, bytes32 r, bytes32 s, uint8 v) = abi.decode(proof, (address, bytes32, bytes32, uint8));

        if (address(reputationRegistry) != address(0)) {
            (, uint256 summaryValue,) = reputationRegistry.getSummary(attestorAgent);
            if (summaryValue < minReputation) {
                revert AttestorReputationTooLow();
            }
        }

        address signer = ecrecover(_attestationDigest(defId, agent), v, r, s);
        if (signer != attestorAgent) {
            revert InvalidAttestation();
        }
    }

    function _attestationDigest(uint256 defId, address agent) internal view returns (bytes32) {
        bytes32 message = keccak256(abi.encodePacked(address(this), defId, agent));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }

    function _expiringAttestationDigest(uint256 defId, address agent, uint64 issuedAt, uint64 expiresAt)
        internal
        view
        returns (bytes32)
    {
        bytes32 message = keccak256(abi.encodePacked(address(this), defId, agent, issuedAt, expiresAt));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }

    function _writeReputation(address agent) internal {
        if (address(reputationRegistry) == address(0)) {
            return;
        }

        uint256 badgeCount = agentBadges[agent].length;
        uint8 score = uint8(badgeCount > type(uint8).max ? type(uint8).max : badgeCount);
        reputationRegistry.giveFeedback(agent, score);
        emit ReputationWritten(agent, badgeCount);
    }

    function _requireActiveAsset(uint256 assetId) internal view {
        if (!assetRegistry.getAsset(assetId).active) {
            revert AssetInactive(assetId);
        }
    }

    function _getDefinitionStorage(uint256 defId) internal view returns (BadgeDefinition storage definition) {
        definition = definitions[defId];
        if (definition.creator == address(0)) {
            revert BadgeInactive(defId);
        }
    }

    function _checkBadgeEditor(BadgeDefinition storage definition) internal view {
        if (msg.sender != definition.creator && msg.sender != owner()) {
            revert NotAuthorized(msg.sender, definition.id);
        }
    }

    function _externalUrlForToken(uint256 tokenId) internal view returns (string memory) {
        if (bytes(tokenPageBaseUri).length == 0) {
            return "";
        }

        return string.concat(tokenPageBaseUri, _uintToString(tokenId));
    }

    function _verify(bytes32[] memory proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computedHash = computedHash <= proof[i]
                ? keccak256(abi.encodePacked(computedHash, proof[i]))
                : keccak256(abi.encodePacked(proof[i], computedHash));
        }
        return computedHash == root;
    }

    function _resultGte(bytes memory result, bytes memory expected) internal pure returns (bool) {
        uint256 actual = abi.decode(result, (uint256));
        uint256 minimum = abi.decode(expected, (uint256));
        return actual >= minimum;
    }

    function _badgeTypeName(BadgeType badgeType) internal pure returns (string memory) {
        if (badgeType == BadgeType.EVENT) {
            return "Event";
        }
        if (badgeType == BadgeType.ACHIEVEMENT) {
            return "Achievement";
        }
        return "Custom";
    }

    function _verificationTypeName(VerificationType verificationType) internal pure returns (string memory) {
        if (verificationType == VerificationType.ONCHAIN_STATE) {
            return "Onchain State";
        }
        if (verificationType == VerificationType.MERKLE_PROOF) {
            return "Merkle Proof";
        }
        if (verificationType == VerificationType.ORACLE_ATTESTATION) {
            return "Oracle Attestation";
        }
        return "Agent Attestation";
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }
}
