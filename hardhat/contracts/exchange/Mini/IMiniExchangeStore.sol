//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "../IExchangeStruct.sol";

interface IMiniExchangeStore is IExchangeStruct {
    function addOrder(Params memory order) external returns (uint256 orderIndex);
    function removeOrder(AssignOrders memory order) external;
    function setOrderBook(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint amount, uint orderIndex) external;
    function setTurnIndex(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint orderIndex) external;

    function addTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) external;
    function removeTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) external;
    function addPrice (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) external;
    function removePrice (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) external;


    function getIdBooks(bytes4 methodSig, address paymentToken, address targetToken) external view returns (uint256[] memory ids);
    function getPriceBooks(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) external view returns (uint256[] memory prices);
    function getOrder(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint256 orderIndex) external view returns (address maker, uint256 amount, uint256 expireTime);
    function getOrderIndex(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) external view returns (uint256 turnIndex, uint256 endIndex);
}
