//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

interface IExchangeStruct {
    /**
        order param, arg

        @Params - MiniExchange method's parameter & argument
        @UnAssignOrders - MasterExchange method's parameter or MiniExchange method's parameter & argument
        @AssignOrders - MasterExchange method's parameter or MiniExchange method's parameter & argument
    */
    struct Params {
        bytes4 methodSig; // sellSig : 0x0f3cba00, buySig : 0xb9f5a720
        address paymentToken; // erc20 contractAddress
        address targetToken; // erc721 or erc1155 contractAddress
        address maker; // order maker
        uint256 tokenId; // tokenId
        uint256 price; // price (무조건 개당가격)
        uint256 amount; // token amount -> erc721 case 는 모두 1
        uint256 turnIndex; // Indexer Struct 의 turnIndex 값, sellOrderBooks 또는 buyOrderBooks 에서 나온 값
        uint256 endIndex; // Indexer Struct 의 endIndex 값, sellOrderBooks 또는 buyOrderBooks 에서 나온 값
        uint256 expireTime; // 주문 유효기간, 0(지정하지않음) 일때는 2**256 - 1
    }

    struct UnAssignOrders {
        address paymentToken; // erc20 contractAddress
        address targetToken; // erc721 or erc1155 contractAddress
        uint256 tokenId; // tokenId
        uint256 price; // price (무조건 개당가격)
        uint256 amount; // token amount -> erc721 case 는 모두 1
        uint256 expireDate; // 주문 유효기간, 0(지정하지않음) 일때는 2**256 - 1
    }

    struct AssignOrders {
        bytes4 methodSig; // sellSig : 0x0f3cba00, buySig : 0xb9f5a720
        address paymentToken; // erc20 contractAddress
        address targetToken; // erc721 or erc1155 contractAddress
        address taker;  // 체결자 (msg sender)
        uint256 tokenId; // tokenId
        uint256 price; // price (무조건 개당가격)
        uint256 amount; // amount, => 721 case : expireTime 을 0 으로 초기화, 1155 case : amount 뺄셈
        uint256 orderIndex; // orderIndex
    }

    /**
        오더북을 리턴할 때, 쓰이는 구조체

        판매중인 모든 토큰을 볼 때 : MasterOrderBook[]
        토큰 하나의 오더북을 볼 때 : MasterOrderBook

        return Rule =>
                     groupBy => tokenId => price
                     sortBy => createdAt

                     
    */
    struct MasterOrderBook {
        uint256 tokenId;
        MasterOrders[] orders;
    }
    struct MasterOrders {
        uint256 price;
        uint256 amount;
        MiniOrder[] order;
    }
    struct MiniOrder {
        address maker;
        uint256 amount;
        uint256 expireTime;
        uint256 orderIndex;
    }
}
