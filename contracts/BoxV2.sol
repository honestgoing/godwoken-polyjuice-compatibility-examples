// SPDX-License-Identifier: MIT
pragma solidity >0.6.0;

contract BoxV2 {
    uint256 public value;

    function store(uint256 newValue) public {
        value = newValue;
    }

    function increment() public {
        value = value + 1;
    }
}
