// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./MintableTokenFixedParams.sol";

contract Create2 {
    bytes32 public constant INIT_CODE_HASH =
        keccak256(
            abi.encodePacked(type(MintableTokenFixedParams).creationCode)
        );

    function create(bytes32 salt) public returns (address token) {
        bytes memory bytecode = type(MintableTokenFixedParams).creationCode;
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

    // [Polyjuice compatibility]
    function convertETHAddrToGodwokenAddr(address eth_addr)
        public
        returns (address)
    {
        uint256[1] memory input;
        input[0] = uint256(uint160(address(eth_addr)));
        uint256[1] memory output;
        assembly {
            if iszero(call(not(0), 0xf3, 0x0, input, 0x20, output, 0x20)) {
                revert(0x0, 0x0)
            }
        }
        return address(uint160(output[0]));
    }
}
