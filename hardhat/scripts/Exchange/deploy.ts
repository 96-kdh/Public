import readline from 'readline-sync';

import RETURN, { argsType, EXCHANGE_DEPLOY_CONFIGS, EXCHANGE_DEPLOY_OPTION, ExchangeContractName } from './code';
import {
    exchangeViewer,
    klayMintFeeWallet,
    masterExchange,
    miniExchange1155,
    miniExchange721,
    miniExchangeStore1155,
    miniExchangeStore721,
} from '../envVariables';
import { ethers, upgrades } from 'hardhat';

/** ------------------------------------------------------------------------------------------------- */

/**
 * @param {object} contracts 배포할 또는 배포된 Contract address
 * @param {object} option for initialized option
 */
const CONF: EXCHANGE_DEPLOY_CONFIGS = {
    contracts: {
        EXCHANGE_VIEWER: exchangeViewer,
        EXCHANGE_MASTER: masterExchange,
        EXCHANGE_MINI_721: miniExchange721,
        EXCHANGE_MINI_721_STORE: miniExchangeStore721,
        EXCHANGE_MINI_1155: miniExchange1155,
        EXCHANGE_MINI_1155_STORE: miniExchangeStore1155,
    },
    option: {
        INIT_FEE_WALLET: klayMintFeeWallet,
        INIT_FEE_RATIO: 100, // 10 %
    },
};

// 누적 결과를 담을 배열
const result: string[] = ['\n배포된 계약 리스트는 다음과 같습니다.\n'];

/** 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
 *
 * CLI 를 정상적으로 실행할 수 있는 조건은 다음과 같은 두 조건 뿐이다.
 *
 *      1. CONF.contract 의 모든 value 값이 ''(null) 값 인 경우
 *      2. CONF.contract 의 모든 value 값이 유효한 contract address 로 채워진 경우
 *
 *   만약 두가지 조건 중 하나라도 만족하지 않는 상태에서 진행하게 된다면,
 *   기존에 배포된 Master <-> Mini 간의 관계르 무시하고 모든 컨트랙트가 새롭게 배포되는 것 과 같다.
 *
 ** 🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 */
(async function startCLI() {
    /* conf.contract 에 null 값이 끼어있는지 체크, 끼어있다면, initDeploy 를 진행하고 종료 */
    if (!confNullChecker()) {
        await initDeploy();
        loadResult();
        return;
    }

    let answer = ''; // user input value

    try {
        /* conf.contract 에 값이 전부 들어있다면, validation check */
        for (const val in CONF.contracts) if (ethers.utils.isAddress(val)) throw new Error(`${RETURN.CODE(0x0010)}`);
        if (!ethers.utils.isAddress(CONF.option.INIT_FEE_WALLET)) throw new Error(`${RETURN.CODE(0x0010)}`);

        console.log('---------------------------------------------');
        const upgradeOrReDeploy = question().q_1();
        console.log('---------------------------------------------');

        switch (upgradeOrReDeploy) {
            case '1':
                answer = question().q_2();
                await UPGRADE(answer);
                break;
            case '2':
                answer = question().q_2();
                await RE_DEPLOY(answer);
                break;
            default:
                throw new Error(`${RETURN.CODE(0x4)}, 1 또는 2를 입력해주세요.`);
        }
    } catch (err: any) {
        console.error(err);
    } finally {
        loadResult();
        console.log('---------------------------------------------');

        answer = readline.question(`처음부터 다시 하시겠습니까 ? (Y/N) `);

        if (isYes(answer)) await startCLI();
        else console.log('종료합니다.');
    }
})();

/* ------------------------------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------------------------------- */

/** *** *** *** *** *** *** *** *
 * init deploy function (conf 값이 채워지지 않은 상태에서 진행되는 함수)
 * * * * * * * * * * * * * * * */
