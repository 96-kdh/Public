// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "hardhat/console.sol";

contract XToken is ERC20PresetMinterPauser, Ownable {
    using SafeMath for uint256;

    uint256 private _lockStartBlock;
    uint256 private _unlockCycle;
    uint256 private _unlockNumber;

    mapping(address => uint256) private _locks;

    constructor(string memory name, string memory symbol) ERC20PresetMinterPauser(name, symbol) {
        mint(_msgSender(), 1e8 * 10 ** 18);
        _lockStartBlock = block.number;
        _unlockCycle = 50;
        _unlockNumber = 9;
    }

    function remaingLock(address account) public view returns (uint256 lock) {
        lock = _locks[account];

        if(lock > 0 && _lockStartBlock > 0 && _unlockCycle > 0 && _unlockNumber > 0) {
            uint256 unlockAmountPerCycle = lock / _unlockNumber;
            uint256 currentBlock = block.number;
            uint256 multiplier = (currentBlock - _lockStartBlock) / _unlockCycle;

            lock -= unlockAmountPerCycle * (multiplier > _unlockNumber ? _unlockNumber : multiplier);
        }

        console.log("lock:", lock);
    }

    function availableBalanceOf(address account) public view returns (uint256 amount) {
        return balanceOf(account) - remaingLock(account);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override (ERC20PresetMinterPauser) {
        // require(amount <= availableBalanceOf(from), "tokens lock");
        super._beforeTokenTransfer(from, to, amount);
    }
}
