// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticPOAPMetadata} from "../libraries/AgenticPOAPMetadata.sol";

interface IBadgeMetadataRenderer {
    function buildTokenMetadata(
        AgenticPOAPMetadata.TokenMetadataInput calldata input,
        uint256 assetId
    ) external view returns (string memory);
}
