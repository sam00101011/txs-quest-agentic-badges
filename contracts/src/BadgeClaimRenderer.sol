// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBadgeAssetRegistry} from "./interfaces/IBadgeAssetRegistry.sol";
import {IBadgeClaimRenderer} from "./interfaces/IBadgeClaimRenderer.sol";
import {AgenticBadgeClaimMetadata} from "./libraries/AgenticBadgeClaimMetadata.sol";

contract BadgeClaimRenderer is IBadgeClaimRenderer {
    IBadgeAssetRegistry public immutable assetRegistry;

    constructor(address assetRegistryAddress) {
        assetRegistry = IBadgeAssetRegistry(assetRegistryAddress);
    }

    function buildClaimMetadata(
        AgenticBadgeClaimMetadata.ClaimMetadataInput calldata input,
        uint256 assetId
    ) external view returns (string memory) {
        AgenticBadgeClaimMetadata.ClaimMetadataInput memory copiedInput = input;
        return AgenticBadgeClaimMetadata.buildJson(
            copiedInput,
            assetRegistry.getAsset(assetId)
        );
    }
}
