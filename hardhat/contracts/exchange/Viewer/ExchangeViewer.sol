//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../Master/Role/MasterRole.sol";
import "../IExchangeStruct.sol";
import "../Mini/ERC721/IMiniExchangeStruct721.sol";
import "../Mini/ERC1155/IMiniExchangeStruct1155.sol";
import "../Mini/Role/IMiniRole.sol";
import "../Mini/IMiniExchange.sol";
import "./IExchangeViewer.sol";


/**
    switch (account)
        case1 account === address(0)  유효한 주문 + 유효할 가능성이 있는 amount 모두 리턴 (priceBooks, idBooks 에서 key 값을 삭제해도 되는지 식별)
        case2 account === master()    유효한 주문에 대해서만 amount 를 더해서 리턴 (오더 리스트 뽑아줄 때)
        case2 account === eoa         eoa의 유효한 주문 + 유효할 가능성이 있는 amount 모두 리턴 (마이페이지)

    type MiniOrder {
        maker : address,
        amount : BigNumber,
        expireTime : BigNumber,
        orderIndex : BigNumber
    }

    type MasterOrders {
        price : BigNumber,
        amount : BigNumber,     (sum amount)
        order : MiniOrder[]
    }

    Rule =>
        1. canceled or matched 오더가 아니라면, idBooks 나 priceBooks 의 값이 갱신되지 않기때문에 getOrderBooks 를 통해 가져오는 array 에는 빈값이 채워져 리턴된다.
*/
contract ExchangeViewer is IExchangeViewer, MasterRole, Initializable, OwnableUpgradeable {
    bool public initialized;

    function initialize() public initializer {
        __Ownable_init();

        initialized = false;
    }

    function resister(address exchange721, address exchangeStore721, address exchange1155, address exchangeStore1155) external onlyOwner {
        _resister(exchange721, exchangeStore721, exchange1155, exchangeStore1155);
    }



    /**
        only erc1155 view function
    */
    function getOrderBookByTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, address account) public view returns (MasterOrderBook memory orders) {
        (, address store) = getMini(targetToken);
        uint256[] memory __orderPrice = IMiniExchangeStore(store).getPriceBooks(methodSig, paymentToken, targetToken, tokenId);

        MasterOrders[] memory __Orders = new MasterOrders[](__orderPrice.length);

        for (uint l = 0; l < __orderPrice.length; l++) {
            __Orders[l] = this.getAmountByPrice(methodSig, paymentToken, targetToken, tokenId, __orderPrice[l], account);
        }

        return MasterOrderBook(tokenId, __Orders);
    }

    function getOrderBookByTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256[] memory tokenIds, address account) public view returns (MasterOrderBook[] memory orderBook) {
        MasterOrderBook[] memory __OrderBook = new MasterOrderBook[](tokenIds.length);

        for (uint i = 0; i < tokenIds.length; i++) {
            __OrderBook[i] = this.getOrderBookByTokenId(methodSig, paymentToken, targetToken, tokenIds[i], account);
        }

        return __OrderBook;
    }

    function _getOrder(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint price, address account, uint256 orderIndex) internal view returns (MiniOrder memory order) {
        (, address store) = getMini(targetToken);
        (address maker, uint256 _amount, uint256 expireTime) = IMiniExchangeStore(store).getOrder(methodSig, paymentToken, targetToken, tokenId, price, orderIndex);

        if (expireTime < block.timestamp || _amount == 0) return MiniOrder(address(0), 0, 0, 0);

        if (account == address(0)) { // account 가 null 일 때, 유효한 주문 + 유효할 가능성이 있는 amount 모두 리턴
            return MiniOrder(maker, _amount, expireTime, orderIndex);
        } else if (account == IMiniRole(ex1155).master()) { // account 가 master() 일 때, 유효한 주문에 대해서만 amount 를 더해서 리턴
            bool validate = methodSig == sellSig
            ? IMiniExchange(ex1155).validateTargetToken(targetToken, maker, tokenId, _amount)
            : IMiniRole(ex1155).validateERC20(paymentToken, maker, price * _amount);
            if (validate) {
                return MiniOrder(maker, _amount, expireTime, orderIndex);
            } else return MiniOrder(address(0), 0, 0, 0);
        } else if (account == maker) { // account 의 유효한 주문 + 유효할 가능성이 있는 amount 모두 리턴
            return MiniOrder(maker, _amount, expireTime, orderIndex);
        } else return MiniOrder(address(0), 0, 0, 0);
    }

    function getAmountByPrice(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint price, address account) public view returns (MasterOrders memory order) {
        if (methodSig != sellSig &&  methodSig != buySig) revert("invalid method sig");

        (, address store) = getMini(targetToken);

        uint256 sumAmount;

        (uint turnIndex, uint endIndex) = IMiniExchangeStore(store).getOrderIndex(methodSig, paymentToken, targetToken, tokenId, price);

        MiniOrder[] memory __miniOrders = new MiniOrder[](endIndex - turnIndex);

        for (uint256 index = 0; index < __miniOrders.length; index++) {
            MiniOrder memory __miniOrder = _getOrder(methodSig, paymentToken, targetToken, tokenId, price, account, turnIndex);
            __miniOrders[index] = __miniOrder;
            sumAmount += __miniOrder.amount;

            turnIndex++;
        }

        return MasterOrders(price, sumAmount, __miniOrders);
    }

    /**
        only erc721 view function,
        getOrderBookByTokenId   -> only buySig view function
        getSellOrderBooks       -> only sellSig view function
        validateBuyOrderCounts  -> only buy Order count view function
    */
    function _getBuyOrder (address paymentToken, address targetToken, uint256 tokenId, address account, uint256 price, uint256 orderIndex) internal view returns (MiniOrder memory buyOrder) {
        (, address store) = getMini(targetToken);

        (address maker, , uint256 expireTime) = IMiniExchangeStore(store).getOrder(buySig, paymentToken, targetToken, tokenId, price, orderIndex);

        if (expireTime >= block.timestamp) {
            if (account == address(0)) {
               return MiniOrder(maker, 1, expireTime, orderIndex);
            } else if (account == IMiniRole(ex721).master()) {
                if (IMiniRole(ex721).validateERC20(paymentToken, maker, price)) {
                    return MiniOrder(maker, 1, expireTime, orderIndex);
                } else return MiniOrder(address(0), 0, 0, 0);
            } else if (account == maker) {
                return MiniOrder(maker, 1, expireTime, orderIndex);
            } else return MiniOrder(address(0), 0, 0, 0);
        } else {
            return MiniOrder(address(0), 0, 0, 0);
        }
    }

    function getOrderBookByTokenId (address paymentToken, address targetToken, uint256 tokenId, address account) public view returns (MasterOrderBook memory order) {
        (, address store) = getMini(targetToken);

        uint256[] memory __orderPrice = IMiniExchangeStore(store).getPriceBooks(buySig, paymentToken, targetToken, tokenId);

        MasterOrders[] memory __MasterOrders = new MasterOrders[](__orderPrice.length);

        for (uint i = 0; i < __orderPrice.length; i++) {
            (uint turnIndex, uint endIndex) = IMiniExchangeStore(store).getOrderIndex(buySig, paymentToken, targetToken, tokenId, __orderPrice[i]);

            MiniOrder[] memory __MiniOrders = new MiniOrder[](endIndex - turnIndex);
            uint256 sumAmount;

            for (uint j = 0; j < __MiniOrders.length; j++) {
                MiniOrder memory __MiniOrder = _getBuyOrder(paymentToken, targetToken, tokenId, account, __orderPrice[i], turnIndex);
                __MiniOrders[j] = __MiniOrder;
                if (sumAmount == 0 && __MiniOrder.amount != 0) sumAmount = 1;

                turnIndex++;
            }

            __MasterOrders[i] = MasterOrders(__orderPrice[i], sumAmount, __MiniOrders);
        }

        return MasterOrderBook(tokenId, __MasterOrders);
    }

    function getOrderBookByTokenId (address paymentToken, address targetToken, uint256[] memory tokenIds, address account) public view returns (MasterOrderBook[] memory orderBook) {
        MasterOrderBook[] memory __OrderBooks  = new MasterOrderBook[](tokenIds.length);

        for (uint i = 0; i < tokenIds.length; i++) {
            __OrderBooks[i] = this.getOrderBookByTokenId(paymentToken, targetToken, tokenIds[i], account);
        }

        return __OrderBooks;
    }

    function getSellOrderBooks (address paymentToken, address targetToken, uint tokenId, address account) public view returns (MasterOrderBook memory sellOrder) {
        (address exchange, address store) = getMini(targetToken);

        (address maker, uint256 price, uint256 expireTime) = IMiniExchangeStore(store).getOrder(sellSig, paymentToken, targetToken, tokenId, 0, 0);

        if (expireTime < block.timestamp) {
            return MasterOrderBook(tokenId, new MasterOrders[](0));
        } else {
            MasterOrders[] memory __Orders = new MasterOrders[](1);
            MiniOrder[] memory __order = new MiniOrder[](1);

            if (account == address(0)){
                __order[0] = MiniOrder(maker, 1, expireTime, 0);
                __Orders[0] = MasterOrders(price, 1, __order);

                return MasterOrderBook(tokenId, __Orders);
            } else if (account == IMiniRole(ex721).master()) {
                if (!IMiniExchange(exchange).validateTargetToken(targetToken, maker, tokenId, 0)) {
                    __order[0] = MiniOrder(address(0), 0, 0, 0);
                    __Orders[0] = MasterOrders(price, 0, __order);

                    return MasterOrderBook(tokenId, __Orders);
                }

                __order[0] = MiniOrder(maker, 1, expireTime, 0);
                __Orders[0] = MasterOrders(price, 1, __order);

                return MasterOrderBook(tokenId, __Orders);
            } else if (account == maker) {
                __order[0] = MiniOrder(maker, 1, expireTime, 0);
                __Orders[0] = MasterOrders(price, 1, __order);

                return MasterOrderBook(tokenId, __Orders);
            }

            __order[0] = MiniOrder(address(0), 0, 0, 0);
            __Orders[0] = MasterOrders(price, 0, __order);

            return MasterOrderBook(tokenId, __Orders);
        }
    }

    function validateBuyOrderCounts (address paymentToken, address targetToken, uint tokenId, uint price, address account) public view returns (uint256 cnt) {
        (, address store) = getMini(targetToken);

        (uint turnIndex, uint endIndex) = IMiniExchangeStore(store).getOrderIndex(buySig, paymentToken, targetToken, tokenId, price);

        uint _cnt;

        for (uint index = turnIndex; index < endIndex; index++){
            (address maker, , uint256 expireTime) = IMiniExchangeStore(store).getOrder(buySig, paymentToken, targetToken, tokenId, price, index);

            if (expireTime >= block.timestamp) {
                if (account == address(0)) {
                    _cnt++;
                } else if (account == IMiniRole(ex721).master()) {
                    if (IMiniRole(ex721).validateERC20(paymentToken, maker, price)) _cnt++;
                } else if (account == maker) {
                    _cnt++;
                }
            }
        }

        return _cnt;
    }

    /**
        erc (1155 + 721) view function
    */
    /*@@@@@@@ external or public view function @@@@@@@*/
    // Rule : groupBy price, sortBy createdAt
    function getOrderBooks (address paymentToken, address targetToken, address account) public view returns (MasterOrderBook[] memory sellOrderBook, MasterOrderBook[] memory buyOrderBook) {
        (, address store) = getMini(targetToken);

        if (_isERC721(targetToken)) {
            uint256[] memory sellIds = IMiniExchangeStore(store).getIdBooks(sellSig, paymentToken, targetToken);
            MasterOrderBook[] memory _sellOrderBook = new MasterOrderBook[](sellIds.length);

            for (uint i = 0; i < sellIds.length; i++) {
                _sellOrderBook[i] = this.getSellOrderBooks(paymentToken, targetToken, sellIds[i], account);
            }

            return (
                _sellOrderBook,
                this.getOrderBookByTokenId(
                    paymentToken,
                    targetToken,
                    IMiniExchangeStore(store).getIdBooks(buySig, paymentToken, targetToken),
                    account
                )
            );
        } else {
            return (
                this.getOrderBookByTokenId(
                    sellSig,
                    paymentToken,
                    targetToken,
                    IMiniExchangeStore(store).getIdBooks(sellSig, paymentToken, targetToken),
                    account
                ),
                this.getOrderBookByTokenId(
                    buySig,
                    paymentToken,
                    targetToken,
                    IMiniExchangeStore(store).getIdBooks(buySig, paymentToken, targetToken),
                    account
                )
            );
        }
    }

    function getOrderBooks(address paymentToken, address targetToken, uint tokenId, address account) external view returns (MasterOrderBook memory sellOrderBook, MasterOrderBook memory buyOrderBook) {
        if (_isERC721(targetToken)) {
            return (
                this.getSellOrderBooks(paymentToken, targetToken, tokenId, account),
                this.getOrderBookByTokenId(paymentToken, targetToken, tokenId, account)
            );
        }
        else {
            return (
                this.getOrderBookByTokenId(sellSig, paymentToken, targetToken, tokenId, account),
                this.getOrderBookByTokenId(buySig, paymentToken, targetToken, tokenId, account)
            );
        }
    }

    function isRemoveBook(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint price) external view returns (bool) {
        if (_isERC721(targetToken)) {
            if (methodSig == sellSig) {
                if (getSellOrderBooks(paymentToken, targetToken, tokenId, address(0)).orders.length == 0) return true;
                else return false;
            } else {
                if (0 == validateBuyOrderCounts(paymentToken, targetToken, tokenId, price, address(0))) return true;
                else return false;
            }
        } else {
            if (0 == getAmountByPrice(methodSig, paymentToken, targetToken, tokenId, price, address(0)).amount) return true;
            else return false;
        }
    }
}
