//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

import "./Master/IMasterExchange.sol";

abstract contract ExchangeMethodValidator {
    bytes4 constant sellSig = IMasterExchange(address(0)).sell.selector;
    bytes4 constant buySig = IMasterExchange(address(0)).buy.selector;

    modifier methodSigValidator(bytes4 sig) {
        require(sig == sellSig || sig == buySig, "invalid methodSig");
        _;
    }

    function getReverseSignature(bytes4 methodSig) methodSigValidator(methodSig) internal pure returns (bytes4) {
        if (methodSig == sellSig) return buySig;
        else return sellSig;
    }
}
