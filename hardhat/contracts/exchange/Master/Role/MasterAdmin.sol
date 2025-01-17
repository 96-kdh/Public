//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "./MasterRole.sol";

abstract contract MasterAdmin is MasterRole {
    address baseKlaymintWallet;
    uint16 baseKlaymintFee;

    uint16 public projectFeeLimit;

    struct Fee { // fee 는 판매자 부담
        address projectWallet;
        uint16 projectFee;
    }

    // mapping(targetToken => fee))
    mapping(address => Fee) feeBooks;



        /*@@@@@@@ external view function @@@@@@@*/
    function getFeeBook(address targetToken) external view returns (address klaymint, uint16 klaymintRate, address project, uint16 projectRate) {
        Fee memory _fee = feeBooks[targetToken];

        return (baseKlaymintWallet, baseKlaymintFee, _fee.projectWallet, _fee.projectFee);
    }



        /*@@@@@@@ internal admin function @@@@@@@*/
    function _setFeeBook(address targetToken, address account, uint16 rate) internal {
        require(targetToken != address(0), "account can not null address");
        require(account != address(0), "account can not null address");
        require(rate <= projectFeeLimit, "rate should be samller than projectFeeLimit");

        feeBooks[targetToken] = Fee(account, rate);
    }

    function _setBaseFee(address account, uint16 rate) internal {
        require(rate + projectFeeLimit <= 1000, "projectFeeLimit plus baseKlaymintFee should be smaller than 1000");
        require(account != address(0), "baseFeeWalletAddress can not NullAddress");

        baseKlaymintWallet = account;
        baseKlaymintFee = rate;
    }

    function _setProjectFeeLimit(uint16 rate) internal {
        require(baseKlaymintFee + rate <= 1000, "projectFeeLimit plus baseKlaymintFee should be smaller than 1000");
        projectFeeLimit = rate;
    }



        /*@@@@@@@ external emitter function @@@@@@@*/
    function shareFee(address paymentToken, address targetToken, address from, address to, uint256 value) internal {
        Fee memory _fee = feeBooks[targetToken];

        uint _klaymintValue = value / 1000 * baseKlaymintFee;
        uint _ProjectValue = value / 1000 * _fee.projectFee;
        uint _userValue = value - _klaymintValue - _ProjectValue;

        if (to != address(0)) safePaymentTransferFrom(paymentToken, from, to, _userValue);

        safePaymentTransferFrom(paymentToken, from, baseKlaymintWallet, _klaymintValue);
        if (_fee.projectWallet != address(0) && _fee.projectFee != 0) safePaymentTransferFrom(paymentToken, from, _fee.projectWallet, _ProjectValue);
    }
}
