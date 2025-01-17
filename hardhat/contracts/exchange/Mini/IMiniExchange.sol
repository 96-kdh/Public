//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "../IExchangeStruct.sol";
import "./IMiniExchangeStore.sol";

interface IMiniExchange is IExchangeStruct {
    // master function
    function findMatch(AssignOrders memory order, IMiniExchangeStore Store) external view returns (MiniOrder memory matchableOrders); // 미지정 오더 (오더 탐색 & 오더 생성)
    function cancel(AssignOrders memory order, IMiniExchangeStore Store) external view returns (bool);
    function setViewer(address _ExchangeViewer) external;

    // view function
    function validateTargetToken(address targetToken, address account, uint tokenId, uint amount) external view returns (bool);
}
