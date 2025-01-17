------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------

# Klaymint Exchange Contract Index

* [Desc](#desc)
* [FrontEnd User Function Interface](#frontend-user-function-interface)
* [BackEnd Event Interface](#backend-event-interface)
* [Test](#test)
* [Deploy](#deploy)
* [Contract Address](#contract-address)

------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------

## Desc

* [Deployed](#deployed)
* [WorkFlow](#workflow)
* [Requirements](#requirements)
* [Logic](#logic)
------------------------------------------------------------------------------------------

각각의 역할에 따라 코드 분리,  
모든 코드를 모아보기 -> KlayMintMarketPlace.txt 
해당 파일을 먼저 읽고, 분리된 코드를 따로 다시 읽어서 파악하길 추천


### Deployed 
(배포되는 컨트랙은 다음과 같다)
1. **MasterExchange**
2. **MiniExchange721**
3. **MiniExchangeStore721**
4. **MiniExchange1155**
4. **MiniExchangeStore1155**
5. **ExchangeViewer**



```
exchange
├─ KlayMintMarketPlace.txt      // 모든 코드 모아보기
├─ ExchangeMethodValidator.sol  // function signature abstract contract
├─ IExchangeStruct.sol          // Master, Mini, Viewer 컨트랙에 공통으로 들어가는 Struct Interface
├─ 📂 Master 
│  ├─ IMasterExchange.sol
│  ├─ MasterExchange.sol
│  └─ 📂 Role                    // MasterExchange 에서 아래의 모든 추상 컨트랙 및 인터페이스를 상속받음
│     ├─ MasterAdmin.sol        // Master Exchange Contract 에서 필요한 Admin Function Contract
│     └─ MasterRole.sol         // Master <-> Mini 관계에서 필요한 Master Role Contract
├─ 📂 Mini
│  ├─ IMiniExchange.sol         // MiniExchange Common Interface
│  ├─ IMiniExchangeStore.sol    // MiniExchange Store Interface          
│  ├─ 📂 ERC1155                 
│  │  ├─ IMiniExchangeStruct1155.sol  // MiniExchange struct interafce
│  │  ├─ MiniExchangeStore1155.sol    // MiniExchange Storage
│  │  └─ MiniExchange1155.sol         // MiniExchange set Storage validation checker
│  ├─ 📂 ERC721
│  │  ├─ IMiniExchangeStruct721.sol   // MiniExchange struct interafce
│  │  ├─ MiniExchangeStore721.sol     // MiniExchange Storage
│  │  └─ MiniExchange721.sol          // MiniExchange set Storage validation checker
│  └─ 📂 Role
│     ├─ IMiniRole.sol
│     └─ MiniRole.sol           // Master <-> Mini 관계에서 필요한 Mini Role Contract
└─ 📂 Viewer
   ├─ ExchangeViewer.sol        // Contract size issue 로 분리된 view contract (오더북 등의 view function)
   ├─ IExchangeViewer.sol
   └─ 📂 Role
      └─ ViewerRole.sol

```

### WorkFlow
```
    Client                          :       (sell or buy) function call
->  MasterExchange                  :       MiniExchange (sell or buy) function call
->  MiniExchange (ex1155 or ex721)  :       matchOrder function call
    -> if (matchOrder == true)      :       break
    -> if (matchOrder == false)     :       addOrder 전환
```

### Requirements
- [x] SCA-000 : 거래방식은 기본은 (가격 제안 -> 수락) 이며, 유저 함수는 다음과 같다.
    - [x] SCA-000-01 : **판매 제안)** 판매 가격 제안, 동시에 체결 가능한 가격을 탐색 및 체결, 찾지 못한 경우 오더가 등록된다. 
    - [x] SCA-000-02 : **구매 제안)** 구매 가격 제안, 판매 제안과 마찬가지
    - [x] SCA-000-03 : **지정 판매)** 지정 판매 제안, 동시에 체결 가능한 가격을 탐색 및 체결, 별도의 오더가 등록되지 않는다.
    - [x] SCA-000-04 : **지정 구매)** 지정 구매 제안, 동시에 체결 가능한 가격을 탐색 및 체결, 별도의 오더가 등록되지 않는다.
- [x] SCA-001 : 토큰 종류(ERC721 or ERC1155)에 따라 다른 contract call 이 필요없이 MasterExchange 의 function call, event listener 핸들링 
- [x] SCA-002 : orderBook call view function 이 가능한 컨트랙과 불가능한 컨트랙간의 스위칭이 가능하다. 단, 스토리지를 공유하지 않는다.
- [x] SCA-003 : 오더 만료기간은 1일 단위로 설정할 수 있다.
- [x] SCA-004 : 프로젝트의 오너는 fee 변경이 가능하다.
- [x] SCA-005 : batch sell, buy, cancel 이 가능하다.
- [x] SCA-006 : 같은 가격으로 sell order 와 buy order 가 공존할 수 없다.
- [x] SCA-007 : 관리자 기능은 다음과 같다.
  - [x] SCA-007-01 : pause (MasterExchange)
  - [x] SCA-007-02 : adminCancel
  - [x] SCA-007-03 : setBlackList
  - [x] SCA-007-04 : adminSetFeeBooks
  - [x] SCA-007-05 : setBaseFee
  - [x] SCA-007-06 : setProjectFeeLimit
  - [x] SCA-007-07 : resister, deResister, migration 은 MiniExchange 와 MasterExchange 의 관계 function


### Logic
```solidity
    /**
        Indexer rule ( ** 중요함 ** )
            1. turnIndex 는 matchOrder 를 통해서만 증가된다.
            2. endIndex 는 addOrder 를 통해서만 증가된다. (endIndex 를 order 로 만들고, 증가 시키는 방식, 즉 endIndex 는 nextOrderIndex)
            3. (turnIndex <= orderIndex < endIndex) , orderIndex 의 오더만 체결된다.
            4. 판매 또는 구매 가능한 수량을 출력해주는 함수 또한 해당 indexer의 turnIndex ~ endIndex 사이의 amount 를 출력한다.
    */
    struct Indexer { // 구매 order 의 인덱서,  turnIndex 와 endIndex 간격에는 order 가 존재하고, 해당 index 값이 아래 order mapping의 key 값이 된다.
        uint256 turnIndex; // 가장먼저 확인되는 인덱스, turnIndex ~ endIndex 를 order 에 넣어 체결될 수 있는 가격을 찾는다.
        uint256 endIndex; // 마지막에 등록된 인덱스
        mapping(uint => Order) order; // 위 인덱스를 key 값으로 가지는 주문서
    }
```
MiniExchange721 의 sellOrderBook 을 제외한 위의 Indexer 가 로직의 베이스가 된다.

오더가 만료되는 기준은 다음과같다.
>> #### Common
> - turnIndex 보다 작은 orderIndex
> - expireTime 만료
>> #### MiniExchange721
> - expireTime === 0 (cancel or match 경우 set expireTime 0 )
>> #### MiniExchange1155
> - amount === 0 (cancel 경우 set amount 0 ) (match 경우 originAmount -= matchedAmount)

오더가 만료되지 않았지만, 숨겨져야하는 경우
>> #### 판매 제안 오더  
> - ERC721 or ERC1155 판매 토큰의 소유주가 변경 또는 수량이 충분하지 않은 경우
>> #### 구매 제안 오더
> - ERC20 규격의 지불수단이 충분하지 않은 경우
 

때문에 ViewerContract 의 orderBook 이라는 view function 을 통해 오더북을 가져오는게 아니라  
지불수단에 대한 블록 트래킹을 통해 DB 값을을 업데이트 하는 경우,   

1. 체결되는 주문의 orderIndex, 

보다 작은 orderIndex 를 가진 주문을 모두 만료시켜야한다. ( (paymentToken, targetToken, tokenId, price) 가 같은 orderIndex )

------------------------------------------------------------------------------------------

Contract ABI 얻는 방법

1. 해당 레포를 clone  
2. ```npm i ```
3. ```npx hardhat compile```
4. 생성된 './artifacts/contracts/exchange' 내부 필요한 Contract에 맞는 .json 내부 key 값이 abi 인 value
 
또는 

1. contracts 내부 필요한 contract 코드 복사
2. remix ide 로 붙여넣기
3. compiler tap 에서 contract 지정 후 abi 추출

------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------

## FrontEnd User Function Interface
>> MasterExchange
>> ### Struct
>> * ### [UnAssignOrders](#unassignorders)
>> * ### [AssignOrders](#assignorders)
>> ------------------------------------------------------------------------------------------
>> ### Function 
>> * ### [sell(...UnAssignOrders)](#Struct-params-function-example) // 주문 생성 
>> * ### [sell(...UnAssignOrders[ ])](#array-struct-params-function-example) // 일괄 주문 생성
>> * ### [buy(...UnAssignOrders)](#Struct-params-function-example)
>> * ### [buy(...UnAssignOrders[ ])](#array-struct-params-function-example)
>> * ### [cancel(...AssignOrders)](#Struct-params-function-example) // 주문 취소
>> * ### [cancel(...AssignOrders[ ])](#array-struct-params-function-example) // 일괄 주문 취소
>> * ### [assignMatch(...AssignOrders)](#Struct-params-function-example) // 지정 주문 체결 (주문 생성 X, 체결 시도만 한다.)
>> * ### [marketMatch(...AssignOrders)](#Struct-params-function-example) // ERC1155 전용 지정 주문 체결 (주문 생성 X, 체결 시도만 한다.)
>> * ### [setFeeBooks(address, address, uint16)](#setfeebooks-function-example) // set fee function
>> ------------------------------------------------------------------------------------------
>> ### View Function
>> * ### [getFeeBook(address) returns (address, uint256)](#get-feebooks-function-example) // get fee info function
> ------------------------------------------------------------------------------------------
>> ViewerExchange 
>> ### Struct
>> * ### [MasterOrderBook](#masterorderbook)
>> * ### [MasterOrders](#masterorders)
>> * ### [MiniOrder](#miniorder)
>> ### View Function 
>> * ### [getOrderBooks(address, address, address) returns (MasterOrderBook[], MasterOrderBook[])](#get-orderbook-view-function-example) // 모든 오더북 불러오기 
>> * ### [getOrderBooks(address, address, uint256, address) returns (MasterOrderBook, MasterOrderBook)](#get-orderbook-view-function-example---by-tokenid) // 토큰 하나에 해당하는 오더북 불러오기
> ------------------------------------------------------------------------------------------
> 
> marketMatch 경우 ERC1155 의 오더북을 보여줄 때, 가격별로 오더를 묶어서 보여준다면,  
> 체결 버튼도 하나만 생길것, 그 경우에 체결버튼을 누루고 오더 수락에 대해서 진행할 때,   
> 주문 하나에 대한 수락이 아니라, 가능한 원하는 만큼의 체결을 진행할 때 사용한다.   
> 해당함수를 사용할 때 AssignOrders 의 orderIndex 를 uint256 범위 내에서 아무 숫자나 넣어도 무방하다. (0 권장)  
> ERC1155 는 assignMatch, marketMatch 둘 다 사용가능하고, ERC721 은 assignMatch 만 사용가능하다.
>


### UnAssignOrders
```solidity
    struct UnAssignOrders {
        address paymentToken; // erc20 contractAddress
        address targetToken; // erc721 or erc1155 contractAddress
        uint256 tokenId; // tokenId
        uint256 price; // price (무조건 개당가격)
        uint256 amount; // token amount -> erc721 case 는 모두 1
        uint256 expireDate; // 주문 유효기간, 0(지정하지않음) 일때는 2**256 - 1
    }
```  
  
### AssignOrders
```solidity
    struct AssignOrders {
        bytes4 methodSig; // sellSig : 0x45c9acfe, buySig : 0x848d8f28
        address paymentToken; // erc20 contractAddress
        address targetToken; // erc721 or erc1155 contractAddress
        address taker;  // 체결자 (msg sender) 
        uint256 tokenId; // tokenId
        uint256 price; // price (무조건 개당가격)
        uint256 amount; // amount, => 721 case : expireTime 을 0 으로 초기화, 1155 case : amount 뺄셈
        uint256 orderIndex; // orderIndex
    }
```

------------------------------------------------------------------------------------------

### Struct Params Function Example
[UnAssignOrders](#unassignorders) 또는 [AssignOrders](#assignorders) 를 params 로 가진 function 을 호출할 때, 아래와 같이 배열 형태로 넣어주면 된다.
```typescript
const data = MasterExchange.methods.sell(
    [_erc20, _erc721, _tokenId, _price, _amount, _expireTime]
  ).encodeABI();
  // ... send transaction
```

### Array Struct Params Function Example
[UnAssignOrders](#unassignorders) 또는 [AssignOrders](#assignorders) 의 Array 를 params 로 가진 function 을 호출할 때, 아래와 같이 2차원 배열 형태로 넣어주면 된다.
```typescript
const data = MasterExchange.methods.sell(
    [[_erc20, _erc721, _tokenId, _price, _amount, _expireTime], [...second]]
  ).encodeABI();
  // ... send transaction
```

### setFeeBooks Function Example
0 <= FeeRate <= projectFeeLimit(default 100)   
소수점 첫번째 지원, ex) 10% -> 100, 2.5% -> 25
```typescript
const data = MasterExchange.methods.setFeeBooks([_erc721, feeWalletAddress, feeRate]).encodeABI();
  // ... send transaction
```

### Get FeeBooks Function Example 
```typescript
const result = MasterExchange.methods.getFeeBook(_erc721).call();
```
- result (예시)
```
Result {
  klaymint: '0x0000000000000000000000000000000000000000',
  klaymintRate: '0'
  project: '0x0000000000000000000000000000000000000000',
  projectRate: '0'
}
```

------------------------------------------------------------------------------------------

### MasterOrderBook
```solidity
struct MasterOrderBook { // array 형태라면 group by tokenId
  uint256 tokenId;
  MasterOrders[] orders;
}
```
### MasterOrders
```solidity
struct MasterOrders { // group by price
  uint256 price;
  uint256 amount;
  MiniOrder[] order;
}
```
### MiniOrder
```solidity
struct MiniOrder { // sort by orderIndex
  address maker;
  uint256 amount;
  uint256 expireTime;
  uint256 orderIndex;
}
```


> ## Get OrderBook View Function Example
> 컬렉션(nft contract)에 해당하는 모든 오더북을 들고온다.
>
> ```typescript
> const result = ViewerExchange.methods.getOrderBooks(payment, target, MasterExchange).call();
> ```
> ### Input 
>
> | name       | type          |  desc                |
> -------------| ------------- |----------------------|
> payment | address | 지불수단 Contract Address, `ex) erc20, kip7`
> target | address | 거래대상 Contract Address, `ex) erc721, erc1155, kip17, kip37`
> MasterExchange | address | null address, MasterExchange address, account 중 하나, ( 아래 사진 및 [ViewerExcahgne](https://github.com/cic-env/hardhat/blob/main/contracts/exchange/Viewer/ExchangeViewer.sol) 참고)
> ![스크린샷 2022-09-23 오후 5 33 13](https://user-images.githubusercontent.com/54474732/191922060-b2cedd9b-ff7a-4e23-a7b8-f8f20b277179.png)
> 여기서 switch 안에 들어오는 account 가 어떤 값이냐에 따라서, 다른 view 를 return 한다.   
> - null address
>   - `유효한` 주문 + `유효할 가능성`이 있는 주문을 모두 리턴
> - master address
>   - `유효한` 주문만 리턴
> - EOA (Externally Owned Accounts)
>   - 해당 `account 의 유효한` 주문만 리턴
>
> ### Output
> type : { sellOrderBook : [MasterOrderBook](#masterorderbook)[], buyOrderBook : [MasterOrderBook](#masterorderbook)[] }  
> rule : [OrderBook Rule](#orderbook-rule)
> ```typescript
> const Result = {
>   sellOrderBook: [
>     [ { tokenId: '1', orders: [
>       {
>         price: '5000000000000000000',
>         amount: '1',
>         order: [
>           {
>             maker: '0xa5E5f12acC05B3D7E019747b511df4DaC8027Ce2',
>             amount: '1',
>             expireTime: '1664528038',
>             orderIndex: '0'
>           },
>           {
>             maker: '0xe34f22cF55db5209bA6546701d408e5F58d8703f',
>             amount: '1',
>             expireTime: '1664528039',
>             orderIndex: '1'
>           }
>         ]
>       },
>       {
>         price: '10000000000000000000',
>         amount: '1',
>         order: [Array]
>       }
>     ] } ],
>     [ { tokenId: '2', orders: [Array] } ],
>     [ { tokenId: '3', orders: [Array] } ]
>   ],
>   buyOrderBook: [
>     [ { tokenId: '1', orders: [Array] } ],
>     [ { tokenId: '2', orders: [Array] } ],
>     [ { tokenId: '3', orders: [Array] } ]
>   ]
> }
> ```
> ## Get OrderBook View Function Example - by TokenId
> 컬렉션(nft contract)의 tokenId 에 해당하는 오더북을 들고온다.
>
> ```typescript
> const result = ViewerExchange.methods.getOrderBooks(payment, target, tokenId, MasterExchange).call();
> ```
> ### Input
>
> | name       | type    |  desc                |
> -------------|---------|----------------------|
> payment | address | 지불수단 Contract Address, `ex) erc20, kip7`
> target | address | 거래대상 Contract Address, `ex) erc721, erc1155, kip17, kip37`
> tokenId | uint256 | 거래대상 tokenId
> MasterExchange | address | null address, MasterExchange address, account 중 하나, ( 아래 사진 및 [ViewerExcahgne](https://github.com/cic-env/hardhat/blob/main/contracts/exchange/Viewer/ExchangeViewer.sol) 참고)
> ![스크린샷 2022-09-23 오후 5 33 13](https://user-images.githubusercontent.com/54474732/191922060-b2cedd9b-ff7a-4e23-a7b8-f8f20b277179.png)
> 여기서 switch 안에 들어오는 account 가 어떤 값이냐에 따라서, 다른 view 를 return 한다.
> - null address
>   - `유효한` 주문 + `유효할 가능성`이 있는 주문을 모두 리턴
> - master address
>   - `유효한` 주문만 리턴
> - EOA (Externally Owned Accounts)
>   - 해당 `account 의 유효한` 주문만 리턴
>
> ### Output
> type : { sellOrderBook : [MasterOrderBook](#masterorderbook), buyOrderBook : [MasterOrderBook](#masterorderbook) }
> rule : [OrderBook Rule](#orderbook-rule)
> ```typescript
> const Result = {
>   sellOrderBook: { 
>       tokenId: '1', orders: [
>       {
>         price: '5000000000000000000',
>         amount: '1',
>         order: [
>           {
>             maker: '0xa5E5f12acC05B3D7E019747b511df4DaC8027Ce2',
>             amount: '1',
>             expireTime: '1664528038',
>             orderIndex: '0'
>           },
>           {
>             maker: '0xe34f22cF55db5209bA6546701d408e5F58d8703f',
>             amount: '1',
>             expireTime: '1664528039',
>             orderIndex: '1'
>           }
>         ]
>       },
>       {
>         price: '10000000000000000000',
>         amount: '1',
>         order: [Array]
>       }
>     ] },
>   buyOrderBook: { tokenId: '1', orders: [Array] }
> }
> ```
> 
> ### OrderBook Rule
> ```
> group by : tokenId => price  
> sort by : createdAt
> ```
> [MasterOrderBook](#masterorderbook)[] 는  
> 1차적으로 먼저 tokenId 로 group by 가 되어있고,  
> 2차적으로 [MasterOrderBook](#masterorderbook) 내부 [MasterOrders](#masterorders) 는 price 로 group by 가 되어있다.  
> [MasterOrders](#masterorders) 내부에는 [MiniOrder](#miniorder) 가 orderIndex 를 기준으로 sort by 되어 나온다.
> 
> 또, array 의 length 는 주문의 유효성과 무관하게 할당되어,  
> 유효하지 않은 오더는 MiniOrder(address(0),0,0,0) 의 형태로 리턴되기 때문에 출력시 주의를 요함
> 
> 

------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------

## BackEnd Event Interface
```solidity
abstract contract MasterEmitter {
    // ...
    /** emitter 는 child exchange 의 주소, 혹여나 재배포 등으로 주소가 변경되고, PastEvents 를 조회해야할 때, 전 exchange 주소를 filter 할 수 있게, indexed */
    event addSellOrderEvent(address indexed emitter, address paymentToken, address indexed targetToken, uint256 indexed tokenId, address maker, uint256 price, uint256 amount, uint256 orderIndex, uint256 expireTime);
    event addBuyOrderEvent(address indexed emitter, address paymentToken, address indexed targetToken, uint256 indexed tokenId, address maker, uint256 price, uint256 amount, uint256 orderIndex, uint256 expireTime);
    event sellMatchOrderEvent(address indexed emitter, address paymentToken, address indexed targetToken, uint256 indexed tokenId, address maker, uint256 price, uint256 amount, uint256 orderIndex, address taker);
    event buyMatchOrderEvent(address indexed emitter, address paymentToken, address indexed targetToken, uint256 indexed tokenId, address maker, uint256 price, uint256 amount, uint256 orderIndex, address taker);
    event cancelSellOrderEvent(address indexed emitter, address paymentToken, address indexed targetToken, uint256 indexed tokenId, address maker, uint256 price, uint256 amount, uint256 orderIndex);
    event cancelBuyOrderEvent(address indexed emitter, address paymentToken, address indexed targetToken, uint256 indexed tokenId, address maker, uint256 price, uint256 amount, uint256 orderIndex);
}
```

------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------

## Test
### Command
> `yarn or npm run`  
> 
> ALL : `yarn testExchange`  
> 
> MasterExchange : `yarn testMasterExchange`  
> 
> MiniExchange1155 : `yarn testExchange1155`  
> 
> MiniExchange721 : `yarn testExchange721`  
> 
> ViewerExchange : `yarn testViewerExchange`
> 
> 🚨 만약 코드를 수정했을 떄, 무조건 테스트 코드를 실행해보고 배포해야합니다 🚨


### [Exchange Test](https://github.com/cic-env/hardhat/tree/main/test/exchange) dir tree
```
exchange
├─ common.ts          // 공통으로 쓰이는 함수
├─ Exchange721.ts     // only MiniExchange721 Test Code
├─ Exchange1155.ts    // only MiniExchange1155 Test Code
├─ index.ts           // 모든 테스트 코드 실행 파일
├─ MasterExchange.ts  // client <-> MasterExchange 또는 owner <-> MasterExchange 의 External Function Test Code
└─ ViewerExchange.ts  // OrderBooks Test Code 
```
[MasterExchange](https://github.com/cic-env/hardhat/blob/main/test/exchange/MasterExchange.ts) & [ViewerExchange](https://github.com/cic-env/hardhat/blob/main/test/exchange/ViewerExchange.ts)  
두개 파일 테스트가 제일 중요함, 만약 오더북 view function 이 필요없다면, ViewerExchange 의 테스트가 필요없음

테스트를 실행해보면 아래와같은 skip 이라는 테스트가 있는데,
<img width="911" alt="스크린샷 2022-09-21 오후 4 45 02" src="https://user-images.githubusercontent.com/54474732/191445733-e651da77-e6d0-4312-94a1-1179f5b49891.png">

### (passTime Test skip Done Time) - (약 2분)
<img width="303" alt="스크린샷 2022-09-21 오후 4 47 32" src="https://user-images.githubusercontent.com/54474732/191446122-36631c92-f7f0-4dd2-aa47-25e1d955ce85.png">


### (passTime Test 일부 제외 Done Time) - (약 9분)
<img width="531" alt="스크린샷 2022-09-21 오후 4 45 16" src="https://user-images.githubusercontent.com/54474732/191445725-e537c3c0-7b81-4e1d-917c-6f7232eb1394.png">  

```
이렇듯 skip 을 풀고 테스트를 진행할 시 많은 시간이 걸림,
심지어 5개를 모두 skip 을 풀고 진행하면, heap out of memory 로 테스트를 실행할 수 없음...

** 하나 또는 두개씩 풀어서 테스트 진행 권장 **
```

------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------

## Deploy
### Command
> `yarn or npm run`
>
> baobab : `yarn baobab:exchange`  
> 
> cypress:dev : `yarn cypress:exchange:dev`  
> 
> cypress:prod : `yarn cypress:exchange:prod`  
>
> 🚨 proxy logic 을 변경하는 스크립트도 포함된 명령어입니다. 🚨

### [Exchange scripts](https://github.com/cic-env/hardhat/tree/main/scripts/exchange) dir tree
```
exchange
├─ code.ts          // config interface + error message
└─ deploy.ts        // re_deploy or change proxy logic scripts
```

### deploy.ts
```
/** 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
 *
 * CLI 를 정상적으로 실행할 수 있는 조건은 다음과 같은 두 조건 뿐이다.
 *
 *      1. CONF.contract 의 모든 value 값이 ''(null) 값 인 경우
 *      2. CONF.contract 의 모든 value 값이 유효한 contract address 로 채워진 경우
 *
 *   만약 두가지 조건 중 하나라도 만족하지 않는 상태에서 진행하게 된다면,
 *   기존에 배포된 Master <-> Mini 간의 관계르 무시하고 모든 컨트랙트가 새롭게 배포되는 것 과 같다.
 *
 ** 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 */
```
```

deploy.ts 를 실행하게되면, 즉시실행함수로 표현된 startCLI 를 시작한다.

workFlow 는 다음과 같다.

startCLI()

   1. if (confNullChecker === true)           // conf 파일 내부 contract 의 address 가 모두 채워져있는 경우
     1-1. question().q_1()                    // 재배포 또는 업그래이드 선택  
     1-2. question().q_2()                    // (1-1) 를 실행할 컨트랙트 선택
     1-3. (1-1), (1-2) 에 선택에 맞는 동작 실행

   2. if (confNullChecker === false)          // conf 파일 내부 contract 의 address 가 하나라도 빠져있는 경우
     2-1. initDeploy() 실행                    // exchange 관련 모든 컨트랙트 배포 함수 
```

### example (Baobab)

./scripts/envVariables.ts 내부 실행환경과 매치되는 변수를 비워놓은 경우 (최초 배포)

![스크린샷 2022-09-23 오후 12 22 59](https://user-images.githubusercontent.com/54474732/191887354-b6db4790-10d9-4e0d-82d1-a064a9aca04e.png)

./scripts/envVariables.ts 내부 실행환경과 매치되는 변수를 모두 채워놓은 경우 (업그레이드)

![스크린샷 2022-09-23 오후 12 30 13](https://user-images.githubusercontent.com/54474732/191887348-99437103-f450-40b8-8032-1ccf42843bc2.png)

./scripts/envVariables.ts 내부 실행환경과 매치되는 변수를 모두 채워놓은 경우 (재배포)

![스크린샷 2022-09-23 오후 12 38 56](https://user-images.githubusercontent.com/54474732/191888028-800c9b90-f733-4379-8c37-5df5754fc7e6.png)

`🚨  주의할 점   🚨`

![스크린샷 2022-09-23 오후 12 44 09](https://user-images.githubusercontent.com/54474732/191888399-08ca7f44-7d06-4115-8824-1afd96ef4513.png)

'처음부터 다시 하시겠습니까 ?' 에서 YSE 를 대답한 경우,

`런타임이 지속되는 동안만` CONF.contract 의 내부 value 값들이 수정되는 방식이다.  

`실행환경이 종료되는 순간, 모든 변수는 실행전의 상태로 돌아가기때문에`,  

재배포 또는 최초 배포를 실행했다면, 실행환경 종료와 함께,    
envVariables 의 내부변수를 수정해줘야한다.

------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------

## Contract Address
### ./scripts/envVariables.ts 
[envVariables](https://github.com/cic-env/hardhat/blob/main/scripts/envVariables.ts) 에서 확인 가능
