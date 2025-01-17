import { task } from 'hardhat/config';
import readline from 'readline-sync';
import { HardhatRuntimeEnvironment } from 'hardhat/types/runtime';
import chalk from 'chalk';

import { isYes, toPeb } from './utils';
import { BigNumber } from 'ethers';

enum CoreTask {
    DEPLOY = 'DEPLOY',
    BALANCE__OF = 'BALANCE__OF',

    LIQUIDITY__ADD = 'LIQUIDITY__ADD',
    LIQUIDITY__ADD__ETH = 'LIQUIDITY__ADD__ETH',
    LIQUIDITY__REMOVE = 'LIQUIDITY__REMOVE',
    LIQUIDITY__REMOVE__ETH = 'LIQUIDITY__REMOVE__ETH',
}

const beforeTaskAction = async (
    taskArgs: { [key: string]: string },
    hre: HardhatRuntimeEnvironment,
    afterTaskAction: () => Promise<void>,
) => {
    console.log('\n트랜잭션을 실행 전, 다음과 같은 사항들이 올바른지 체크해주세요.\n');
    const admin = (await hre.ethers.getSigners())[0].address; // hardhat config accounts 0 index
    console.log(`selected network: [${chalk.red(hre.network.name)}]`);
    console.log(`selected address: [${chalk.red(admin)}]`);

    console.log('\n전달된 taskArgs 는 아래와 같습니다.', '\n{');
    for (const [key, value] of Object.entries(taskArgs)) {
        let _value = value;
        try {
            _value = JSON.parse(value);
        } catch (e) {}
        console.log(`   ${chalk.blue(key)}: `, _value);
    }
    console.log('}');

    let answer = ''; // user input value
    answer = readline.question(`진행하시겠습니까 ? (Y/N) `);

    if (!isYes(answer)) return console.log('\n진행하지 않습니다. 종료합니다.');

    await afterTaskAction();
};

const checkApprove = async (
    tokenAddress: string,
    spenderAddress: string,
    amount: BigNumber,
    hre: HardhatRuntimeEnvironment,
) => {
    const Imp = await hre.ethers.getContractAt('XToken', tokenAddress);
    const admin = (await hre.ethers.getSigners())[0].address; // hardhat config accounts 0 index
    const allowance = await Imp.allowance(admin, spenderAddress);
    if (+amount > +allowance) {
        console.log(`require approve, token: ${tokenAddress}, spender: ${spenderAddress}`);
        const tx = await (await Imp.approve(spenderAddress, toPeb(100_000_000))).wait();
        console.log('approve tx: ', tx.transactionHash);
    }
};

// npx hardhat DEPLOY
task(CoreTask.DEPLOY, '배포').setAction(async (_, hre) => {
    const { DEPLOY_TASK } = require('./deploy');
    await DEPLOY_TASK(hre);
});

// npx hardhat BALANCE__OF
task(CoreTask.BALANCE__OF, '배포')
    .addParam('token', 'token 주소')
    .setAction(async ({ token }, hre) => {
        const Imp = await hre.ethers.getContractAt('XToken', token);
        const admin = (await hre.ethers.getSigners())[0].address; // hardhat config accounts 0 index
        const balance = await Imp.balanceOf(admin);
        console.log('balance: ', balance);
    });

task(CoreTask.LIQUIDITY__ADD__ETH, '유동성 공급 (ETH-ERC20)')
    .addParam('ca', 'CA (Router Contract Accounts)')
    .addParam('value', 'msg value (eth)')
    .addParam('token', 'token 주소')
    .addParam('amountdesired', '유동성 추가 희망 token0 수량')
    .addParam('to', '유동성 토큰을 받을 사람')
    .addParam('deadline', '만료시간')
    .setAction(async ({ ca, token, value, amountdesired, to, deadline }, hre) =>
        beforeTaskAction({ ca, token, value, amountdesired, to, deadline }, hre, async () => {
            await checkApprove(token, ca, toPeb(amountdesired), hre);

            const Imp = await hre.ethers.getContractAt('UniswapV2Router02', ca);

            const tx = await (
                await Imp.addLiquidityETH(
                    token,
                    toPeb(amountdesired),
                    toPeb(amountdesired),
                    toPeb(value),
                    to,
                    deadline,
                    {
                        value: toPeb(value),
                    },
                )
            ).wait();
            console.log('tx: ', tx.transactionHash);
        }),
    );

// npx hardhat LIQUIDITY__ADD
task(CoreTask.LIQUIDITY__ADD, '유동성 공급 (ERC20-ERC20)')
    .addParam('ca', 'CA (Router Contract Accounts)')
    .addParam('token0', 'token0 주소')
    .addParam('amount0desired', '유동성 추가 희망 token0 수량')
    .addParam('amount0min', '유동성 추가 최소 희망 수량')
    .addParam('token1', 'token1 주소')
    .addParam('amount1desired', '유동성 추가 희망 token1 수량')
    .addParam('amount1min', '유동성 추가 최소 희망 수량')
    .addParam('to', '유동성 토큰을 받을 사람')
    .addParam('deadline', '만료시간')
    .setAction(
        async ({ ca, token0, token1, amount0desired, amount0min, amount1desired, amount1min, to, deadline }, hre) =>
            beforeTaskAction(
                { ca, token0, token1, amount0desired, amount0min, amount1desired, amount1min, to, deadline },
                hre,
                async () => {
                    await checkApprove(token0, ca, toPeb(amount0desired), hre);
                    await checkApprove(token1, ca, toPeb(amount1desired), hre);

                    const Imp = await hre.ethers.getContractAt('UniswapV2Router02', ca);
                    const tx = await (
                        await Imp.addLiquidity(
                            token0,
                            token1,
                            toPeb(amount0desired),
                            toPeb(amount1desired),
                            toPeb(amount0min),
                            toPeb(amount1min),
                            to,
                            deadline,
                        )
                    ).wait();
                    console.log('tx: ', tx.transactionHash);
                },
            ),
    );

// npx hardhat LIQUIDITY__REMOVE
task(CoreTask.LIQUIDITY__REMOVE, '유동성 제거 (ERC20-ERC20')
    .addParam('ca', 'CA (Router Contract Accounts)')
    .addParam('token0', 'token0 주소')
    .addParam('amount0desired', '유동성 추가 희망 token0 수량')
    .addParam('amount0min', '유동성 추가 최소 희망 수량')
    .addParam('token1', 'token1 주소')
    .addParam('amount1desired', '유동성 추가 희망 token1 수량')
    .addParam('amount1min', '유동성 추가 최소 희망 수량')
    .addParam('to', '유동성 토큰을 받을 사람')
    .addParam('deadline', '만료시간')
    .setAction(
        async ({ ca, token0, token1, amount0desired, amount0min, amount1desired, amount1min, to, deadline }, hre) =>
            beforeTaskAction(
                { ca, token0, token1, amount0desired, amount0min, amount1desired, amount1min, to, deadline },
                hre,
                async () => {
                    const Imp = await hre.ethers.getContractAt('UniswapV2Router02', ca);
                    const tx = await (
                        await Imp.removeLiquidity(
                            token0,
                            token1,
                            toPeb(amount0desired),
                            toPeb(amount1desired),
                            toPeb(amount0min),
                            toPeb(amount1min),
                            to,
                            deadline,
                        )
                    ).wait();
                    console.log('tx: ', tx.transactionHash);
                },
            ),
    );
