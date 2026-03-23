// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBadgeAssetRegistry {
    struct BadgeAssetInput {
        string videoUri;
        string posterUri;
        string detailUri;
        bytes32 videoHash;
        bytes32 posterHash;
        string edition;
        uint32 loopSeconds;
    }

    struct BadgeAsset {
        uint256 id;
        string videoUri;
        string posterUri;
        string detailUri;
        bytes32 videoHash;
        bytes32 posterHash;
        string edition;
        uint32 loopSeconds;
        address creator;
        uint64 createdAt;
        uint64 updatedAt;
        bool active;
    }

    event AssetRegistered(
        uint256 indexed assetId,
        address indexed creator,
        string videoUri,
        bytes32 videoHash
    );
    event AssetUpdated(uint256 indexed assetId, string videoUri, bytes32 videoHash);
    event AssetStatusUpdated(uint256 indexed assetId, bool active);

    function registerAsset(
        BadgeAssetInput calldata input
    ) external returns (uint256 assetId);

    function updateAsset(uint256 assetId, BadgeAssetInput calldata input) external;

    function setAssetActive(uint256 assetId, bool active) external;

    function getAsset(uint256 assetId) external view returns (BadgeAsset memory);

    function getCreatorAssets(
        address creator
    ) external view returns (uint256[] memory assetIds);

    function exists(uint256 assetId) external view returns (bool);
}
