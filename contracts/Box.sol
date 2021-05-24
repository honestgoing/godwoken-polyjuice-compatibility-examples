// SPDX-License-Identifier: MIT
pragma solidity >0.6.0;

contract Box {
    uint256 public value;

    function store(uint256 newValue) public {
        value = newValue;
    }
}