async function initDeploy() {
    const answer = readline.question(`CONF.contract 의 value 값들이 모두 null 값이라는 상황을 가정,
Klaymint MarketPlace 에 필요한 Exchange Contract 최초 배포에 필요한 동작을 모두 실행하려고합니다.
실행해도 될까요 ? (Y/N) `);

    if (!isYes(answer)) return console.log('\n취소합니다.');

    const feeWallet = CONF.option.INIT_FEE_WALLET;
    const feeRatio = CONF.option.INIT_FEE_RATIO || 0;

    const VIEWER = await DEPLOY(ExchangeContractName.EXCHANGE_VIEWER);
    const MASTER = await DEPLOY(ExchangeContractName.EXCHANGE_MASTER, {
        args: [feeWallet, feeRatio, VIEWER],
        type: [argsType.address, argsType.uint16, argsType.address],
    });
    const MINI_721 = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_721, {
        args: [MASTER, VIEWER],
        type: [argsType.address, argsType.address],
    });
    const MINI_1155 = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_1155, {
        args: [MASTER, VIEWER],
        type: [argsType.address, argsType.address],
    });
    const MINI_721_STORE = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_721_STORE, {
        args: [MASTER],
        type: [argsType.address],
    });
    const MINI_1155_STORE = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_1155_STORE, {
        args: [MASTER],
        type: [argsType.address],
    });

    const MasterExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_MASTER);
    const ViewerExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_VIEWER);

    await MasterExchange.attach(MASTER).resister(MINI_721, MINI_721_STORE, MINI_1155, MINI_1155_STORE);
    await ViewerExchange.attach(VIEWER).resister(MINI_721, MINI_721_STORE, MINI_1155, MINI_1155_STORE);
}

/** *** *** *** *** *** *** *** *
 * Upgrade function
 * * * * * * * * * * * * * * * */
async function UPGRADE(userInput: string): Promise<void> {
    const answer = readline.question(
        ` (${userInput}) 번 Contract 의 '업그레이드' 를 선택하셨습니다. 진행하시겠습니까 ? (Y/N) `,
    );

    if (!isYes(answer)) return;

    let upgradeContractName;
    let upgradeContractAddress;

    switch (userInput) {
        case '1':
            upgradeContractName = ExchangeContractName.EXCHANGE_VIEWER;
            upgradeContractAddress = CONF.contracts.EXCHANGE_VIEWER;
            break;
        case '2':
            upgradeContractName = ExchangeContractName.EXCHANGE_MASTER;
            upgradeContractAddress = CONF.contracts.EXCHANGE_MASTER;
            break;
        case '3':
            upgradeContractName = ExchangeContractName.EXCHANGE_MINI_721;
            upgradeContractAddress = CONF.contracts.EXCHANGE_MINI_721;
            break;
        case '4':
            upgradeContractName = ExchangeContractName.EXCHANGE_MINI_721_STORE;
            upgradeContractAddress = CONF.contracts.EXCHANGE_MINI_721_STORE;
            break;
        case '5':
            upgradeContractName = ExchangeContractName.EXCHANGE_MINI_1155;
            upgradeContractAddress = CONF.contracts.EXCHANGE_MINI_1155;
            break;
        case '6':
            upgradeContractName = ExchangeContractName.EXCHANGE_MINI_1155_STORE;
            upgradeContractAddress = CONF.contracts.EXCHANGE_MINI_1155_STORE;
            break;

        default:
            throw new Error(`${RETURN.CODE(0x4)}, 1 에서 6 사이의 숫자를 입력하세요.`);
    }

    const implFactory = await ethers.getContractFactory(upgradeContractName);
    const proxy = await upgrades.upgradeProxy(upgradeContractAddress, implFactory);

    result.push(`${proxy.address} upgrade ${upgradeContractName} !!`);
}

/** *** *** *** *** *** *** *** *
 * reDeploy function
 * * * * * * * * * * * * * * * */
