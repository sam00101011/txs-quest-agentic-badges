// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReputationRegistry {
    function giveFeedback(address agent, uint8 score) external;

    function getSummary(
        address agent
    ) external view returns (uint256 count, uint256 summaryValue, uint256 lastUpdatedAt);
}
