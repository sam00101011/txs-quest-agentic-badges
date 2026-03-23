// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @notice Minimal reputation registry for local Tempo badge iteration.
/// Writers can report a score for an agent, and the registry keeps the
/// highest reported summary value plus write count and timestamp.
contract SimpleReputationRegistry is Ownable, IReputationRegistry {
    error WriterUnauthorized(address writer);
    error ZeroAddress(string field);

    struct Summary {
        uint256 count;
        uint256 summaryValue;
        uint256 lastUpdatedAt;
    }

    mapping(address => Summary) private summaries;
    mapping(address => bool) public writers;

    event WriterUpdated(address indexed writer, bool authorized);
    event FeedbackRecorded(
        address indexed agent,
        address indexed writer,
        uint8 score,
        uint256 summaryValue,
        uint256 count
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setWriter(address writer, bool authorized) external onlyOwner {
        if (writer == address(0)) {
            revert ZeroAddress("writer");
        }

        writers[writer] = authorized;
        emit WriterUpdated(writer, authorized);
    }

    function giveFeedback(address agent, uint8 score) external {
        if (!writers[msg.sender]) {
            revert WriterUnauthorized(msg.sender);
        }
        if (agent == address(0)) {
            revert ZeroAddress("agent");
        }

        Summary storage summary = summaries[agent];
        summary.count += 1;
        if (score > summary.summaryValue) {
            summary.summaryValue = score;
        }
        summary.lastUpdatedAt = block.timestamp;

        emit FeedbackRecorded(agent, msg.sender, score, summary.summaryValue, summary.count);
    }

    function getSummary(
        address agent
    ) external view returns (uint256 count, uint256 summaryValue, uint256 lastUpdatedAt) {
        Summary memory summary = summaries[agent];
        return (summary.count, summary.summaryValue, summary.lastUpdatedAt);
    }
}
