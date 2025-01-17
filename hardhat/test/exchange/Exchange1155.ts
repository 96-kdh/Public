import { BigNumber, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, upgrades } from 'hardhat';
import chai from 'chai';
import BN from 'bn.js';

import {
    MiniExchange1155,
    MasterExchange,
    ExchangeViewer,
    MiniExchangeStore1155,
    PER,
    WETH9,
    KIP37Token,
} from '../../typechain';
import PassedTime, { toPeb, address0, convertBigNumber } from './common';

const expect = chai.expect;
chai.use(require('chai-bn')(BN));

describe('Exchange1155', async () => {
    let MasterViewer: ExchangeViewer;
    let MasterExchange: MasterExchange;
    let Exchange1155: MiniExchange1155;

    let ExchangeStore1155: MiniExchangeStore1155;

    let erc20: PER;
    let erc20_wETH: WETH9;
    let erc1155: KIP37Token;

    const tokenId1 = 1;

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

        const _ExchangeStore1155 = await ethers.getContractFactory('MiniExchangeStore1155');
        ExchangeStore1155 = (await upgrades.deployProxy(_ExchangeStore1155, [MasterExchange.address], {
            initializer: 'initialize(address)',
        })) as MiniExchangeStore1155;
        await ExchangeStore1155.connect(admin).deployed;

        const _Exchange1155 = await ethers.getContractFactory('MiniExchange1155');
        Exchange1155 = (await upgrades.deployProxy(_Exchange1155, [MasterExchange.address, MasterViewer.address], {
            initializer: 'initialize(address,address)',
        })) as MiniExchange1155;
        await Exchange1155.connect(admin).deployed();

        await MasterExchange.connect(admin).resister(
            Exchange1155.address,
            ExchangeStore1155.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );

        await approveAll();

        await MasterViewer.connect(admin).resister(
            Exchange1155.address,
            ExchangeStore1155.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );
    });

    /** @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     *  Exchange1155 Test Case ( level1 )
     * @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ */
    /**
     * requirement
     * 1. sell or buy 신청으로 order, order 체결 이 가능하다.
     * 2. 같은 가격으로 sell or buy 신청을 다수 올렸을 때, 한번의 트랜잭션으로 일괄 체결 가능하다.
     * 3. 판매중 or 구매중 인 수량보다 체결자의 수량이 더 많은 경우, 자동으로 order 로 전환이 된다.
     */
    it('(erc1155) sell -> buy, buy -> sell', async () => {
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);
        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(990);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1010);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));

        await sell(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(2), 10, 0);
        await buy(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(2), 10, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(90));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(110));

        for (let i = 0; i < 5; i++) {
            await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);
        }

        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 50, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(950);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1050);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(140));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(60));

        for (let i = 0; i < 5; i++) {
            await buy(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);
        }

        await sell(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 40, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(990);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1010);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        const buyLeftOver = await getAmountByPriceERC1155(buySig, erc20_wETH.address, user1, toPeb(1));
        expect(buyLeftOver).to.equal('10');

        await sell(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 20, 0);
        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(90));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(110));

        const sellLeftOver = await getAmountByPriceERC1155(sellSig, erc20_wETH.address, user2, toPeb(1));
        expect(sellLeftOver).to.equal('10');
    });

    /**
     * requirement
     * 1. 보유자산보다 크지 않은 오더를 여러개 중첩해서 올리고, 남은 오더가 유효하지 않게 될 때 유효한 오더만 체결되고 나머지는 오퍼로 남는다.
     * ex) user1은 1000개의 erc1155를 가지고 있는데, 1000개 판매신청을 두번 올렸다. 하나의 오더가 체결되면 자동으로 남은 오더는 유효하지 오더로 판단
     */
    it('(erc1155) 다수의 오더를 합하면 보유자산보다 더 큰 경우', async () => {
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(0.01), 1000, 0);
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(0.01), 1000, 0);
        const sellAmount = await getAmountByPriceERC1155(sellSig, erc20_wETH.address, user1, toPeb(0.01));
        expect(sellAmount).to.equal('2000');

        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(0.01), 2000, 0);

        const buyLeftOver = await getAmountByPriceERC1155(buySig, erc20_wETH.address, user2, toPeb(0.01));
        expect(buyLeftOver).to.equal('1000');

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(0);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(2000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));
    });

    /**
     * requirement
     * 1. 보유자산보다 크지 않은 오더를 여러개 중첩해서 올리고, 남은 오더가 유효하지 않게 될 때 유효한 오더만 체결되고 나머지는 오퍼로 전환된다.
     * ex) user1은 100wETH 를 가지고있고, 100wETH 의 구매신청을 여러번 올렸다. 하나의 오더가 체결되어 지불수단이 없어진 경우, 나머지는 체결되지 않는다.
     */
    it('(erc20 & wETH) + (erc1155) 다수의 오더를 합하면 보유자산보다 더 큰 경우', async () => {
        await buy(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(100), 1, 0);
        await buy(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(100), 1, 0);

        const buyAmount = await getAmountByPriceERC1155(buySig, erc20_wETH.address, user1, toPeb(100));
        expect(buyAmount).to.equal('2');

        await sell(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(100), 2, 0);
        const sellLeftOver = await getAmountByPriceERC1155(sellSig, erc20_wETH.address, user2, toPeb(100));
        expect(sellLeftOver).to.equal('1');

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1001);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(999);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(0));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(200));
        /** --- wETH --- */

        await buy(user1, erc20.address, erc1155.address, tokenId1, toPeb(100), 1, 0);
        await buy(user1, erc20.address, erc1155.address, tokenId1, toPeb(100), 1, 0);

        const buyAmount2 = await getAmountByPriceERC1155(buySig, erc20.address, user1, toPeb(100));
        expect(buyAmount2).to.equal('2');

        await sell(user2, erc20.address, erc1155.address, tokenId1, toPeb(100), 2, 0);
        const sellLeftOver2 = await getAmountByPriceERC1155(sellSig, erc20.address, user2, toPeb(100));
        expect(sellLeftOver2).to.equal('1');

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1002);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(998);

        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(0));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(200));
        /** --- erc20 --- */
    });

    /**
     * requirement
     * 1. 취소된 주문은 체결되지 않는다.
     */
    it('(erc1155) sellCancel, buyCancel', async function () {
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);
        await sellCancel(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);

        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);
        await buyCancel(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));
    });

    /**
     * requirement
     * 1. fee 는 set 즉시 적용된다.
     */
    it('fee test (erc1155)', async function () {
        const { klaymint, klaymintRate, project, projectRate } = await MasterExchange.getFeeBook(erc1155.address);
        expect(klaymint).to.equal(klaymintFeeWallet.address);
        expect(klaymintRate).to.equal(0);

        expect(project).to.equal(address0());
        expect(projectRate).to.equal(0);

        await MasterExchange.connect(admin).setBaseFee(klaymintFeeWallet.address, 50); // 5%
        await MasterExchange.connect(admin).setFeeBooks(erc1155.address, projectFeeWallet.address, 100); // 10%

        const {
            klaymint: _klaymint,
            klaymintRate: _klaymintRate,
            project: _project,
            projectRate: _projectRate,
        } = await MasterExchange.getFeeBook(erc1155.address);

        expect(_klaymint).to.equal(klaymintFeeWallet.address);
        expect(_klaymintRate).to.equal(50);

        expect(_project).to.equal(projectFeeWallet.address);
        expect(_projectRate).to.equal(100);

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(10), 10, 0);
        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(10), 10, 0);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(185));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(0));
        expect(await erc20_wETH.balanceOf(klaymintFeeWallet.address)).to.equal(toPeb(5));
        expect(await erc20_wETH.balanceOf(projectFeeWallet.address)).to.equal(toPeb(10));

        await sell(user1, erc20.address, erc1155.address, tokenId1, toPeb(10), 10, 0);
        await buy(user2, erc20.address, erc1155.address, tokenId1, toPeb(10), 10, 0);

        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(185));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(0));
        expect(await erc20.balanceOf(klaymintFeeWallet.address)).to.equal(toPeb(5));
        expect(await erc20.balanceOf(projectFeeWallet.address)).to.equal(toPeb(10));
    });

    /**
     * requirement
     * 1. 구매 및 판매 목록을 정확하게 받을 수 있어야 한다. 정확하게 라는 말은 다음과 같다.
     *  i. 누구나 유효한 판매 및 구매 리스트를 볼 수 있어야한다.
     *  ii. 마이페이지에서 유효한 가능성이 있는 리스트도 볼 수 있어야한다.
     *  iii. 판매 + 구매 진행중인 tokenId를 오더리스트와 함께 배열로 받을 수 있어야 한다.
     *  iv. 만료가 되지 않았고, 내-외부 적인 요인으로 지불수단을 다시 충족한다면 판매리스트에 출력되야한다.
     *
     *  getOrderBooks() 의 3번째 파라미터 account 의 경우의 수
     *          switch (account)
     *             case1 account === address(0)  유효한 주문 + 유효할 가능성이 있는 amount 모두 리턴 (priceBooks, idBooks 에서 key 값을 삭제해도 되는지 식별)
     *             case2 account === master()    유효한 주문에 대해서만 amount 를 더해서 리턴 (오더 리스트 뽑아줄 때)
     *             case2 account === eoa         eoa의 유효한 주문 + 유효할 가능성이 있는 amount 모두 리턴 (마이페이지)
     */
    it('(erc1155) view function check', async function () {
        // mint erc1155 token Id
        const erc1155Tokens = [2, 3, 4, 5];

        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        for await (const tokenId of erc1155Tokens) {
            await erc1155.connect(admin).create(tokenId, 0, 'uri');
            await erc1155.connect(admin).mint(tokenId, user1.address, 1000);
            await erc1155.connect(admin).mint(tokenId, user2.address, 1000);
        }

        /* user1 token 1번 sell 5 개 */
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(2), 1, 0);
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(2), 1, 0);

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(3), 2, 0);
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(3), 1, 0);

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(4), 4, 0);

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(5), 5, 0);

        let book = await getOrderBook(erc20_wETH.address, erc1155.address);

        const sellInfo_tokenId_1 = book.sellOrderBook.filter((v) => +v.tokenId === +convertBigNumber(tokenId1))[0];
        expect(sellInfo_tokenId_1.tokenId).to.equal(convertBigNumber(tokenId1));

        expect(sellInfo_tokenId_1.orders[0].price).to.equal(toPeb(1));
        expect(sellInfo_tokenId_1.orders[0].amount).to.equal(1);

        expect(sellInfo_tokenId_1.orders[1].price).to.equal(toPeb(2));
        expect(sellInfo_tokenId_1.orders[1].amount).to.equal(2);

        expect(sellInfo_tokenId_1.orders[2].price).to.equal(toPeb(3));
        expect(sellInfo_tokenId_1.orders[2].amount).to.equal(3);

        expect(sellInfo_tokenId_1.orders[3].price).to.equal(toPeb(4));
        expect(sellInfo_tokenId_1.orders[3].amount).to.equal(4);

        expect(sellInfo_tokenId_1.orders[4].price).to.equal(toPeb(5));
        expect(sellInfo_tokenId_1.orders[4].amount).to.equal(5);

        /* user2 token 2번 buy 2 개 (첫번째 오더가 체결되면 두번째 오더는 유효하지 않은 오더로 차단됨) */
        await buy(user2, erc20_wETH.address, erc1155.address, 2, toPeb(10), 5, 0);
        await buy(user2, erc20_wETH.address, erc1155.address, 2, toPeb(20), 5, 0);

        book = await getOrderBook(erc20_wETH.address, erc1155.address);

        const buyInfo_tokenId_2 = book.buyOrderBook.filter((v) => +v.tokenId === 2)[0];

        expect(buyInfo_tokenId_2.tokenId).to.equal(convertBigNumber(2));

        expect(buyInfo_tokenId_2.orders[0].price).to.equal(toPeb(10));
        expect(buyInfo_tokenId_2.orders[0].amount).to.equal(5);

        expect(buyInfo_tokenId_2.orders[1].price).to.equal(toPeb(20));
        expect(buyInfo_tokenId_2.orders[1].amount).to.equal(5);

        /* user1, user2 가 올려놓은 10wETH(구매희망) 를 1개 판매, (user2 의 두번째 buy 오더가 유효하지 않은 오더로 전환된다.) */
        await sell(user1, erc20_wETH.address, erc1155.address, 2, toPeb(10), 1, 0);

        // address(0) 를 넣은 주문은 validation check 없는 주문
        book = await getOrderBook(erc20_wETH.address, erc1155.address);

        const _buyInfo_tokenId_2 = book.buyOrderBook.filter((v) => +v.tokenId === 2)[0];

        expect(_buyInfo_tokenId_2.tokenId).to.equal(convertBigNumber(2));

        expect(_buyInfo_tokenId_2.orders[0].price).to.equal(toPeb(10));
        expect(_buyInfo_tokenId_2.orders[0].amount).to.equal(4);

        expect(_buyInfo_tokenId_2.orders.length).to.equal(2);
        expect(_buyInfo_tokenId_2.orders[1].price).to.equal(toPeb(20));
        expect(_buyInfo_tokenId_2.orders[1].amount).to.equal(5);

        // MasterExchange.address 를 넣은 주문은 validation check 를 하여, 거래가능한 amount 를 리턴한다.(price 는 그대로)
        let validateBook = await getOrderBook(erc20_wETH.address, erc1155.address, MasterExchange.address);

        const __buyInfo_tokenId_2 = validateBook.buyOrderBook.filter((v) => +v.tokenId === 2)[0];

        expect(__buyInfo_tokenId_2.orders.length).to.equal(2);
        expect(__buyInfo_tokenId_2.orders[1].price).to.equal(toPeb(20));
        expect(__buyInfo_tokenId_2.orders[1].amount).to.equal(0);

        /* user2 의 마이페이지 진입상황, 유효한 주문 + 유효할 가능성 주문 이 모두 나와야함 */
        const user2OrderBook = await getOrderBook(erc20_wETH.address, erc1155.address, user2.address);

        const user2_buyOrder = user2OrderBook.buyOrderBook.filter((v) => +v.tokenId === 2)[0];

        expect(user2_buyOrder.orders.length).to.equal(2);
        expect(user2_buyOrder.orders[1].price).to.equal(toPeb(20));
        expect(user2_buyOrder.orders[1].amount).to.equal(5);

        /* (내-외부적 요인으로) user2 의 지불수단이 갖춰짐 */
        await erc20_wETH.connect(user2).deposit({ value: toPeb(100) });

        validateBook = await getOrderBook(erc20_wETH.address, erc1155.address, MasterExchange.address);

        const ___buyInfo_tokenId_2 = validateBook.buyOrderBook.filter((v) => +v.tokenId === 2)[0];

        expect(___buyInfo_tokenId_2.orders.length).to.equal(2);
        expect(___buyInfo_tokenId_2.orders[1].price).to.equal(toPeb(20));
        expect(___buyInfo_tokenId_2.orders[1].amount).to.equal(5); // user2 의 지불수단이 갖춰졌기 때문에, validateBook 에도 수량 표시가 되야함

        await buyCancel(user2, erc20_wETH.address, erc1155.address, 2, toPeb(10), 4, 0);

        validateBook = await getOrderBook(erc20_wETH.address, erc1155.address, MasterExchange.address);

        const cancelTest_tokenId_2 = validateBook.buyOrderBook.filter((v) => +v.tokenId === 2)[0];

        expect(cancelTest_tokenId_2.orders.length).to.equal(1);
        expect(cancelTest_tokenId_2.orders[0].price).to.equal(toPeb(20));
        expect(cancelTest_tokenId_2.orders[0].amount).to.equal(5);

        await buyCancel(user2, erc20_wETH.address, erc1155.address, 2, toPeb(20), 5, 0);

        validateBook = await getOrderBook(erc20_wETH.address, erc1155.address, MasterExchange.address);

        const _cancelTest_tokenId_2 = validateBook.buyOrderBook.filter((v) => +v.tokenId === 2);

        expect(_cancelTest_tokenId_2.length).to.equal(0);

        // console.log('sellOrderBook : ', book.sellOrderBook);
        // console.log('buyOrderBook : ', book.buyOrderBook);
        //
        // console.log('validateBook sellOrderBook : ', validateBook.sellOrderBook);
        // console.log('validateBook buyOrderBook : ', validateBook.buyOrderBook);
    });

    /** @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     * Exchange1155 거래 관련 테스트 (level 2)
     * @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ */

    it('limit buy or sell trading Test', async function () {
        // # user1 sellOffer 1 ETH, 1 Amount (개당 1 eth) x(limit) 반복
        const limit = 1; // 100 보다 작거나 같은 값으로

        for (let i = 0; i < limit; i++) {
            await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        }

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);

        const { turnIndex, endIndex } = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        for (let i = +turnIndex; i < +endIndex; i++) {
            // 실제 출력할때는 하나의 오더로 보여지겠지만, 펼쳐서 각각 보는 방식
            const { amount, maker, expireTime } = await ExchangeStore1155.getOrder(
                sellSig,
                erc20_wETH.address,
                erc1155.address,
                tokenId1,
                toPeb(1),
                i,
            );

            expect(amount).to.equal(1);
            expect(maker).to.equal(user1.address);
            expect(expireTime).to.equal(BigNumber.from(2).pow(256).sub(1));
        }

        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), limit, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000 - limit);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000 + limit);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100 + limit));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100 - limit));

        const { turnIndex: afterTurnIndex, endIndex: afterEndIndex } = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(afterTurnIndex).to.equal(limit);
        expect(afterEndIndex).to.equal(limit);
        expect(afterEndIndex).to.equal(afterTurnIndex);

        const { amount } = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            afterEndIndex,
        );

        expect(amount).to.equal(0);

        // # user1 buyOffer 1 ETH, 1 Amount (개당 1 eth) x(limit) 반복
        for (let i = 0; i < limit; i++) {
            await buy(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        }

        const { turnIndex: buyTurnIndex, endIndex: buyEndIndex } = await ExchangeStore1155.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        for (let i = +buyTurnIndex; i < +buyEndIndex; i++) {
            // 실제 출력할때는 하나의 오더로 보여지겠지만, 펼쳐서 각각 보는 방식
            const { amount, maker, expireTime } = await ExchangeStore1155.getOrder(
                buySig,
                erc20_wETH.address,
                erc1155.address,
                tokenId1,
                toPeb(1),
                i,
            );

            expect(amount).to.equal(1);
            expect(maker).to.equal(user1.address);
            expect(expireTime).to.equal(BigNumber.from(2).pow(256).sub(1));
        }

        await sell(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), limit, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        const { turnIndex: afterBuyTurnIndex, endIndex: afterBuyEndIndex } = await ExchangeStore1155.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(afterBuyTurnIndex).to.equal(limit);
        expect(afterBuyEndIndex).to.equal(limit);
        expect(afterBuyTurnIndex).to.equal(afterBuyEndIndex);

        const { amount: buyAmount } = await ExchangeStore1155.getOrder(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            afterBuyEndIndex,
        );

        expect(buyAmount).to.equal(0);
    });

    it('Remaining Offer Conversion Test (남은 수량 오퍼 전환 테스트)', async function () {
        // # user1 sellOffer 10 Amount (개당 1 eth) x2
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);

        let indexes = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(0);
        expect(indexes.endIndex).to.equal(2);

        // user2 buy 20 & buyOffer 10 ETH, 30 Amount (개당 1 eth)
        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 30, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(980);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1020);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(120));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(80));

        indexes = await ExchangeStore1155.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(0);
        expect(indexes.endIndex).to.equal(1);

        indexes = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(2);
        expect(indexes.endIndex).to.equal(2);

        const orderBook = await getOrderBook(erc20_wETH.address, erc1155.address, MasterExchange.address);

        expect(orderBook.sellOrderBook.length).to.equal(0);
        expect(orderBook.buyOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBook.buyOrderBook[0].orders[0].amount).to.equal(10);

        // # user1 sell 3a && sell 5a, sell 10a && sellCancel 8a (개당 1 eth)
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 3, 0);
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 5, 0);
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(970);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1030);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(130));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(70));

        indexes = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        // 2, 2 값에서 -> sell 3 번의 신청중 2번은 match 마지막에 add Order 가 들어갔으니 2, 3
        expect(indexes.turnIndex).to.equal(2); // 여기에 아직 체결되지 못한 8개 amount 들어있음
        expect(indexes.endIndex).to.equal(3);

        let sellOrder = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            indexes.turnIndex,
        );
        expect(sellOrder.amount).to.equal(8);

        indexes = await ExchangeStore1155.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(1);
        expect(indexes.endIndex).to.equal(1);

        // user1 (8개), + user1 62개 add Order
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 62, 0);

        indexes = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(2);
        expect(indexes.endIndex).to.equal(4);

        sellOrder = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            indexes.turnIndex,
        );
        expect(sellOrder.amount).to.equal(8);

        sellOrder = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            3,
        );
        expect(sellOrder.amount).to.equal(62);

        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 70, 0);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(900);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1100);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(200));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(0));

        indexes = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(4);
        expect(indexes.endIndex).to.equal(4);

        sellOrder = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            indexes.turnIndex,
        );
        expect(sellOrder.amount).to.equal(0);
    });

    it.skip('expireTime Test', async function () {
        /** 시작 시간, 1월 1일 00시 00분 */
        // sell expiration 1 day
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 1);

        let indexes = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(0);
        expect(indexes.endIndex).to.equal(1);

        // pass time 1day
        await PassedTime.passTimes(86401);
        /** (passed 86401 second) 1월 2일 약 00시 00분 */
        // 구매 시도 (expiration 1 day),
        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 1);

        // 만료된 판매신청, 아무일도 일어나지 않았음
        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        indexes = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(1); // index 는 차례가 지나가 증가하면서, 0번 인덱스에 대한 주문 만료
        expect(indexes.endIndex).to.equal(1);

        const sellOrder = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            0,
        );
        expect(sellOrder.amount).to.equal(10); // 만료된 주문이지만, check

        indexes = await ExchangeStore1155.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(indexes.turnIndex).to.equal(0);
        expect(indexes.endIndex).to.equal(1);

        const buyOrder = await ExchangeStore1155.getOrder(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            indexes.turnIndex,
        );
        expect(buyOrder.amount).to.equal(10);

        // pass time 12h
        await PassedTime.passTimes(43200);
        /** (passed 43200 second) 1월 2일 약 12시 00분 */
        // 판매 시도 (expiration 1 day), 5개만
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 5, 1);

        indexes = await ExchangeStore1155.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        // 인덱스 그대로, 아직 5개 남았음
        expect(indexes.turnIndex).to.equal(0);
        expect(indexes.endIndex).to.equal(1);

        // 판매완료
        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(995);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1005);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(105));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(95));

        const _buyOrder = await ExchangeStore1155.getOrder(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            indexes.turnIndex,
        );
        expect(_buyOrder.amount).to.equal(5);

        // pass time 12h 1m
        await PassedTime.passTimes(43260);
        /** (passed 43200 second) 1월 3일 약 00시 01분 */
        // 판매 시도 (expiration 1 day), -> 앞선 buy order 기간 만료로 아무일도 일어나지 않음
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 1);

        // 만료된 구매신청, 아무일도 일어나지 않았음
        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(995);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1005);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(105));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(95));

        await sellCancel(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 10, 1);

        const orderBooks = await getOrderBook(erc20_wETH.address, erc1155.address, MasterExchange.address);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);
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
        const _ERC1155 = await ethers.getContractFactory('KIP37Token');
        erc1155 = await _ERC1155.connect(admin).deploy('name_', 'symbol_');
        await erc1155.connect(admin).deployed();

        await erc1155.connect(admin).create(tokenId1, 0, 'uri');

        await erc1155.connect(admin).mint(tokenId1, user1.address, 1000);
        await erc1155.connect(admin).mint(tokenId1, user2.address, 1000);
    };

    const approveAll = async () => {
        await erc1155.connect(user1).setApprovalForAll(MasterExchange.address, true);
        await erc1155.connect(user2).setApprovalForAll(MasterExchange.address, true);

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
        amount: number,
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
            amount: amount,
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
        amount: number,
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
            amount: amount,
            orderIndex: orderIndex,
        });
    };

    const getAmountByPriceERC1155 = async (
        sig: string,
        payment: string,
        user: SignerWithAddress,
        price: BigNumber,
    ): Promise<BigNumber> => {
        if (sig === sellSig) {
            const order = await MasterViewer.getAmountByPrice(
                sellSig,
                payment,
                erc1155.address,
                tokenId1,
                price,
                user.address,
            );

            return order.amount;
        } else {
            const order = await MasterViewer.getAmountByPrice(
                buySig,
                payment,
                erc1155.address,
                tokenId1,
                price,
                user.address,
            );
            return order.amount;
        }
    };

    const getOrderBook = async (payment: string, targetToken: string, account: string = address0()) => {
        return await MasterViewer['getOrderBooks(address,address,address)'](payment, targetToken, account);
    };
});