async function RE_DEPLOY(userInput: string): Promise<void> {
    const answer = readline.question(
        ` (${userInput}) 번 Contract 의 '재배포' 를 선택하셨습니다. 진행하시겠습니까 ? (Y/N) `,
    );

    if (!isYes(answer)) return;

    switch (userInput) {
        case '1':
            await CHOOSE_VIEWER();
            break;
        case '2':
            await CHOOSE_MASTER();
            break;
        case '3':
            await CHOOSE_MINI_721();
            break;
        case '4':
            await CHOOSE_MINI_712_STORE();
            break;
        case '5':
            await CHOOSE_MINI_1155();
            break;
        case '6':
            await CHOOSE_MINI_1155_STORE();
            break;

        default:
            throw new Error(`${RETURN.CODE(0x4)}, 1 에서 6 사이의 숫자를 입력하세요.`);
    }

    async function CHOOSE_VIEWER() {
        console.log(`${ExchangeContractName.EXCHANGE_VIEWER} Contract 를 선택하셨습니다.`);
        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 */
        const newViewer = await DEPLOY(ExchangeContractName.EXCHANGE_VIEWER);
        console.log(`\n CONF.contracts.EXCHANGE_VIEWER 값이 \n
    ${CONF.contracts.EXCHANGE_VIEWER} => ${newViewer} 으로 변경됩니다. \n
\n--- migration 작업을 진행합니다. ---\n`);
        CONF.contracts.EXCHANGE_VIEWER = newViewer;

        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 후처리 */
        const MasterExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_MASTER);
        const ExchangeViewer = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_VIEWER);

        try {
            console.log('... MasterExchange.setViewer() ...');
            await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER)['setViewer(address)'](newViewer);
            console.log('... MasterExchange => MiniExchange721.setViewer() ...');
            await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER)['setViewer(address,address)'](
                newViewer,
                CONF.contracts.EXCHANGE_MINI_721,
            );
            console.log('... MasterExchange => MiniExchange1155.setViewer() ...');
            await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER)['setViewer(address,address)'](
                newViewer,
                CONF.contracts.EXCHANGE_MINI_1155,
            );
            console.log('... MasterExchange.resister() ...');
            await ExchangeViewer.attach(newViewer).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );
            console.log('\n.. complete !! ..\n');
        } catch (e) {
            console.error(e);
        }
        /** ------------------------------------------------------------------------------------------------- */
    }
    async function CHOOSE_MASTER() {
        console.log(`${ExchangeContractName.EXCHANGE_MASTER} Contract 를 선택하셨습니다.\n`);
        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 */
        const oldMaster = CONF.contracts.EXCHANGE_MASTER;
        const newMaster = await DEPLOY(ExchangeContractName.EXCHANGE_MASTER, {
            args: [CONF.option.INIT_FEE_WALLET, CONF.option.INIT_FEE_RATIO, CONF.contracts.EXCHANGE_VIEWER],
            type: [argsType.address, argsType.uint16, argsType.address],
        });
        console.log(`\n CONF.contracts.EXCHANGE_MASTER 값이 \n
    ${oldMaster} => ${newMaster} 으로 변경됩니다. \n
\n--- migration 작업을 진행합니다. ---\n`);
        CONF.contracts.EXCHANGE_MASTER = newMaster;

        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 후처리 */
        const MasterExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_MASTER);

        try {
            console.log('... (old) MasterExchange.migration() ...');
            await MasterExchange.attach(oldMaster).migration(newMaster);
            console.log('... (new) MasterExchange.resister() ...');
            await MasterExchange.attach(newMaster).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );

            console.log('\n.. complete !! ..\n');
        } catch (e) {
            console.error(e);
        }
        /** ------------------------------------------------------------------------------------------------- */
    }
    async function CHOOSE_MINI_721() {
        console.log(`${ExchangeContractName.EXCHANGE_MINI_721} Contract 를 선택하셨습니다.\n`);
        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 */
        const oldMini721 = CONF.contracts.EXCHANGE_MINI_721;
        const newMini721 = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_721, {
            args: [CONF.contracts.EXCHANGE_MASTER, CONF.contracts.EXCHANGE_VIEWER],
            type: [argsType.address, argsType.address],
        });
        console.log(`\n CONF.contracts.EXCHANGE_MINI_721 값이 \n
    ${oldMini721} => ${newMini721} 으로 변경됩니다. \n
\n--- migration 작업을 진행합니다. ---\n`);
        CONF.contracts.EXCHANGE_MINI_721 = newMini721;

        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 후처리 */
        const MasterExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_MASTER);
        const ViewerExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_VIEWER);

        try {
            console.log('... MasterExchange.deResister(oldMini) ...');
            await (await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER).deResister(oldMini721)).wait();
            console.log('... MasterExchange.resister(newMini) ...');
            await (
                await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER).resister(
                    CONF.contracts.EXCHANGE_MINI_721,
                    CONF.contracts.EXCHANGE_MINI_721_STORE,
                    CONF.contracts.EXCHANGE_MINI_1155,
                    CONF.contracts.EXCHANGE_MINI_1155_STORE,
                )
            ).wait();

            console.log('... ViewerExchange.resister(newMini) ...');
            await ViewerExchange.attach(CONF.contracts.EXCHANGE_VIEWER).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );

            console.log('\n.. complete !! ..\n');
        } catch (e) {
            console.error(e);
        }
        /** ------------------------------------------------------------------------------------------------- */
    }
    async function CHOOSE_MINI_712_STORE() {
        console.log(`${ExchangeContractName.EXCHANGE_MINI_721_STORE} Contract 를 선택하셨습니다.\n`);
        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 */
        const oldMiniStore721 = CONF.contracts.EXCHANGE_MINI_721_STORE;
        const newMiniStore721 = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_721_STORE, {
            args: [CONF.contracts.EXCHANGE_MASTER],
            type: [argsType.address],
        });
        console.log(`\n CONF.contracts.EXCHANGE_MINI_721_STORE 값이 \n
    ${oldMiniStore721} => ${newMiniStore721} 으로 변경됩니다. \n
\n--- migration 작업을 진행합니다. ---\n`);
        CONF.contracts.EXCHANGE_MINI_721_STORE = newMiniStore721;

        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 후처리 */
        const MasterExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_MASTER);
        const ViewerExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_VIEWER);

        try {
            console.log('... MasterExchange.resister() ...');
            await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );
            console.log('... ViewerExchange.resister() ...');
            await ViewerExchange.attach(CONF.contracts.EXCHANGE_VIEWER).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );

            console.log('\n.. complete !! ..\n');
        } catch (e) {
            console.error(e);
        }
        /** ------------------------------------------------------------------------------------------------- */
    }
    async function CHOOSE_MINI_1155() {
        console.log(`${ExchangeContractName.EXCHANGE_MINI_1155} Contract 를 선택하셨습니다.\n`);
        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 */
        const oldMini1155 = CONF.contracts.EXCHANGE_MINI_1155;
        const newMini1155 = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_1155, {
            args: [CONF.contracts.EXCHANGE_MASTER, CONF.contracts.EXCHANGE_VIEWER],
            type: [argsType.address, argsType.address],
        });
        console.log(`\n CONF.contracts.EXCHANGE_MINI_1155 값이 \n
    ${oldMini1155} => ${newMini1155} 으로 변경됩니다. \n
\n--- migration 작업을 진행합니다. ---\n`);
        CONF.contracts.EXCHANGE_MINI_1155 = newMini1155;

        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 후처리 */
        const MasterExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_MASTER);
        const ViewerExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_VIEWER);

        try {
            console.log('... MasterExchange.deResister(oldMini) ...');
            await (await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER).deResister(oldMini1155)).wait();
            console.log('... MasterExchange.resister(newMini) ...');
            await (
                await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER).resister(
                    CONF.contracts.EXCHANGE_MINI_721,
                    CONF.contracts.EXCHANGE_MINI_721_STORE,
                    CONF.contracts.EXCHANGE_MINI_1155,
                    CONF.contracts.EXCHANGE_MINI_1155_STORE,
                )
            ).wait();
            console.log('... ViewerExchange.resister(newMini) ...');
            await ViewerExchange.attach(CONF.contracts.EXCHANGE_VIEWER).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );

            console.log('\n.. complete !! ..\n');
        } catch (e) {
            console.error(e);
        }
        /** ------------------------------------------------------------------------------------------------- */
    }
    async function CHOOSE_MINI_1155_STORE() {
        console.log(`${ExchangeContractName.EXCHANGE_MINI_1155_STORE} Contract 를 선택하셨습니다.\n`);
        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 */
        const oldMiniStore1155 = CONF.contracts.EXCHANGE_MINI_1155_STORE;
        const newMiniStore1155 = await DEPLOY(ExchangeContractName.EXCHANGE_MINI_1155_STORE, {
            args: [CONF.contracts.EXCHANGE_MASTER],
            type: [argsType.address],
        });
        console.log(`\n CONF.contracts.EXCHANGE_MINI_1155_STORE 값이 \n
    ${oldMiniStore1155} => ${newMiniStore1155} 으로 변경됩니다. \n
\n--- migration 작업을 진행합니다. ---\n`);
        CONF.contracts.EXCHANGE_MINI_721_STORE = newMiniStore1155;

        /** ------------------------------------------------------------------------------------------------- */
        /** 재배포 후처리 */
        const MasterExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_MASTER);
        const ViewerExchange = await ethers.getContractFactory(ExchangeContractName.EXCHANGE_VIEWER);

        try {
            console.log('... MasterExchange.resister() ...');
            await MasterExchange.attach(CONF.contracts.EXCHANGE_MASTER).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );
            console.log('... ViewerExchange.resister() ...');
            await ViewerExchange.attach(CONF.contracts.EXCHANGE_VIEWER).resister(
                CONF.contracts.EXCHANGE_MINI_721,
                CONF.contracts.EXCHANGE_MINI_721_STORE,
                CONF.contracts.EXCHANGE_MINI_1155,
                CONF.contracts.EXCHANGE_MINI_1155_STORE,
            );

            console.log('\n.. complete !! ..\n');
        } catch (e) {
            console.error(e);
        }
        /** ------------------------------------------------------------------------------------------------- */
    }
}

