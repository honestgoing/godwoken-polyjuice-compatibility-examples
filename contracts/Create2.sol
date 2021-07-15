// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./MintableToken.sol";

contract Create2 {
    bytes32 public constant INIT_CODE_HASH =
        keccak256(abi.encodePacked(type(MintableToken).creationCode));

    function create(bytes32 salt) public returns (address token) {
        bytes memory bytecode = type(MintableToken).creationCode;
        assembly {
            token := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
    }

    function getAddress(bytes32 salt) public view returns (address) {
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                hex"ff",
                                address(this),
                                salt,
                                INIT_CODE_HASH
                            )
                        )
                    )
                )
            );
    }
}
