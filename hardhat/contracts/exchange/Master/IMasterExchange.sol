//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "../IExchangeStruct.sol";
import "../Mini/ERC721/IMiniExchangeStruct721.sol";
import "../Mini/ERC1155/IMiniExchangeStruct1155.sol";
import "../Viewer/IExchangeViewer.sol";

/**
    overload sell, buy function 을 주석친 이유
    function selector 를 통해 function signature 를 공유하려는데,
    overload 함수 때문에 selector 가 안되서
*/
interface IMasterExchange is IExchangeStruct {
    // user function
    function sell(UnAssignOrders memory _order) external;
    // function sell(UnAssignOrders[] memory _order) external;
    function buy(UnAssignOrders memory _order) external;
    // function buy(UnAssignOrders[] memory _order) external;
    function assignMatch(AssignOrders memory _order) external;
    function cancel(AssignOrders memory _order) external;
    function cancel(AssignOrders[] memory _order) external;
    function setFeeBooks (address targetToken, address _projectWallet, uint16 _projectFee) external;

    // owner function (onlyOwner)
    function resister(address exchange721, address exchangeStore721, address exchange1155, address exchangeStore1155) external;
    function deResister(address exchange) external;
    function migration(address newMaster) external;
    function pause() external;
    function unpause() external;
    function adminCancel(AssignOrders memory _order) external;
    function adminSetFeeBooks (address targetToken, address account, uint16 rate) external;
    function setBaseFee (address account, uint16 rate) external;
    function setProjectFeeLimit(uint16 rate) external;
    function setViewer(address _ExchangeViewer) external;
    function setViewer(address _ExchangeViewer, address exchange) external;

    // MasterExchange Event
    event addSellOrderEvent(address paymentToken, address indexed targetToken, uint256 indexed tokenId, address indexed maker, uint256 price, uint256 amount, uint256 orderIndex, uint256 expireTime);
    event addBuyOrderEvent(address paymentToken, address indexed targetToken, uint256 indexed tokenId, address indexed maker, uint256 price, uint256 amount, uint256 orderIndex, uint256 expireTime);
    event sellMatchOrderEvent(address paymentToken, address indexed targetToken, uint256 indexed tokenId, address indexed maker, uint256 price, uint256 amount, uint256 orderIndex, address taker);
    event buyMatchOrderEvent(address paymentToken, address indexed targetToken, uint256 indexed tokenId, address indexed maker, uint256 price, uint256 amount, uint256 orderIndex, address taker);
    event cancelSellOrderEvent(address paymentToken, address indexed targetToken, uint256 indexed tokenId, address indexed maker, uint256 price, uint256 amount, uint256 orderIndex);
    event cancelBuyOrderEvent(address paymentToken, address indexed targetToken, uint256 indexed tokenId, address indexed maker, uint256 price, uint256 amount, uint256 orderIndex);
}