/* ------------------------------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------------------------------- */

/** *** *** *** *** *** *** *
 * util pure function
 * ** *** *** *** *** *** ***/
async function DEPLOY(name: ExchangeContractName, option?: EXCHANGE_DEPLOY_OPTION): Promise<string> {
    console.log(`... deploying ... ${name} ... `);

    const args = [];
    let opts = '';

    if (option) {
        if (option.args.length !== option.type.length)
            throw new Error(`${RETURN.CODE(0x0020)}, option 의 args 와 type 의 length 를 일치시켜주세요.`);

        for (let i = 0; i < option.args.length; i++) {
            args.push(option.args[i]);

            if (i === 0) opts += option.type[i];
            else opts += `,${option.type[i]}`;
        }
    }

    opts = `initialize(${opts})`;

    const implFactory = await ethers.getContractFactory(name);
    const proxy = await upgrades.deployProxy(implFactory, args, {
        initializer: opts,
    });
    await proxy.deployed();

    result.push(`${proxy.address} deployed ${name} !!`);

    return proxy.address;
}

function isYes(str: string): boolean {
    return str.toLowerCase() === 'y' || str.toLowerCase() === 'yes';
}

function isNo(str: string): boolean {
    return str.toLowerCase() === 'n' || str.toLowerCase() === 'no';
}

