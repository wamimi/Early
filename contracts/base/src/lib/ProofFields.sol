// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

library ProofFields {
    error MissingField(string field);
    error InvalidAddressField(string field);
    error InvalidBytes32Field(string field);
    error InvalidUintField(string field);

    function stringField(string memory document, string memory field)
        internal
        pure
        returns (string memory)
    {
        bytes memory source = bytes(document);
        bytes memory plain = bytes(string.concat('"', field, '":"'));
        (uint256 start, bool found) = _find(source, plain);

        if (!found) {
            bytes memory escaped = bytes(string.concat('\\"', field, '\\":\\"'));
            (start, found) = _find(source, escaped);
        }
        if (!found) revert MissingField(field);

        uint256 end = start;
        while (end < source.length) {
            if (source[end] == '"' && (end == 0 || source[end - 1] != "\\")) break;
            if (
                source[end] == "\\" && end + 1 < source.length
                    && (source[end + 1] == '"' || source[end + 1] == "\\")
            ) {
                end += 2;
            } else {
                end++;
            }
        }
        if (end == source.length) revert MissingField(field);

        bytes memory value = new bytes(end - start);
        uint256 outputIndex;
        for (uint256 i = start; i < end; i++) {
            if (
                source[i] == "\\" && i + 1 < end
                    && (source[i + 1] == '"' || source[i + 1] == "\\")
            ) {
                i++;
            }
            value[outputIndex++] = source[i];
        }

        assembly {
            mstore(value, outputIndex)
        }
        return string(value);
    }

    function boolField(string memory document, string memory field)
        internal
        pure
        returns (bool)
    {
        bytes memory source = bytes(document);
        bytes memory truePlain = bytes(string.concat('"', field, '":true'));
        (, bool foundTrue) = _find(source, truePlain);
        if (foundTrue) return true;

        bytes memory trueEscaped = bytes(string.concat('\\"', field, '\\":true'));
        (, foundTrue) = _find(source, trueEscaped);
        if (foundTrue) return true;

        bytes memory trueString = bytes(string.concat('"', field, '":"true"'));
        (, foundTrue) = _find(source, trueString);
        if (foundTrue) return true;

        bytes memory trueEscapedString =
            bytes(string.concat('\\"', field, '\\":\\"true\\"'));
        (, foundTrue) = _find(source, trueEscapedString);
        if (foundTrue) return true;

        bytes memory falsePlain = bytes(string.concat('"', field, '":false'));
        (, bool foundFalse) = _find(source, falsePlain);
        if (foundFalse) return false;

        bytes memory falseEscaped = bytes(string.concat('\\"', field, '\\":false'));
        (, foundFalse) = _find(source, falseEscaped);
        if (foundFalse) return false;

        bytes memory falseString = bytes(string.concat('"', field, '":"false"'));
        (, foundFalse) = _find(source, falseString);
        if (foundFalse) return false;

        bytes memory falseEscapedString =
            bytes(string.concat('\\"', field, '\\":\\"false\\"'));
        (, foundFalse) = _find(source, falseEscapedString);
        if (foundFalse) return false;

        revert MissingField(field);
    }

    function uintField(string memory document, string memory field)
        internal
        pure
        returns (uint256 result)
    {
        string memory value = stringField(document, field);
        bytes memory input = bytes(value);
        if (input.length == 0) revert InvalidUintField(field);
        for (uint256 i; i < input.length; i++) {
            uint8 digit = uint8(input[i]);
            if (digit < 48 || digit > 57) revert InvalidUintField(field);
            result = result * 10 + digit - 48;
        }
    }

    function bytes32Field(string memory document, string memory field)
        internal
        pure
        returns (bytes32 result)
    {
        bytes memory value = bytes(stringField(document, field));
        uint256 offset = value.length == 66 && value[0] == "0" && value[1] == "x" ? 2 : 0;
        if (value.length - offset != 64) revert InvalidBytes32Field(field);

        for (uint256 i; i < 64; i += 2) {
            result |= bytes32(uint256((_hex(value[offset + i]) << 4) | _hex(value[offset + i + 1]))
                << (248 - (i / 2) * 8));
        }
    }

    function addressField(string memory document, string memory field)
        internal
        pure
        returns (address result)
    {
        bytes memory value = bytes(stringField(document, field));
        uint256 offset = value.length == 42 && value[0] == "0" && value[1] == "x" ? 2 : 0;
        if (value.length - offset != 40) revert InvalidAddressField(field);

        uint160 parsed;
        for (uint256 i; i < 40; i += 2) {
            parsed = (parsed << 8) | uint160((_hex(value[offset + i]) << 4) | _hex(value[offset + i + 1]));
        }
        return address(parsed);
    }

    function _find(bytes memory source, bytes memory needle)
        private
        pure
        returns (uint256 start, bool found)
    {
        if (needle.length == 0 || source.length < needle.length) return (0, false);
        for (uint256 i; i <= source.length - needle.length; i++) {
            bool matches = true;
            for (uint256 j; j < needle.length; j++) {
                if (source[i + j] != needle[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return (i + needle.length, true);
        }
    }

    function _hex(bytes1 character) private pure returns (uint8) {
        uint8 value = uint8(character);
        if (value >= 48 && value <= 57) return value - 48;
        if (value >= 65 && value <= 70) return value - 55;
        if (value >= 97 && value <= 102) return value - 87;
        revert InvalidBytes32Field("hex");
    }
}
