// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBadgeAssetRegistry} from "../interfaces/IBadgeAssetRegistry.sol";

library AgenticBadgeClaimMetadata {
    bytes16 private constant HEX_DIGITS = "0123456789abcdef";

    struct ClaimMetadataInput {
        address agent;
        uint256 definitionId;
        uint64 claimedAt;
        string name;
        string description;
        string badgeType;
        string verificationType;
        string externalUrl;
        string animationUrl;
    }

    function buildJson(
        ClaimMetadataInput memory input,
        IBadgeAssetRegistry.BadgeAsset memory asset
    ) internal pure returns (string memory) {
        string memory image = asset.posterUri;
        string memory externalUrl = bytes(input.externalUrl).length == 0
            ? _fallbackUri(asset.detailUri, asset.videoUri)
            : input.externalUrl;
        string memory animationUrl = bytes(input.animationUrl).length == 0
            ? asset.videoUri
            : input.animationUrl;

        return string(
            abi.encodePacked(
                '{"name":"',
                input.name,
                '","description":"',
                input.description,
                '","image":"',
                image,
                '","animation_url":"',
                animationUrl,
                '","external_url":"',
                externalUrl,
                '","assets":[{"uri":"',
                asset.videoUri,
                '","mime_type":"video/mp4"}],"properties":{"record_type":"tempo-badge-claim","agent":"',
                _addressToHexString(input.agent),
                '","definition_id":"',
                _uintToString(input.definitionId),
                '","video_uri":"',
                asset.videoUri,
                '","detail_uri":"',
                asset.detailUri,
                '","video_hash":"',
                _bytes32ToHexString(asset.videoHash),
                '","poster_hash":"',
                _bytes32ToHexString(asset.posterHash),
                '","edition":"',
                asset.edition,
                '","loop_seconds":',
                _uintToString(asset.loopSeconds),
                '},"attributes":[{"trait_type":"Badge Type","value":"',
                input.badgeType,
                '"},{"trait_type":"Verification","value":"',
                input.verificationType,
                '"},{"trait_type":"Claimed At","display_type":"date","value":',
                _uintToString(input.claimedAt),
                "}]}"
            )
        );
    }

    function _fallbackUri(
        string memory preferred,
        string memory fallbackValue
    ) private pure returns (string memory) {
        if (bytes(preferred).length != 0) {
            return preferred;
        }
        return fallbackValue;
    }

    function _uintToString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    function _bytes32ToHexString(bytes32 value) private pure returns (string memory) {
        bytes memory buffer = new bytes(66);
        buffer[0] = "0";
        buffer[1] = "x";

        for (uint256 i = 0; i < 32; i++) {
            uint8 current = uint8(value[i]);
            buffer[2 + i * 2] = HEX_DIGITS[current >> 4];
            buffer[3 + i * 2] = HEX_DIGITS[current & 0x0f];
        }

        return string(buffer);
    }

    function _addressToHexString(address account) private pure returns (string memory) {
        bytes20 value = bytes20(account);
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";

        for (uint256 i = 0; i < 20; i++) {
            uint8 current = uint8(value[i]);
            buffer[2 + i * 2] = HEX_DIGITS[current >> 4];
            buffer[3 + i * 2] = HEX_DIGITS[current & 0x0f];
        }

        return string(buffer);
    }
}
