// SPDX-License-Identifier: MIT
pragma solidity >0.6.0;

contract PolyjuiceAddress {
    function getPolyjuiceAddress() public view returns (address) {
        return msg.sender;
    }
}
