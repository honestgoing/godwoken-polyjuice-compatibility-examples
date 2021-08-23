// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CurveTokenV3 is ERC20, Ownable {
    address public minter;

    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {}

    function set_minter(address _minter) public onlyOwner {
        minter = _minter;
    }

    function mint(address to, uint256 amount) public {
        require(msg.sender == minter, "minter role is required");

        _mint(to, amount);
    }

    function burnFrom(address account, uint256 amount) public {
        require(msg.sender == minter, "minter role is required");

        _burn(account, amount);
    }
}
