// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    function isRegistered(address agent) external view returns (bool);

    function getAgentWallet(address agent) external view returns (address wallet);
}
