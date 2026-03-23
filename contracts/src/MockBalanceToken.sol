// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";

/// @notice Minimal mintable token used for local onchain-state badge unlocks.
contract MockBalanceToken is Ownable {
    error ZeroAddress(string field);

    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address ownerAddress
    ) Ownable(ownerAddress) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) {
            revert ZeroAddress("to");
        }

        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
