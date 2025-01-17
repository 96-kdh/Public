//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../Role/MiniRole.sol";
import "../../Viewer/Role/ViewerRole.sol";
import "../../Viewer/IExchangeViewer.sol";
import "./IMiniExchangeStruct721.sol";
import "../IMiniExchangeStore.sol";
import "../IMiniExchange.sol";

/*
    MiniExchange721 rule

    1. match 또는 cancel 된 주문은 expireTime 을 0 으로 변경하며 만료시킨다.
*/
contract MiniExchange721 is IMiniExchange, IMiniExchangeStruct721, ViewerRole, MiniRole, Initializable {
    using EnumerableSet for EnumerableSet.UintSet;

    bool public initialized;

    function initialize(address _master, address _ExchangeViewer) public initializer {
        __MiniRole_init(_master);

        _setViewer(_ExchangeViewer);

        initialized = false;
    }



        /*@@@ master  function @@@*/
    function findMatch(AssignOrders memory order, IMiniExchangeStore Store) external view onlyMaster returns (MiniOrder memory matchableOrders) {
        (address maker, uint256 price, uint256 expireTime) = Store.getOrder(getReverseSignature(order.methodSig), order.paymentToken, order.targetToken, order.tokenId, order.price, order.orderIndex);

        bool result = validator(order, Order(maker, price, expireTime));

        if (result) return MiniOrder(maker, 1, expireTime, order.orderIndex);
        else return MiniOrder(address(0), 0, 0, 0);
    }

    function cancel(AssignOrders memory order, IMiniExchangeStore Store) external view onlyMaster returns (bool) {
        (address maker, , uint256 expireTime) = Store.getOrder(order.methodSig, order.paymentToken, order.targetToken, order.tokenId, order.price, order.orderIndex);

        if (maker == order.taker && expireTime >= block.timestamp) return true;
        else return false;
    }

    function setViewer(address _ExchangeViewer) external onlyMaster {
        _setViewer(_ExchangeViewer);
    }



        /*@@@ view function @@@*/
    function validator(AssignOrders memory order, Order memory m_order) public view returns (bool) {
        if (m_order.expireTime < block.timestamp) return false;
        else if (order.methodSig == sellSig) {
            if (!validateTargetToken(order.targetToken, order.taker, order.tokenId, 0)) return false;
            else if (!validateERC20(order.paymentToken, m_order.maker, order.price)) return false;
        } else {
            if (m_order.price != order.price) return false; // m_order.price > order.price 라는 조건문을 붙이면, 제시한 금액보다 작은 금액의 판매 오더도 포함
            else if (!validateERC20(order.paymentToken, order.taker, order.price)) return false;
            else if (!validateTargetToken(order.targetToken, m_order.maker, order.tokenId, 0)) return false;
        }

        return true;
    }

    function validateTargetToken(address targetToken, address account, uint tokenId, uint) public view returns (bool) {
        if (
            IERC721Upgradeable(targetToken).ownerOf(tokenId) == account &&
            IERC721Upgradeable(targetToken).isApprovedForAll(account, master())
        ) return true;
        else return false;
    }
}
