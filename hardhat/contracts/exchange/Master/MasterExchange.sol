//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

import "./IMasterExchange.sol";
import "./Role/MasterAdmin.sol";
import "../Viewer/Role/ViewerRole.sol";
import "../Mini/IMiniExchange.sol";
import "../Mini/ERC721/IMiniExchangeStruct721.sol";
import "../Mini/ERC1155/IMiniExchangeStruct1155.sol";
import "../Mini/IMiniExchangeStore.sol";

interface IOwnable {
    function owner() external view returns (address);
}

contract MasterExchange is IMasterExchange, MasterAdmin, ViewerRole, Initializable, OwnableUpgradeable, PausableUpgradeable {
    bool public initialized;


    function initialize(address _klaymintWallet, uint16 _klaymintFee, address _ExchangeViewer) public initializer {
        require(_klaymintFee <= 900, "projectFeeLimit plus baseKlaymintFee should be smaller than 1000");
        __Ownable_init();
        __Pausable_init();

        baseKlaymintWallet = _klaymintWallet;
        baseKlaymintFee = _klaymintFee;
        projectFeeLimit = 100; // project fee percent limit (100 == 10%)

        _setViewer(_ExchangeViewer);

        initialized = false;
    }


        /*@@@@@@@ MasterExchange user function @@@@@@@*/
    function sell(UnAssignOrders memory _order) public whenNotPaused {
        (address exchange, address store) = getMini(_order.targetToken);

        (uint leftOver, uint turnIndex, uint endIndex) = _findMatch(_order, sellSig, IMiniExchange(exchange), IMiniExchangeStore(store));

        if (leftOver != 0) {
            Params memory newOrder = makerOrder(sellSig, _order.paymentToken, _order.targetToken, msg.sender, _order.tokenId, _order.price, _order.amount, _order.expireDate, turnIndex, endIndex);
            uint orderIndex = IMiniExchangeStore(store).addOrder(newOrder);
            emit addSellOrderEvent( _order.paymentToken, _order.targetToken, _order.tokenId, msg.sender, _order.price, _order.amount, orderIndex, newOrder.expireTime);

            _addBooks(_order, sellSig, IMiniExchangeStore(store));
        }

        if (IExchangeViewer(Viewer).isRemoveBook(getReverseSignature(sellSig), _order.paymentToken, _order.targetToken, _order.tokenId, _order.price)) {
            _removeBooks(_order, getReverseSignature(sellSig), IMiniExchangeStore(store));
        }
    }

    function sell(UnAssignOrders[] memory _orders) external whenNotPaused {
        for (uint8 i = 0; i < _orders.length; i++) {
            sell(_orders[i]);
        }
    }

    function buy(UnAssignOrders memory _order) public whenNotPaused {
        (address exchange, address store) = getMini(_order.targetToken);

        (uint leftOver, uint turnIndex, uint endIndex) = _findMatch(_order, buySig, IMiniExchange(exchange), IMiniExchangeStore(store));

        if (leftOver != 0) {
            Params memory newOrder = makerOrder(buySig, _order.paymentToken, _order.targetToken, msg.sender, _order.tokenId, _order.price, _order.amount, _order.expireDate, turnIndex, endIndex);
            uint orderIndex = IMiniExchangeStore(store).addOrder(newOrder);
            emit addBuyOrderEvent( _order.paymentToken, _order.targetToken, _order.tokenId, msg.sender, _order.price, _order.amount, orderIndex, newOrder.expireTime);

            _addBooks(_order, buySig, IMiniExchangeStore(store));
        }

        if (IExchangeViewer(Viewer).isRemoveBook(getReverseSignature(buySig), _order.paymentToken, _order.targetToken, _order.tokenId, _order.price)) {
            _removeBooks(_order, getReverseSignature(buySig), IMiniExchangeStore(store));
        }
    }

    function buy(UnAssignOrders[] memory _orders) external whenNotPaused {
        for (uint8 i = 0; i < _orders.length; i++) {
            buy(_orders[i]);
        }
    }

    function cancel(AssignOrders memory _order) public whenNotPaused {
        require(_order.taker == msg.sender, "invalid taker address");

        (address exchange, address store) = getMini(_order.targetToken);

        bool revocable = IMiniExchange(exchange).cancel(_order, IMiniExchangeStore(store));

        if (revocable) {
            IMiniExchangeStore(store).removeOrder(_order);
            if (_order.methodSig == sellSig) emit cancelSellOrderEvent(_order.paymentToken, _order.targetToken, _order.tokenId, msg.sender, _order.price, _order.amount, _order.orderIndex);
            else emit cancelBuyOrderEvent(_order.paymentToken, _order.targetToken, _order.tokenId, msg.sender, _order.price, _order.amount, _order.orderIndex);

            if (IExchangeViewer(Viewer).isRemoveBook(getReverseSignature(_order.methodSig), _order.paymentToken, _order.targetToken, _order.tokenId, _order.price)) {
                _removeBooks(UnAssignOrders(_order.paymentToken, _order.targetToken, _order.tokenId, _order.price, _order.amount, 0), _order.methodSig, IMiniExchangeStore(store));
            }
        }
    }

    function cancel(AssignOrders[] memory _orders) external whenNotPaused {
        for (uint8 i = 0; i < _orders.length; i++) {
            cancel(_orders[i]);
        }
    }

    function assignMatch(AssignOrders memory order) external whenNotPaused {
        require(order.taker == msg.sender, "invalid taker address");

        (address exchange, address store) = getMini(order.targetToken);

        MiniOrder memory _miniOrder = IMiniExchange(exchange).findMatch(order, IMiniExchangeStore(store));

        require(_miniOrder.amount != 0 && _miniOrder.expireTime != 0 && _miniOrder.maker != address(0), "invalid order, fail OrderMatch");

        if (order.methodSig == sellSig) {
            safeTargetTokenTransferFrom(order.targetToken, order.taker, _miniOrder.maker, order.tokenId, _miniOrder.amount);
            shareFee(order.paymentToken, order.targetToken, _miniOrder.maker, order.taker, order.price * _miniOrder.amount);
            emit sellMatchOrderEvent(order.paymentToken, order.targetToken, order.tokenId, _miniOrder.maker, order.price, _miniOrder.amount, _miniOrder.orderIndex, order.taker);
        } else {
            safeTargetTokenTransferFrom(order.targetToken, _miniOrder.maker, order.taker, order.tokenId, _miniOrder.amount);
            shareFee(order.paymentToken, order.targetToken, order.taker, _miniOrder.maker, order.price * _miniOrder.amount);
            emit buyMatchOrderEvent(order.paymentToken, order.targetToken, order.tokenId, _miniOrder.maker, order.price, _miniOrder.amount, _miniOrder.orderIndex, order.taker);
        }

        if (order.amount <= _miniOrder.amount) _miniOrder.amount -= order.amount;
        else _miniOrder.amount = 0;

        IMiniExchangeStore(store).setOrderBook(getReverseSignature(order.methodSig), order.paymentToken, order.targetToken, order.tokenId, order.price, _miniOrder.amount, _miniOrder.orderIndex);

        if (IExchangeViewer(Viewer).isRemoveBook(getReverseSignature(order.methodSig), order.paymentToken, order.targetToken, order.tokenId, order.price)) {
            _removeBooks(UnAssignOrders(order.paymentToken, order.targetToken, order.tokenId, order.price, order.amount, 0), getReverseSignature(order.methodSig), IMiniExchangeStore(store));
        }
    }

    function marketMatch(AssignOrders memory order) external whenNotPaused {
        require(order.taker == msg.sender, "invalid taker address");
        require(order.methodSig == sellSig || order.methodSig == buySig, "invalid methodSig");
        (address exchange, address store) = getMini(order.targetToken);
        require(exchange == address(ex1155), "ERC721 Contract address can Not available.");

        UnAssignOrders memory _unAssignOrder = UnAssignOrders(order.paymentToken, order.targetToken, order.tokenId, order.price, order.amount, 0);

        _findMatch(_unAssignOrder, order.methodSig, IMiniExchange(exchange), IMiniExchangeStore(store));

        if (IExchangeViewer(Viewer).isRemoveBook(getReverseSignature(order.methodSig), order.paymentToken, order.targetToken, order.tokenId, order.price)) {
            _removeBooks(_unAssignOrder, getReverseSignature(order.methodSig), IMiniExchangeStore(store));
        }
    }

    function setFeeBooks (address targetToken, address account, uint16 rate) external whenNotPaused {
        /* contract 가 ownable을 상속했고 msg sender 가 owner 일 경우 setFee 가능 */
        require(IOwnable(targetToken).owner() == msg.sender, "Ownable: caller is not the owner");
        _setFeeBook(targetToken, account, rate);
    }


        /*@@@@@@@ internal function @@@@@@@*/
    function _findMatch(UnAssignOrders memory _order, bytes4 _methodSig, IMiniExchange Exchange, IMiniExchangeStore Store) internal returns (uint _leftOver, uint _turnIndex, uint _endIndex) {
        if (_methodSig == sellSig) require(Exchange.validateTargetToken(_order.targetToken, msg.sender, _order.tokenId, _order.amount), "caller is not owner nor approved");
        else require(IMiniRole(address(Exchange)).validateERC20(_order.paymentToken, msg.sender, _order.price), "caller is not enough nor approved");

        (uint256 turnIndex, uint256 endIndex) = Store.getOrderIndex(getReverseSignature(_methodSig), _order.paymentToken, _order.targetToken, _order.tokenId, _order.price);

        while (turnIndex < endIndex) {
            AssignOrders memory order = AssignOrders(_methodSig, _order.paymentToken, _order.targetToken, msg.sender, _order.tokenId, _order.price, _order.amount, turnIndex);
            MiniOrder memory _miniOrder = Exchange.findMatch(order, Store);

            if (_miniOrder.amount == 0 || _miniOrder.expireTime == 0 || _miniOrder.maker == address(0)) {
                turnIndex++;
                continue;
            }

            uint matchAmount;

            // 두 조건 모두 overflow or underflow 방지 조건
            if (_miniOrder.amount <= _order.amount) {
                matchAmount = _miniOrder.amount;
                _miniOrder.amount = 0;
            } else {
                matchAmount = _order.amount;
                _miniOrder.amount -= _order.amount;
            }
            _order.amount -= matchAmount;

            if (_methodSig == sellSig) {
                safeTargetTokenTransferFrom(order.targetToken, order.taker, _miniOrder.maker, order.tokenId, matchAmount);
                shareFee(order.paymentToken, order.targetToken, _miniOrder.maker, order.taker, order.price * matchAmount);
                emit sellMatchOrderEvent(order.paymentToken, order.targetToken, order.tokenId, _miniOrder.maker, order.price, matchAmount, turnIndex, order.taker);
            } else {
                safeTargetTokenTransferFrom(order.targetToken, _miniOrder.maker, order.taker, order.tokenId, matchAmount);
                shareFee(order.paymentToken, order.targetToken, order.taker, _miniOrder.maker, order.price * matchAmount);
                emit buyMatchOrderEvent(order.paymentToken, order.targetToken, order.tokenId, _miniOrder.maker, order.price, matchAmount, turnIndex, order.taker);
            }

            Store.setOrderBook(getReverseSignature(_methodSig), order.paymentToken, order.targetToken, order.tokenId, order.price, _miniOrder.amount, turnIndex);

            if (_order.amount == 0){
                if (_miniOrder.amount == 0) turnIndex++;
                break;
            }

            turnIndex++;
        }

        Store.setTurnIndex(getReverseSignature(_methodSig), _order.paymentToken, _order.targetToken, _order.tokenId, _order.price, turnIndex);

        return (_order.amount, turnIndex, endIndex);
    }

    function _removeBooks(UnAssignOrders memory order, bytes4 orderBookSig, IMiniExchangeStore Store) internal {
        Store.removePrice(orderBookSig, order.paymentToken, order.targetToken, order.tokenId, order.price);
        if (Store.getPriceBooks(orderBookSig, order.paymentToken, order.targetToken, order.tokenId).length == 0) {
            Store.removeTokenId(orderBookSig, order.paymentToken, order.targetToken, order.tokenId);
        }
    }

    function _addBooks(UnAssignOrders memory order, bytes4 orderBookSig, IMiniExchangeStore Store) internal {
        Store.addPrice(orderBookSig, order.paymentToken, order.targetToken, order.tokenId, order.price);
        Store.addTokenId(orderBookSig, order.paymentToken, order.targetToken, order.tokenId);
    }


        /*@@@@@@@ owner function @@@@@@@*/
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function resister(address exchange721, address exchangeStore721, address exchange1155, address exchangeStore1155) external onlyOwner {
        _resister(exchange721, exchangeStore721, exchange1155, exchangeStore1155);
    }

    function deResister(address exchange) external onlyOwner {
        _deResister(exchange);
    }

    function migration(address newMaster) external onlyOwner {
        _pause();
        _migration(newMaster);
    }

    function adminCancel(AssignOrders memory _order) external onlyOwner {
        (address exchange, address store) = getMini(_order.targetToken);
        bool revocable = IMiniExchange(exchange).cancel(_order, IMiniExchangeStore(store));
        if (revocable) {
            IMiniExchangeStore(store).removeOrder(_order);
            if (_order.methodSig == sellSig) emit cancelSellOrderEvent(_order.paymentToken, _order.targetToken, _order.tokenId, msg.sender, _order.price, _order.amount, _order.orderIndex);
            else emit cancelBuyOrderEvent(_order.paymentToken, _order.targetToken, _order.tokenId, msg.sender, _order.price, _order.amount, _order.orderIndex);
        }
    }

    function adminSetFeeBooks (address targetToken, address account, uint16 rate) external onlyOwner {
        _setFeeBook(targetToken, account, rate);
    }

    function setBaseFee (address account, uint16 rate) external onlyOwner {
        _setBaseFee(account, rate);
    }

    function setProjectFeeLimit(uint16 rate) external onlyOwner {
        _setProjectFeeLimit(rate);
    }

    // MasterExchange's Viewer address change function
    function setViewer(address _ExchangeViewer) external onlyOwner {
        _setViewer(_ExchangeViewer);
    }

    // MiniExchange's Viewer address change function
    function setViewer(address _ExchangeViewer, address exchange) external onlyOwner {
        IMiniExchange(exchange).setViewer(_ExchangeViewer);
    }
}
