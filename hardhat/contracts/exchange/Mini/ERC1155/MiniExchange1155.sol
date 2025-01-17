//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

import "../Role/MiniRole.sol";
import "../../Viewer/Role/ViewerRole.sol";
import "../../Viewer/IExchangeViewer.sol";
import "./IMiniExchangeStruct1155.sol";
import "../IMiniExchangeStore.sol";
import "../IMiniExchange.sol";

/*
    주의사항
        1. turnIndex 를 증가시키지 않으면 turnIndex ~ endIndex 까지의 차이가 멀어지기만 한다.
            때문에 유효하지 않은 주문서가 turnIndex 차례일 때 넘어가게 되면, 해당 주문서는 폐기처분되는것과 같다.
            (지불수단을 다시 만족시키더라도, 체결될 수 없는 상태) -> 때문에 matchOrder event 를 통해서 받는 returnValues
            중에서 orderIndex 보다 작은 orderIndex 를 가진 order 는 모두 유효하지 않은 주문으로 변경해야한다.
*/
contract MiniExchange1155 is IMiniExchange, IMiniExchangeStruct1155, ViewerRole, MiniRole, Initializable {
    using EnumerableSet for EnumerableSet.UintSet;

    bool public initialized;

    function initialize(address _master, address _ExchangeViewer) public initializer {
        __MiniRole_init(_master);

        _setViewer(_ExchangeViewer);

        initialized = false;
    }


        /*@@@ master function @@@*/
    function findMatch(AssignOrders memory order, IMiniExchangeStore Store) external view onlyMaster returns (MiniOrder memory matchableOrders)  {
        (address maker, uint256 amount, uint256 expireTime) = Store.getOrder(getReverseSignature(order.methodSig), order.paymentToken, order.targetToken, order.tokenId, order.price, order.orderIndex);

        bool result = validator(order, Order(maker, amount, expireTime));

        if (result) return MiniOrder(maker, amount, expireTime, order.orderIndex);
        else return MiniOrder(address(0), 0 , 0 , 0);
    }

    function cancel(AssignOrders memory order, IMiniExchangeStore Store) external view onlyMaster returns(bool) {
        (address maker, uint256 amount, uint256 expireTime) = Store.getOrder(order.methodSig, order.paymentToken, order.targetToken, order.tokenId, order.price, order.orderIndex);

        if (maker == order.taker && expireTime >= block.timestamp && amount != 0) return true;
        else return false;
    }

    function setViewer(address _ExchangeViewer) external onlyMaster {
        _setViewer(_ExchangeViewer);
    }



        /*@@@ view function @@@*/
    function validator(AssignOrders memory order, Order memory m_order) public view returns (bool) {
        if (m_order.expireTime < block.timestamp) return false;
        else if (order.methodSig == sellSig) {
            if (!validateTargetToken(order.targetToken, order.taker, order.tokenId, order.amount)) return false;
            else if (!validateERC20(order.paymentToken, m_order.maker, order.price * m_order.amount)) return false;
        } else {
            if (!validateERC20(order.paymentToken, order.taker, order.price * order.amount)) return false;
            else if (!validateTargetToken(order.targetToken, m_order.maker, order.tokenId, m_order.amount)) return false;
        }

        return true;
    }

    function validateTargetToken(address targetToken, address account, uint tokenId, uint amount) public view returns (bool) {
        if (
            IERC1155Upgradeable(targetToken).balanceOf(account, tokenId) >= amount &&
            IERC1155Upgradeable(targetToken).isApprovedForAll(account, master())
        ) return true;
        else return false;
    }
}

