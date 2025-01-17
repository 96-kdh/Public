import * as dotenv from 'dotenv';

import { HardhatUserConfig, task } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@openzeppelin/hardhat-upgrades';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: '0.4.24',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
            {
                version: '0.4.26',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
            {
                version: '0.5.0',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
            {
                version: '0.5.2',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
            {
                version: '0.5.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
            {
                version: '0.5.9',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
            {
                version: '0.8.12',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                        details: {
                            yul: false,
                        },
                    },
                },
            },
        ],
    },
    networks: {
        bscTestnet: {
            url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
            accounts: [process.env.PRIVATE_KEY || ''],
            chainId: 97,
        },
    },
    mocha: {
        timeout: 5 * 60 * 1000,
    },
};

export default config;
