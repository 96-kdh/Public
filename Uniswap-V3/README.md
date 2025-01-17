# X - Core 

*****
*****
## Version Rules
node : v16.18.1  
npm : 8.19.2
*****
*****

```shell
npm install
```
or 
```shell
yarn install
```
진행 후 
```shell
node_modules/@uniswap/v2-periphery/contracts/libraries/UniswapV2Library.sol
```
해당 경로로 들어가 17-26 line 의
```solidity
    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(uint(keccak256(abi.encodePacked(
                hex'ff',
                factory,
                keccak256(abi.encodePacked(token0, token1)),
                hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' // init code hash
            ))));
    }
```
해당 함수
```solidity
    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address factory, address tokenA, address tokenB) internal view returns (address pair) {
        pair = IUniswapV2Factory(factory).getPair(tokenA,tokenB);
    }
```
으로 변경, 아래 import 추가
```solidity
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
```
추가, 

```shell
npm run compile
```
or
```shell
yarn compile
```
