//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.12;

abstract contract ViewerRole {
    address public Viewer;

    function _setViewer(address _ExchangeViewer) internal {
        Viewer = address(_ExchangeViewer);
    }
}
