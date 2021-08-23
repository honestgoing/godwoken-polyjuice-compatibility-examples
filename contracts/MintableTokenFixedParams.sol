// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./MintableToken.sol";

contract MintableTokenFixedParams is MintableToken {
    constructor() MintableToken("MintableToken", "MT") {}
}
