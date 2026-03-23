// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

contract SimpleIdentityRegistry is Ownable, IIdentityRegistry {
    error ZeroAddress();
    error WalletMismatch(address expected, address provided);

    mapping(address => bool) internal registeredAgents;
    mapping(address => address) internal agentWallets;

    event IdentityUpdated(address indexed agent, address indexed wallet, bool registered);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerSelf() external {
        registeredAgents[msg.sender] = true;
        agentWallets[msg.sender] = msg.sender;
        emit IdentityUpdated(msg.sender, msg.sender, true);
    }

    function setIdentity(address agent, address wallet, bool registered) external onlyOwner {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        if (wallet == address(0) && registered) {
            revert ZeroAddress();
        }

        registeredAgents[agent] = registered;
        agentWallets[agent] = registered ? wallet : address(0);
        emit IdentityUpdated(agent, agentWallets[agent], registered);
    }

    function registerFor(address agent) external {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        if (agent != msg.sender) {
            revert WalletMismatch(agent, msg.sender);
        }

        registeredAgents[agent] = true;
        agentWallets[agent] = msg.sender;
        emit IdentityUpdated(agent, msg.sender, true);
    }

    function isRegistered(address agent) external view returns (bool) {
        return registeredAgents[agent];
    }

    function getAgentWallet(address agent) external view returns (address wallet) {
        return agentWallets[agent];
    }
}
