//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../Mini/Role/MiniRole.sol";
import "../IMiniExchangeStore.sol";
import "./IMiniExchangeStruct721.sol";

contract MiniExchangeStore721 is IMiniExchangeStruct721, IMiniExchangeStore, MiniRole, Initializable {
    using EnumerableSet for EnumerableSet.UintSet;

    bool public initialized;

    // methodSig => paymentAddress => targetTokenAddress => arrays(tokenId[])
    mapping(bytes4 => mapping(address => mapping(address => EnumerableSet.UintSet))) idBooks; // 구매 or 판매 중인 tokenId array list
    // methodSig => paymentAddress => targetTokenAddress => tokenId => arrays(Price[])
    mapping(bytes4 => mapping(address => mapping(address => mapping(uint => EnumerableSet.UintSet)))) priceBooks; // 구매 or 판매 중인 price array list
    // methodSig => paymentAddress => targetTokenAddress => tokenId => price => Indexer(turnIndex <= order < endIndex)
    mapping(bytes4 => mapping(address => mapping(address => mapping(uint => mapping(uint => Indexer))))) orderBooks;

    // paymentAddress => targetTokenAddress => tokenId => order   /  (721 case 는 token 소유주가 한명뿐이라, Indexer 사용 x, 별도의 저장공간 생성)
    mapping(address => mapping(address => mapping(uint => Order))) public sellOrderBooks;


    function initialize(address master) public initializer {
        __MiniRole_init(master);

        initialized = false;
    }



    /* addOrder의 절대적인 룰 : endIndex 를 증가시킨다 */
    function addOrder(Params memory order) external onlyMaster returns (uint orderIndex) {
        Indexer storage _orderBook = orderBooks[order.methodSig][order.paymentToken][order.targetToken][order.tokenId][order.price];

        if (order.methodSig == sellSig){
            sellOrderBooks[order.paymentToken][order.targetToken][order.tokenId] = Order(order.maker, order.price, order.expireTime);
            return (_orderBook.endIndex);
        }
        else {
            _orderBook.order[_orderBook.endIndex] = BuyOrder(order.maker, order.expireTime);
            _orderBook.endIndex++;
            return (_orderBook.endIndex - 1);
        }
    }

    /* expireTime 을 0으로 초기화해서 강제 만료, 실제로 remove 하는 건 아님, */
    function removeOrder(AssignOrders memory order) external onlyMaster {
        if (order.methodSig == sellSig) sellOrderBooks[order.paymentToken][order.targetToken][order.tokenId].expireTime = 0;
        else orderBooks[order.methodSig][order.paymentToken][order.targetToken][order.tokenId][order.price].order[order.orderIndex].expireTime = 0;
    }

    /* order 초기화 */
    function setOrderBook(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint, uint orderIndex) external onlyMaster {
        if (methodSig == sellSig) sellOrderBooks[paymentToken][targetToken][tokenId].expireTime = 0;
        else orderBooks[methodSig][paymentToken][targetToken][tokenId][price].order[orderIndex].expireTime = 0;
    }

    /* matchOrder case 에서 turnIndex 의 증감치만큼 orderIndex set */
    function setTurnIndex(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price, uint orderIndex) external onlyMaster {
        if (methodSig == buySig) orderBooks[methodSig][paymentToken][targetToken][tokenId][price].turnIndex = orderIndex;
        else if (sellOrderBooks[paymentToken][targetToken][tokenId].price == price) {
            sellOrderBooks[paymentToken][targetToken][tokenId].expireTime = 0;
        }
    }

    function addTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) external onlyMaster {
        idBooks[methodSig][paymentToken][targetToken].add(tokenId);
    }

    function removeTokenId (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) external onlyMaster {
        idBooks[methodSig][paymentToken][targetToken].remove(tokenId);
    }

    function addPrice (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) external onlyMaster {
        if (methodSig == buySig) priceBooks[methodSig][paymentToken][targetToken][tokenId].add(price);
    }

    function removePrice (bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) external onlyMaster {
        if (methodSig == buySig) priceBooks[methodSig][paymentToken][targetToken][tokenId].remove(price);
    }



        /*@@@ view function @@@*/
    function getIdBooks(bytes4 methodSig, address paymentToken, address targetToken) methodSigValidator(methodSig) public view returns (uint256[] memory ids) {
        return idBooks[methodSig][paymentToken][targetToken].values();
    }

    function getPriceBooks(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId) methodSigValidator(methodSig) public view returns (uint256[] memory prices) {
        if (methodSig == sellSig) {
            (address maker, uint256 price, uint expireTime) = this.sellOrderBooks(paymentToken, targetToken, tokenId);

            if (expireTime >= block.timestamp && validateTargetToken(targetToken, maker, tokenId, 0)) {
                uint256[] memory _returnValue = new uint256[](1);
                _returnValue[0] = price;
                return _returnValue;
            } else {
                return new uint256[](0);
            }
        }
        else return priceBooks[methodSig][paymentToken][targetToken][tokenId].values();
    }

    function getOrder(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 _price, uint256 orderIndex) methodSigValidator(methodSig) public view returns (address maker, uint256 price, uint expireTime) {
        if (methodSig == sellSig) return (this.sellOrderBooks(paymentToken,targetToken,tokenId));
        else {
            BuyOrder memory _buyOrder = orderBooks[methodSig][paymentToken][targetToken][tokenId][_price].order[orderIndex];

            return (_buyOrder.maker, _price, _buyOrder.expireTime);
        }
    }

    function getOrderIndex(bytes4 methodSig, address paymentToken, address targetToken, uint256 tokenId, uint256 price) methodSigValidator(methodSig) public view returns (uint256 turnIndex, uint256 endIndex) {
        if (methodSig == sellSig) return (0, 1); // 721 sellOrderIndex is (0,1) fixed
        else return (orderBooks[methodSig][paymentToken][targetToken][tokenId][price].turnIndex, orderBooks[methodSig][paymentToken][targetToken][tokenId][price].endIndex);
    }

    function validateTargetToken(address targetToken, address account, uint tokenId, uint) internal view returns (bool) {
        if (
            IERC721Upgradeable(targetToken).ownerOf(tokenId) == account &&
            IERC721Upgradeable(targetToken).isApprovedForAll(account, master())
        ) return true;
        else return false;
    }
}
