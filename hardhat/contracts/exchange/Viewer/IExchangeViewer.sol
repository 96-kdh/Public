//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "../IExchangeStruct.sol";
import "../Mini/ERC721/IMiniExchangeStruct721.sol";
import "../Mini/ERC1155/IMiniExchangeStruct1155.sol";

interface IExchangeViewer is IExchangeStruct {
    // owner function
    function resister(address exchange721, address exchangeStore721, address exchange1155, address exchangeStore1155) external;

    // ex1155 view function
    function getOrderBookByTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, address account) external view returns (MasterOrderBook memory orders);
    function getOrderBookByTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256[] memory tokenIds, address account) external view returns (MasterOrderBook[] memory orderBook);
    function getAmountByPrice(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint price, address account) external view returns (MasterOrders memory order);

    // ex721 view function
    function getOrderBookByTokenId (address paymentToken, address targetToken, uint256 tokenId, address account) external view returns (MasterOrderBook memory order);
    function getOrderBookByTokenId (address paymentToken, address targetToken, uint256[] memory tokenIds, address account) external view returns (MasterOrderBook[] memory orderBook);
    function getSellOrderBooks (address paymentToken, address targetToken, uint tokenId, address account) external view returns (MasterOrderBook memory sellOrder);
    function validateBuyOrderCounts (address paymentToken, address targetToken, uint tokenId, uint price, address account) external view returns (uint256 cnt);

    // master view function (실제 쓰이는 external function)
    function getOrderBooks (address paymentToken, address targetToken, address account) external view returns (MasterOrderBook[] memory sellOrderBook, MasterOrderBook[] memory buyOrderBook);
    function getOrderBooks(address paymentToken, address targetToken, uint tokenId, address account) external view returns (MasterOrderBook memory sellOrderBook, MasterOrderBook memory buyOrderBook);
    function isRemoveBook(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint price) external view returns (bool);
}
