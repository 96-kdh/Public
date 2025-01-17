// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract TestUpgradeable is Initializable, OwnableUpgradeable {
    bool public initialized;

    string public test;

    function initialize(string memory _test) public initializer {
        __Ownable_init();

        test = _test;

        initialized = false;
    }

    function setTest(string memory _test) external {
        test = _test;
    }
}
