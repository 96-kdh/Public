import { HardhatUserConfig } from 'hardhat/config';
import { SolcConfig } from 'hardhat/types';

import '@typechain/hardhat';

const CompilerSettings = {
    optimizer: {
        enabled: true,
        runs: 200,
    },
};

const CompilerVersions = ['0.8.17'];

const compilers: SolcConfig[] = CompilerVersions.map((item) => {
    return {
        version: item,
        settings: CompilerSettings,
    };
});

const config: HardhatUserConfig = {
    solidity: {
        compilers,
    },
    mocha: {
        timeout: 10 * 60 * 1000,
    },
};

export default config;
