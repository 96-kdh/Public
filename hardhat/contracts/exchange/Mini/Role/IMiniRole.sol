//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

interface IMiniRole {
    function transferMastership(address newMaster) external;
    function renounceMastership() external;

    function master() external view returns(address);
    function getName() external view returns (string memory);

    function validateERC20(address tokenAddress, address account, uint value) external view returns (bool);
}
