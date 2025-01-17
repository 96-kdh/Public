import { ethers, upgrades } from 'hardhat';

export const deployERC20 = async (mint_amount: number) => {
    const erc20_factory = await ethers.getContractFactory('PER');
    const erc20 = await erc20_factory.deploy(mint_amount, 'reward token', 'reward token');
    await erc20.deployed();

    console.log('ERC20 deployed to:', erc20.address);

    return erc20.address;
};

export const deployERC721 = async () => {
    const nft_factory = await ethers.getContractFactory('KIP17Token');
    const nft = await nft_factory.deploy('nft', 'nft');
    await nft.deployed();

    console.log('NFT deployed to:', nft.address);

    return nft.address;
};
export const deployERC1155 = async () => {
    const KIP37Token = await ethers.getContractFactory('KIP37Token');
    const erc1155 = await KIP37Token.deploy('reward item token', 'reward item token');
    await erc1155.deployed();

    console.log('erc1155 deployed to:', erc1155.address);

    return erc1155.address;
};
export const deployBurnContract = async () => {
    const burnContract = await ethers.getContractFactory('burnContract');
    const _burn = await burnContract.deploy();
    await _burn.deployed();

    console.log('burnContract deployed to:', _burn.address);

    return _burn.address;
};
export const deployDbContract = async () => {
    const db = await ethers.getContractFactory('DB');
    const db_with_proxy = await upgrades.deployProxy(db, [], {
        initializer: 'initialize()',
    });
    await db_with_proxy.deployed();

    console.log('DB deployed to:', db_with_proxy.address);
    return db_with_proxy.address;
};
