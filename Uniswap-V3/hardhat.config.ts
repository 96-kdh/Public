import * as dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
import { SolcConfig } from 'hardhat/types';

import '@nomicfoundation/hardhat-verify';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-gas-reporter';
import '@openzeppelin/hardhat-upgrades';

import './scripts/task';
import { NetworksUserConfig } from 'hardhat/src/types/config';
import { ApiKey } from '@nomicfoundation/hardhat-verify/src/types';

import '@nomicfoundation/hardhat-ledger';

dotenv.config();

const CompilerSettings = {
    optimizer: {
        enabled: true,
        runs: 200,
    },
};

const CompilerVersions = ['0.7.6', '0.4.17'];

const _compilers: SolcConfig[] = CompilerVersions.map((item) => {
    return {
        version: item,
        settings: CompilerSettings,
    };
});

enum NetworkNames {
    polygonMumbai = 'polygonMumbai',
    bscTestnet = 'bscTestnet',
    goerli = 'goerli',
}

const _chainIds: { [key in NetworkNames]: number } = {
    [NetworkNames.polygonMumbai]: 80001,
    [NetworkNames.bscTestnet]: 97,
    [NetworkNames.goerli]: 5,
};

const _ledgerAccount: { [key in NetworkNames]?: string[] } = {
    [NetworkNames.goerli]: [''],
};

const _networks: NetworksUserConfig = {};
const _apiKeys: ApiKey = {};

for (const [networkName, chainId] of Object.entries(_chainIds)) {
    _networks[networkName] = {
        chainId,
        url: process.env[`RPC_URL_${chainId}`] + '',
    };

    // @ts-ignore
    if (_ledgerAccount[networkName]) {
        // @ts-ignore
        _networks[networkName].ledgerAccounts = _ledgerAccount[networkName];
    } else {
        // @ts-ignore
        _networks[networkName].accounts = [process.env.PRIVATE_KEY || ''];
    }

    if (process.env[`SCAN_API_KEY_${chainId}`]) {
        _apiKeys[networkName] = process.env[`SCAN_API_KEY_${chainId}`] + '';
    }
}

const config: HardhatUserConfig = {
    solidity: {
        compilers: _compilers,
    },
    networks: _networks,
    etherscan: {
        apiKey: _apiKeys,
        customChains: [],
        enabled: true,
    },
    sourcify: {
        enabled: true,
    },
    mocha: {
        timeout: 10 * 60 * 1000,
    },
};

export default config;
