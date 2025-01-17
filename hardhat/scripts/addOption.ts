import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

export const approveERC20 = async (
    erc20_address: string,
    nftstaker_address: string,
    erc20_reward_amount: BigNumber,
) => {
    const erc20_factory = await ethers.getContractFactory('PER');
    const erc20 = await erc20_factory.attach(erc20_address);
    console.log('approve ERC20 transfer for init..');
    const tx = await erc20.approve(nftstaker_address, erc20_reward_amount);
    await tx.wait();
};

export const addMinterERC721 = async (nft_address: string, enforce_address: string) => {
    const ERC721 = await ethers.getContractFactory('KIP17Token');
    const erc721 = await ERC721.attach(nft_address);
    console.log('ERC721 addMinter for init..');
    const tx = await erc721.addMinter(enforce_address);
    await tx.wait();
};
export const addMinterERC1155 = async (erc1155_address: string, enforce_address: string) => {
    const ERC1155 = await ethers.getContractFactory('KIP37Token');
    const erc1155 = await ERC1155.attach(erc1155_address);
    console.log('ERC1155 addMinter for init..');
    const tx = await erc1155.addMinter(enforce_address);
    await tx.wait();
};
export const addOwnerBurnContract = async (burnContract_address: string, enforce_address: string) => {
    const burnContract = await ethers.getContractFactory('burnContract');
    const _burnContract = await burnContract.attach(burnContract_address);
    console.log('burnContract_address addOwner for init..');
    const tx = await _burnContract.addOwner(enforce_address);
    await tx.wait();
};
