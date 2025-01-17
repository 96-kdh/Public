import readline from 'readline-sync';
import { HardhatRuntimeEnvironment } from 'hardhat/types/runtime';
import fs from 'fs';

import { getAddress, ContractNames } from './variables';
import { isYes } from './utils';

export async function DEPLOY_TASK(hre: HardhatRuntimeEnvironment) {
    console.log(`selected network: [${hre.network.name}]`);

    const _CA = getAddress(hre.network.name);

    const deployer = DEPLOY(hre);
    const admin = (await hre.ethers.getSigners())[0].address; // hardhat config accounts 0 index

    // 배포된 계약 주소, 배포되지 않은 계약주소 나누기
    const contracts = {
        [ContractNames.XToken]: {
            address: _CA.XToken,
            fun: deployer.BasicDeploy,
            name: ContractNames.XToken,
            arg: ['X Name', 'XN'],
        },
        [ContractNames.WETH9]: {
            address: _CA.WETH9,
            fun: deployer.BasicDeploy,
            name: ContractNames.WETH9,
            arg: [],
        },
        [ContractNames.TetherToken]: {
            address: _CA.TetherToken,
            fun: deployer.BasicDeploy,
            name: ContractNames.TetherToken,
            arg: [],
        },
        [ContractNames.UniswapV3Factory]: {
            address: _CA.UniswapV3Factory,
            fun: deployer.BasicDeploy,
            name: ContractNames.UniswapV3Factory,
            arg: [],
        },
        [ContractNames.Counter]: {
            address: _CA.Counter,
            fun: deployer.BasicDeploy,
            name: ContractNames.Counter,
            arg: [],
        },
    };

    const deployed = [];
    const require_deploy = [];

    for (const [, value] of Object.entries(contracts)) {
        if (value.address) deployed.push(value);
        else require_deploy.push(value);
    }

    if (deployed.length !== 0) {
        console.log('\n배포된 컨트랙트 리스트');
        for (let i = 0; i < deployed.length; i++) {
            console.log(`[${deployed[i].name}]: ${deployed[i].address}`);
        }
    }

    if (require_deploy.length === 0) {
        return '\n새롭게 배포할 컨트랙트 없음, DONE.';
    }

    console.log(`\n다음과 같은 컨트랙트가 배포됩니다.`);
    for (let i = 0; i < require_deploy.length; i++) {
        console.log(`[ ${require_deploy[i].name} ]`);
    }

    let answer = ''; // user input value
    answer = readline.question(`\n진행하시겠습니까 ? (Y/N) `);

    if (!isYes(answer)) return '\n발행하지 않습니다. 종료합니다.';

    for await (const el of require_deploy) {
        console.log(`\n${el.name} 발행 스크립트 실행`);
        const address = await el.fun(el.name, el.arg);
        console.log(`${el.name} deployed: ${address}`);
    }

    return 'DEPLOY DONE.';
}

function DEPLOY(hre: HardhatRuntimeEnvironment) {
    // internal function
    const writeAddress = (key: ContractNames, address: string) => {
        console.log(`deployed... [${key}]: ${address}`);

        const originAddress = getAddress(hre.network.name);
        const nextAddress = { ...originAddress, [key]: address };

        fs.writeFileSync(
            `./constants/deployments/${hre.network.name}/address.json`,
            JSON.stringify(nextAddress, null, 4),
            'utf8',
        );
    };

    const BasicDeploy = async function (_contractName: ContractNames, _arg: string[]): Promise<string> {
        const newContractImp = await hre.ethers.getContractFactory(_contractName);
        const newContract = await newContractImp.deploy(..._arg);
        await newContract.deployed();

        writeAddress(_contractName, newContract.address);

        return newContract.address;
    };

    return {
        BasicDeploy,
    };
}
