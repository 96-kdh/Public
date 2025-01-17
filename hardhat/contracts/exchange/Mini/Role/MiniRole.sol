//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../../ExchangeMethodValidator.sol";

/*
    MasterExchange (Master) -> MiniExchange721(child)
                            -> MiniExchange1155(child)
    형태로 child 를 관리하기 위한 MasterRole
    role 을 설정해야하는건 master 가 아니라, child 이기때문에
    MiniExchange721 과 MiniExchange1155 이 상속받는다.

    ** requirement **
    1. exchange 내부 storage 를 변경하는 함수는 master만 호출 가능하다.
    2. MasterExchange를 재배포를 해야하는 경우, master를 교체해서 사용 가능하다.
    3. 2번과 반대로 exchange를 재배포 해야하는 경우 기존 exchange는 누구도 사용할 수 없다.
    4. 구매목록, 판매목록을 보여주는 view 함수가 존재하여, 인터페이스 제공시 클레이민트뿐만 아니라 어디서든 거래가 가능하다.
    5. 프로젝트 페이지에서 즉시구매 가능한(판매중) 리스트를 가장 낮은 가격과 함께 불러 올 수 있어여한다.
    6. master, child 모두 업그레이드 가능해야한다.
    7. event 는 master 에 저장되어, 읽을 수 있어야한다.
    8. 다수의 인원이 같은 가격에 sell or buy 를 올린경우, 순서에 맞는 오더부터 체결되야한다.
*/
abstract contract MiniRole is ExchangeMethodValidator {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    string public constant name = "KlayMint Mini Exchange Contract";

    address private __MasterExchange;

    event MastershipTransferred(
        address indexed previousMaster,
        address indexed newMaster
    );

    modifier onlyMaster() {
        _checkMaster();
        _;
    }


    /*
        상속받는 contract 의 초기(initialize or constructor) 에서 실행
    */
    function __MiniRole_init(address _master) internal {
        require(_master != address(0), "init master address can not null address");

        __MasterExchange = _master;
    }

    function _checkMaster() internal view virtual {
        require(msg.sender == master(), "MiniRole: caller is not the Master Contract");
    }


    function getName() public pure returns (string memory) {
        return name;
    }

    function master() public view returns(address) {
        return __MasterExchange;
    }

    function transferMastership(address newMaster) public onlyMaster {
        emit MastershipTransferred(__MasterExchange, newMaster);
        __MasterExchange = newMaster;
    }

    function renounceMastership() public onlyMaster {
        emit MastershipTransferred(__MasterExchange, address(0));
        __MasterExchange = address(0);
    }



        /*@@@ call master function @@@*/
    function validateERC20(address tokenAddress, address account, uint value) public view returns (bool) {
        if (
            IERC20Upgradeable(tokenAddress).balanceOf(account) >= value &&
            IERC20Upgradeable(tokenAddress).allowance(account, master()) >= value
        ) return true;
        else return false;
    }
}
