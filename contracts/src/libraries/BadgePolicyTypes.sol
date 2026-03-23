// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Draft optional policy model for 8004 identity/reputation + 8183 evidence-backed badges.
/// @dev This is intentionally a standalone type library for the next registry upgrade.
/// Normal badges should remain free to use the existing verificationType + verificationData path.
library BadgePolicyTypes {
    enum PolicyRuleKind {
        NONE,
        ONCHAIN_STATE,
        MERKLE,
        ORACLE_8183,
        AGENT_8183
    }

    enum NonceScope {
        NONE,
        GLOBAL,
        PER_ISSUER,
        PER_SUBJECT
    }

    struct IdentityPolicy {
        bool requireRegisteredAgent;
        bool requirePrimaryWallet;
        bool uniquePerAgent;
        uint64 minSubjectReputation;
        uint64 minIssuerReputation;
    }

    struct EvidencePolicy {
        bytes32 schemaId;
        bytes32 contextId;
        address requiredIssuer;
        uint64 maxAge;
        bool requireExpiry;
        NonceScope nonceScope;
    }

    struct ScarcityPolicy {
        uint64 startsAt;
        uint64 endsAt;
        uint32 maxClaims;
    }

    struct OnchainPolicy {
        address target;
        bytes4 selector;
        uint256 threshold;
    }

    struct BadgePolicy {
        PolicyRuleKind ruleKind;
        IdentityPolicy identity;
        EvidencePolicy evidence;
        ScarcityPolicy scarcity;
        OnchainPolicy onchain;
        bytes32 merkleRoot;
    }

    function hashPolicy(BadgePolicy memory policy) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                policy.ruleKind,
                policy.identity.requireRegisteredAgent,
                policy.identity.requirePrimaryWallet,
                policy.identity.uniquePerAgent,
                policy.identity.minSubjectReputation,
                policy.identity.minIssuerReputation,
                policy.evidence.schemaId,
                policy.evidence.contextId,
                policy.evidence.requiredIssuer,
                policy.evidence.maxAge,
                policy.evidence.requireExpiry,
                policy.evidence.nonceScope,
                policy.scarcity.startsAt,
                policy.scarcity.endsAt,
                policy.scarcity.maxClaims,
                policy.onchain.target,
                policy.onchain.selector,
                policy.onchain.threshold,
                policy.merkleRoot
            )
        );
    }
}
