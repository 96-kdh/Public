//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../../IExchangeStruct.sol";
import "../../Mini/ERC721/IMiniExchangeStruct721.sol";
import "../../Mini/ERC1155/IMiniExchangeStruct1155.sol";
import "../../Mini/Role/IMiniRole.sol";
import "../../ExchangeMethodValidator.sol";


abstract contract MasterRole is IExchangeStruct, ExchangeMethodValidator {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    string public constant name = "KlayMint Master Exchange Contract";

    address ex721;
    address ex1155;

    bytes4 constant ERC721InterfaceId = 0x80ac58cd; // same IKIP17 interfaceId
    //    bytes4 constant ERC1155InterfaceId = 0xd9b67a26;

    // mapping(exchangeAddress => storeAddress)
    mapping(address => address) emitter;

    modifier onlyEmitter() {
        _checkEmitter();
        _;
    }



    function _setEmitter(address exchange, address store) internal {
        emitter[exchange] = store;
    }
    function _checkEmitter() internal view virtual {
        require(emitter[msg.sender] != address(0), "MasterRole: caller is not the MiniExchange Contract");
    }
    function _checkMiniExchange(address miniExchange) internal view {
        require(miniExchange != address(0), "exchange address can not null address");
        require(
            keccak256(abi.encodePacked(("KlayMint Mini Exchange Contract"))) == keccak256(abi.encodePacked((
                IMiniRole(miniExchange).getName()
            ))), "not a miniExchange"
        );
    }
    function _checkMasterExchange(address masterExchange) internal view {
        require(masterExchange != address(0), "exchange address can not null address");
        require(
            keccak256(abi.encodePacked((name))) == keccak256(abi.encodePacked((
                IMiniRole(masterExchange).getName()
            ))), "not a masterExchange"
        );
    }



    function getName() public pure returns (string memory) {
        return name;
    }

    function getMini() public view returns(address mini721, address miniStore721, address mini1155, address miniStore1155) {
        return (ex721, emitter[ex721], ex1155, emitter[ex1155]);
    }


    /*
        masterExchange 가 관리할 child exchange 를 등록하는 함수,
        최초 1회, 또는 child exchange 의 address 가 변경된 경우 사용
        실제 parameter 에는 address 가 들어감
    */
    function _resister(address exchange721, address exchangeStore721, address exchange1155, address exchangeStore1155) internal {
        _checkMiniExchange(exchange721);
        _checkMiniExchange(exchangeStore721);
        _checkMiniExchange(exchange1155);
        _checkMiniExchange(exchangeStore1155);

        ex721 = exchange721;
        ex1155 = exchange1155;

        _setEmitter(exchange721, exchangeStore721);
        _setEmitter(exchange1155, exchangeStore1155);
    }

    /*
        masterExchange 가 관리할 child exchange 를 해제하는 함수,
        해당 함수를 사용하면 child exchange 의 master 가 null address 로 변경(폐기)
        parameter address 는 address(ex721) 또는 address(ex1155) 가 들어가야함
    */
    function _deResister(address exchange) internal {
        _checkMiniExchange(exchange);

        IMiniRole(exchange).renounceMastership();

        if (exchange == address(ex721)) delete ex721;
        else if (exchange == address(ex1155)) delete ex1155;
        else revert("invalid exchange address");

        _setEmitter(exchange, address(0));
    }

    /*
        masterExchange 의 address 가 변경됨에 따라,
        child 의 master 를 변경해야할 때 사용하는 함수
        해당 함수는 newMaster 라는 새로운 masterExchange 를 배포한 후,
        address 를 parameter 로 전달하여 새로운 master 가 되게 한다.

        #! 주의 !#
        해당 함수 실행 후, new masterExchange 에서 resister 는 별도로 진행해줘야한다.
    */
    function _migration(address newMaster) internal {
        _checkMasterExchange(newMaster);

        IMiniRole(ex721).transferMastership(newMaster);
        IMiniRole(emitter[ex721]).transferMastership(newMaster);
        IMiniRole(ex1155).transferMastership(newMaster);
        IMiniRole(emitter[ex1155]).transferMastership(newMaster);
    }

    function safePaymentTransferFrom(address paymentToken, address from, address to, uint value) internal {
        IERC20Upgradeable(paymentToken).transferFrom(address(from), address(to), value);
    }

    function safeTargetTokenTransferFrom(address targetToken, address from, address to, uint tokenId, uint amount) internal {
        if (_isERC721(targetToken)) IERC721Upgradeable(targetToken).safeTransferFrom(address(from), address(to), tokenId);
        else IERC1155Upgradeable(targetToken).safeTransferFrom(address(from), address(to), tokenId, amount, bytes(""));
    }



        /*@@@@@@@ internal view or pure function @@@@@@@*/
    function _isERC721(address targetToken) internal view returns(bool isERC721) {
        return IERC165Upgradeable(targetToken).supportsInterface(ERC721InterfaceId);
    }

    function getMini(address targetToken) internal view returns(address exchange, address store) {
        if (_isERC721(targetToken)) return (ex721, emitter[ex721]);
        else return (ex1155, emitter[ex1155]);
    }

    function makerOrder(bytes4 methodSig, address paymentToken, address targetToken, address account, uint tokenId, uint price, uint amount, uint expirationDate, uint turnIndex, uint endIndex) internal view returns (Params memory order) {
        uint expireTime = expirationDate == 0 ? 2 ** 256 - 1 : (block.timestamp + (expirationDate * 86400));

        Params memory _order = Params(methodSig, paymentToken, targetToken, account, tokenId, price, amount, turnIndex, endIndex, expireTime);

        require(amount != 0, "not allowed amount 0");
        require(price != 0, "not allowed buyPrice 0");
        require(targetToken != address(0), "not allowed kip37Address 0x");
        require(paymentToken != address(0), "not allowed ERC20Address 0x");

        return _order;
    }
}
