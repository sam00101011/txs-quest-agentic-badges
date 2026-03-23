// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticBadgeRegistry} from "../contracts/src/AgenticBadgeRegistry.sol";
import {BadgeAssetRegistry} from "../contracts/src/BadgeAssetRegistry.sol";
import {BadgeClaimRenderer} from "../contracts/src/BadgeClaimRenderer.sol";
import {SimpleReputationRegistry} from "../contracts/src/SimpleReputationRegistry.sol";
import {IBadgeAssetRegistry} from "../contracts/src/interfaces/IBadgeAssetRegistry.sol";
import {IIdentityRegistry} from "../contracts/src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../contracts/src/interfaces/IReputationRegistry.sol";
import {BadgePolicyTypes} from "../contracts/src/libraries/BadgePolicyTypes.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function prank(address caller) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
    function expectRevert(bytes calldata revertData) external;
}

contract AgenticBadgeRegistryTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant ORACLE_PK = 0xA11CE;
    uint256 internal constant AGENT_PK = 0xB0B;
    uint256 internal constant ATTESTOR_PK = 0xD00D;
    uint256 internal constant SECOND_AGENT_PK = 0xCAFE;

    bytes32 internal constant ORACLE_SCHEMA = keccak256("agentic-poap.oracle-event.v1");
    bytes32 internal constant AGENT_SCHEMA = keccak256("agentic-poap.agent-attestation.v1");

    BadgeAssetRegistry internal assetRegistry;
    BadgeClaimRenderer internal claimRenderer;
    SimpleReputationRegistry internal reputationRegistry;
    AgenticBadgeRegistry internal badgeRegistry;

    address internal oracle;
    address internal agent;
    address internal attestorAgent;
    address internal secondAgent;
    uint256 internal assetId;

    function setUp() public {
        oracle = vm.addr(ORACLE_PK);
        agent = vm.addr(AGENT_PK);
        attestorAgent = vm.addr(ATTESTOR_PK);
        secondAgent = vm.addr(SECOND_AGENT_PK);

        assetRegistry = new BadgeAssetRegistry(address(this));
        claimRenderer = new BadgeClaimRenderer(address(assetRegistry));
        reputationRegistry = new SimpleReputationRegistry(address(this));
        badgeRegistry = new AgenticBadgeRegistry(
            address(assetRegistry), address(claimRenderer), address(0), address(reputationRegistry)
        );
        reputationRegistry.setWriter(address(this), true);
        reputationRegistry.setWriter(address(badgeRegistry), true);
        reputationRegistry.giveFeedback(attestorAgent, 10);

        assetId = assetRegistry.registerAsset(
            IBadgeAssetRegistry.BadgeAssetInput({
                videoUri: "/pins/pin1.mp4",
                posterUri: "/pins/pin1.jpg",
                detailUri: "/index.html?samplePin=pin1",
                videoHash: keccak256("pin1-video"),
                posterHash: keccak256("pin1-poster"),
                edition: "trailblazer-launch",
                loopSeconds: 5
            })
        );
    }

    function testLegacyOracleBadgeClaimStillWorks() public {
        uint256 definitionId = badgeRegistry.defineBadge(
            "Legacy Trailblazer",
            "Legacy oracle badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.ACHIEVEMENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            hex""
        );

        bytes32 digest = _legacyOracleDigest(address(badgeRegistry), definitionId, agent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PK, digest);
        bytes memory proof = abi.encode(r, s, v);

        vm.prank(agent);
        badgeRegistry.claim(definitionId, proof);

        AgenticBadgeRegistry.ClaimRecord memory record = badgeRegistry.getClaim(agent, definitionId);
        require(record.exists, "legacy claim missing");
        require(record.definitionId == definitionId, "legacy definition mismatch");
        require(record.proofHash == keccak256(proof), "legacy proof hash mismatch");
    }

    function testAttestAndRecordStillWorksForManualBadge() public {
        uint256 definitionId = badgeRegistry.defineBadge(
            "Manual Trailblazer",
            "Manual attestor badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.ACHIEVEMENT,
            AgenticBadgeRegistry.VerificationType.ONCHAIN_STATE,
            hex"",
            0,
            0,
            hex""
        );

        badgeRegistry.setAttestor(attestorAgent, true);
        vm.prank(attestorAgent);
        badgeRegistry.attestAndRecord(definitionId, agent);

        AgenticBadgeRegistry.ClaimRecord memory record = badgeRegistry.getClaim(agent, definitionId);
        require(record.exists, "manual claim missing");
    }

    function testAttestAndRecordRejectsProofBasedBadge() public {
        uint256 definitionId = badgeRegistry.defineBadge(
            "Oracle Trailblazer",
            "Proof-based oracle badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            hex""
        );

        badgeRegistry.setAttestor(attestorAgent, true);
        vm.expectRevert(abi.encodeWithSelector(AgenticBadgeRegistry.ManualAttestorOnly.selector, definitionId));
        vm.prank(attestorAgent);
        badgeRegistry.attestAndRecord(definitionId, agent);
    }

    function testAdvancedOracle8183ClaimWorks() public {
        bytes32 contextId = keccak256("trailblazer-launch-2026");
        uint256 definitionId = badgeRegistry.defineBadge(
            "8183 Trailblazer",
            "Advanced oracle badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            _buildOracle8183Policy(oracle, contextId, ORACLE_SCHEMA, false, false, false, 0, 0)
        );

        bytes32 nonce = keccak256("proof-nonce-one");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;
        bytes32 digest =
            _oracle8183Digest(badgeRegistry, definitionId, agent, ORACLE_SCHEMA, contextId, nonce, issuedAt, expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PK, digest);
        bytes memory proof = abi.encode(contextId, nonce, issuedAt, expiresAt, r, s, v);

        vm.warp(600);
        vm.prank(agent);
        badgeRegistry.claim(definitionId, proof);

        AgenticBadgeRegistry.ClaimRecord memory record = badgeRegistry.getClaim(agent, definitionId);
        bytes32 nonceHash = keccak256(abi.encodePacked(address(badgeRegistry), nonce));

        require(record.exists, "advanced claim missing");
        require(record.proofHash == keccak256(proof), "advanced proof hash mismatch");
        require(badgeRegistry.usedEvidenceNonces(nonceHash), "nonce should be consumed");
    }

    function testAdvancedOracle8183RequiresIdentityRegistryWhenConfigured() public {
        bytes32 contextId = keccak256("trailblazer-launch-2026");
        uint256 definitionId = badgeRegistry.defineBadge(
            "Identity Trailblazer",
            "Identity-enforced advanced oracle badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            _buildOracle8183Policy(oracle, contextId, ORACLE_SCHEMA, true, false, false, 0, 0)
        );

        bytes32 nonce = keccak256("identity-proof-nonce");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;
        bytes32 digest =
            _oracle8183Digest(badgeRegistry, definitionId, agent, ORACLE_SCHEMA, contextId, nonce, issuedAt, expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PK, digest);
        bytes memory proof = abi.encode(contextId, nonce, issuedAt, expiresAt, r, s, v);

        vm.warp(600);
        vm.expectRevert(abi.encodeWithSelector(AgenticBadgeRegistry.IdentityRegistryUnavailable.selector));
        vm.prank(agent);
        badgeRegistry.claim(definitionId, proof);
    }

    function testAdvancedOracle8183RequiresRegisteredAgentAndPrimaryWallet() public {
        MockIdentityRegistry identity = new MockIdentityRegistry();
        SimpleReputationRegistry localReputation = new SimpleReputationRegistry(address(this));
        AgenticBadgeRegistry registry = _deployBadgeRegistry(address(identity), address(localReputation));
        localReputation.setWriter(address(this), true);
        localReputation.setWriter(address(registry), true);

        bytes32 contextId = keccak256("trailblazer-launch-2026");
        uint256 definitionId = registry.defineBadge(
            "Registered Trailblazer",
            "Registered + primary wallet advanced oracle badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            _buildOracle8183Policy(oracle, contextId, ORACLE_SCHEMA, true, true, true, 0, 0)
        );

        bytes32 nonce = keccak256("registered-proof-nonce");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;
        bytes32 digest =
            _oracle8183Digest(registry, definitionId, agent, ORACLE_SCHEMA, contextId, nonce, issuedAt, expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PK, digest);
        bytes memory proof = abi.encode(contextId, nonce, issuedAt, expiresAt, r, s, v);

        vm.warp(600);
        vm.expectRevert(abi.encodeWithSelector(AgenticBadgeRegistry.AgentNotRegistered.selector, agent));
        vm.prank(agent);
        registry.claim(definitionId, proof);

        identity.setIdentity(agent, secondAgent, true);
        vm.expectRevert(abi.encodeWithSelector(AgenticBadgeRegistry.PrimaryWalletMismatch.selector, agent, secondAgent));
        vm.prank(agent);
        registry.claim(definitionId, proof);

        identity.setIdentity(agent, agent, true);
        vm.prank(agent);
        registry.claim(definitionId, proof);
        require(registry.hasBadge(agent, definitionId), "registered agent claim missing");
    }

    function testAdvancedOracle8183RequiresSubjectReputation() public {
        MockIdentityRegistry identity = new MockIdentityRegistry();
        SimpleReputationRegistry localReputation = new SimpleReputationRegistry(address(this));
        AgenticBadgeRegistry registry = _deployBadgeRegistry(address(identity), address(localReputation));
        localReputation.setWriter(address(this), true);
        localReputation.setWriter(address(registry), true);
        identity.setIdentity(agent, agent, true);

        bytes32 contextId = keccak256("trailblazer-launch-2026");
        uint256 definitionId = registry.defineBadge(
            "Trusted Trailblazer",
            "Subject reputation advanced oracle badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            _buildOracle8183Policy(oracle, contextId, ORACLE_SCHEMA, true, true, false, 2, 0)
        );

        bytes32 nonce = keccak256("trusted-proof-nonce");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;
        bytes32 digest =
            _oracle8183Digest(registry, definitionId, agent, ORACLE_SCHEMA, contextId, nonce, issuedAt, expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PK, digest);
        bytes memory proof = abi.encode(contextId, nonce, issuedAt, expiresAt, r, s, v);

        vm.warp(600);
        vm.expectRevert(
            abi.encodeWithSelector(AgenticBadgeRegistry.SubjectReputationTooLow.selector, agent, uint256(0), uint256(2))
        );
        vm.prank(agent);
        registry.claim(definitionId, proof);

        localReputation.giveFeedback(agent, 2);
        vm.prank(agent);
        registry.claim(definitionId, proof);
        require(registry.hasBadge(agent, definitionId), "trusted agent claim missing");
    }

    function testAdvancedOracle8183RejectsWrongSchema() public {
        bytes32 contextId = keccak256("trailblazer-launch-2026");
        uint256 definitionId = badgeRegistry.defineBadge(
            "Schema Trailblazer",
            "Schema-bound advanced oracle badge flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            _buildOracle8183Policy(oracle, contextId, ORACLE_SCHEMA, false, false, false, 0, 0)
        );

        bytes32 nonce = keccak256("wrong-schema-proof-nonce");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;
        bytes32 digest = _oracle8183Digest(
            badgeRegistry,
            definitionId,
            agent,
            keccak256("agentic-poap.oracle-event.v2"),
            contextId,
            nonce,
            issuedAt,
            expiresAt
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PK, digest);
        bytes memory proof = abi.encode(contextId, nonce, issuedAt, expiresAt, r, s, v);

        vm.warp(600);
        vm.expectRevert(abi.encodeWithSelector(AgenticBadgeRegistry.InvalidAttestation.selector));
        vm.prank(agent);
        badgeRegistry.claim(definitionId, proof);
    }

    function testLegacyAgentAttestationStillWorks() public {
        uint256 definitionId = badgeRegistry.defineBadge(
            "Legacy Peer Vouch",
            "Legacy agent attestation flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.ACHIEVEMENT,
            AgenticBadgeRegistry.VerificationType.AGENT_ATTESTATION,
            abi.encode(uint256(5)),
            0,
            0,
            hex""
        );

        bytes32 digest = _legacyOracleDigest(address(badgeRegistry), definitionId, agent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_PK, digest);
        bytes memory proof = abi.encode(attestorAgent, r, s, v);

        vm.prank(agent);
        badgeRegistry.claim(definitionId, proof);

        AgenticBadgeRegistry.ClaimRecord memory record = badgeRegistry.getClaim(agent, definitionId);
        require(record.exists, "legacy agent claim missing");
        require(record.proofHash == keccak256(proof), "legacy agent proof hash mismatch");
    }

    function testAdvancedAgent8183ClaimWorks() public {
        bytes32 contextId = keccak256("peer-vouch-2026");
        uint256 definitionId = badgeRegistry.defineBadge(
            "8183 Peer Vouch",
            "Advanced agent attestation flow",
            assetId,
            AgenticBadgeRegistry.BadgeType.ACHIEVEMENT,
            AgenticBadgeRegistry.VerificationType.AGENT_ATTESTATION,
            abi.encode(uint256(5)),
            0,
            0,
            _buildAgent8183Policy(attestorAgent, contextId, AGENT_SCHEMA, 5)
        );

        bytes32 nonce = keccak256("agent-proof-nonce-one");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;
        bytes32 digest =
            _agent8183Digest(badgeRegistry, definitionId, agent, AGENT_SCHEMA, contextId, nonce, issuedAt, expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_PK, digest);
        bytes memory proof = abi.encode(contextId, nonce, issuedAt, expiresAt, r, s, v);

        vm.warp(600);
        vm.prank(agent);
        badgeRegistry.claim(definitionId, proof);

        AgenticBadgeRegistry.ClaimRecord memory record = badgeRegistry.getClaim(agent, definitionId);
        bytes32 nonceHash = keccak256(abi.encodePacked(address(badgeRegistry), nonce));

        require(record.exists, "advanced agent claim missing");
        require(record.proofHash == keccak256(proof), "advanced agent proof hash mismatch");
        require(badgeRegistry.usedEvidenceNonces(nonceHash), "advanced agent nonce should be consumed");
    }

    function testAdvancedOracle8183RejectsReusedNonce() public {
        bytes32 contextId = keccak256("trailblazer-launch-2026");
        bytes memory policy = _buildOracle8183Policy(oracle, contextId, ORACLE_SCHEMA, false, false, false, 0, 0);

        uint256 definitionIdOne = badgeRegistry.defineBadge(
            "8183 Trailblazer One",
            "First advanced badge",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            policy
        );

        uint256 definitionIdTwo = badgeRegistry.defineBadge(
            "8183 Trailblazer Two",
            "Second advanced badge",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            policy
        );

        bytes32 nonce = keccak256("shared-proof-nonce");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;

        bytes32 digestOne = _oracle8183Digest(
            badgeRegistry, definitionIdOne, agent, ORACLE_SCHEMA, contextId, nonce, issuedAt, expiresAt
        );
        (uint8 vOne, bytes32 rOne, bytes32 sOne) = vm.sign(ORACLE_PK, digestOne);
        bytes memory proofOne = abi.encode(contextId, nonce, issuedAt, expiresAt, rOne, sOne, vOne);

        vm.warp(600);
        vm.prank(agent);
        badgeRegistry.claim(definitionIdOne, proofOne);

        bytes32 digestTwo = _oracle8183Digest(
            badgeRegistry, definitionIdTwo, secondAgent, ORACLE_SCHEMA, contextId, nonce, issuedAt, expiresAt
        );
        (uint8 vTwo, bytes32 rTwo, bytes32 sTwo) = vm.sign(ORACLE_PK, digestTwo);
        bytes memory proofTwo = abi.encode(contextId, nonce, issuedAt, expiresAt, rTwo, sTwo, vTwo);

        bytes32 nonceHash = keccak256(abi.encodePacked(address(badgeRegistry), nonce));
        vm.expectRevert(abi.encodeWithSelector(AgenticBadgeRegistry.EvidenceNonceUsed.selector, nonceHash));
        vm.prank(secondAgent);
        badgeRegistry.claim(definitionIdTwo, proofTwo);
    }

    function testAdvancedOracle8183ConsumesNonceBeforeReputationWrite() public {
        ReentrantReputationRegistry reentrantReputation = new ReentrantReputationRegistry();
        AgenticBadgeRegistry registry = _deployBadgeRegistry(address(0), address(reentrantReputation));
        bytes32 contextId = keccak256("trailblazer-launch-2026");
        bytes memory policy = _buildOracle8183Policy(oracle, contextId, ORACLE_SCHEMA, false, false, false, 0, 0);

        uint256 definitionIdOne = registry.defineBadge(
            "Reentrant Trailblazer One",
            "Outer advanced badge",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            policy
        );
        uint256 definitionIdTwo = registry.defineBadge(
            "Reentrant Trailblazer Two",
            "Nested advanced badge",
            assetId,
            AgenticBadgeRegistry.BadgeType.EVENT,
            AgenticBadgeRegistry.VerificationType.ORACLE_ATTESTATION,
            abi.encode(oracle),
            0,
            0,
            policy
        );

        bytes32 nonce = keccak256("reentrant-shared-proof-nonce");
        uint64 issuedAt = 120;
        uint64 expiresAt = 3600;

        bytes32 digestOne =
            _oracle8183Digest(registry, definitionIdOne, agent, ORACLE_SCHEMA, contextId, nonce, issuedAt, expiresAt);
        (uint8 vOne, bytes32 rOne, bytes32 sOne) = vm.sign(ORACLE_PK, digestOne);
        bytes memory proofOne = abi.encode(contextId, nonce, issuedAt, expiresAt, rOne, sOne, vOne);

        bytes32 digestTwo = _oracle8183Digest(
            registry,
            definitionIdTwo,
            address(reentrantReputation),
            ORACLE_SCHEMA,
            contextId,
            nonce,
            issuedAt,
            expiresAt
        );
        (uint8 vTwo, bytes32 rTwo, bytes32 sTwo) = vm.sign(ORACLE_PK, digestTwo);
        bytes memory proofTwo = abi.encode(contextId, nonce, issuedAt, expiresAt, rTwo, sTwo, vTwo);

        reentrantReputation.arm(registry, definitionIdTwo, proofTwo);

        vm.warp(600);
        vm.prank(agent);
        registry.claim(definitionIdOne, proofOne);

        require(registry.hasBadge(agent, definitionIdOne), "outer claim missing");
        require(!reentrantReputation.nestedCallSucceeded(), "nested replay should fail");
        require(
            !registry.hasBadge(address(reentrantReputation), definitionIdTwo), "reentrant replay should not succeed"
        );
    }

    function _deployBadgeRegistry(address identityRegistryAddress, address reputationRegistryAddress)
        internal
        returns (AgenticBadgeRegistry)
    {
        return new AgenticBadgeRegistry(
            address(assetRegistry), address(claimRenderer), identityRegistryAddress, reputationRegistryAddress
        );
    }

    function _legacyOracleDigest(address registry, uint256 definitionId, address subject)
        internal
        pure
        returns (bytes32)
    {
        bytes32 message = keccak256(abi.encodePacked(registry, definitionId, subject));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }

    function _oracle8183Digest(
        AgenticBadgeRegistry registry,
        uint256 definitionId,
        address subject,
        bytes32 schemaId,
        bytes32 contextId,
        bytes32 nonce,
        uint64 issuedAt,
        uint64 expiresAt
    ) internal view returns (bytes32) {
        bytes32 message = keccak256(
            abi.encodePacked(
                address(registry),
                block.chainid,
                schemaId,
                "ORACLE_8183",
                definitionId,
                subject,
                contextId,
                nonce,
                issuedAt,
                expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }

    function _agent8183Digest(
        AgenticBadgeRegistry registry,
        uint256 definitionId,
        address subject,
        bytes32 schemaId,
        bytes32 contextId,
        bytes32 nonce,
        uint64 issuedAt,
        uint64 expiresAt
    ) internal view returns (bytes32) {
        bytes32 message = keccak256(
            abi.encodePacked(
                address(registry),
                block.chainid,
                schemaId,
                "AGENT_8183",
                definitionId,
                subject,
                contextId,
                nonce,
                issuedAt,
                expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }

    function _buildOracle8183Policy(
        address issuer,
        bytes32 contextId,
        bytes32 schemaId,
        bool requireRegisteredAgent,
        bool requirePrimaryWallet,
        bool uniquePerAgent,
        uint64 minSubjectReputation,
        uint64 minIssuerReputation
    ) internal pure returns (bytes memory) {
        BadgePolicyTypes.BadgePolicy memory policy = BadgePolicyTypes.BadgePolicy({
            ruleKind: BadgePolicyTypes.PolicyRuleKind.ORACLE_8183,
            identity: BadgePolicyTypes.IdentityPolicy({
                requireRegisteredAgent: requireRegisteredAgent,
                requirePrimaryWallet: requirePrimaryWallet,
                uniquePerAgent: uniquePerAgent,
                minSubjectReputation: minSubjectReputation,
                minIssuerReputation: minIssuerReputation
            }),
            evidence: BadgePolicyTypes.EvidencePolicy({
                schemaId: schemaId,
                contextId: contextId,
                requiredIssuer: issuer,
                maxAge: 0,
                requireExpiry: true,
                nonceScope: BadgePolicyTypes.NonceScope.GLOBAL
            }),
            scarcity: BadgePolicyTypes.ScarcityPolicy({startsAt: 0, endsAt: 0, maxClaims: 0}),
            onchain: BadgePolicyTypes.OnchainPolicy({target: address(0), selector: bytes4(0), threshold: 0}),
            merkleRoot: bytes32(0)
        });

        return abi.encode(policy);
    }

    function _buildAgent8183Policy(address issuer, bytes32 contextId, bytes32 schemaId, uint64 minIssuerReputation)
        internal
        pure
        returns (bytes memory)
    {
        BadgePolicyTypes.BadgePolicy memory policy = BadgePolicyTypes.BadgePolicy({
            ruleKind: BadgePolicyTypes.PolicyRuleKind.AGENT_8183,
            identity: BadgePolicyTypes.IdentityPolicy({
                requireRegisteredAgent: false,
                requirePrimaryWallet: false,
                uniquePerAgent: false,
                minSubjectReputation: 0,
                minIssuerReputation: minIssuerReputation
            }),
            evidence: BadgePolicyTypes.EvidencePolicy({
                schemaId: schemaId,
                contextId: contextId,
                requiredIssuer: issuer,
                maxAge: 0,
                requireExpiry: true,
                nonceScope: BadgePolicyTypes.NonceScope.GLOBAL
            }),
            scarcity: BadgePolicyTypes.ScarcityPolicy({startsAt: 0, endsAt: 0, maxClaims: 0}),
            onchain: BadgePolicyTypes.OnchainPolicy({target: address(0), selector: bytes4(0), threshold: 0}),
            merkleRoot: bytes32(0)
        });

        return abi.encode(policy);
    }
}

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(address => bool) internal registered;
    mapping(address => address) internal primaryWallet;

    function setIdentity(address agent, address wallet, bool isRegisteredValue) external {
        registered[agent] = isRegisteredValue;
        primaryWallet[agent] = wallet;
    }

    function isRegistered(address agent) external view returns (bool) {
        return registered[agent];
    }

    function getAgentWallet(address agent) external view returns (address wallet) {
        return primaryWallet[agent];
    }
}

contract ReentrantReputationRegistry is IReputationRegistry {
    AgenticBadgeRegistry internal registry;
    uint256 internal definitionId;
    bytes internal proof;
    bool internal armed;
    bool internal nestedSucceeded;

    mapping(address => uint256) internal counts;
    mapping(address => uint256) internal values;

    function arm(AgenticBadgeRegistry registryValue, uint256 definitionIdValue, bytes calldata proofValue) external {
        registry = registryValue;
        definitionId = definitionIdValue;
        proof = proofValue;
        armed = true;
        nestedSucceeded = false;
    }

    function giveFeedback(address agent, uint8 score) external {
        counts[agent] += 1;
        values[agent] = score;

        if (!armed) {
            return;
        }

        armed = false;
        (bool success,) = address(registry).call(abi.encodeCall(AgenticBadgeRegistry.claim, (definitionId, proof)));
        nestedSucceeded = success;
    }

    function getSummary(address agent)
        external
        view
        returns (uint256 count, uint256 summaryValue, uint256 lastUpdatedAt)
    {
        return (counts[agent], values[agent], 0);
    }

    function nestedCallSucceeded() external view returns (bool) {
        return nestedSucceeded;
    }
}