function question() {
    const q_1 = () =>
        readline.question(` Exchange Contract Deploy 를 시작합니다.
        
CONF.contract 의 value 값이 모두 유효합니다. 

            (1) 업그레이드 (프록시 로직 교체), 
            (2) 재배포, 
    
 Enter Number (1-2) `);

    const q_2 = () =>
        readline.question(
            ` Choose a new contract to deploy 

            (1) Viewer Exchange Contract,               현재 설정값 ${CONF.contracts.EXCHANGE_VIEWER} ,
            (2) Master Exchange Contract,               현재 설정값 ${CONF.contracts.EXCHANGE_MASTER} ,
            (3) Mini Exchange 721 Contract,             현재 설정값 ${CONF.contracts.EXCHANGE_MINI_721} ,
            (4) Mini Exchange Store 721 Contract,       현재 설정값 ${CONF.contracts.EXCHANGE_MINI_721_STORE} ,
            (5) Mini Exchange 1155 Contract,            현재 설정값 ${CONF.contracts.EXCHANGE_MINI_1155} ,
            (6) Mini Exchange Store 1155 Contract,      현재 설정값 ${CONF.contracts.EXCHANGE_MINI_1155_STORE} 
            
 Enter Number (1-6) `,
        );

    return { q_1, q_2 };
}

function confNullChecker(): boolean {
    return (
        CONF.contracts.EXCHANGE_MINI_1155 !== '' &&
        CONF.contracts.EXCHANGE_MINI_1155_STORE !== '' &&
        CONF.contracts.EXCHANGE_MINI_721 !== '' &&
        CONF.contracts.EXCHANGE_MINI_721_STORE !== '' &&
        CONF.contracts.EXCHANGE_VIEWER !== '' &&
        CONF.contracts.EXCHANGE_MASTER !== ''
    );
}

function loadResult(): void {
    for (let i = 0; i < result.length; i++) {
        if (i === 0) console.log(`${result[i]}`);
        else console.log(`  [${i}]. ${result[i]}`);
    }
    if (result.length === 1) console.log('\n배포된 계약이 없습니다.');
    else console.log('\n배포가 완료되었습니다. envVariables 를 수정해주세요.');
}

/* ------------------------------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------------------------------- */
