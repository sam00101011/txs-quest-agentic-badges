// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";
import {Base64} from "./libraries/Base64.sol";
import {IBadgeAssetRegistry} from "./interfaces/IBadgeAssetRegistry.sol";
import {IBadgeClaimRenderer} from "./interfaces/IBadgeClaimRenderer.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";
import {BadgePolicyTypes} from "./libraries/BadgePolicyTypes.sol";
import {AgenticBadgeClaimMetadata} from "./libraries/AgenticBadgeClaimMetadata.sol";

/// @notice Tempo-native badge claims without NFT minting.
contract AgenticBadgeRegistry is Ownable {
    error ZeroAddress(string field);
    error BadgeInactive(uint256 defId);
    error BadgeMissing(uint256 defId);
    error AssetInactive(uint256 assetId);
    error AlreadyClaimed(uint256 defId, address agent);
    error BadgeExpired(uint256 defId);
    error MaxClaimsReached(uint256 defId);
    error NotAttestor(address caller);
    error NotAuthorized(address caller, uint256 defId);
    error ManualAttestorOnly(uint256 defId);
    error ClaimMissing(uint256 defId, address agent);
    error InvalidAttestation();
    error AttestationExpired(uint64 expiresAt);
    error InvalidEvidenceContext(bytes32 expectedContextId, bytes32 actualContextId);
    error EvidenceNonceUsed(bytes32 nonceHash);
    error IdentityRegistryUnavailable();
    error ReputationRegistryUnavailable();
    error AgentNotRegistered(address agent);
    error PrimaryWalletMismatch(address agent, address primaryWallet);
    error SubjectReputationTooLow(address agent, uint256 actualValue, uint256 requiredValue);
    error UnsupportedAdvancedPolicy(BadgePolicyTypes.PolicyRuleKind ruleKind);
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
        uint256 maxClaims;
        uint256 claimCount;
        uint64 expiresAt;
        bool active;
        bytes advancedPolicy;
    }

    struct ClaimRecord {
        uint256 definitionId;
        uint64 claimedAt;
        bytes32 proofHash;
        bool exists;
    }

    struct AdvancedEvidenceSummary {
        address issuer;
        bytes32 contextId;
        uint64 expiresAt;
        bytes32 nonceHash;
        bool exists;
    }

    struct Decoded8183Proof {
        bytes32 contextId;
        bytes32 nonce;
        uint64 issuedAt;
        uint64 expiresAt;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    IBadgeAssetRegistry public immutable assetRegistry;
    IBadgeClaimRenderer public immutable claimRenderer;
    IIdentityRegistry public immutable identityRegistry;
    IReputationRegistry public immutable reputationRegistry;

    uint256 public nextDefinitionId;
    string public claimPageBaseUri;

    mapping(uint256 => BadgeDefinition) public definitions;
    mapping(uint256 => mapping(address => ClaimRecord)) public claims;
    mapping(address => uint256[]) public agentBadgeDefinitions;
    mapping(address => bool) public attestors;
    mapping(bytes32 => bool) public usedEvidenceNonces;

    event BadgeDefined(
        uint256 indexed defId, uint256 indexed assetId, string name, BadgeType badgeType, address creator
    );
    event BadgeAssetUpdated(uint256 indexed defId, uint256 indexed assetId);
    event BadgeStatusUpdated(uint256 indexed defId, bool active);
    event BadgeVerificationUpdated(uint256 indexed defId, VerificationType verificationType);
    event BadgeClaimed(
        uint256 indexed defId, address indexed agent, VerificationType verificationType, bytes32 proofHash
    );
    event AdvancedEvidenceVerified(
        uint256 indexed defId,
        address indexed agent,
        bytes32 indexed proofHash,
        address issuer,
        bytes32 contextId,
        uint64 expiresAt,
        bytes32 nonceHash
    );
    event AttestorUpdated(address indexed attestor, bool authorized);
    event ClaimPageBaseUriUpdated(string claimPageBaseUriValue);
    event ReputationWritten(address indexed agent, uint256 badgeCount);

    constructor(
        address assetRegistryAddress,
        address claimRendererAddress,
        address identityRegistryAddress,
        address reputationRegistryAddress
    ) Ownable(msg.sender) {
        if (assetRegistryAddress == address(0)) {
            revert ZeroAddress("assetRegistry");
        }
        if (claimRendererAddress == address(0)) {
            revert ZeroAddress("claimRenderer");
        }

        assetRegistry = IBadgeAssetRegistry(assetRegistryAddress);
        claimRenderer = IBadgeClaimRenderer(claimRendererAddress);
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
        uint256 maxClaims,
        uint64 expiresAt,
        bytes calldata advancedPolicy
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
            maxClaims: maxClaims,
            claimCount: 0,
            expiresAt: expiresAt,
            active: true,
            advancedPolicy: advancedPolicy
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

    function updateBadgeVerification(
        uint256 defId,
        VerificationType verificationType,
        bytes calldata verificationData,
        bytes calldata advancedPolicy
    ) external {
        BadgeDefinition storage definition = _getDefinitionStorage(defId);
        _checkBadgeEditor(definition);

        definition.verificationType = verificationType;
        definition.verificationData = verificationData;
        definition.advancedPolicy = advancedPolicy;

        emit BadgeVerificationUpdated(defId, verificationType);
    }

    function setAttestor(address attestor, bool authorized) external onlyOwner {
        attestors[attestor] = authorized;
        emit AttestorUpdated(attestor, authorized);
    }

    function setClaimPageBaseUri(string calldata claimPageBaseUriValue) external onlyOwner {
        claimPageBaseUri = claimPageBaseUriValue;
        emit ClaimPageBaseUriUpdated(claimPageBaseUriValue);
    }

    function claim(uint256 defId, bytes calldata proof) external {
        BadgeDefinition storage definition = _prepareClaim(defId, msg.sender);
        AdvancedEvidenceSummary memory advancedEvidence;

        if (definition.verificationType == VerificationType.ONCHAIN_STATE) {
            _verifyOnchainState(definition.verificationData, msg.sender);
        } else if (definition.verificationType == VerificationType.MERKLE_PROOF) {
            _verifyMerkleProof(definition.verificationData, msg.sender, proof);
        } else if (definition.verificationType == VerificationType.ORACLE_ATTESTATION) {
            advancedEvidence = _verifyOracleAttestation(
                defId, definition.verificationData, definition.advancedPolicy, msg.sender, proof
            );
        } else if (definition.verificationType == VerificationType.AGENT_ATTESTATION) {
            advancedEvidence = _verifyAgentAttestation(
                defId, definition.verificationData, definition.advancedPolicy, msg.sender, proof
            );
        }

        bytes32 proofHash = keccak256(proof);
        if (advancedEvidence.exists) {
            if (advancedEvidence.nonceHash != bytes32(0)) {
                usedEvidenceNonces[advancedEvidence.nonceHash] = true;
            }
        }
        _recordClaim(defId, msg.sender, proofHash);
        if (advancedEvidence.exists) {
            emit AdvancedEvidenceVerified(
                defId,
                msg.sender,
                proofHash,
                advancedEvidence.issuer,
                advancedEvidence.contextId,
                advancedEvidence.expiresAt,
                advancedEvidence.nonceHash
            );
        }
    }

    function attestAndRecord(uint256 defId, address agent) external {
        if (!attestors[msg.sender]) {
            revert NotAttestor(msg.sender);
        }

        BadgeDefinition storage definition = _prepareClaim(defId, agent);
        _requireManualAttestorBadge(defId, definition);
        _recordClaim(defId, agent, keccak256(abi.encodePacked(msg.sender, block.timestamp)));
    }

    function hasBadge(address agent, uint256 defId) external view returns (bool) {
        return claims[defId][agent].exists;
    }

    function getClaim(address agent, uint256 defId) external view returns (ClaimRecord memory) {
        ClaimRecord memory record = claims[defId][agent];
        if (!record.exists) {
            revert ClaimMissing(defId, agent);
        }
        return record;
    }

    function getAgentBadges(address agent) external view returns (uint256[] memory) {
        return agentBadgeDefinitions[agent];
    }

    function getAgentBadgeCount(address agent) external view returns (uint256) {
        return agentBadgeDefinitions[agent].length;
    }

    function claimURI(address agent, uint256 defId) external view returns (string memory) {
        ClaimRecord memory record = claims[defId][agent];
        if (!record.exists) {
            revert ClaimMissing(defId, agent);
        }

        BadgeDefinition memory definition = definitions[defId];
        AgenticBadgeClaimMetadata.ClaimMetadataInput memory input = AgenticBadgeClaimMetadata.ClaimMetadataInput({
            agent: agent,
            definitionId: defId,
            claimedAt: record.claimedAt,
            name: definition.name,
            description: definition.description,
            badgeType: _badgeTypeName(definition.badgeType),
            verificationType: _verificationTypeName(definition.verificationType),
            externalUrl: _externalUrlForClaim(agent, defId),
            animationUrl: ""
        });

        string memory json = claimRenderer.buildClaimMetadata(input, definition.assetId);
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
        if (claims[defId][agent].exists) {
            revert AlreadyClaimed(defId, agent);
        }
        if (definition.expiresAt != 0 && block.timestamp > definition.expiresAt) {
            revert BadgeExpired(defId);
        }
        if (definition.maxClaims != 0 && definition.claimCount >= definition.maxClaims) {
            revert MaxClaimsReached(defId);
        }
    }

    function _recordClaim(uint256 defId, address agent, bytes32 proofHash) internal {
        definitions[defId].claimCount++;
        claims[defId][agent] =
            ClaimRecord({definitionId: defId, claimedAt: uint64(block.timestamp), proofHash: proofHash, exists: true});
        agentBadgeDefinitions[agent].push(defId);

        emit BadgeClaimed(defId, agent, definitions[defId].verificationType, proofHash);
        _writeReputation(agent);
    }

    function _requireManualAttestorBadge(uint256 defId, BadgeDefinition storage definition) internal view {
        if (
            definition.verificationType != VerificationType.ONCHAIN_STATE || definition.verificationData.length != 0
                || definition.advancedPolicy.length != 0
        ) {
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

    function _verifyOracleAttestation(
        uint256 defId,
        bytes memory data,
        bytes memory advancedPolicy,
        address agent,
        bytes calldata proof
    ) internal view returns (AdvancedEvidenceSummary memory advancedEvidence) {
        address expectedSigner = abi.decode(data, (address));
        if (advancedPolicy.length == 0) {
            _verifyLegacyOracleAttestation(defId, expectedSigner, agent, proof);
            return advancedEvidence;
        }

        BadgePolicyTypes.BadgePolicy memory policy = _decodeAdvancedPolicy(advancedPolicy);
        if (policy.ruleKind == BadgePolicyTypes.PolicyRuleKind.NONE) {
            _verifyLegacyOracleAttestation(defId, expectedSigner, agent, proof);
            return advancedEvidence;
        }
        if (policy.ruleKind != BadgePolicyTypes.PolicyRuleKind.ORACLE_8183) {
            revert UnsupportedAdvancedPolicy(policy.ruleKind);
        }

        Decoded8183Proof memory decodedProof = _decode8183Proof(proof);
        _enforceIdentityPolicy(policy.identity, agent);
        _validateEvidencePolicy(policy.evidence, decodedProof);

        address requiredIssuer =
            policy.evidence.requiredIssuer == address(0) ? expectedSigner : policy.evidence.requiredIssuer;
        address signer = ecrecover(
            _oracle8183Digest(
                defId,
                agent,
                policy.evidence.schemaId,
                decodedProof.contextId,
                decodedProof.nonce,
                decodedProof.issuedAt,
                decodedProof.expiresAt
            ),
            decodedProof.v,
            decodedProof.r,
            decodedProof.s
        );

        if (signer == address(0) || requiredIssuer == address(0) || signer != requiredIssuer) {
            revert InvalidAttestation();
        }
        _enforceIssuerReputation(policy.identity.minIssuerReputation, signer);

        bytes32 nonceHash = _resolveEvidenceNonceHash(
            policy.evidence.nonceScope, signer, agent, decodedProof.contextId, decodedProof.nonce
        );
        if (nonceHash != bytes32(0) && usedEvidenceNonces[nonceHash]) {
            revert EvidenceNonceUsed(nonceHash);
        }

        return AdvancedEvidenceSummary({
            issuer: signer,
            contextId: decodedProof.contextId,
            expiresAt: decodedProof.expiresAt,
            nonceHash: nonceHash,
            exists: true
        });
    }

    function _verifyLegacyOracleAttestation(uint256 defId, address expectedSigner, address agent, bytes calldata proof)
        internal
        view
    {
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

    function _verifyAgentAttestation(
        uint256 defId,
        bytes memory data,
        bytes memory advancedPolicy,
        address agent,
        bytes calldata proof
    ) internal view returns (AdvancedEvidenceSummary memory advancedEvidence) {
        uint256 minReputation = abi.decode(data, (uint256));
        if (advancedPolicy.length == 0) {
            _verifyLegacyAgentAttestation(defId, minReputation, agent, proof);
            return advancedEvidence;
        }

        BadgePolicyTypes.BadgePolicy memory policy = _decodeAdvancedPolicy(advancedPolicy);
        if (policy.ruleKind == BadgePolicyTypes.PolicyRuleKind.NONE) {
            _verifyLegacyAgentAttestation(defId, minReputation, agent, proof);
            return advancedEvidence;
        }
        if (policy.ruleKind != BadgePolicyTypes.PolicyRuleKind.AGENT_8183) {
            revert UnsupportedAdvancedPolicy(policy.ruleKind);
        }

        Decoded8183Proof memory decodedProof = _decode8183Proof(proof);
        _enforceIdentityPolicy(policy.identity, agent);
        _validateEvidencePolicy(policy.evidence, decodedProof);

        address signer = ecrecover(
            _agent8183Digest(
                defId,
                agent,
                policy.evidence.schemaId,
                decodedProof.contextId,
                decodedProof.nonce,
                decodedProof.issuedAt,
                decodedProof.expiresAt
            ),
            decodedProof.v,
            decodedProof.r,
            decodedProof.s
        );
        address requiredIssuer = policy.evidence.requiredIssuer;
        if (signer == address(0) || (requiredIssuer != address(0) && signer != requiredIssuer)) {
            revert InvalidAttestation();
        }

        uint256 effectiveMinReputation = minReputation;
        if (policy.identity.minIssuerReputation > effectiveMinReputation) {
            effectiveMinReputation = policy.identity.minIssuerReputation;
        }
        _enforceIssuerReputation(effectiveMinReputation, signer);

        bytes32 nonceHash = _resolveEvidenceNonceHash(
            policy.evidence.nonceScope, signer, agent, decodedProof.contextId, decodedProof.nonce
        );
        if (nonceHash != bytes32(0) && usedEvidenceNonces[nonceHash]) {
            revert EvidenceNonceUsed(nonceHash);
        }

        return AdvancedEvidenceSummary({
            issuer: signer,
            contextId: decodedProof.contextId,
            expiresAt: decodedProof.expiresAt,
            nonceHash: nonceHash,
            exists: true
        });
    }

    function _verifyLegacyAgentAttestation(uint256 defId, uint256 minReputation, address agent, bytes calldata proof)
        internal
        view
    {
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

    function _oracle8183Digest(
        uint256 defId,
        address agent,
        bytes32 schemaId,
        bytes32 contextId,
        bytes32 nonce,
        uint64 issuedAt,
        uint64 expiresAt
    ) internal view returns (bytes32) {
        bytes32 message = keccak256(
            abi.encodePacked(
                address(this),
                block.chainid,
                schemaId,
                "ORACLE_8183",
                defId,
                agent,
                contextId,
                nonce,
                issuedAt,
                expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }

    function _agent8183Digest(
        uint256 defId,
        address agent,
        bytes32 schemaId,
        bytes32 contextId,
        bytes32 nonce,
        uint64 issuedAt,
        uint64 expiresAt
    ) internal view returns (bytes32) {
        bytes32 message = keccak256(
            abi.encodePacked(
                address(this),
                block.chainid,
                schemaId,
                "AGENT_8183",
                defId,
                agent,
                contextId,
                nonce,
                issuedAt,
                expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }

    function _decodeAdvancedPolicy(bytes memory advancedPolicy)
        internal
        pure
        returns (BadgePolicyTypes.BadgePolicy memory policy)
    {
        policy = abi.decode(advancedPolicy, (BadgePolicyTypes.BadgePolicy));
    }

    function _decode8183Proof(bytes calldata proof) internal pure returns (Decoded8183Proof memory decodedProof) {
        (
            decodedProof.contextId,
            decodedProof.nonce,
            decodedProof.issuedAt,
            decodedProof.expiresAt,
            decodedProof.r,
            decodedProof.s,
            decodedProof.v
        ) = abi.decode(proof, (bytes32, bytes32, uint64, uint64, bytes32, bytes32, uint8));
    }

    function _validateEvidencePolicy(
        BadgePolicyTypes.EvidencePolicy memory evidencePolicy,
        Decoded8183Proof memory decodedProof
    ) internal view {
        if (evidencePolicy.schemaId == bytes32(0)) {
            revert InvalidAttestation();
        }
        if (evidencePolicy.contextId != bytes32(0) && decodedProof.contextId != evidencePolicy.contextId) {
            revert InvalidEvidenceContext(evidencePolicy.contextId, decodedProof.contextId);
        }

        if (evidencePolicy.requireExpiry) {
            if (decodedProof.expiresAt == 0 || decodedProof.expiresAt <= decodedProof.issuedAt) {
                revert InvalidAttestation();
            }
        } else if (decodedProof.expiresAt != 0 && decodedProof.expiresAt <= decodedProof.issuedAt) {
            revert InvalidAttestation();
        }

        if (decodedProof.expiresAt != 0 && block.timestamp > decodedProof.expiresAt) {
            revert AttestationExpired(decodedProof.expiresAt);
        }

        if (evidencePolicy.maxAge != 0 && block.timestamp > decodedProof.issuedAt + evidencePolicy.maxAge) {
            revert AttestationExpired(uint64(decodedProof.issuedAt + evidencePolicy.maxAge));
        }
    }

    function _enforceIdentityPolicy(BadgePolicyTypes.IdentityPolicy memory identityPolicy, address agent)
        internal
        view
    {
        if (
            identityPolicy.requireRegisteredAgent || identityPolicy.requirePrimaryWallet
                || identityPolicy.uniquePerAgent
        ) {
            if (address(identityRegistry) == address(0)) {
                revert IdentityRegistryUnavailable();
            }
            if (!identityRegistry.isRegistered(agent)) {
                revert AgentNotRegistered(agent);
            }
            // Claims are keyed by agent address, so unique-per-agent relies on using the
            // registered primary wallet as the canonical claim subject.
            if (identityPolicy.requirePrimaryWallet || identityPolicy.uniquePerAgent) {
                address primaryWallet = identityRegistry.getAgentWallet(agent);
                if (primaryWallet == address(0) || primaryWallet != agent) {
                    revert PrimaryWalletMismatch(agent, primaryWallet);
                }
            }
        }

        if (identityPolicy.minSubjectReputation != 0) {
            if (address(reputationRegistry) == address(0)) {
                revert ReputationRegistryUnavailable();
            }
            (, uint256 summaryValue,) = reputationRegistry.getSummary(agent);
            if (summaryValue < identityPolicy.minSubjectReputation) {
                revert SubjectReputationTooLow(agent, summaryValue, identityPolicy.minSubjectReputation);
            }
        }
    }

    function _resolveEvidenceNonceHash(
        BadgePolicyTypes.NonceScope nonceScope,
        address issuer,
        address agent,
        bytes32 contextId,
        bytes32 nonce
    ) internal view returns (bytes32) {
        if (nonceScope == BadgePolicyTypes.NonceScope.NONE || nonce == bytes32(0)) {
            return bytes32(0);
        }
        if (nonceScope == BadgePolicyTypes.NonceScope.GLOBAL) {
            return keccak256(abi.encodePacked(address(this), nonce));
        }
        if (nonceScope == BadgePolicyTypes.NonceScope.PER_ISSUER) {
            return keccak256(abi.encodePacked(address(this), issuer, nonce));
        }
        if (nonceScope == BadgePolicyTypes.NonceScope.PER_SUBJECT) {
            return keccak256(abi.encodePacked(address(this), agent, nonce));
        }
        return keccak256(abi.encodePacked(address(this), contextId, nonce));
    }

    function _enforceIssuerReputation(uint256 minReputation, address issuer) internal view {
        if (minReputation == 0) {
            return;
        }
        if (address(reputationRegistry) == address(0)) {
            revert ReputationRegistryUnavailable();
        }

        (, uint256 summaryValue,) = reputationRegistry.getSummary(issuer);
        if (summaryValue < minReputation) {
            revert AttestorReputationTooLow();
        }
    }

    function _writeReputation(address agent) internal {
        if (address(reputationRegistry) == address(0)) {
            return;
        }

        uint256 badgeCount = agentBadgeDefinitions[agent].length;
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
            revert BadgeMissing(defId);
        }
    }

    function _checkBadgeEditor(BadgeDefinition storage definition) internal view {
        if (msg.sender != definition.creator && msg.sender != owner()) {
            revert NotAuthorized(msg.sender, definition.id);
        }
    }

    function _externalUrlForClaim(address agent, uint256 defId) internal view returns (string memory) {
        if (bytes(claimPageBaseUri).length == 0) {
            return "";
        }

        string memory separator = _containsQuery(claimPageBaseUri) ? "&" : "?";
        return string.concat(
            claimPageBaseUri, separator, "claimAgent=", _addressToHexString(agent), "&claimDef=", _uintToString(defId)
        );
    }

    function _containsQuery(string memory value) internal pure returns (bool) {
        bytes memory buffer = bytes(value);
        for (uint256 i = 0; i < buffer.length; i++) {
            if (buffer[i] == 0x3f) {
                return true;
            }
        }
        return false;
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

    function _addressToHexString(address account) internal pure returns (string memory) {
        bytes20 value = bytes20(account);
        bytes16 hexDigits = "0123456789abcdef";
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";

        for (uint256 i = 0; i < 20; i++) {
            uint8 current = uint8(value[i]);
            buffer[2 + i * 2] = hexDigits[current >> 4];
            buffer[3 + i * 2] = hexDigits[current & 0x0f];
        }

        return string(buffer);
    }
}
