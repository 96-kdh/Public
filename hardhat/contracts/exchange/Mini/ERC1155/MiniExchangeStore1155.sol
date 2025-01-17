//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../Mini/Role/MiniRole.sol";
import "../IMiniExchangeStore.sol";
import "./IMiniExchangeStruct1155.sol";

contract MiniExchangeStore1155 is IMiniExchangeStruct1155, IMiniExchangeStore, MiniRole, Initializable {
    using EnumerableSet for EnumerableSet.UintSet;

    bool public initialized;

    // methodSig => paymentAddress => targetTokenAddress => arrays(tokenId[])
    mapping(bytes4 => mapping(address => mapping(address => EnumerableSet.UintSet))) idBooks; // 구매 or 판매 중인 tokenId array list
    // methodSig => paymentAddress => targetTokenAddress => tokenId => arrays(Price[])
    mapping(bytes4 => mapping(address => mapping(address => mapping(uint => EnumerableSet.UintSet)))) priceBooks; // 구매 or 판매 중인 price array list
    // methodSig => paymentAddress => targetTokenAddress => tokenId => price => Indexer(turnIndex <= order < endIndex)
    mapping(bytes4 => mapping(address => mapping(address => mapping(uint => mapping(uint => Indexer))))) orderBooks;

    function initialize(address master) public initializer {
        __MiniRole_init(master);

        initialized = false;
    }



    /* addOrder의 절대적인 룰 : endIndex 를 증가시킨다 */
    function addOrder(Params memory order) external onlyMaster returns (uint orderIndex) {
        Indexer storage _orderBook = orderBooks[order.methodSig][order.paymentToken][order.targetToken][order.tokenId][order.price];

        _orderBook.order[_orderBook.endIndex] = Order(order.maker, order.amount, order.expireTime);
        _orderBook.endIndex++;

        return (_orderBook.endIndex - 1);
    }

    /* expireTime 을 0으로 초기화해서 강제 만료, 실제로 remove 하는 건 아님, */
    function removeOrder(AssignOrders memory order) external onlyMaster {
        orderBooks[order.methodSig][order.paymentToken][order.targetToken][order.tokenId][order.price].order[order.orderIndex].amount = 0;
    }

    /* order amount 수정 초기화 */
    function setOrderBook(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint amount, uint orderIndex) external onlyMaster {
        orderBooks[methodSig][paymentToken][targetToken][tokenId][price].order[orderIndex].amount = amount;
    }

    /* matchOrder case 에서 turnIndex 의 증감치만큼 orderIndex set */
    function setTurnIndex(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint turnIndex) external onlyMaster {
        orderBooks[methodSig][paymentToken][targetToken][tokenId][price].turnIndex = turnIndex;
    }

    function addTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) external onlyMaster {
        idBooks[methodSig][paymentToken][targetToken].add(tokenId);
    }

    function removeTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) external onlyMaster {
        idBooks[methodSig][paymentToken][targetToken].remove(tokenId);
    }

    function addPrice (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) external onlyMaster {
        priceBooks[methodSig][paymentToken][targetToken][tokenId].add(price);
    }

    function removePrice (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) external onlyMaster {
        priceBooks[methodSig][paymentToken][targetToken][tokenId].remove(price);
    }



        /*@@@ view function @@@*/
    function getIdBooks(bytes4 methodSig, address paymentToken, address targetToken) methodSigValidator(methodSig) public view returns (uint256[] memory ids)  {
        return idBooks[methodSig][paymentToken][targetToken].values();
    }

    function getPriceBooks(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) methodSigValidator(methodSig) public view returns (uint256[] memory prices) {
        return priceBooks[methodSig][paymentToken][targetToken][tokenId].values();
    }

    function getOrder(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint256 orderIndex) methodSigValidator(methodSig) public view returns (address maker, uint256 amount, uint256 expireTime) {
        Order memory _order = orderBooks[methodSig][paymentToken][targetToken][tokenId][price].order[orderIndex];
        return (_order.maker, _order.amount, _order.expireTime);
    }

    function getOrderIndex(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) methodSigValidator(methodSig) public view returns (uint256 turnIndex, uint256 endIndex) {
        return (orderBooks[methodSig][paymentToken][targetToken][tokenId][price].turnIndex, orderBooks[methodSig][paymentToken][targetToken][tokenId][price].endIndex);
    }
}
