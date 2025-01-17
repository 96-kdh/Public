import fs, { existsSync, mkdirSync } from 'fs';
import { NFTDescriptor, NonfungibleTokenPositionDescriptor } from '../typechain-types';

export enum ContractNames {
    XToken = 'XToken', // erc20
    WETH9 = 'WETH9', // w eth
    TetherToken = 'TetherToken', // usdt

    UniswapV3Factory = 'UniswapV3Factory',
    SwapRouter = 'SwapRouter',

    NFTDescriptor = 'NFTDescriptor',
    NonfungibleTokenPositionDescriptor = 'NonfungibleTokenPositionDescriptor',
    NonfungiblePositionManager = 'NonfungiblePositionManager',
    QuoterV2 = 'QuoterV2',

    Counter = 'Counter',
}

interface ReturnAddressType {
    [ContractNames.XToken]: string;
    [ContractNames.WETH9]: string;
    [ContractNames.TetherToken]: string;

    [ContractNames.UniswapV3Factory]: string;
    [ContractNames.SwapRouter]: string;

    [ContractNames.NFTDescriptor]: string;
    [ContractNames.NonfungibleTokenPositionDescriptor]: string;
    [ContractNames.NonfungiblePositionManager]: string;
    [ContractNames.QuoterV2]: string;

    [ContractNames.Counter]: string;
}

export const getAddress = (network: string): ReturnAddressType => {
    const deployedPath = './constants';
    if (!existsSync(deployedPath)) mkdirSync(deployedPath);
    if (!existsSync(deployedPath + '/deployments')) mkdirSync(deployedPath + '/deployments');

    const uploadPath = `${deployedPath}/deployments/${network}`;

    if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath);
    }

    if (!existsSync(uploadPath + '/address.json')) {
        fs.writeFileSync(uploadPath + '/address.json', JSON.stringify({}), 'utf8');
    }

    const _file = fs.readFileSync(`./constants/deployments/${network}/address.json`, 'utf8');
    return JSON.parse(_file);
};
