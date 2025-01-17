// SPDX-License-Identifier: MIT

pragma solidity ^0.5.0;

import "@klaytn/contracts/token/KIP37/KIP37.sol";

import "@klaytn/contracts/access/roles/MinterRole.sol";
import "@klaytn/contracts/access/roles/PauserRole.sol";

import "@klaytn/contracts/GSN/Context.sol";
import "@klaytn/contracts/math/SafeMath.sol";
import "@klaytn/contracts/utils/Address.sol";

contract Ownable is Context {
    address payable private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor () internal {
        _owner = msg.sender;
        emit OwnershipTransferred(address(0), _owner);
    }

    function owner() public view returns (address payable) {
        return _owner;
    }

    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }

    function transferOwnership(address payable newOwner) public onlyOwner {
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address payable newOwner) internal {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

contract KIP37Mintable is KIP37, MinterRole {
    bytes4 private constant _INTERFACE_ID_KIP37_MINTABLE = 0xdfd9d9ec;

    mapping(uint256 => address) public creators;
    mapping(uint256 => string) public _uris;

    constructor() public {
        _registerInterface(_INTERFACE_ID_KIP37_MINTABLE);
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        address creator = creators[tokenId];
        return creator != address(0);
    }

    function uri(uint256 tokenId) external view returns (string memory) {
        string memory customURI = string(_uris[tokenId]);
        if(bytes(customURI).length != 0) {
            return customURI;
        }

        return _uris[tokenId];
    }

    function create(
        uint256 _id,
        uint256 _initialSupply,
        string memory _uri
    ) public onlyMinter returns (bool) {
        require(!_exists(_id), "KIP37: token already created");

        creators[_id] = msg.sender;
        _mint(msg.sender, _id, _initialSupply, "");

        if (bytes(_uri).length > 0) {
            _uris[_id] = _uri;
            emit URI(_uri, _id);
        }
    }

    function mint(
        uint256 _id,
        address _to,
        uint256 _value
    ) public onlyMinter {
        require(_exists(_id), "KIP37: nonexistent token");
        _mint(_to, _id, _value, "");
    }

    function mintBatch(
        address _to,
        uint256[] memory _ids,
        uint256[] memory _values
    ) public onlyMinter {
        for (uint256 i = 0; i < _ids.length; ++i) {
            require(_exists(_ids[i]), "KIP37: nonexistent token");
        }
        _mintBatch(_to, _ids, _values, "");
    }
}

contract KIP37Pausable is KIP37, PauserRole {
    mapping(uint256 => bool) private _tokenPaused;

    bytes4 private constant _INTERFACE_ID_KIP37_PAUSABLE = 0x0e8ffdb7;
    bool public _paused = false;

    constructor() public {
        _registerInterface(_INTERFACE_ID_KIP37_PAUSABLE);
    }

    event Paused(address account);
    event Unpaused(address account);

    modifier whenNotPaused() {
        require(!paused(), "Pausable: paused");
        _;
    }

    modifier whenPaused() {
        require(paused(), "Pausable: not paused");
        _;
    }

    function paused() public view returns (bool) {
        return _paused;
    }

    function pause() public onlyPauser {
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() public onlyPauser {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal whenNotPaused {}
}

contract KIP37Burnable is KIP37 {
    bytes4 private constant _INTERFACE_ID_KIP37_BURNABLE = 0x9e094e9e;

    constructor() public {
        _registerInterface(_INTERFACE_ID_KIP37_BURNABLE);
    }

    function burn(
        address account,
        uint256 id,
        uint256 value
    ) public {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()),
            "KIP37: caller is not owner nor approved"
        );

        _burn(account, id, value);
    }

    function burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory values
    ) public {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()),
            "KIP37: caller is not owner nor approved"
        );

        _burnBatch(account, ids, values);
    }
}

contract KIP37Token is KIP37, KIP37Pausable, KIP37Mintable, KIP37Burnable, Ownable {
    string private _name; // Token name
    string private _symbol; // Token symbol

    constructor(string memory name_, string memory symbol_) public KIP37("") {
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }
}
