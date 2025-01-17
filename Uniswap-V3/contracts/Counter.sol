// SPDX-License-Identifier: MIT
pragma solidity = 0.7.6;

contract Counter {
    uint256 public count = 0;

    event WriteCount(address indexed writer, uint256 count);

    function readCount() external view returns (uint256 cnt) {
        cnt = count;
    }

    function writeCount() external returns (uint256 nextCnt) {
        count += 1;
        nextCnt = count;

        emit WriteCount(msg.sender, count);
    }
}
