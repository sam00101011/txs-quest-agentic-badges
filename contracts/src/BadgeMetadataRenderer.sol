// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBadgeAssetRegistry} from "./interfaces/IBadgeAssetRegistry.sol";
import {IBadgeMetadataRenderer} from "./interfaces/IBadgeMetadataRenderer.sol";
import {AgenticPOAPMetadata} from "./libraries/AgenticPOAPMetadata.sol";

contract BadgeMetadataRenderer is IBadgeMetadataRenderer {
    IBadgeAssetRegistry public immutable assetRegistry;

    constructor(address assetRegistryAddress) {
        assetRegistry = IBadgeAssetRegistry(assetRegistryAddress);
    }

    function buildTokenMetadata(
        AgenticPOAPMetadata.TokenMetadataInput calldata input,
        uint256 assetId
    ) external view returns (string memory) {
        AgenticPOAPMetadata.TokenMetadataInput memory copiedInput = input;
        return AgenticPOAPMetadata.buildJson(copiedInput, assetRegistry.getAsset(assetId));
    }
}
