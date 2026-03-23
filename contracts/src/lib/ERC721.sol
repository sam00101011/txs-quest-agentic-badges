// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal mint-only ERC-721 style base for badge issuance drafts.
abstract contract ERC721 {
    error ERC721InvalidOwner(address ownerAddress);
    error ERC721TokenAlreadyMinted(uint256 tokenId);

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    string private _name;
    string private _symbol;

    mapping(uint256 => address) internal _owners;
    mapping(address => uint256) internal _balances;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _ownerOf(tokenId);
    }

    function balanceOf(address ownerAddress) external view returns (uint256) {
        if (ownerAddress == address(0)) {
            revert ERC721InvalidOwner(address(0));
        }
        return _balances[ownerAddress];
    }

    function _ownerOf(uint256 tokenId) internal view returns (address) {
        return _owners[tokenId];
    }

    function _mint(address to, uint256 tokenId) internal {
        if (to == address(0)) {
            revert ERC721InvalidOwner(address(0));
        }
        if (_owners[tokenId] != address(0)) {
            revert ERC721TokenAlreadyMinted(tokenId);
        }

        _owners[tokenId] = to;
        _balances[to] += 1;

        emit Transfer(address(0), to, tokenId);
    }

    function tokenURI(uint256 tokenId) public view virtual returns (string memory);
}
