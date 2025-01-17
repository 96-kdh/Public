import hre, { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BN from 'bn.js';
import * as chai from 'chai';
import { FactoryOptions } from 'hardhat-deploy-ethers/src/types';
import { BigNumber, constants, Event, Signer, utils } from 'ethers';
import { Currency, CurrencyAmount, Ether, Percent, Token, WETH9 } from '@uniswap/sdk-core';
import {
    encodeSqrtRatioX96,
    Pool,
    Position,
    NonfungiblePositionManager as PositionManagerSDK,
    TickMath,
} from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

import {
    asciiStringToBytes32,
    computePoolAddress,
    encodePath,
    encodePriceSqrt,
    getMaxTick,
    getMinTick,
    getTickToPrice,
    MAX_INT,
    MaxUint128,
    sortedTokens,
    toPeb,
    tryParseCurrencyAmount,
    tryParsePrice,
    tryParseTick,
} from '../scripts/utils';
import {
    NFTDescriptor,
    NonfungiblePositionManager,
    NonfungibleTokenPositionDescriptor,
    QuoterV2,
    SwapRouter,
    UniswapV3Factory,
    UniswapV3Pool,
    XToken,
} from '../typechain-types';
import { ContractNames } from '../scripts/variables';
import PassedTime from './vm/PassedTime';

const expect = chai.expect;
chai.use(require('chai-bn')(BN));

// 평소에 로그 숨김, package.json 내부 test 실행 script 참고
if (!process.env.LOG) {
    global.console.log = function (message?: any, ...optionalParams: any[]) {};
}

describe('#UNI FORK', function () {
    let xToken: XToken, wETH: XToken, usdt: XToken;
    let admin: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress; // signer

    let xFactory: UniswapV3Factory;
    let xRouter: SwapRouter;
    let nftDescriptorLib: NFTDescriptor;
    let xPositionDescriptor: NonfungibleTokenPositionDescriptor;
    let xPositionManager: NonfungiblePositionManager;
    let xQuoterV2: QuoterV2;

    const initBalance = toPeb(100_000_000);

    const INIT_RATIO_ETH_TO_USDT = 2500; // 1 이더당 2500 usdt & div decimal
    const INIT_RATIO_ETH_TO_X = 30_000_000; // 1 이더당 3000만 x
    const INIT_RATIO_USDT_TO_X = 12000; // 1 usdt 당 1.2만 x & div decimal

    const INIT_AMOUNT_ETH = toPeb(2); // 2 ETH, decimal 18
    const INIT_AMOUNT_USDT_FOR_ETH = INIT_AMOUNT_ETH.mul(INIT_RATIO_ETH_TO_USDT).div(BigNumber.from(10).pow(12)); // 5_000 USDT, decimal 6
    const INIT_AMOUNT_X_FOR_ETH = INIT_AMOUNT_ETH.mul(INIT_RATIO_ETH_TO_X); // 60_000_000 X, decimal 18
    const INIT_AMOUNT_USDT_FOR_X = BigNumber.from(10_000).mul(1e6); // 10_000 USDT, decimal 6
    const INIT_AMOUNT_X_FOR_USDT = INIT_AMOUNT_USDT_FOR_X.mul(INIT_RATIO_USDT_TO_X).mul(BigNumber.from(10).pow(12)); // 120_000_000 X, decimal 6

    let deadline = 0;
    let tokenId = 0;

    enum FeeAmount {
        LOWEST = 100,
        LOW = 500,
        MEDIUM = 3000,
        HIGH = 10000,
    }

    const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
        [FeeAmount.LOWEST]: 1,
        [FeeAmount.LOW]: 10,
        [FeeAmount.MEDIUM]: 60,
        [FeeAmount.HIGH]: 200,
    };

    const createdPoolEventId = utils.id('PoolCreated(address,address,uint24,int24,address)');
    const initializePoolEventId = utils.id('Initialize(uint160,int24)');

    beforeEach(async function () {
        [admin, user1, user2] = await ethers.getSigners();

        xToken = await Deploy(ContractNames.XToken, ['X Name', 'XN']);
        wETH = await Deploy(ContractNames.WETH9, []);
        usdt = await Deploy(ContractNames.TetherToken, []);

        xFactory = await Deploy(ContractNames.UniswapV3Factory, []);
        xRouter = await Deploy(ContractNames.SwapRouter, [xFactory.address, wETH.address]);

        nftDescriptorLib = await Deploy(ContractNames.NFTDescriptor, []);
        xPositionDescriptor = await Deploy(
            ContractNames.NonfungibleTokenPositionDescriptor,
            [wETH.address, asciiStringToBytes32('BNB')],
            {
                libraries: {
                    NFTDescriptor: nftDescriptorLib.address,
                },
            },
        );
        xPositionManager = await Deploy(ContractNames.NonfungiblePositionManager, [
            xFactory.address,
            wETH.address,
            xPositionDescriptor.address,
        ]);
        xQuoterV2 = await Deploy(ContractNames.QuoterV2, [xFactory.address, wETH.address]);

        await ApproveERC20([admin, user1], [xRouter.address, xPositionManager.address]);
        await xToken.connect(admin).mint(admin.address, toPeb(500_000_000));

        deadline = (await PassedTime.getNow()) + 3000;
        tokenId = 0;
    });

    it('INIT BALANCE CHECK', async function () {
        expect((await xToken.totalSupply()).toString()).to.equal(initBalance.add(toPeb(500_000_000)).toString());
        expect((await xToken.balanceOf(admin.address)).toString()).to.equal(
            initBalance.add(toPeb(500_000_000)).toString(),
        );
        expect((await wETH.balanceOf(admin.address)).toString()).to.equal(initBalance.toString());
        expect((await usdt.balanceOf(admin.address)).toString()).to.equal(initBalance.div(1e12).toString());
    });

    describe('#V3-SDK EX', function () {
        const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0');
        const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'token1');

        const fee = FeeAmount.MEDIUM;

        const pool_0_1 = new Pool(token0, token1, fee, encodeSqrtRatioX96(1, 1), 0, 0, []);
        const pool_1_weth = new Pool(token1, WETH9[1], fee, encodeSqrtRatioX96(1, 1), 0, 0, []);

        const recipient = '0x0000000000000000000000000000000000000003';
        const sender = '0x0000000000000000000000000000000000000004';
        const tokenId = 1;
        const slippageTolerance = new Percent(1, 100);

        beforeEach(function () {
            deadline = 123;
        });

        describe('#createCallParameters', () => {
            it('succeeds', () => {
                const { calldata, value } = PositionManagerSDK.createCallParameters(pool_0_1);

                expect(calldata).to.be.equal(
                    '0x13ead562000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb80000000000000000000000000000000000000001000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });
        });

        describe('#addCallParameters', () => {
            it('throws if liquidity is 0', () => {
                expect(() =>
                    PositionManagerSDK.addCallParameters(
                        new Position({
                            pool: pool_0_1,
                            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                            liquidity: 0,
                        }),
                        { recipient, slippageTolerance, deadline },
                    ),
                ).throw('ZERO_LIQUIDITY');
            });

            it('throws if pool does not involve ether and useNative is true', () => {
                expect(() =>
                    PositionManagerSDK.addCallParameters(
                        new Position({
                            pool: pool_0_1,
                            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                            liquidity: 1,
                        }),
                        { recipient, slippageTolerance, deadline, useNative: Ether.onChain(1) },
                    ),
                ).throw('NO_WETH');
            });

            it('succeeds for mint', () => {
                const { calldata, value } = PositionManagerSDK.addCallParameters(
                    new Position({
                        pool: pool_0_1,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 1,
                    }),
                    { recipient, slippageTolerance, deadline },
                );

                expect(calldata).to.be.equal(
                    '0x88316456000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc4000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000007b',
                );
                expect(value).to.be.equal('0x00');
            });

            it('succeeds for increase', () => {
                const { calldata, value } = PositionManagerSDK.addCallParameters(
                    new Position({
                        pool: pool_0_1,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 1,
                    }),
                    { tokenId, slippageTolerance, deadline },
                );

                expect(calldata).to.be.equal(
                    '0x219f5d1700000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b',
                );
                expect(value).to.be.equal('0x00');
            });

            it('createPool', () => {
                const { calldata, value } = PositionManagerSDK.addCallParameters(
                    new Position({
                        pool: pool_0_1,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 1,
                    }),
                    { recipient, slippageTolerance, deadline, createPool: true },
                );

                expect(calldata).to.be.equal(
                    '0xac9650d80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000008413ead562000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000016488316456000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc4000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000007b00000000000000000000000000000000000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });

            it('useNative', () => {
                const { calldata, value } = PositionManagerSDK.addCallParameters(
                    new Position({
                        pool: pool_1_weth,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 1,
                    }),
                    { recipient, slippageTolerance, deadline, useNative: Ether.onChain(1) },
                );

                expect(calldata).to.be.equal(
                    '0xac9650d800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001e00000000000000000000000000000000000000000000000000000000000000164883164560000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc4000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000007b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000412210e8a00000000000000000000000000000000000000000000000000000000',
                );
                expect(value).to.be.equal('0x01');
            });
        });

        describe('#collectCallParameters', () => {
            it('works', () => {
                const { calldata, value } = PositionManagerSDK.collectCallParameters({
                    tokenId,
                    expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
                    expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
                    recipient,
                });

                expect(calldata).to.be.equal(
                    '0xfc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff',
                );
                expect(value).to.be.equal('0x00');
            });

            it('works with eth', () => {
                const { calldata, value } = PositionManagerSDK.collectCallParameters({
                    tokenId,
                    expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token1, 0),
                    expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(Ether.onChain(1), 0),
                    recipient,
                });

                expect(calldata).to.be.equal(
                    '0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004449404b7c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064df2ab5bb00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });
        });

        describe('#removeCallParameters', () => {
            it('throws for 0 liquidity', () => {
                expect(() =>
                    PositionManagerSDK.removeCallParameters(
                        new Position({
                            pool: pool_0_1,
                            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                            liquidity: 0,
                        }),
                        {
                            tokenId,
                            liquidityPercentage: new Percent(1),
                            slippageTolerance,
                            deadline,
                            collectOptions: {
                                expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
                                expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
                                recipient,
                            },
                        },
                    ),
                ).throw('ZERO_LIQUIDITY');
            });

            it('throws for 0 liquidity from small percentage', () => {
                expect(() =>
                    PositionManagerSDK.removeCallParameters(
                        new Position({
                            pool: pool_0_1,
                            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                            liquidity: 50,
                        }),
                        {
                            tokenId,
                            liquidityPercentage: new Percent(1, 100),
                            slippageTolerance,
                            deadline,
                            collectOptions: {
                                expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
                                expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
                                recipient,
                            },
                        },
                    ),
                ).throw('ZERO_LIQUIDITY');
            });

            it('throws for bad burn', () => {
                expect(() =>
                    PositionManagerSDK.removeCallParameters(
                        new Position({
                            pool: pool_0_1,
                            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                            liquidity: 50,
                        }),
                        {
                            tokenId,
                            liquidityPercentage: new Percent(99, 100),
                            slippageTolerance,
                            deadline,
                            burnToken: true,
                            collectOptions: {
                                expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
                                expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
                                recipient,
                            },
                        },
                    ),
                ).throw('CANNOT_BURN');
            });

            it('works', () => {
                const { calldata, value } = PositionManagerSDK.removeCallParameters(
                    new Position({
                        pool: pool_0_1,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 100,
                    }),
                    {
                        tokenId,
                        liquidityPercentage: new Percent(1),
                        slippageTolerance,
                        deadline,
                        collectOptions: {
                            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
                            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
                            recipient,
                        },
                    },
                );

                expect(calldata).to.be.equal(
                    '0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000a40c49ccbe0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });

            it('works for partial', () => {
                const { calldata, value } = PositionManagerSDK.removeCallParameters(
                    new Position({
                        pool: pool_0_1,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 100,
                    }),
                    {
                        tokenId,
                        liquidityPercentage: new Percent(1, 2),
                        slippageTolerance,
                        deadline,
                        collectOptions: {
                            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
                            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
                            recipient,
                        },
                    },
                );

                expect(calldata).to.be.equal(
                    '0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000a40c49ccbe0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });

            it('works with eth', () => {
                const ethAmount = CurrencyAmount.fromRawAmount(Ether.onChain(1), 0);
                const tokenAmount = CurrencyAmount.fromRawAmount(token1, 0);

                const { calldata, value } = PositionManagerSDK.removeCallParameters(
                    new Position({
                        pool: pool_1_weth,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 100,
                    }),
                    {
                        tokenId,
                        liquidityPercentage: new Percent(1),
                        slippageTolerance,
                        deadline,
                        collectOptions: {
                            expectedCurrencyOwed0: pool_1_weth.token0.equals(token1) ? tokenAmount : ethAmount,
                            expectedCurrencyOwed1: pool_1_weth.token0.equals(token1) ? ethAmount : tokenAmount,
                            recipient,
                        },
                    },
                );

                expect(calldata).to.be.equal(
                    '0xac9650d80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000000a40c49ccbe0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004449404b7c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064df2ab5bb00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });

            it('works for partial with eth', () => {
                const ethAmount = CurrencyAmount.fromRawAmount(Ether.onChain(1), 0);
                const tokenAmount = CurrencyAmount.fromRawAmount(token1, 0);

                const { calldata, value } = PositionManagerSDK.removeCallParameters(
                    new Position({
                        pool: pool_1_weth,
                        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
                        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
                        liquidity: 100,
                    }),
                    {
                        tokenId,
                        liquidityPercentage: new Percent(1, 2),
                        slippageTolerance,
                        deadline,
                        collectOptions: {
                            expectedCurrencyOwed0: pool_1_weth.token0.equals(token1) ? tokenAmount : ethAmount,
                            expectedCurrencyOwed1: pool_1_weth.token0.equals(token1) ? ethAmount : tokenAmount,
                            recipient,
                        },
                    },
                );

                expect(calldata).to.be.equal(
                    '0xac9650d80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000000a40c49ccbe0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004449404b7c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064df2ab5bb00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });
        });

        describe('#safeTransferFromParameters', () => {
            it('succeeds no data param', () => {
                const options = {
                    sender,
                    recipient,
                    tokenId,
                };
                const { calldata, value } = PositionManagerSDK.safeTransferFromParameters(options);

                expect(calldata).to.be.equal(
                    '0x42842e0e000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001',
                );
                expect(value).to.be.equal('0x00');
            });
            it('succeeds data param', () => {
                const data = '0x0000000000000000000000000000000000009004';
                const options = {
                    sender,
                    recipient,
                    tokenId,
                    data,
                };
                const { calldata, value } = PositionManagerSDK.safeTransferFromParameters(options);

                expect(calldata).to.be.equal(
                    '0xb88d4fde000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000009004000000000000000000000000',
                );
                expect(value).to.be.equal('0x00');
            });
        });
    });

    describe('#Liquidity', function () {
        it('work addLiquidity', async function () {
            const [tokenA, tokenB] = sortedTokens(usdt, xToken);
            const fee = FeeAmount.MEDIUM;

            const expectedPoolAddress = computePoolAddress(xFactory.address, [tokenA.address, tokenB.address], fee);
            const code = await hre.ethers.provider.getCode(expectedPoolAddress);
            expect(code).to.equal('0x');

            const tx = await xPositionManager
                .connect(admin)
                .createAndInitializePoolIfNecessary(tokenA.address, tokenB.address, fee, encodePriceSqrt(1, 1));
            const receipt = await tx.wait();

            const codeAfter = await hre.ethers.provider.getCode(expectedPoolAddress);
            expect(codeAfter).to.not.eq('0x');

            const poolEvent = receipt.events?.filter(
                (item) => item.topics[0] === initializePoolEventId.toLowerCase(),
            ) as Event[];
            expect(poolEvent[0].address).to.be.equal(expectedPoolAddress);
            expect(poolEvent[0].address).to.be.equal(await xFactory.getPool(tokenA.address, tokenB.address, fee));

            const factoryEvent = receipt.events?.filter(
                (item) => item.topics[0] === createdPoolEventId.toLowerCase(),
            ) as Event[];
            expect(factoryEvent[0].address).to.be.equal(xFactory.address);

            await xPositionManager.connect(admin).mint({
                token0: tokenA.address,
                token1: tokenB.address,
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                amount0Desired: 100,
                amount1Desired: 100,
                amount0Min: 0,
                amount1Min: 0,
                recipient: admin.address,
                deadline,
                fee: FeeAmount.MEDIUM,
            });

            expect((await xPositionManager.balanceOf(admin.address)).toNumber()).to.be.equal(1);
            expect((await xPositionManager.tokenOfOwnerByIndex(admin.address, 0)).toNumber()).to.be.equal(1);

            const {
                fee: _fee,
                token0,
                token1,
                tickLower,
                tickUpper,
                liquidity,
                tokensOwed0,
                tokensOwed1,
                feeGrowthInside0LastX128,
                feeGrowthInside1LastX128,
            } = await xPositionManager.positions(1);
            expect(token0).to.equal(tokenA.address);
            expect(token1).to.equal(tokenB.address);
            expect(_fee).to.equal(fee);
            expect(tickLower).to.equal(getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]));
            expect(tickUpper).to.equal(getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]));
            expect(liquidity.toNumber()).to.equal(100);
            expect(tokensOwed0.toNumber()).to.equal(0);
            expect(tokensOwed1.toNumber()).to.equal(0);
            expect(feeGrowthInside0LastX128.toNumber()).to.equal(0);
            expect(feeGrowthInside1LastX128.toNumber()).to.equal(0);
        });
        it('work addLiquidityETH', async function () {
            const [tokenA, tokenB] = sortedTokens(usdt, wETH);
            const fee = FeeAmount.MEDIUM;

            const expectedPoolAddress = computePoolAddress(xFactory.address, [tokenA.address, tokenB.address], fee);
            const code = await hre.ethers.provider.getCode(expectedPoolAddress);
            expect(code).to.equal('0x');

            const tx = await xPositionManager
                .connect(admin)
                .createAndInitializePoolIfNecessary(tokenA.address, tokenB.address, fee, encodePriceSqrt(1, 1), {
                    value: 100,
                });
            const receipt = await tx.wait();

            const codeAfter = await hre.ethers.provider.getCode(expectedPoolAddress);
            expect(codeAfter).to.not.eq('0x');

            const poolEvent = receipt.events?.filter(
                (item) => item.topics[0] === initializePoolEventId.toLowerCase(),
            ) as Event[];
            expect(poolEvent[0].address).to.be.equal(expectedPoolAddress);
            expect(poolEvent[0].address).to.be.equal(await xFactory.getPool(tokenA.address, tokenB.address, fee));

            const factoryEvent = receipt.events?.filter(
                (item) => item.topics[0] === createdPoolEventId.toLowerCase(),
            ) as Event[];
            expect(factoryEvent[0].address).to.be.equal(xFactory.address);

            await xPositionManager.connect(admin).mint({
                token0: tokenA.address,
                token1: tokenB.address,
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                amount0Desired: 100,
                amount1Desired: 100,
                amount0Min: 0,
                amount1Min: 0,
                recipient: admin.address,
                deadline,
                fee: FeeAmount.MEDIUM,
            });

            expect((await xPositionManager.balanceOf(admin.address)).toNumber()).to.be.equal(1);
            expect((await xPositionManager.tokenOfOwnerByIndex(admin.address, 0)).toNumber()).to.be.equal(1);

            const {
                fee: _fee,
                token0,
                token1,
                tickLower,
                tickUpper,
                liquidity,
                tokensOwed0,
                tokensOwed1,
                feeGrowthInside0LastX128,
                feeGrowthInside1LastX128,
            } = await xPositionManager.positions(1);
            expect(token0).to.equal(tokenA.address);
            expect(token1).to.equal(tokenB.address);
            expect(_fee).to.equal(fee);
            expect(tickLower).to.equal(getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]));
            expect(tickUpper).to.equal(getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]));
            expect(liquidity.toNumber()).to.equal(100);
            expect(tokensOwed0.toNumber()).to.equal(0);
            expect(tokensOwed1.toNumber()).to.equal(0);
            expect(feeGrowthInside0LastX128.toNumber()).to.equal(0);
            expect(feeGrowthInside1LastX128.toNumber()).to.equal(0);
        });
    });

    describe('#Swap exactInput (single Path)', function () {
        /* exactInput: 지정된 경로를 따라 한 토큰의 amountIn을 가능한 한 많은 다른 토큰으로 스왑합니다. */
        it('work [ERC20-ERC20]', async function () {
            await initAddLiquidity(
                { _token: usdt, _decimal: 6, _amount: INIT_AMOUNT_USDT_FOR_X },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_USDT },
            );

            const inputAmount = 1e6;
            const path = encodePath([usdt.address, xToken.address], [FeeAmount.MEDIUM]);
            const outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeXTokenBalance = await xToken.balanceOf(admin.address);

            await xRouter.connect(admin).exactInput({
                path,
                recipient: admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            });

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterXTokenBalance = await xToken.balanceOf(admin.address);

            expect(beforeUsdtBalance.sub(afterUsdtBalance).toString()).to.be.equal(inputAmount.toString());
            expect(afterXTokenBalance.sub(beforeXTokenBalance).toString()).to.be.equal(
                outputAmount.amountOut.toString(),
            );
        });
        it('work [ETH-ERC20]', async function () {
            await initAddLiquidity(
                { _token: wETH, _decimal: 18, _amount: INIT_AMOUNT_ETH },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_ETH },
            );

            const inputToken = wETH;
            const outputToken = xToken;

            const inputAmount = toPeb(0.5);
            const path = encodePath([inputToken.address, outputToken.address], [FeeAmount.MEDIUM]);
            const outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            const beforeETHBalance = await admin.getBalance();
            const beforeXTokenBalance = await xToken.balanceOf(admin.address);

            const params = {
                path,
                recipient: admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            };
            const data = [xRouter.interface.encodeFunctionData('exactInput', [params])];

            const inputIsWETH9 = inputToken.address === wETH.address;
            const outputIsWETH9 = outputToken.address === wETH.address;
            if (inputIsWETH9) {
                data.push(xRouter.interface.encodeFunctionData('refundETH'));
            }
            if (outputIsWETH9) {
                data.push(
                    xRouter.interface.encodeFunctionData('unwrapWETH9', [
                        outputAmount.amountOut.toString(),
                        admin.address,
                    ]),
                );
            }

            const tx = await xRouter.connect(admin).multicall(
                data,
                inputIsWETH9
                    ? {
                          value: inputAmount,
                      }
                    : { value: 0 },
            );
            const receipt = await tx.wait();

            const afterETHBalance = await admin.getBalance();
            const afterXTokenBalance = await xToken.balanceOf(admin.address);

            expect(beforeETHBalance.sub(afterETHBalance).toString()).to.be.equal(
                inputAmount.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).toString(),
            );
            expect(afterXTokenBalance.sub(beforeXTokenBalance).toString()).to.be.equal(
                outputAmount.amountOut.toString(),
            );
        });
    });
    describe('#Swap exactOutput (single Path)', function () {
        /* exactOutput: 지정된 경로를 따라 한 토큰을 가능한 한 적게 다른 토큰의 amountOut 으로 스왑합니다(역방향) */
        it('work [ERC20-ERC20]', async function () {
            await initAddLiquidity(
                { _token: usdt, _decimal: 6, _amount: INIT_AMOUNT_USDT_FOR_X },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_USDT },
            );

            const path = encodePath([usdt.address, xToken.address], [FeeAmount.MEDIUM]);
            const amountOut = 1e6;
            const amountIn = await xQuoterV2.callStatic.quoteExactOutput(path, amountOut);

            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeXTokenBalance = await xToken.balanceOf(admin.address);

            await xRouter.connect(admin).exactOutput({
                path,
                recipient: admin.address,
                deadline,
                amountOut,
                amountInMaximum: amountIn.amountIn.toString(),
            });

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterXTokenBalance = await xToken.balanceOf(admin.address);

            expect(afterUsdtBalance.sub(beforeUsdtBalance).toString()).to.be.equal(amountOut.toString());
            expect(beforeXTokenBalance.sub(afterXTokenBalance).toString()).to.be.equal(amountIn.amountIn.toString());
        });
        it('work [ETH-ERC20]', async function () {
            await initAddLiquidity(
                { _token: wETH, _decimal: 18, _amount: INIT_AMOUNT_ETH },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_ETH },
            );

            const inputToken = xToken;
            const outputToken = wETH;

            const path = encodePath([outputToken.address, inputToken.address], [FeeAmount.MEDIUM]);
            const amountOut = toPeb(0.5);
            const amountIn = await xQuoterV2.callStatic.quoteExactOutput(path, amountOut);

            const inputIsWETH9 = inputToken.address === wETH.address;
            const outputIsWETH9 = outputToken.address === wETH.address;

            const beforeETHBalance = await admin.getBalance();
            const beforeXTokenBalance = await xToken.balanceOf(admin.address);

            const params = {
                path,
                recipient: outputIsWETH9 ? constants.AddressZero : admin.address,
                deadline,
                amountOut,
                amountInMaximum: amountIn.amountIn.toString(),
            };

            const data = [xRouter.interface.encodeFunctionData('exactOutput', [params])];

            if (inputIsWETH9) {
                data.push(xRouter.interface.encodeFunctionData('unwrapWETH9', [0, admin.address]));
            }
            if (outputIsWETH9) {
                data.push(xRouter.interface.encodeFunctionData('unwrapWETH9', [amountOut, admin.address]));
            }

            const tx = await xRouter.connect(admin).multicall(data);
            const receipt = await tx.wait();

            const afterETHBalance = await admin.getBalance();
            const afterXTokenBalance = await xToken.balanceOf(admin.address);

            expect(afterETHBalance.sub(beforeETHBalance).toString()).to.be.equal(
                amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)).toString(),
            );
            expect(beforeXTokenBalance.sub(afterXTokenBalance).toString()).to.be.equal(amountIn.amountIn.toString());
        });
    });

    describe('#Swap exactInput (multi Path)', function () {
        beforeEach(async function () {
            await initAddLiquidity(
                { _token: usdt, _decimal: 6, _amount: INIT_AMOUNT_USDT_FOR_X },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_USDT },
            );
            await initAddLiquidity(
                { _token: wETH, _decimal: 18, _amount: INIT_AMOUNT_ETH },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_ETH },
            );
            await initAddLiquidity(
                { _token: wETH, _decimal: 18, _amount: INIT_AMOUNT_ETH },
                { _token: usdt, _decimal: 6, _amount: INIT_AMOUNT_USDT_FOR_ETH },
            );
        });

        it('work [ERC20-ERC20-ETH]', async function () {
            const _path = [usdt.address, xToken.address, wETH.address];
            const path = encodePath(_path, [FeeAmount.MEDIUM, FeeAmount.MEDIUM]);

            const inputAmount = 1e6 * 25; // near 0.01 eth (25 usdt)
            const outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeETHBalance = await admin.getBalance();

            const params = {
                path,
                recipient: _path[_path.length - 1] === wETH.address ? constants.AddressZero : admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            };

            const data = [xRouter.interface.encodeFunctionData('exactInput', [params])];

            if (_path[_path.length - 1] === wETH.address) {
                data.push(
                    xRouter.interface.encodeFunctionData('unwrapWETH9', [
                        outputAmount.amountOut.toString(),
                        admin.address,
                    ]),
                );
            }

            const tx = await xRouter.connect(admin).multicall(data);
            const receipt = await tx.wait();

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterETHBalance = await admin.getBalance();

            expect(beforeUsdtBalance.sub(afterUsdtBalance).toString()).to.be.equal(inputAmount.toString());
            expect(afterETHBalance.sub(beforeETHBalance).toString()).to.be.equal(
                outputAmount.amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)).toString(),
            );
        });
        it('work [ETH-ERC20-ERC20]', async function () {
            const _path = [wETH.address, xToken.address, usdt.address];
            const path = encodePath(_path, [FeeAmount.MEDIUM, FeeAmount.MEDIUM]);

            const inputAmount = toPeb(0.5);
            const outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);
            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeETHBalance = await admin.getBalance();

            const params = {
                path,
                recipient: _path[_path.length - 1] === wETH.address ? constants.AddressZero : admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            };

            const data = [xRouter.interface.encodeFunctionData('exactInput', [params])];

            if (_path[0] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('refundETH'));
            }

            const tx = await xRouter
                .connect(admin)
                .multicall(data, _path[0] === wETH.address ? { value: inputAmount } : { value: 0 });
            const receipt = await tx.wait();

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterETHBalance = await admin.getBalance();

            expect(afterUsdtBalance.sub(beforeUsdtBalance).toString()).to.be.equal(outputAmount.amountOut.toString());
            expect(beforeETHBalance.sub(afterETHBalance).toString()).to.be.equal(
                inputAmount.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).toString(),
            );
        });
        it('work [ERC20-ETH-ERC20]', async function () {
            const _path = [usdt.address, wETH.address, xToken.address];
            const path = encodePath(_path, [FeeAmount.MEDIUM, FeeAmount.MEDIUM]);

            const inputAmount = 1e6 * 100; // 100 usdt :== 120M X
            const outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            const beforeXTokenBalance = await xToken.balanceOf(admin.address);
            const beforeUsdtBalance = await usdt.balanceOf(admin.address);

            const params = {
                path,
                recipient: admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            };

            const data = [xRouter.interface.encodeFunctionData('exactInput', [params])];
            await xRouter.connect(admin).multicall(data);

            const afterXTokenBalance = await xToken.balanceOf(admin.address);
            const afterUsdtBalance = await usdt.balanceOf(admin.address);

            expect(afterXTokenBalance.sub(beforeXTokenBalance).toString()).to.be.equal(
                outputAmount.amountOut.toString(),
            );
            expect(beforeUsdtBalance.sub(afterUsdtBalance).toString()).to.be.equal(inputAmount.toString());
        });
    });
    describe('#Swap exactOutput (multi Path)', function () {
        beforeEach(async function () {
            await initAddLiquidity(
                { _token: usdt, _decimal: 6, _amount: INIT_AMOUNT_USDT_FOR_X },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_USDT },
            );
            await initAddLiquidity(
                { _token: wETH, _decimal: 18, _amount: INIT_AMOUNT_ETH },
                { _token: xToken, _decimal: 18, _amount: INIT_AMOUNT_X_FOR_ETH },
            );
            await initAddLiquidity(
                { _token: wETH, _decimal: 18, _amount: INIT_AMOUNT_ETH },
                { _token: usdt, _decimal: 6, _amount: INIT_AMOUNT_USDT_FOR_ETH },
            );
        });

        it('work [ERC20-ERC20-ETH]', async function () {
            const _path = [usdt.address, xToken.address, wETH.address];
            const path = encodePath(_path, [FeeAmount.MEDIUM, FeeAmount.MEDIUM]);

            const amountOut = 1e6 * 25; // near 0.01 eth (25 usdt)
            const amountIn = await xQuoterV2.callStatic.quoteExactOutput(path, amountOut);

            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeETHBalance = await admin.getBalance();

            const params = {
                path,
                recipient: _path[0] === wETH.address ? constants.AddressZero : admin.address,
                deadline,
                amountOut,
                amountInMaximum: amountIn.amountIn.toString(),
            };

            const data = [xRouter.interface.encodeFunctionData('exactOutput', [params])];

            if (_path[_path.length - 1] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('refundETH'));
            }

            if (_path[0] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('unwrapWETH9', [amountOut, admin.address]));
            }

            const tx = await xRouter
                .connect(admin)
                .multicall(
                    data,
                    _path[_path.length - 1] === wETH.address ? { value: amountIn.amountIn.toString() } : { value: 0 },
                );
            const receipt = await tx.wait();

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterETHBalance = await admin.getBalance();

            expect(beforeETHBalance.sub(afterETHBalance).toString()).to.be.equal(
                amountIn.amountIn.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).toString(),
            );
            expect(afterUsdtBalance.sub(beforeUsdtBalance).toString()).to.be.equal(amountOut.toString());
        });
        it('work [ETH-ERC20-ERC20]', async function () {
            const _path = [wETH.address, xToken.address, usdt.address];
            const path = encodePath(_path, [FeeAmount.MEDIUM, FeeAmount.MEDIUM]);

            const amountOut = toPeb(0.01); // 0.01 eth :== (25 usdt)
            const amountIn = await xQuoterV2.callStatic.quoteExactOutput(path, amountOut);

            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeETHBalance = await admin.getBalance();

            const params = {
                path,
                recipient: _path[0] === wETH.address ? constants.AddressZero : admin.address,
                deadline,
                amountOut,
                amountInMaximum: amountIn.amountIn.toString(),
            };

            const data = [xRouter.interface.encodeFunctionData('exactOutput', [params])];

            if (_path[_path.length - 1] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('refundETH'));
            }

            if (_path[0] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('unwrapWETH9', [amountOut, admin.address]));
            }

            const tx = await xRouter
                .connect(admin)
                .multicall(
                    data,
                    _path[_path.length - 1] === wETH.address ? { value: amountIn.amountIn.toString() } : { value: 0 },
                );
            const receipt = await tx.wait();

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterETHBalance = await admin.getBalance();

            expect(afterETHBalance.sub(beforeETHBalance).toString()).to.be.equal(
                amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)).toString(),
            );
            expect(beforeUsdtBalance.sub(afterUsdtBalance).toString()).to.be.equal(amountIn.amountIn.toString());
        });
        it('work [ERC20-ETH-ERC20]', async function () {
            const _path = [usdt.address, wETH.address, xToken.address];
            const path = encodePath(_path, [FeeAmount.MEDIUM, FeeAmount.MEDIUM]);

            const amountOut = 1e6 * 100; // 100 usdt :== 120M X
            const amountIn = await xQuoterV2.callStatic.quoteExactOutput(path, amountOut);

            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeXTokenBalance = await xToken.balanceOf(admin.address);

            const params = {
                path,
                recipient: _path[0] === wETH.address ? constants.AddressZero : admin.address,
                deadline,
                amountOut,
                amountInMaximum: amountIn.amountIn.toString(),
            };

            const data = [xRouter.interface.encodeFunctionData('exactOutput', [params])];

            if (_path[_path.length - 1] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('refundETH'));
            }

            if (_path[0] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('unwrapWETH9', [amountOut, admin.address]));
            }

            await xRouter
                .connect(admin)
                .multicall(
                    data,
                    _path[_path.length - 1] === wETH.address ? { value: amountIn.amountIn.toString() } : { value: 0 },
                );

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterXTokenBalance = await xToken.balanceOf(admin.address);

            expect(beforeXTokenBalance.sub(afterXTokenBalance).toString()).to.be.equal(amountIn.amountIn.toString());
            expect(afterUsdtBalance.sub(beforeUsdtBalance).toString()).to.be.equal(amountOut.toString());
        });
    });

    describe('#Liquidity (Concentrated & Lazy)', function () {
        let baseToken: Currency;
        let quoteToken: Currency;

        let chainId: number;

        beforeEach(async function () {
            chainId = Number(await hre.getChainId());
        });

        it('work add [ERC20-ERC20]', async function () {
            baseToken = new Token(chainId, usdt.address, 6);
            quoteToken = new Token(chainId, xToken.address, 18);

            const _startPriceValue = INIT_RATIO_USDT_TO_X.toString(); // 12_000
            const _leftRangeValue = BigNumber.from(11_000).toString();
            const _rightRangeValue = BigNumber.from(13_000).toString();

            const lowPrice = tryParsePrice(baseToken, quoteToken, _rightRangeValue);
            const highPrice = tryParsePrice(baseToken, quoteToken, _leftRangeValue);
            const startPrice = tryParsePrice(baseToken, quoteToken, _startPriceValue);
            if (!lowPrice || !highPrice || !startPrice) throw new Error('fail get price');

            console.log('lowPrice: ', lowPrice.toSignificant(8));
            console.log('highPrice: ', highPrice.toSignificant(8));
            console.log('currentPrice: ', startPrice.toSignificant(8));

            let lowTick = tryParseTick(baseToken, quoteToken, FeeAmount.LOW, lowPrice.toSignificant(8));
            let highTick = tryParseTick(baseToken, quoteToken, FeeAmount.LOW, highPrice.toSignificant(8));
            const currentTick = tryParseTick(baseToken, quoteToken, FeeAmount.LOW, startPrice.toSignificant(8));

            console.log('lowTick: ', getTickToPrice(baseToken, quoteToken, lowTick)?.toSignificant(8), lowTick);
            console.log('highTick: ', getTickToPrice(baseToken, quoteToken, highTick)?.toSignificant(8), highTick);
            console.log(
                'currentTick: ',
                getTickToPrice(baseToken, quoteToken, currentTick)?.toSignificant(8),
                currentTick,
            );

            [lowTick, highTick] = Number(lowTick) < Number(highTick) ? [lowTick, highTick] : [highTick, lowTick];
            const noRequireSort = sortedTokens(baseToken, quoteToken)[0].address === baseToken.address;

            const mockPool = new Pool(
                baseToken,
                quoteToken,
                FeeAmount.LOW,
                TickMath.getSqrtRatioAtTick(Number(currentTick)),
                JSBI.BigInt(0),
                Number(currentTick),
                [],
            );

            const independentAmount = tryParseCurrencyAmount('1', baseToken);
            if (!independentAmount) throw new Error('require independentAmount');

            const position = noRequireSort
                ? Position.fromAmount0({
                      pool: mockPool,
                      tickLower: Number(lowTick),
                      tickUpper: Number(highTick),
                      amount0: independentAmount.quotient.toString(),
                      useFullPrecision: true,
                  })
                : Position.fromAmount1({
                      pool: mockPool,
                      tickLower: Number(lowTick),
                      tickUpper: Number(highTick),
                      amount1: independentAmount.quotient.toString(),
                  });

            const beforeUSDTBalance = await usdt.balanceOf(admin.address);
            const beforeXTokenBalance = await xToken.balanceOf(admin.address);

            const amount0 = independentAmount.quotient.toString();
            const amount1 = noRequireSort ? position.amount1.quotient.toString() : position.amount0.quotient.toString();

            console.log('amount0: ', amount0);
            console.log('amount1: ', amount1);

            await addLiquidity(
                { currency: baseToken, amount: amount0 },
                { currency: quoteToken, amount: amount1 },
                {
                    tickLower: Number(lowTick),
                    tickUpper: Number(highTick),
                    feeAmount: FeeAmount.LOW,
                    currentSqrt: TickMath.getSqrtRatioAtTick(Number(currentTick)),
                },
            );

            const afterUSDTBalance = await usdt.balanceOf(admin.address);
            const afterXTokenBalance = await xToken.balanceOf(admin.address);

            expect(independentAmount.quotient.toString()).to.be.equal(
                beforeUSDTBalance.sub(afterUSDTBalance).toString(),
            );
            // // @ts-ignore
            // expect(position.amount0.quotient.toString()).to.be.a.bignumber.within(
            //     beforeXTokenBalance.sub(afterXTokenBalance).mul(990).div(1000).toString(),
            //     beforeXTokenBalance.sub(afterXTokenBalance).mul(1010).div(1000).toString(),
            // );
        });
        it('work add [ETH-ERC20]', async function () {
            baseToken = new Token(chainId, wETH.address, 18);
            quoteToken = new Token(chainId, xToken.address, 18);

            const _leftRangeValue = BigNumber.from(INIT_RATIO_ETH_TO_X).mul(90).div(100).toString(); // 90%
            const _rightRangeValue = BigNumber.from(INIT_RATIO_ETH_TO_X).mul(110).div(100).toString(); // 110%
            const _startPriceValue = INIT_RATIO_ETH_TO_X.toString(); // 30_000_000

            const lowPrice = tryParsePrice(baseToken, quoteToken, _leftRangeValue);
            const highPrice = tryParsePrice(baseToken, quoteToken, _rightRangeValue);
            const startPrice = tryParsePrice(baseToken, quoteToken, _startPriceValue);
            if (!lowPrice || !highPrice || !startPrice) throw new Error('fail get price');

            console.log('lowPrice: ', lowPrice.toSignificant(8));
            console.log('highPrice: ', highPrice.toSignificant(8));
            console.log('currentPrice: ', startPrice.toSignificant(8));

            let lowTick = tryParseTick(baseToken, quoteToken, FeeAmount.MEDIUM, lowPrice.toSignificant(8));
            let highTick = tryParseTick(baseToken, quoteToken, FeeAmount.MEDIUM, highPrice.toSignificant(8));
            const currentTick = tryParseTick(baseToken, quoteToken, FeeAmount.MEDIUM, startPrice.toSignificant(8));

            console.log('lowTick: ', getTickToPrice(baseToken, quoteToken, lowTick)?.toSignificant(8), lowTick);
            console.log('highTick: ', getTickToPrice(baseToken, quoteToken, highTick)?.toSignificant(8), highTick);
            console.log(
                'currentTick: ',
                getTickToPrice(baseToken, quoteToken, currentTick)?.toSignificant(8),
                currentTick,
            );

            [lowTick, highTick] = Number(lowTick) < Number(highTick) ? [lowTick, highTick] : [highTick, lowTick];
            const noRequireSort = sortedTokens(baseToken, quoteToken)[0].address === baseToken.address;

            const mockPool = new Pool(
                baseToken,
                quoteToken,
                FeeAmount.MEDIUM,
                TickMath.getSqrtRatioAtTick(Number(currentTick)),
                JSBI.BigInt(0),
                Number(currentTick),
                [],
            );

            const independentAmount = tryParseCurrencyAmount('1', baseToken);
            if (!independentAmount) throw new Error('require independentAmount');

            const position = noRequireSort
                ? Position.fromAmount0({
                      pool: mockPool,
                      tickLower: Number(lowTick),
                      tickUpper: Number(highTick),
                      amount0: independentAmount.quotient.toString(),
                      useFullPrecision: true,
                  })
                : Position.fromAmount1({
                      pool: mockPool,
                      tickLower: Number(lowTick),
                      tickUpper: Number(highTick),
                      amount1: independentAmount.quotient.toString(),
                  });

            const beforeBaseTokenBalance = await admin.getBalance();
            const beforeQuoteTokenBalance = await xToken.balanceOf(admin.address);

            const amount0 = independentAmount.quotient.toString();
            const amount1 = noRequireSort ? position.amount1.quotient.toString() : position.amount0.quotient.toString();

            console.log('amount0: ', amount0);
            console.log('amount1: ', amount1);

            const usedBalance = await addLiquidity(
                { currency: baseToken, amount: amount0 },
                { currency: quoteToken, amount: amount1 },
                {
                    tickLower: Number(lowTick),
                    tickUpper: Number(highTick),
                    feeAmount: FeeAmount.MEDIUM,
                    currentSqrt: TickMath.getSqrtRatioAtTick(Number(currentTick)),
                },
            );

            const afterBaseTokenBalance = await admin.getBalance();
            const afterQuoteTokenBalance = await xToken.balanceOf(admin.address);

            expect(independentAmount.quotient.toString()).to.be.equal(
                beforeBaseTokenBalance.sub(afterBaseTokenBalance).sub(usedBalance).toString(),
            );
        });
        it('work add & swap & remove [ERC20-ERC20]', async function () {
            baseToken = new Token(chainId, usdt.address, 6);
            quoteToken = new Token(chainId, xToken.address, 18);
            const noRequireSort = sortedTokens(baseToken, quoteToken)[0].address === baseToken.address;

            const startPriceValue = INIT_RATIO_USDT_TO_X; // 12_000
            const leftRangeValue = (INIT_RATIO_USDT_TO_X * 90) / 100; // 90%
            const rightRangeValue = (INIT_RATIO_USDT_TO_X * 110) / 100; // 110%

            const baseAmount = tryParseCurrencyAmount('100', baseToken);
            if (!baseAmount) throw new Error('require independentAmount');

            const { tickLower, tickUpper } = getRangeTick(
                { baseToken, quoteToken },
                { leftRangeValue: leftRangeValue.toString(), rightRangeValue: rightRangeValue.toString() },
                FeeAmount.LOW,
            );
            const { sqrtRatioX96, tick } = getTick(
                { baseToken, quoteToken },
                startPriceValue.toString(),
                FeeAmount.LOW,
            );

            const mockPool = new Pool(baseToken, quoteToken, FeeAmount.LOW, sqrtRatioX96, JSBI.BigInt(0), tick, []);
            const position = noRequireSort
                ? Position.fromAmount0({
                      pool: mockPool,
                      tickLower,
                      tickUpper,
                      amount0: baseAmount.quotient.toString(),
                      useFullPrecision: true,
                  })
                : Position.fromAmount1({
                      pool: mockPool,
                      tickLower,
                      tickUpper,
                      amount1: baseAmount.quotient.toString(),
                  });

            const quoteAmount = noRequireSort
                ? position.amount1.quotient.toString()
                : position.amount0.quotient.toString();

            await addLiquidity(
                { currency: baseToken, amount: baseAmount.quotient.toString() },
                { currency: quoteToken, amount: quoteAmount },
                {
                    tickLower,
                    tickUpper,
                    feeAmount: FeeAmount.LOW,
                    currentSqrt: sqrtRatioX96,
                },
            );

            // 유동성 일부 스왑
            let inputAmount = baseAmount.divide(10).quotient.toString();
            const path = encodePath([usdt.address, xToken.address], [FeeAmount.LOW]);
            let outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            const beforeUsdtBalance = await usdt.balanceOf(admin.address);
            const beforeXTokenBalance = await xToken.balanceOf(admin.address);

            await xRouter.connect(admin).exactInput({
                path,
                recipient: admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            });

            const afterUsdtBalance = await usdt.balanceOf(admin.address);
            const afterXTokenBalance = await xToken.balanceOf(admin.address);

            expect(beforeUsdtBalance.sub(afterUsdtBalance).toString()).to.be.equal(inputAmount.toString());
            expect(afterXTokenBalance.sub(beforeXTokenBalance).toString()).to.be.equal(
                outputAmount.amountOut.toString(),
            );

            // 유동성 모두 스왑
            inputAmount = baseAmount.multiply(2).quotient.toString();
            outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            await xRouter.connect(admin).exactInput({
                path,
                recipient: admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            });

            const { liquidity } = await xPositionManager.positions(tokenId);

            const decreaseLiquidityData = xPositionManager.interface.encodeFunctionData('decreaseLiquidity', [
                { tokenId, liquidity, amount0Min: 0, amount1Min: 0, deadline },
            ]);
            const collectData = xPositionManager.interface.encodeFunctionData('collect', [
                {
                    tokenId,
                    recipient: admin.address,
                    amount0Max: MaxUint128,
                    amount1Max: MaxUint128,
                },
            ]);
            const burnData = xPositionManager.interface.encodeFunctionData('burn', [tokenId]);

            await xPositionManager.multicall([decreaseLiquidityData, collectData, burnData]);

            const expectedPoolAddress = computePoolAddress(
                xFactory.address,
                noRequireSort ? [baseToken.address, quoteToken.address] : [quoteToken.address, baseToken.address],
                FeeAmount.LOW,
            );
            const _pool = (await hre.ethers.getContractAt('UniswapV3Pool', expectedPoolAddress)) as UniswapV3Pool;
            expect((await _pool.liquidity()).toString()).to.be.equal('0');
        });
        it('work add & swap & remove [ETH-ERC20]', async function () {
            baseToken = new Token(chainId, wETH.address, 18);
            quoteToken = new Token(chainId, xToken.address, 18);
            const noRequireSort = sortedTokens(baseToken, quoteToken)[0].address === baseToken.address;

            const startPriceValue = INIT_RATIO_ETH_TO_X; // 30_000_000
            const leftRangeValue = (INIT_RATIO_ETH_TO_X * 90) / 100; // 90%
            const rightRangeValue = (INIT_RATIO_ETH_TO_X * 110) / 100; // 110%

            const baseAmount = tryParseCurrencyAmount('10', baseToken); // 10 eth
            if (!baseAmount) throw new Error('require independentAmount');

            const { tickLower, tickUpper } = getRangeTick(
                { baseToken, quoteToken },
                { leftRangeValue: leftRangeValue.toString(), rightRangeValue: rightRangeValue.toString() },
                FeeAmount.MEDIUM,
            );
            const { sqrtRatioX96, tick } = getTick(
                { baseToken, quoteToken },
                startPriceValue.toString(),
                FeeAmount.MEDIUM,
            );

            const mockPool = new Pool(baseToken, quoteToken, FeeAmount.MEDIUM, sqrtRatioX96, JSBI.BigInt(0), tick, []);
            const position = noRequireSort
                ? Position.fromAmount0({
                      pool: mockPool,
                      tickLower,
                      tickUpper,
                      amount0: baseAmount.quotient.toString(),
                      useFullPrecision: true,
                  })
                : Position.fromAmount1({
                      pool: mockPool,
                      tickLower,
                      tickUpper,
                      amount1: baseAmount.quotient.toString(),
                  });

            const quoteAmount = noRequireSort
                ? position.amount1.quotient.toString()
                : position.amount0.quotient.toString();

            await addLiquidity(
                { currency: baseToken, amount: baseAmount.quotient.toString() },
                { currency: quoteToken, amount: quoteAmount },
                {
                    tickLower,
                    tickUpper,
                    feeAmount: FeeAmount.MEDIUM,
                    currentSqrt: sqrtRatioX96,
                },
            );

            // 유동성 일부 스왑
            const path = encodePath([wETH.address, xToken.address], [FeeAmount.MEDIUM]);
            let inputAmount = baseAmount.divide(10).quotient.toString();
            let outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            let params = {
                path,
                recipient: path[path.length - 1] === wETH.address ? constants.AddressZero : admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            };

            let data = [xRouter.interface.encodeFunctionData('exactInput', [params])];

            if (path[0] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('refundETH'));
            }

            await xRouter
                .connect(admin)
                .multicall(data, path[0] === wETH.address ? { value: inputAmount } : { value: 0 });

            // 유동성 모두 스왑
            inputAmount = baseAmount.multiply(2).quotient.toString();
            outputAmount = await xQuoterV2.callStatic.quoteExactInput(path, inputAmount);

            params = {
                path,
                recipient: path[path.length - 1] === wETH.address ? constants.AddressZero : admin.address,
                deadline,
                amountIn: inputAmount,
                amountOutMinimum: outputAmount.amountOut.toString(),
            };

            data = [xRouter.interface.encodeFunctionData('exactInput', [params])];

            if (path[0] === wETH.address) {
                data.push(xRouter.interface.encodeFunctionData('refundETH'));
            }

            await xRouter
                .connect(admin)
                .multicall(data, path[0] === wETH.address ? { value: inputAmount } : { value: 0 });

            const { liquidity } = await xPositionManager.positions(tokenId);

            const decreaseLiquidityData = xPositionManager.interface.encodeFunctionData('decreaseLiquidity', [
                { tokenId, liquidity, amount0Min: 0, amount1Min: 0, deadline },
            ]);
            const collectData = xPositionManager.interface.encodeFunctionData('collect', [
                {
                    tokenId,
                    recipient: admin.address,
                    amount0Max: MaxUint128,
                    amount1Max: MaxUint128,
                },
            ]);
            const burnData = xPositionManager.interface.encodeFunctionData('burn', [tokenId]);

            await xPositionManager.connect(admin).multicall([decreaseLiquidityData, collectData, burnData]);

            const expectedPoolAddress = computePoolAddress(
                xFactory.address,
                noRequireSort ? [baseToken.address, quoteToken.address] : [quoteToken.address, baseToken.address],
                FeeAmount.MEDIUM,
            );
            const _pool = (await hre.ethers.getContractAt('UniswapV3Pool', expectedPoolAddress)) as UniswapV3Pool;
            expect((await _pool.liquidity()).toString()).to.be.equal('0');
        });

        const addLiquidity = async (
            token0: { currency: Currency; amount: BigNumber | string },
            token1: { currency: Currency; amount: BigNumber | string },
            _tick: { tickLower: number; tickUpper: number; feeAmount: FeeAmount; currentSqrt: JSBI },
        ): Promise<BigNumber> => {
            let value = '0';
            const txs = [];

            const isSorted: boolean =
                sortedTokens(token0.currency.wrapped, token1.currency.wrapped)[0].address ===
                token0.currency.wrapped.address;

            const [_token0, _token1] = isSorted ? [token0, token1] : [token1, token0];

            if (_token0.currency.wrapped.address === wETH.address) {
                value = _token0.amount.toString();
            } else if (_token1.currency.wrapped.address === wETH.address) {
                value = _token1.amount.toString();
            }

            const expectedPoolAddress = computePoolAddress(
                xFactory.address,
                [_token0.currency.wrapped.address, _token1.currency.wrapped.address],
                _tick.feeAmount,
            );

            const code = await hre.ethers.provider.getCode(expectedPoolAddress);
            if (code === '0x') {
                const createAndInitializeData = xPositionManager.interface.encodeFunctionData(
                    'createAndInitializePoolIfNecessary',
                    [
                        _token0.currency.wrapped.address,
                        _token1.currency.wrapped.address,
                        _tick.feeAmount,
                        _tick.currentSqrt.toString(),
                    ],
                );
                txs.push(createAndInitializeData);
            }

            const mintData = xPositionManager.interface.encodeFunctionData('mint', [
                {
                    token0: _token0.currency.wrapped.address,
                    token1: _token1.currency.wrapped.address,
                    fee: _tick.feeAmount,
                    tickLower: _tick.tickLower,
                    tickUpper: _tick.tickUpper,
                    amount0Desired: _token0.amount,
                    amount1Desired: _token1.amount,
                    amount0Min: BigNumber.from(_token0.amount).mul(999).div(1000),
                    amount1Min: BigNumber.from(_token1.amount).mul(999).div(1000),
                    recipient: admin.address,
                    deadline,
                },
            ]);

            txs.push(mintData);

            if (value !== '0') {
                const refundETHData = xPositionManager.interface.encodeFunctionData('refundETH');
                txs.push(refundETHData);
            }

            const tx = await xPositionManager.connect(admin).multicall(txs, {
                value,
            });
            const receipt = await tx.wait();
            const used = receipt.gasUsed.mul(receipt.effectiveGasPrice);

            const afterCode = await hre.ethers.provider.getCode(expectedPoolAddress);
            expect(afterCode).to.be.not.equal('0x');
            tokenId++;

            return used;
        };

        const getRangeTick = (
            token: { baseToken: Token; quoteToken: Token },
            range: { leftRangeValue: string; rightRangeValue: string },
            feeAmount: FeeAmount,
        ) => {
            const lowPrice = tryParsePrice(token.baseToken, token.quoteToken, range.rightRangeValue.toString());
            const highPrice = tryParsePrice(token.baseToken, token.quoteToken, range.leftRangeValue.toString());
            if (!lowPrice || !highPrice) throw new Error('fail get price');

            let tickLower = tryParseTick(token.baseToken, token.quoteToken, feeAmount, lowPrice.toSignificant(8));
            let tickUpper = tryParseTick(token.baseToken, token.quoteToken, feeAmount, highPrice.toSignificant(8));
            if (!tickLower || !tickUpper) throw new Error('fail get tick');

            [tickLower, tickUpper] =
                Number(tickLower) < Number(tickUpper) ? [tickLower, tickUpper] : [tickUpper, tickLower];

            return { tickLower, tickUpper };
        };

        const getTick = (token: { baseToken: Token; quoteToken: Token }, value: string, feeAmount: FeeAmount) => {
            const price = tryParsePrice(token.baseToken, token.quoteToken, value);
            if (!price) throw new Error('fail get price');
            const tick = tryParseTick(token.baseToken, token.quoteToken, feeAmount, price.toSignificant(8));
            if (!tick) throw new Error('fail get tick');
            const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

            return { sqrtRatioX96, tick };
        };
    });

    // For Slippage
    // For Fee
    // Calc path

    const Deploy = async function (
        _contractName: ContractNames,
        _arg: string[],
        signerOrOptions?: Signer | string | FactoryOptions,
    ): Promise<any> {
        // @ts-ignore
        const newContractImp = await hre.ethers.getContractFactory(_contractName, signerOrOptions);
        const newContract = await newContractImp.deploy(..._arg);
        await newContract.deployed();

        return newContract;
    };

    const ApproveERC20 = async function (wallets: Signer[], spender: string[]): Promise<void> {
        const txs = [];

        for (let i = 0; i < wallets.length; i++) {
            for (let l = 0; l < spender.length; l++) {
                txs.push(new Promise((resolve) => resolve(xToken.connect(wallets[i]).approve(spender[l], MAX_INT))));
                txs.push(new Promise((resolve) => resolve(usdt.connect(wallets[i]).approve(spender[l], MAX_INT))));
                txs.push(new Promise((resolve) => resolve(wETH.connect(wallets[i]).approve(spender[l], MAX_INT))));
            }
        }

        await Promise.all(txs);
    };

    const _initAddLiquidity = async (
        _token0: { _token: XToken | Token; _decimal: number; _amount: BigNumber },
        _token1: { _token: XToken | Token; _decimal: number; _amount: BigNumber },
        _sqrtRatioX96: BigNumber,
        _tick?: { tickLower: number; tickUpper: number; feeAmount: FeeAmount },
    ) => {
        let token0Amount: BigNumber;
        let token1Amount: BigNumber;
        let value;
        const feeAmount = _tick ? _tick.feeAmount : FeeAmount.MEDIUM;

        const [token0, token1] = sortedTokens(_token0._token, _token1._token);
        const expectedPoolAddress = computePoolAddress(xFactory.address, [token0.address, token1.address], feeAmount);

        if (token0.address === _token0._token.address) {
            token0Amount = _token0._amount;
            token1Amount = _token1._amount;
        } else {
            token0Amount = _token1._amount;
            token1Amount = _token0._amount;
        }

        if (token0.address === wETH.address) {
            value = token0Amount;
        } else if (token1.address === wETH.address) {
            value = token1Amount;
        }

        const price = _sqrtRatioX96.div(BigNumber.from(2).pow(96)).pow(2);
        if (_token0._decimal !== _token1._decimal) {
            const adjPrice =
                _token0._decimal > _token1._decimal
                    ? price.mul(BigNumber.from(10).pow(_token1._decimal)).div(BigNumber.from(10).pow(_token0._decimal))
                    : price.mul(BigNumber.from(10).pow(_token0._decimal)).div(BigNumber.from(10).pow(_token1._decimal));
            console.log('price: ', adjPrice.toString());
        } else {
            console.log('price: ', price);
        }

        const createAndInitializeData = xPositionManager.interface.encodeFunctionData(
            'createAndInitializePoolIfNecessary',
            [token0.address, token1.address, feeAmount, _sqrtRatioX96],
        );

        const mintData = xPositionManager.interface.encodeFunctionData('mint', [
            {
                token0: token0.address,
                token1: token1.address,
                tickLower: _tick ? _tick.tickLower : getMinTick(TICK_SPACINGS[feeAmount]),
                tickUpper: _tick ? _tick.tickUpper : getMaxTick(TICK_SPACINGS[feeAmount]),
                fee: feeAmount,
                recipient: admin.address,
                amount0Desired: token0Amount,
                amount1Desired: token1Amount,
                amount0Min: 0,
                amount1Min: 0,
                deadline,
            },
        ]);

        const refundETHData = xPositionManager.interface.encodeFunctionData('refundETH');

        await xPositionManager.connect(admin).multicall([createAndInitializeData, mintData, refundETHData], {
            value,
        });
        tokenId++;

        // console.log('_token0 balance: ', (await _token0._token.balanceOf(expectedPoolAddress)).toString());
        // console.log('_token1 balance: ', (await _token1._token.balanceOf(expectedPoolAddress)).toString());

        const {
            fee: _fee,
            token0: tokenZero,
            token1: tokenOne,
            tickLower,
            tickUpper,
            liquidity,
            tokensOwed0,
            tokensOwed1,
            feeGrowthInside0LastX128,
            feeGrowthInside1LastX128,
        } = await xPositionManager.positions(tokenId);
        expect(tokenZero).to.equal(token0.address);
        expect(tokenOne).to.equal(token1.address);
        expect(_fee).to.equal(feeAmount);
        // expect(tickLower).to.equal(getMinTick(TICK_SPACINGS[feeAmount]));
        // expect(tickUpper).to.equal(getMaxTick(TICK_SPACINGS[feeAmount]));
        // console.log('liquidity: ', liquidity.toString());
        // console.log(tokensOwed0.toString());
        // console.log(tokensOwed1.toString());
        // console.log(feeGrowthInside0LastX128.toString());
        // console.log(feeGrowthInside1LastX128.toString());
        // expect(liquidity.toNumber()).to.equal(100);
        // expect(tokensOwed0.toNumber()).to.equal(0);
        // expect(tokensOwed1.toNumber()).to.equal(0);
        // expect(feeGrowthInside0LastX128.toNumber()).to.equal(0);
        // expect(feeGrowthInside1LastX128.toNumber()).to.equal(0);
    };

    const initAddLiquidity = async (
        _token0: { _token: XToken | Token; _decimal: number; _amount: BigNumber },
        _token1: { _token: XToken | Token; _decimal: number; _amount: BigNumber },
        _tick?: { tickLower: number; tickUpper: number; feeAmount: FeeAmount },
    ) => {
        const [token0, token1] = sortedTokens(_token0._token, _token1._token);

        const sqrtRatioX96 =
            token0.address === _token0._token.address
                ? encodePriceSqrt(_token1._amount, _token0._amount)
                : encodePriceSqrt(_token0._amount, _token1._amount);

        await _initAddLiquidity(
            token0.address === _token0._token.address ? _token0 : _token1,
            token0.address === _token0._token.address ? _token1 : _token0,
            sqrtRatioX96,
            _tick,
        );
    };
});
