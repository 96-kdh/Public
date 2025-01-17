import { BigNumber, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, upgrades } from 'hardhat';
import chai from 'chai';
import BN from 'bn.js';

import { MiniExchange721, MasterExchange, ExchangeViewer, MiniExchangeStore721 } from '../../typechain';
import { toPeb, address0 } from './common';

const expect = chai.expect;
chai.use(require('chai-bn')(BN));

describe('Exchange721', async () => {
    let MasterViewer: ExchangeViewer;
    let MasterExchange: MasterExchange;
    let Exchange721: MiniExchange721;
    let ExchangeStore721: MiniExchangeStore721;

    let erc20: Contract;
    let erc20_wETH: Contract;
    let erc721: Contract;

    const user1Tokens = [1, 2, 3, 4, 5];
    const user2Tokens = [6, 7, 8, 9, 10];

    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    let klaymintFeeWallet: SignerWithAddress;
    let projectFeeWallet: SignerWithAddress;

    const sellSig: string = '0x0f3cba00';
    const buySig: string = '0xb9f5a720';

    /**
     * it(...) test case 가 실행되기 전 항상 선행되어 실행되는 부분
     */
    beforeEach(async () => {
        // deploy & init
        const [_admin, _user1, _user2, _user3, _user4] = await ethers.getSigners();
        admin = _admin;
        user1 = _user1;
        user2 = _user2;
        klaymintFeeWallet = _user3;
        projectFeeWallet = _user4;

        await paymentDeploy();
        await targetTokenDeploy();

        const _MasterViewer = await ethers.getContractFactory('ExchangeViewer');
        MasterViewer = (await upgrades.deployProxy(_MasterViewer, [], {
            initializer: 'initialize()',
        })) as ExchangeViewer;
        await MasterViewer.connect(admin).deployed();

        const _MasterExchange = await ethers.getContractFactory('MasterExchange');
        MasterExchange = (await upgrades.deployProxy(
            _MasterExchange,
            [klaymintFeeWallet.address, 0, MasterViewer.address],
            {
                initializer: 'initialize(address,uint16,address)',
            },
        )) as MasterExchange;
        await MasterExchange.connect(admin).deployed();

        const _Exchange721 = await ethers.getContractFactory('MiniExchange721');
        Exchange721 = (await upgrades.deployProxy(_Exchange721, [MasterExchange.address, MasterViewer.address], {
            initializer: 'initialize(address,address)',
        })) as MiniExchange721;
        await Exchange721.connect(admin).deployed();

        const _ExchangeStore721 = await ethers.getContractFactory('MiniExchangeStore721');
        ExchangeStore721 = (await upgrades.deployProxy(_ExchangeStore721, [MasterExchange.address], {
            initializer: 'initialize(address)',
        })) as MiniExchangeStore721;
        await ExchangeStore721.connect(admin).deployed;

        await MasterExchange.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange721.address,
            ExchangeStore721.address,
        );

        await approveAll();

        await MasterViewer.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange721.address,
            ExchangeStore721.address,
        );
    });

    /** @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     *      Exchange721 Test Case
     * @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ */
    /**
     * requirement
     * 1. sell or buy 신청으로 order, order 체결 이 가능하다.
     * 2. 서로 다른 유저의 같은 가격 buyOrder 의 경우 둘 다 지불수단이 유효하다면 먼저 넣은 인원이 먼저 체결된다.
     * 3. 토큰의 소유주가 변경되더라도 전의 구매오더는 영향이 없다.
     * 4. buyMatch 는 taker의 price 보다 작거나 같은 경우 실행된다.
     * 5. sellMatch 는 taker 의 price 와 동일한 경우만 실행된다.
     */
    it('(erc721) sell -> buy, buy -> sell', async () => {
        const sellToken = user1Tokens[0];
        expect(await erc721.ownerOf(sellToken)).to.equal(user1.address);

        await sell(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(10), 1, 0);
        await buy(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(10), 1, 0);
        expect(await erc721.ownerOf(sellToken)).to.equal(user2.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));

        await buy(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(20), 1, 0);
        await sell(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(20), 1, 0);
        expect(await erc721.ownerOf(sellToken)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(90));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(110));

        const buyToken = user1Tokens[1];
        expect(await erc721.ownerOf(buyToken)).to.equal(user1.address);
        await buy(user2, erc20.address, erc721.address, buyToken, toPeb(100), 1, 0);

        await erc20.connect(admin).approve(MasterExchange.address, toPeb(10000));
        await buy(admin, erc20.address, erc721.address, buyToken, toPeb(100), 1, 0);

        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(100));
        expect(await erc20.balanceOf(admin.address)).to.equal(toPeb(800));

        await sell(user1, erc20.address, erc721.address, buyToken, toPeb(100), 1, 0);
        expect(await erc721.ownerOf(buyToken)).to.equal(user2.address);

        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(200));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(0));
        expect(await erc20.balanceOf(admin.address)).to.equal(toPeb(800));

        await sell(user2, erc20.address, erc721.address, buyToken, toPeb(100), 1, 0);
        expect(await erc721.ownerOf(buyToken)).to.equal(admin.address);

        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(200));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(100));
        expect(await erc20.balanceOf(admin.address)).to.equal(toPeb(700));
    });

    /**
     * requirement
     * 1. 보유자산보다 크지 않은 오더를 여러개 중첩해서 올리고, 남은 오더가 유효하지 않게 될 때 유효한 오더만 체결된다. 체결되는 오더가 없으면 오퍼로 전환된다.
     * ex) user1은 100wETH 를 가지고있고, 100wETH 의 구매신청을 여러번 올렸다. 하나의 오더가 체결되어 지불수단이 없어진 경우, 나머지는 체결되지 않는다.
     */
    it('(erc20 & wETH) + (erc721) 다수의 오더를 합하면 보유자산보다 더 큰 경우', async () => {
        const buyToken = user2Tokens[0];
        const buyToken1 = user2Tokens[1];
        const buyToken2 = user2Tokens[2];
        const buyToken3 = user2Tokens[2];
        expect(await erc721.ownerOf(buyToken)).to.equal(user2.address);
        expect(await erc721.ownerOf(buyToken1)).to.equal(user2.address);
        expect(await erc721.ownerOf(buyToken2)).to.equal(user2.address);
        expect(await erc721.ownerOf(buyToken3)).to.equal(user2.address);

        // 현재 user1 의 지불능력은 총 100wETH,
        await buy(user1, erc20_wETH.address, erc721.address, buyToken, toPeb(50), 1, 0);
        await buy(user1, erc20_wETH.address, erc721.address, buyToken1, toPeb(50), 1, 0);
        await buy(user1, erc20_wETH.address, erc721.address, buyToken2, toPeb(50), 1, 0);
        await buy(user1, erc20_wETH.address, erc721.address, buyToken3, toPeb(50), 1, 0);

        // user1 의 모든 오더를 체결하려고 했을 때, token3, token4 는 체결x, user1의 지불능력 상실
        await sell(user2, erc20_wETH.address, erc721.address, buyToken, toPeb(50), 1, 0);
        await sell(user2, erc20_wETH.address, erc721.address, buyToken1, toPeb(50), 1, 0);
        await sell(user2, erc20_wETH.address, erc721.address, buyToken2, toPeb(50), 1, 0);
        await sell(user2, erc20_wETH.address, erc721.address, buyToken3, toPeb(50), 1, 0);

        expect(await erc721.ownerOf(buyToken)).to.equal(user1.address);
        expect(await erc721.ownerOf(buyToken1)).to.equal(user1.address);

        expect(await erc721.ownerOf(buyToken2)).to.equal(user2.address);
        expect(await erc721.ownerOf(buyToken3)).to.equal(user2.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(0));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(200));
        /** --- wETH --- */

        const _buyToken = user1Tokens[0];
        const _buyToken1 = user1Tokens[1];
        const _buyToken2 = user1Tokens[2];
        const _buyToken3 = user1Tokens[3];
        expect(await erc721.ownerOf(_buyToken)).to.equal(user1.address);
        expect(await erc721.ownerOf(_buyToken1)).to.equal(user1.address);
        expect(await erc721.ownerOf(_buyToken2)).to.equal(user1.address);
        expect(await erc721.ownerOf(_buyToken3)).to.equal(user1.address);

        await buy(user2, erc20.address, erc721.address, _buyToken, toPeb(40), 1, 0);
        await buy(user2, erc20.address, erc721.address, _buyToken1, toPeb(40), 1, 0);
        await buy(user2, erc20.address, erc721.address, _buyToken2, toPeb(40), 1, 0);
        await buy(user2, erc20.address, erc721.address, _buyToken3, toPeb(40), 1, 0);

        await sell(user1, erc20.address, erc721.address, _buyToken, toPeb(40), 1, 0);
        await sell(user1, erc20.address, erc721.address, _buyToken1, toPeb(40), 1, 0);
        await sell(user1, erc20.address, erc721.address, _buyToken2, toPeb(40), 1, 0);
        await sell(user1, erc20.address, erc721.address, _buyToken3, toPeb(40), 1, 0);

        expect(await erc721.ownerOf(_buyToken)).to.equal(user2.address);
        expect(await erc721.ownerOf(_buyToken1)).to.equal(user2.address);

        expect(await erc721.ownerOf(_buyToken2)).to.equal(user1.address);
        expect(await erc721.ownerOf(_buyToken3)).to.equal(user1.address);

        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(180));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(20));
        /** --- erc20 --- */
    });

    /**
     * requirement
     * 1. 취소된 주문은 체결되지 않는다.
     */
    it('(erc721) sellCancel, buyCancel', async function () {
        const sellToken = user1Tokens[0];
        expect(await erc721.ownerOf(sellToken)).to.equal(user1.address);

        await sell(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(1), 1, 0);
        await sellCancel(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(1), 0);

        await buy(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(1), 1, 0);
        await buyCancel(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(1), 0);

        expect(await erc721.ownerOf(sellToken)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        await sell(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(1), 1, 0);

        expect(await erc721.ownerOf(sellToken)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));
    });

    /**
     * requirement
     * 1. fee 는 set 즉시 적용된다.
     */
    it('fee test (erc721)', async function () {
        const { klaymint, klaymintRate, project, projectRate } = await MasterExchange.getFeeBook(erc721.address);

        expect(klaymint).to.equal(klaymintFeeWallet.address);
        expect(klaymintRate).to.equal(0);

        expect(project).to.equal(address0());
        expect(projectRate).to.equal(0);

        await MasterExchange.connect(admin).setBaseFee(klaymintFeeWallet.address, 50); // 5%
        await MasterExchange.connect(admin).setFeeBooks(erc721.address, projectFeeWallet.address, 100); // 10%

        const {
            klaymint: _klaymint,
            klaymintRate: _klaymintRate,
            project: _project,
            projectRate: _projectRate,
        } = await MasterExchange.getFeeBook(erc721.address);

        expect(_klaymint).to.equal(klaymintFeeWallet.address);
        expect(_klaymintRate).to.equal(50);

        expect(_project).to.equal(projectFeeWallet.address);
        expect(_projectRate).to.equal(100);

        const sellToken = user1Tokens[0];

        await sell(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(100), 1, 0);
        await buy(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(100), 1, 0);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(185));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(0));
        expect(await erc20_wETH.balanceOf(klaymintFeeWallet.address)).to.equal(toPeb(5));
        expect(await erc20_wETH.balanceOf(projectFeeWallet.address)).to.equal(toPeb(10));

        const sellToken2 = user1Tokens[1];

        await sell(user1, erc20.address, erc721.address, sellToken2, toPeb(100), 1, 0);
        await buy(user2, erc20.address, erc721.address, sellToken2, toPeb(100), 1, 0);

        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(185));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(0));
        expect(await erc20.balanceOf(klaymintFeeWallet.address)).to.equal(toPeb(5));
        expect(await erc20.balanceOf(projectFeeWallet.address)).to.equal(toPeb(10));
    });

    /**
     *
     */
    it('(erc721) view function check', async function () {
        const sellToken = user1Tokens[0];
        expect(await erc721.ownerOf(sellToken)).to.equal(user1.address);

        await sell(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(100), 1, 0);
        await sell(user1, erc20_wETH.address, erc721.address, sellToken, toPeb(80), 1, 0);

        await buy(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(10), 1, 0);
        await buy(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(11), 1, 0);
        await buy(user2, erc20_wETH.address, erc721.address, sellToken, toPeb(88), 1, 0);

        const orderBooks = await getOrderBook(erc20_wETH.address, erc721.address, user1.address);

        //  // 만약 buy price 보다 낮은 가격에 살 수 있게하면 아래
        // expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(180));
        // expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(20));
        // expect(await erc721.ownerOf(sellToken)).to.equal(user2.address);

        // 그게 아니라면 matching 안되서 아래와 같이 결과나와야함 (price <-> price) match
        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));
        expect(await erc721.ownerOf(sellToken)).to.equal(user1.address);
    });

    const paymentDeploy = async () => {
        const _erc20_wETH = await ethers.getContractFactory('WETH9');
        erc20_wETH = await _erc20_wETH.connect(admin).deploy();
        await erc20_wETH.connect(admin).deployed();

        await erc20_wETH.connect(user1).deposit({ value: toPeb(100) });
        await erc20_wETH.connect(user2).deposit({ value: toPeb(100) });

        const _erc20 = await ethers.getContractFactory('PER');
        erc20 = await _erc20.connect(admin).deploy(1000, '_name', 'symbol');
        await erc20.connect(admin).deployed();

        await erc20.connect(admin).transfer(user1.address, toPeb(100));
        await erc20.connect(admin).transfer(user2.address, toPeb(100));
    };

    const targetTokenDeploy = async () => {
        const _ERC721 = await ethers.getContractFactory('KIP17Token');
        erc721 = await _ERC721.connect(admin).deploy('name_', 'symbol_');
        await erc721.connect(admin).deployed();

        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        for await (const id of user1Tokens) await erc721.connect(admin).mintWithTokenURI(user1.address, id, '');
        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        for await (const id of user2Tokens) await erc721.connect(admin).mintWithTokenURI(user2.address, id, '');
    };

    const approveAll = async () => {
        await erc721.connect(user1).setApprovalForAll(MasterExchange.address, true);
        await erc721.connect(user2).setApprovalForAll(MasterExchange.address, true);

        await erc20.connect(user1).approve(MasterExchange.address, toPeb(999));
        await erc20.connect(user2).approve(MasterExchange.address, toPeb(999));
        await erc20_wETH.connect(user1).approve(MasterExchange.address, toPeb(999));
        await erc20_wETH.connect(user2).approve(MasterExchange.address, toPeb(999));
    };

    const sell = async (
        user: SignerWithAddress,
        payment: string,
        targetToken: string,
        tokenId: number,
        price: BigNumber,
        amount: number,
        expirationDate: number,
    ) => {
        // @ts-ignore
        return await MasterExchange.connect(user)['sell((address,address,uint256,uint256,uint256,uint256))']({
            paymentToken: payment,
            targetToken: targetToken,
            tokenId: tokenId,
            price: price,
            amount: amount,
            expireDate: expirationDate,
        });
    };

    const sellCancel = async (
        user: SignerWithAddress,
        payment: string,
        targetToken: string,
        tokenId: number,
        price: BigNumber,
        orderIndex: number,
    ) => {
        return await MasterExchange.connect(user)[
            'cancel((bytes4,address,address,address,uint256,uint256,uint256,uint256))'
        ]({
            methodSig: sellSig,
            paymentToken: payment,
            targetToken: targetToken,
            taker: user.address,
            tokenId: tokenId,
            price: price,
            amount: 1,
            orderIndex: orderIndex,
        });
    };

    const buy = async (
        user: SignerWithAddress,
        payment: string,
        targetToken: string,
        tokenId: number,
        price: BigNumber,
        amount: number,
        expirationDate: number,
    ) => {
        // @ts-ignore
        return await MasterExchange.connect(user)['buy((address,address,uint256,uint256,uint256,uint256))']({
            paymentToken: payment,
            targetToken: targetToken,
            tokenId: tokenId,
            price: price,
            amount: amount,
            expireDate: expirationDate,
        });
    };

    const buyCancel = async (
        user: SignerWithAddress,
        payment: string,
        targetToken: string,
        tokenId: number,
        price: BigNumber,
        orderIndex: number,
    ) => {
        return await MasterExchange.connect(user)[
            'cancel((bytes4,address,address,address,uint256,uint256,uint256,uint256))'
        ]({
            methodSig: buySig,
            paymentToken: payment,
            targetToken: targetToken,
            taker: user.address,
            tokenId: tokenId,
            price: price,
            amount: 1,
            orderIndex: orderIndex,
        });
    };

    const getOrderBook = async (payment: string, targetToken: string, account: string = address0()) => {
        return await MasterViewer['getOrderBooks(address,address,address)'](payment, targetToken, account);
    };
});
