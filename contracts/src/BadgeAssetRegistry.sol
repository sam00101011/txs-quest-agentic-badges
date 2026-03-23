// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./lib/Ownable.sol";
import {IBadgeAssetRegistry} from "./interfaces/IBadgeAssetRegistry.sol";

contract BadgeAssetRegistry is Ownable, IBadgeAssetRegistry {
    error AssetNotFound(uint256 assetId);
    error NotAuthorized(address caller, uint256 assetId);
    error EmptyAssetUri();
    error MissingVideoHash();
    error MissingPosterHash();

    uint256 public nextAssetId;

    mapping(uint256 => BadgeAsset) private assets;
    mapping(address => uint256[]) private creatorAssets;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerAsset(
        BadgeAssetInput calldata input
    ) external returns (uint256 assetId) {
        _validate(input);

        assetId = nextAssetId++;
        assets[assetId] = BadgeAsset({
            id: assetId,
            videoUri: input.videoUri,
            posterUri: input.posterUri,
            detailUri: input.detailUri,
            videoHash: input.videoHash,
            posterHash: input.posterHash,
            edition: input.edition,
            loopSeconds: input.loopSeconds,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            active: true
        });

        creatorAssets[msg.sender].push(assetId);
        emit AssetRegistered(assetId, msg.sender, input.videoUri, input.videoHash);
    }

    function updateAsset(uint256 assetId, BadgeAssetInput calldata input) external {
        _validate(input);

        BadgeAsset storage asset = _getAssetStorage(assetId);
        _checkAuthorized(assetId, asset.creator);

        asset.videoUri = input.videoUri;
        asset.posterUri = input.posterUri;
        asset.detailUri = input.detailUri;
        asset.videoHash = input.videoHash;
        asset.posterHash = input.posterHash;
        asset.edition = input.edition;
        asset.loopSeconds = input.loopSeconds;
        asset.updatedAt = uint64(block.timestamp);

        emit AssetUpdated(assetId, input.videoUri, input.videoHash);
    }

    function setAssetActive(uint256 assetId, bool active) external {
        BadgeAsset storage asset = _getAssetStorage(assetId);
        _checkAuthorized(assetId, asset.creator);

        asset.active = active;
        asset.updatedAt = uint64(block.timestamp);

        emit AssetStatusUpdated(assetId, active);
    }

    function getAsset(uint256 assetId) external view returns (BadgeAsset memory) {
        return _getAssetStorage(assetId);
    }

    function getCreatorAssets(
        address creator
    ) external view returns (uint256[] memory assetIds) {
        return creatorAssets[creator];
    }

    function exists(uint256 assetId) external view returns (bool) {
        return assets[assetId].creator != address(0);
    }

    function _getAssetStorage(
        uint256 assetId
    ) internal view returns (BadgeAsset storage asset) {
        asset = assets[assetId];
        if (asset.creator == address(0)) {
            revert AssetNotFound(assetId);
        }
    }

    function _checkAuthorized(uint256 assetId, address creator) internal view {
        if (msg.sender != creator && msg.sender != owner()) {
            revert NotAuthorized(msg.sender, assetId);
        }
    }

    function _validate(BadgeAssetInput calldata input) internal pure {
        bool hasVideo = bytes(input.videoUri).length != 0;
        bool hasPoster = bytes(input.posterUri).length != 0;

        if (!hasVideo && !hasPoster) {
            revert EmptyAssetUri();
        }
        if (hasVideo && input.videoHash == bytes32(0)) {
            revert MissingVideoHash();
        }
        if (hasPoster && input.posterHash == bytes32(0)) {
            revert MissingPosterHash();
        }
    }
}
