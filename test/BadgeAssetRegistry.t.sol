// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BadgeAssetRegistry} from "../contracts/src/BadgeAssetRegistry.sol";
import {IBadgeAssetRegistry} from "../contracts/src/interfaces/IBadgeAssetRegistry.sol";

interface Vm {
    function expectRevert(bytes calldata revertData) external;
}

contract BadgeAssetRegistryTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    BadgeAssetRegistry internal assetRegistry;

    function setUp() public {
        assetRegistry = new BadgeAssetRegistry(address(this));
    }

    function testRegisterAssetAllowsPosterOnly() public {
        bytes32 posterHash = keccak256("pin25-poster");
        uint256 assetId = assetRegistry.registerAsset(
            IBadgeAssetRegistry.BadgeAssetInput({
                videoUri: "",
                posterUri: "/pins/pin25.jpg",
                detailUri: "/index.html?badge=farcaster",
                videoHash: bytes32(0),
                posterHash: posterHash,
                edition: "farcaster-10000-plus",
                loopSeconds: 5
            })
        );

        IBadgeAssetRegistry.BadgeAsset memory asset = assetRegistry.getAsset(assetId);
        require(bytes(asset.videoUri).length == 0, "video should be optional");
        require(
            keccak256(bytes(asset.posterUri)) == keccak256(bytes("/pins/pin25.jpg")),
            "poster uri mismatch"
        );
        require(asset.posterHash == posterHash, "poster hash mismatch");
    }

    function testRegisterAssetRejectsMissingMediaUris() public {
        vm.expectRevert(abi.encodeWithSelector(BadgeAssetRegistry.EmptyAssetUri.selector));
        assetRegistry.registerAsset(
            IBadgeAssetRegistry.BadgeAssetInput({
                videoUri: "",
                posterUri: "",
                detailUri: "/index.html?badge=empty",
                videoHash: bytes32(0),
                posterHash: bytes32(0),
                edition: "empty",
                loopSeconds: 5
            })
        );
    }

    function testRegisterAssetStillRequiresVideoHashWhenVideoExists() public {
        vm.expectRevert(abi.encodeWithSelector(BadgeAssetRegistry.MissingVideoHash.selector));
        assetRegistry.registerAsset(
            IBadgeAssetRegistry.BadgeAssetInput({
                videoUri: "/pins/pin1.mp4",
                posterUri: "",
                detailUri: "/index.html?badge=video-only",
                videoHash: bytes32(0),
                posterHash: bytes32(0),
                edition: "video-only",
                loopSeconds: 5
            })
        );
    }

    function testRegisterAssetStillRequiresPosterHashWhenPosterExists() public {
        vm.expectRevert(abi.encodeWithSelector(BadgeAssetRegistry.MissingPosterHash.selector));
        assetRegistry.registerAsset(
            IBadgeAssetRegistry.BadgeAssetInput({
                videoUri: "",
                posterUri: "/pins/pin25.jpg",
                detailUri: "/index.html?badge=poster-only",
                videoHash: bytes32(0),
                posterHash: bytes32(0),
                edition: "poster-only",
                loopSeconds: 5
            })
        );
    }
}
