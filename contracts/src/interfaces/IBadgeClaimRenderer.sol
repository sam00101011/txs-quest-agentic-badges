// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticBadgeClaimMetadata} from "../libraries/AgenticBadgeClaimMetadata.sol";

interface IBadgeClaimRenderer {
    function buildClaimMetadata(
        AgenticBadgeClaimMetadata.ClaimMetadataInput calldata input,
        uint256 assetId
    ) external view returns (string memory);
}
