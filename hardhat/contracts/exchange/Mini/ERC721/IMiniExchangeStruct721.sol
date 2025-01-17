//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

interface IMiniExchangeStruct721 {
    struct Order {
        address maker;
        uint256 price;
        uint256 expireTime;
    }
    struct BuyOrder {
        address maker;
        uint256 expireTime;
    }

    /**
        Indexer rule ( ** 중요함 **) -> 핵심 role
            1. turnIndex 는 matchOrder 를 통해서만 증가된다.
            2. endIndex 는 addOrder 를 통해서만 증가된다. (endIndex 를 order 로 만들고, 증가 시키는 방식, 즉 endIndex 는 nextOrderIndex)
            3. (turnIndex <= orderIndex < endIndex) , orderIndex 의 오더만 체결된다.
            4. 판매 또는 구매 가능한 수량을 출력해주는 함수 또한 해당 indexer의 turnIndex ~ endIndex 사이의 amount 를 출력한다.
    */
    struct Indexer { // 구매 order 의 인덱서,  turnIndex 와 endIndex 간격에는 order 가 존재하고, 해당 index 값이 아래 order mapping의 key 값이 된다.
        uint256 turnIndex; // 해당 가격으로 가장 먼저 체결되는 인덱스
        uint256 endIndex; // 해당 가격으로 addOrder 되는 nextIndex ( endIndex-1 값이 마지막 오더)
        mapping(uint => BuyOrder) order; // 위 인덱스를 key 값으로 가지는 주문서
    }
}
