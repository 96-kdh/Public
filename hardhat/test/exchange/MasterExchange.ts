import { ethers, upgrades } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BN from 'bn.js';
import * as chai from 'chai';

import {
    MiniExchange721,
    MiniExchange1155,
    MasterExchange,
    ExchangeViewer,
    WETH9,
    KIP37Token,
    KIP17Token,
    MiniExchangeStore1155,
    MiniExchangeStore721,
    PER,
} from '../../typechain';
import PassedTime, { toPeb, address0 } from './common';

const expect = chai.expect;
chai.use(require('chai-bn')(BN));

describe('MasterExchange', function () {
    let MasterViewer: ExchangeViewer;
    let MasterExchange: MasterExchange;

    let Exchange721: MiniExchange721;
    let ExchangeStore721: MiniExchangeStore721;
    let Exchange1155: MiniExchange1155;
    let ExchangeStore1155: MiniExchangeStore1155;

    let erc20: PER;
    let erc20_wETH: WETH9;
    let erc1155: KIP37Token;
    let erc721: KIP17Token;

    const tokenId1 = 1;

    const user1Tokens = [1, 2, 3];
    const user2Tokens = [4, 5, 6];

    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    let klaymintFeeWallet: SignerWithAddress;
    let projectFeeWallet: SignerWithAddress;

    const sellSig: string = '0x0f3cba00';
    const buySig: string = '0xb9f5a720';

    const maxUint = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

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

        await MasterViewerDeploy();
        await MasterExchangeDeploy();
        await MiniExchange721Deploy();
        await MiniExchange1155Deploy();
        await MiniExchangeStore721Deploy();
        await MiniExchangeStore1155Deploy();

        await MasterExchange.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );

        await approveAll();

        await MasterViewer.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );
    });

    /** @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     *     MasterExchange Test Case
     * @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ */
    it('init check balance', async () => {
        // init user balance check
        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);
        expect(await erc20.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20.balanceOf(user2.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));
        expect(await erc721.balanceOf(user2.address)).to.equal(3);
        expect(await erc721.balanceOf(user1.address)).to.equal(3);
    });

    /**
     * requirement
     * 1. 모든 owner 는 admin.address 와 같아야함
     * 2. exchangeContract(721,1155) 의 master 는 masterExchange.address 와 같아야함
     * 3. upgrade 를 진행하더라도 1,2 번은 동일, address 또한 유지
     */
    it('owner & master & child check', async () => {
        await ownerCheck();

        const IExchange721 = await ethers.getContractFactory('MiniExchange721');
        const newProxy721 = (await upgrades.upgradeProxy(Exchange721.address, IExchange721)) as MiniExchange721;

        const IExchange1155 = await ethers.getContractFactory('MiniExchange1155');
        const newProxy1155 = (await upgrades.upgradeProxy(Exchange1155.address, IExchange1155)) as MiniExchange1155;

        expect(newProxy721.address).to.equal(Exchange721.address);
        expect(newProxy1155.address).to.equal(Exchange1155.address);

        Exchange721 = newProxy721;
        Exchange1155 = newProxy1155;

        await ownerCheck();

        /* user function test */
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20_wETH.address, erc721.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20.address, erc721.address, tokenId1, toPeb(1), 1, 0);
    });

    /**
     * requirement
     * 1. master 또는 child 를 재배포 하여도 정상적인 master, child 관계가 유지되야한다.
     * 2. 위와 동일한 상황에서도, 즉시 sell, buy 기능이용이 가능하다.
     */
    it('new deploy & deResister & resister check', async () => {
        // exchange721(child), exchange1155(child), 를 재배포하고 연결하기
        /* new 721 exchange deploy */
        const NEW_Exchange721 = await ethers.getContractFactory('MiniExchange721');
        const new_Exchange721 = (await upgrades.deployProxy(
            NEW_Exchange721,
            [MasterExchange.address, MasterViewer.address],
            {
                initializer: 'initialize(address,address)',
            },
        )) as MiniExchange721;
        await new_Exchange721.connect(admin).deployed();

        /* deResister old exchange 721 */
        await MasterExchange.connect(admin).deResister(Exchange721.address);
        expect(await Exchange721.master()).to.equal(address0());
        // expect(await MasterExchange.emitter(Exchange721.address)).to.equal(false); // emitter private
        // expect(await MasterExchange.ex721()).to.equal(address0()); // private

        /* resister new exchange 721 */
        await MasterExchange.connect(admin).resister(
            new_Exchange721.address,
            ExchangeStore721.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );

        Exchange721 = new_Exchange721;
        await ownerCheck();

        /* new 1155 exchange deploy */
        const NEW_Exchange1155 = await ethers.getContractFactory('MiniExchange1155');
        const new_Exchange1155 = (await upgrades.deployProxy(
            NEW_Exchange1155,
            [MasterExchange.address, MasterViewer.address],
            {
                initializer: 'initialize(address,address)',
            },
        )) as MiniExchange1155;
        await new_Exchange1155.connect(admin).deployed();

        /* deResister old exchange 1155 */
        await MasterExchange.connect(admin).deResister(Exchange1155.address);
        expect(await Exchange1155.master()).to.equal(address0());
        // expect(await MasterExchange.emitter(Exchange1155.address)).to.equal(false); // emitter private
        // expect(await MasterExchange.ex1155()).to.equal(address0()); // private

        /* resister new exchange 1155 */
        await MasterExchange.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            new_Exchange1155.address,
            ExchangeStore1155.address,
        );
        Exchange1155 = new_Exchange1155;
        await ownerCheck();

        /* user function test */ /* -> master exchange 의 주소로 approve, child exchange 를 재배포 해도 approve 를 다시 하지 않아도됨 */
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20_wETH.address, erc721.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20.address, erc721.address, tokenId1, toPeb(1), 1, 0);

        /* new masterExchange deploy */
        const NEW_MasterExchange = await ethers.getContractFactory('MasterExchange');
        const new_MasterExchange = (await upgrades.deployProxy(
            NEW_MasterExchange,
            [klaymintFeeWallet.address, 0, MasterViewer.address],
            {
                initializer: 'initialize(address,uint16,address)',
            },
        )) as MasterExchange;
        await new_MasterExchange.connect(admin).deployed();

        /* transferMastership in MasterRole */
        await MasterExchange.connect(admin).migration(new_MasterExchange.address);
        await new_MasterExchange
            .connect(admin)
            .resister(Exchange721.address, ExchangeStore721.address, Exchange1155.address, ExchangeStore1155.address);
        MasterExchange = new_MasterExchange;

        // new MasterExchange approve
        await approveAll();
        await ownerCheck();

        /* user function test */
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20_wETH.address, erc721.address, tokenId1, toPeb(1), 1, 0);
        await sell(user1, erc20.address, erc721.address, tokenId1, toPeb(1), 1, 0);
    });

    describe('(erc721) new deploy (except MiniStore)', function () {
        let payment: string;
        let target: string;

        let MasterExchangeAddress: string;
        let ViewerExchangeAddress: string;
        let MiniExchange721Address: string;
        let MiniExchange1155Address: string;

        beforeEach(async () => {
            payment = erc20.address;
            target = erc721.address;

            MasterExchangeAddress = MasterExchange.address;
            ViewerExchangeAddress = MasterViewer.address;
            MiniExchange721Address = Exchange721.address;
            MiniExchange1155Address = Exchange1155.address;

            // tokenId 1,2,3 각각 다른 가격에 sell order
            await sell(user1, payment, target, user1Tokens[0], toPeb(user1Tokens[0]), 1, 1);
            await sell(user1, payment, target, user1Tokens[1], toPeb(user1Tokens[1]), 1, 1);
            await sell(user1, payment, target, user1Tokens[2], toPeb(user1Tokens[2]), 1, 1);

            // 판매가 보다 낮은 가격에 1,2,3 buy order (user2)
            await buy(user2, payment, target, user1Tokens[0], toPeb(user1Tokens[0] - 0.5), 1, 1);
            await buy(user2, payment, target, user1Tokens[1], toPeb(user1Tokens[1] - 0.5), 1, 1);
            await buy(user2, payment, target, user1Tokens[2], toPeb(user1Tokens[2] - 0.5), 1, 1);

            // 판매가 보다 낮은 가격에 1,2,3 buy order (user1) - 판매자와 다른 사람이라고 가정
            await buy(user1, payment, target, user1Tokens[0], toPeb(user1Tokens[0] - 0.5), 1, 1);
            await buy(user1, payment, target, user1Tokens[1], toPeb(user1Tokens[1] - 0.5), 1, 1);
            await buy(user1, payment, target, user1Tokens[2], toPeb(user1Tokens[2] - 0.5), 1, 1);

            // tokenId 4,5,6 각각 다른 가격에 sell order
            await sell(user2, payment, target, user2Tokens[0], toPeb(user2Tokens[0]), 1, 1);
            await sell(user2, payment, target, user2Tokens[1], toPeb(user2Tokens[1]), 1, 1);
            await sell(user2, payment, target, user2Tokens[2], toPeb(user2Tokens[2]), 1, 1);

            // 판매가 보다 낮은 가격에 4,5,6 buy order (user2)
            await buy(user2, payment, target, user2Tokens[0], toPeb(user2Tokens[0] - 0.5), 1, 1);
            await buy(user2, payment, target, user2Tokens[1], toPeb(user2Tokens[1] - 0.5), 1, 1);
            await buy(user2, payment, target, user2Tokens[2], toPeb(user2Tokens[2] - 0.5), 1, 1);

            // 판매가 보다 낮은 가격에 4,5,6 buy order (user1) - 판매자와 다른 사람이라고 가정
            await buy(user1, payment, target, user2Tokens[0], toPeb(user2Tokens[0] - 0.5), 1, 1);
            await buy(user1, payment, target, user2Tokens[1], toPeb(user2Tokens[1] - 0.5), 1, 1);
            await buy(user1, payment, target, user2Tokens[2], toPeb(user2Tokens[2] - 0.5), 1, 1);

            await orderBookChecker(); // 오더북 확인 함수
        });

        it('Deploy MiniExchange ', async function () {
            // MiniExchange 컨트랙 재배포 후, storage 유지 되는지 테스트
            const newMiniExchange721Address = await MiniExchange721Deploy();
            const newMiniExchange1155Address = await MiniExchange1155Deploy();

            await MasterExchange.connect(admin).deResister(MiniExchange721Address);
            await MasterExchange.connect(admin).deResister(MiniExchange1155Address);

            await MasterExchange.connect(admin).resister(
                newMiniExchange721Address,
                ExchangeStore721.address,
                newMiniExchange1155Address,
                ExchangeStore1155.address,
            );

            await MasterViewer.connect(admin).resister(
                newMiniExchange721Address,
                ExchangeStore721.address,
                newMiniExchange1155Address,
                ExchangeStore1155.address,
            );

            await orderBookChecker(); // 오더북 확인 함수
        });

        it('Deploy MasterExchange', async function () {
            // MasterExchange 컨트랙 재배포 후, storage 유지 되는지 테스트
            const newMasterExchangeAddress = await MasterExchangeDeploy();

            const _MasterExchange = await ethers.getContractFactory('MasterExchange');

            // oldMasterExhcange
            await _MasterExchange.attach(MasterExchangeAddress).connect(admin).migration(newMasterExchangeAddress);

            // newMasterExchange
            await MasterExchange.connect(admin).resister(
                Exchange721.address,
                ExchangeStore721.address,
                Exchange1155.address,
                ExchangeStore1155.address,
            );

            await approveAll(); // MasterExchange 가 변경되면, 유효한 모든 오더가 유효할 가능성이 있는 오더로 변한다.

            await orderBookChecker();

            // MiniExchange 컨트랙 재배포 후, storage 유지 되는지 테스트
            const newMiniExchange721Address = await MiniExchange721Deploy();
            const newMiniExchange1155Address = await MiniExchange1155Deploy();

            await MasterExchange.connect(admin).deResister(MiniExchange721Address);

            await MasterExchange.connect(admin).resister(
                newMiniExchange721Address,
                ExchangeStore721.address,
                newMiniExchange1155Address,
                ExchangeStore1155.address,
            );

            await MasterViewer.connect(admin).resister(
                newMiniExchange721Address,
                ExchangeStore721.address,
                newMiniExchange1155Address,
                ExchangeStore1155.address,
            );

            await orderBookChecker(); // 오더북 확인 함수
        });

        it('Deploy ViewerExchange', async function () {
            // ViewerExchange 컨트랙 재배포 후, storage 유지 되는지 테스트
            const newViewerExchangeAddress = await MasterViewerDeploy();

            await MasterExchange.connect(admin)['setViewer(address)'](newViewerExchangeAddress);

            await MasterExchange.connect(admin)['setViewer(address,address)'](
                newViewerExchangeAddress,
                Exchange721.address,
            );
            await MasterExchange.connect(admin)['setViewer(address,address)'](
                newViewerExchangeAddress,
                Exchange1155.address,
            );

            await MasterViewer.connect(admin).resister(
                Exchange721.address,
                ExchangeStore721.address,
                Exchange1155.address,
                ExchangeStore1155.address,
            );

            await orderBookChecker();
        });

        async function orderBookChecker() {
            const orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // group by tokenId
            expect(orderBooks.sellOrderBook.length).to.equal(6); // 즉 length => 6
            expect(orderBooks.buyOrderBook.length).to.equal(6); // 즉 length => 6

            // group by tokenId
            for (let i = 1; i <= orderBooks.sellOrderBook.length; i++) {
                expect(orderBooks.sellOrderBook[i - 1].tokenId).to.equal(i);

                expect(orderBooks.sellOrderBook[i - 1].orders.length).to.equal(1);
                // group by price (그러나 오직 erc721 sell case 는 length 가 무조건 1 이하일 수 밖에 없음, 덮어쓰기 개념)
                for (let j = 0; j < orderBooks.sellOrderBook[i - 1].orders.length; j++) {
                    expect(orderBooks.sellOrderBook[i - 1].orders[j].price).to.equal(toPeb(i)); // sell price 는 tokenId 랑 일치 시킴
                    expect(orderBooks.sellOrderBook[i - 1].orders[j].amount).to.equal(1);

                    expect(orderBooks.sellOrderBook[i - 1].orders[j].order.length).to.equal(1);

                    expect(orderBooks.sellOrderBook[i - 1].orders[j].order[0].orderIndex).to.equal(0);
                    expect(orderBooks.sellOrderBook[i - 1].orders[j].order[0].amount).to.equal(1);
                    await expireTimeCheck(orderBooks.sellOrderBook[i - 1].orders[j].order[0].expireTime, 1);

                    if (i <= 3)
                        expect(orderBooks.sellOrderBook[i - 1].orders[j].order[0].maker).to.equal(user1.address);
                    else expect(orderBooks.sellOrderBook[i - 1].orders[j].order[0].maker).to.equal(user2.address);
                }
            }

            // group by tokenId
            for (let i = 1; i <= orderBooks.buyOrderBook.length; i++) {
                expect(orderBooks.buyOrderBook[i - 1].tokenId).to.equal(i);

                expect(orderBooks.buyOrderBook[i - 1].orders.length).to.equal(1); //  group by price
                // group by price
                for (let j = 0; j < orderBooks.buyOrderBook[i - 1].orders.length; j++) {
                    expect(orderBooks.buyOrderBook[i - 1].orders[j].price).to.equal(toPeb(i - 0.5)); // sell price 는 (tokenId - 0.5) 랑 일치 시킴
                    expect(orderBooks.buyOrderBook[i - 1].orders[j].amount).to.equal(1);

                    // 유효한 오더 개수 (위에서 같은 가격으로 서로 다른 사람이 구매 신청을 했음)
                    expect(orderBooks.buyOrderBook[i - 1].orders[j].order.length).to.equal(2);
                    for (let l = 0; l < orderBooks.buyOrderBook[i - 1].orders[j].order.length; l++) {
                        expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].amount).to.equal(1);
                        expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].orderIndex).to.equal(l);

                        await expireTimeCheck(orderBooks.buyOrderBook[i - 1].orders[j].order[l].expireTime, 1);

                        if (l === 0)
                            expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].maker).to.equal(user2.address);
                        else expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].maker).to.equal(user1.address);
                    }
                }
            }
        }
    });

    describe('(erc1155) new deploy (except MiniStore)', function () {
        let payment: string;
        let target: string;

        const tokenId2 = 2;

        let MasterExchangeAddress: string;
        let ViewerExchangeAddress: string;
        let MiniExchange721Address: string;
        let MiniExchange1155Address: string;

        beforeEach(async () => {
            await erc1155.connect(admin).create(tokenId2, 0, 'uri');
            await erc1155.connect(admin).mint(tokenId2, user1.address, 1000);
            await erc1155.connect(admin).mint(tokenId2, user2.address, 1000);

            payment = erc20_wETH.address;
            target = erc1155.address;

            MasterExchangeAddress = MasterExchange.address;
            ViewerExchangeAddress = MasterViewer.address;
            MiniExchange721Address = Exchange721.address;
            MiniExchange1155Address = Exchange1155.address;

            // tokenId 1,2 각각 다른 가격에 sell order (user1) 두번씩
            await sell(user1, payment, target, tokenId1, toPeb(tokenId1), tokenId1, 1);
            await sell(user1, payment, target, tokenId1, toPeb(tokenId1), tokenId1, 1);
            await sell(user1, payment, target, tokenId2, toPeb(tokenId2), tokenId2, 1);
            await sell(user1, payment, target, tokenId2, toPeb(tokenId2), tokenId2, 1);
            // 두배 가격으로 한번 더
            await sell(user1, payment, target, tokenId1, toPeb(tokenId1 * 2), tokenId1, 1);
            await sell(user1, payment, target, tokenId1, toPeb(tokenId1 * 2), tokenId1, 1);
            await sell(user1, payment, target, tokenId2, toPeb(tokenId2 * 2), tokenId2, 1);
            await sell(user1, payment, target, tokenId2, toPeb(tokenId2 * 2), tokenId2, 1);

            // tokenId 1,2 각각 다른 가격에 sell order (user2) 두번씩
            await sell(user2, payment, target, tokenId1, toPeb(tokenId1), tokenId1, 1);
            await sell(user2, payment, target, tokenId1, toPeb(tokenId1), tokenId1, 1);
            await sell(user2, payment, target, tokenId2, toPeb(tokenId2), tokenId2, 1);
            await sell(user2, payment, target, tokenId2, toPeb(tokenId2), tokenId2, 1);
            // 두배 가격으로 한번 더
            await sell(user2, payment, target, tokenId1, toPeb(tokenId1 * 2), tokenId1, 1);
            await sell(user2, payment, target, tokenId1, toPeb(tokenId1 * 2), tokenId1, 1);
            await sell(user2, payment, target, tokenId2, toPeb(tokenId2 * 2), tokenId2, 1);
            await sell(user2, payment, target, tokenId2, toPeb(tokenId2 * 2), tokenId2, 1);

            // 판매가 보다 낮은 가격에 1,2 buy order (user1) - 판매자와 다른 사람이라고 가정, 두번씩
            await buy(user1, payment, target, tokenId1, toPeb(tokenId1 - 0.5), tokenId1, 1);
            await buy(user1, payment, target, tokenId1, toPeb(tokenId1 - 0.5), tokenId1, 1);
            await buy(user1, payment, target, tokenId2, toPeb(tokenId2 - 0.5), tokenId2, 1);
            await buy(user1, payment, target, tokenId2, toPeb(tokenId2 - 0.5), tokenId2, 1);

            // 판매가 보다 낮은 가격에 1,2 buy order (user2) - 판매자와 다른 사람이라고 가정, 두번씩
            await buy(user2, payment, target, tokenId1, toPeb(tokenId1 - 0.5), tokenId1, 1);
            await buy(user2, payment, target, tokenId1, toPeb(tokenId1 - 0.5), tokenId1, 1);
            await buy(user2, payment, target, tokenId2, toPeb(tokenId2 - 0.5), tokenId2, 1);
            await buy(user2, payment, target, tokenId2, toPeb(tokenId2 - 0.5), tokenId2, 1);

            await orderBookChecker(); // 오더북 확인 함수
        });

        it('Deploy MiniExchange ', async function () {
            // MiniExchange 컨트랙 재배포 후, storage 유지 되는지 테스트
            const newMiniExchange721Address = await MiniExchange721Deploy();
            const newMiniExchange1155Address = await MiniExchange1155Deploy();

            await MasterExchange.connect(admin).deResister(MiniExchange721Address);
            await MasterExchange.connect(admin).deResister(MiniExchange1155Address);

            await MasterExchange.connect(admin).resister(
                newMiniExchange721Address,
                ExchangeStore721.address,
                newMiniExchange1155Address,
                ExchangeStore1155.address,
            );

            await MasterViewer.connect(admin).resister(
                newMiniExchange721Address,
                ExchangeStore721.address,
                newMiniExchange1155Address,
                ExchangeStore1155.address,
            );

            await orderBookChecker(); // 오더북 확인 함수
        });

        it('Deploy MasterExchange', async function () {
            // MasterExchange 컨트랙 재배포 후, storage 유지 되는지 테스트
            const newMasterExchangeAddress = await MasterExchangeDeploy();

            const _MasterExchange = await ethers.getContractFactory('MasterExchange');

            // oldMasterExhcange
            await _MasterExchange.attach(MasterExchangeAddress).connect(admin).migration(newMasterExchangeAddress);

            // newMasterExchange
            await MasterExchange.connect(admin).resister(
                Exchange721.address,
                ExchangeStore721.address,
                Exchange1155.address,
                ExchangeStore1155.address,
            );

            await approveAll(); // MasterExchange 가 변경되면, 유효한 모든 오더가 유효할 가능성이 있는 오더로 변한다.

            await orderBookChecker();
        });

        it('Deploy ViewerExchange', async function () {
            // ViewerExchange 컨트랙 재배포 후, storage 유지 되는지 테스트
            const newViewerExchangeAddress = await MasterViewerDeploy();

            await MasterExchange.connect(admin)['setViewer(address)'](newViewerExchangeAddress);

            await MasterExchange.connect(admin)['setViewer(address,address)'](
                newViewerExchangeAddress,
                Exchange721.address,
            );
            await MasterExchange.connect(admin)['setViewer(address,address)'](
                newViewerExchangeAddress,
                Exchange1155.address,
            );

            await MasterViewer.connect(admin).resister(
                Exchange721.address,
                ExchangeStore721.address,
                Exchange1155.address,
                ExchangeStore1155.address,
            );

            await orderBookChecker();
        });

        async function orderBookChecker() {
            const orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // group by tokenId
            expect(orderBooks.sellOrderBook.length).to.equal(2); // 즉 length => 2
            expect(orderBooks.buyOrderBook.length).to.equal(2); // 즉 length => 2

            // group by tokenId
            for (let i = 1; i <= orderBooks.sellOrderBook.length; i++) {
                expect(orderBooks.sellOrderBook[i - 1].tokenId).to.equal(i);

                expect(orderBooks.sellOrderBook[i - 1].orders.length).to.equal(2); // 서로 다른 price 개수 , (두배 가격으로 한번 더 했으니)
                for (let j = 0; j < orderBooks.sellOrderBook[i - 1].orders.length; j++) {
                    expect(orderBooks.sellOrderBook[i - 1].orders[j].price).to.equal(toPeb(i * (j + 1))); // sell price 는 tokenId 랑 일치 시킴
                    expect(orderBooks.sellOrderBook[i - 1].orders[j].amount).to.equal(i * 4); // 같은 가격으로 총 네번 오더 넣었으니 *4

                    expect(orderBooks.sellOrderBook[i - 1].orders[j].order.length).to.equal(4); // 두명의 사용자가 같은 가격으로는 두번씩 넣었으니 4
                    for (let l = 0; l < orderBooks.sellOrderBook[i - 1].orders[j].order.length; l++) {
                        expect(orderBooks.sellOrderBook[i - 1].orders[j].order[l].orderIndex).to.equal(l);
                        expect(orderBooks.sellOrderBook[i - 1].orders[j].order[l].amount).to.equal(i);
                        await expireTimeCheck(orderBooks.sellOrderBook[i - 1].orders[j].order[l].expireTime, 1);

                        if (l < 2)
                            expect(orderBooks.sellOrderBook[i - 1].orders[j].order[l].maker).to.equal(user1.address);
                        else expect(orderBooks.sellOrderBook[i - 1].orders[j].order[l].maker).to.equal(user2.address);
                    }
                }
            }

            // group by tokenId
            for (let i = 1; i <= orderBooks.buyOrderBook.length; i++) {
                expect(orderBooks.buyOrderBook[i - 1].tokenId).to.equal(i);

                expect(orderBooks.buyOrderBook[i - 1].orders.length).to.equal(1); // 서로 다른 price 개수
                for (let j = 0; j < orderBooks.buyOrderBook[i - 1].orders.length; j++) {
                    expect(orderBooks.buyOrderBook[i - 1].orders[j].price).to.equal(toPeb(i - 0.5)); // sell price 는 tokenId 랑 일치 시킴
                    expect(orderBooks.buyOrderBook[i - 1].orders[j].amount).to.equal(i * 4); // 같은 가격으로 총 네번 오더 넣었으니 *4

                    expect(orderBooks.buyOrderBook[i - 1].orders[j].order.length).to.equal(4); // 두명의 사용자가 두번씩 넣었으니 4
                    for (let l = 0; l < orderBooks.buyOrderBook[i - 1].orders[j].order.length; l++) {
                        expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].orderIndex).to.equal(l);
                        expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].amount).to.equal(i);
                        await expireTimeCheck(orderBooks.buyOrderBook[i - 1].orders[j].order[l].expireTime, 1);

                        if (l < 2)
                            expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].maker).to.equal(user1.address);
                        else expect(orderBooks.buyOrderBook[i - 1].orders[j].order[l].maker).to.equal(user2.address);
                    }
                }
            }
        }
    });

    it('(erc721) new deploy MiniStore', async function () {
        // Store 의 새로운 배포는 storage 를 초기화 한다.
        const payment = erc20.address;
        const target = erc721.address;

        await sell(user1, payment, target, user1Tokens[0], toPeb(2), 1, 1);
        await buy(user1, payment, target, user1Tokens[0], toPeb(1), 1, 1);

        let orderBooks = await getOrderBooksByTokenId(payment, target, user1Tokens[0], MasterExchange.address);

        expect(orderBooks.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks.buyOrderBook.orders.length).to.equal(1);

        await MiniExchangeStore721Deploy();

        await MasterExchange.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );

        await MasterViewer.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );

        orderBooks = await getOrderBooksByTokenId(payment, target, user1Tokens[0], MasterExchange.address);

        expect(orderBooks.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks.buyOrderBook.orders.length).to.equal(0);
    });

    it('(erc1155) new deploy MiniStore', async function () {
        // Store 의 새로운 배포는 storage 를 초기화 한다.
        const payment = erc20.address;
        const target = erc1155.address;

        await sell(user1, payment, target, tokenId1, toPeb(2), 10, 1);
        await buy(user1, payment, target, tokenId1, toPeb(1), 10, 1);

        let orderBooks = await getOrderBooksByTokenId(payment, target, tokenId1, MasterExchange.address);

        expect(orderBooks.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks.buyOrderBook.orders.length).to.equal(1);

        await MiniExchangeStore1155Deploy();

        await MasterExchange.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );

        await MasterViewer.connect(admin).resister(
            Exchange721.address,
            ExchangeStore721.address,
            Exchange1155.address,
            ExchangeStore1155.address,
        );

        orderBooks = await getOrderBooksByTokenId(payment, target, tokenId1, MasterExchange.address);

        expect(orderBooks.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks.buyOrderBook.orders.length).to.equal(0);
    });

    /**
     * requirement
     * 1. event receipt check
     */
    it('(erc1155) event emitter check', async () => {
        await expect(sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'addSellOrderEvent')
            .withArgs(erc20_wETH.address, erc1155.address, tokenId1, user1.address, toPeb(1), 1, 0, maxUint);

        await expect(buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'buyMatchOrderEvent')
            .withArgs(erc20_wETH.address, erc1155.address, tokenId1, user1.address, toPeb(1), 1, 0, user2.address);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(999);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1001);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(101));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(99));

        await expect(buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'addBuyOrderEvent')
            .withArgs(erc20_wETH.address, erc1155.address, tokenId1, user2.address, toPeb(1), 1, 0, maxUint);

        await expect(sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'sellMatchOrderEvent')
            .withArgs(erc20_wETH.address, erc1155.address, tokenId1, user2.address, toPeb(1), 1, 0, user1.address);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(998);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1002);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(102));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(98));

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await expect(
            MasterExchange.connect(user1)['cancel((bytes4,address,address,address,uint256,uint256,uint256,uint256))']({
                methodSig: sellSig,
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                taker: user1.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                orderIndex: 1,
            }),
        )
            .to.emit(MasterExchange, 'cancelSellOrderEvent')
            .withArgs(erc20_wETH.address, erc1155.address, tokenId1, user1.address, toPeb(1), 1, 1);

        await buy(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);

        await expect(
            MasterExchange.connect(user1)['cancel((bytes4,address,address,address,uint256,uint256,uint256,uint256))']({
                methodSig: buySig,
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                taker: user1.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                orderIndex: 1,
            }),
        )
            .to.emit(MasterExchange, 'cancelBuyOrderEvent')
            .withArgs(erc20_wETH.address, erc1155.address, tokenId1, user1.address, toPeb(1), 1, 1);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(998);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1002);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(102));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(98));
    });

    /**
     * requirement
     * 1. event receipt check
     */
    it('(erc721) event emitter check', async () => {
        const payment = erc20_wETH.address;
        const target = erc721.address;
        const tokenId = user1Tokens[0];

        await expect(sell(user1, payment, target, tokenId, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'addSellOrderEvent')
            .withArgs(payment, target, tokenId, user1.address, toPeb(1), 1, 0, maxUint);

        await expect(buy(user2, payment, target, tokenId, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'buyMatchOrderEvent')
            .withArgs(payment, target, tokenId, user1.address, toPeb(1), 1, 0, user2.address);

        expect(await erc721.ownerOf(tokenId)).to.equal(user2.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(101));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(99));

        await expect(buy(user1, payment, target, tokenId, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'addBuyOrderEvent')
            .withArgs(payment, target, tokenId, user1.address, toPeb(1), 1, 0, maxUint);

        await expect(sell(user2, payment, target, tokenId, toPeb(1), 1, 0))
            .to.emit(MasterExchange, 'sellMatchOrderEvent')
            .withArgs(payment, target, tokenId, user1.address, toPeb(1), 1, 0, user2.address);

        expect(await erc721.ownerOf(tokenId)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        await sell(user1, payment, target, tokenId, toPeb(1), 1, 0);
        await expect(
            MasterExchange.connect(user1)['cancel((bytes4,address,address,address,uint256,uint256,uint256,uint256))']({
                methodSig: sellSig,
                paymentToken: payment,
                targetToken: target,
                taker: user1.address,
                tokenId: tokenId,
                price: toPeb(1),
                amount: 1,
                orderIndex: 1,
            }),
        )
            .to.emit(MasterExchange, 'cancelSellOrderEvent')
            .withArgs(payment, target, tokenId, user1.address, toPeb(1), 1, 1);

        await buy(user1, payment, target, tokenId, toPeb(1), 1, 0);

        await expect(
            MasterExchange.connect(user1)['cancel((bytes4,address,address,address,uint256,uint256,uint256,uint256))']({
                methodSig: buySig,
                paymentToken: payment,
                targetToken: target,
                taker: user1.address,
                tokenId: tokenId,
                price: toPeb(1),
                amount: 1,
                orderIndex: 1,
            }),
        )
            .to.emit(MasterExchange, 'cancelBuyOrderEvent')
            .withArgs(payment, target, tokenId, user1.address, toPeb(1), 1, 1);

        expect(await erc721.ownerOf(tokenId)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));
    });

    /**
     * flow
     * sell(1eth) -> adminCancel -> buy(1eth) -> adminCancel -> sell(1eth)
     * addOrder   ->   cancel    -> addOrder  ->    cancel   -> addOrder
     */
    it('(erc1155) admin cancel check', async function () {
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);

        let orderIndex = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(orderIndex.turnIndex).to.equal(0);
        expect(orderIndex.endIndex).to.equal(1);

        const { amount, maker, expireTime } = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(amount).to.equal(1);
        expect(maker).to.equal(user1.address);
        expect(expireTime).to.equal(BigNumber.from(2).pow(256).sub(1));

        await MasterExchange.connect(admin).adminCancel({
            methodSig: sellSig,
            paymentToken: erc20_wETH.address,
            targetToken: erc1155.address,
            taker: user1.address,
            tokenId: tokenId1,
            price: toPeb(1),
            amount: 1,
            orderIndex: orderIndex.turnIndex,
        });

        const { amount: afterCancelAmount } = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(afterCancelAmount).to.equal(0);

        // cancel 되어, 체결이 되지 않아야함
        await buy(user2, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);

        orderIndex = await ExchangeStore1155.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        expect(orderIndex.turnIndex).to.equal(0);
        expect(orderIndex.endIndex).to.equal(1);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        const buyOrder = await ExchangeStore1155.getOrder(
            buySig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(buyOrder.amount).to.equal(1);
        await MasterExchange.connect(admin).adminCancel({
            methodSig: buySig,
            paymentToken: erc20_wETH.address,
            targetToken: erc1155.address,
            taker: user2.address,
            tokenId: tokenId1,
            price: toPeb(1),
            amount: 1,
            orderIndex: orderIndex.turnIndex,
        });

        expect(buyOrder.maker).to.equal(user2.address);

        const { amount: afterBuyCancelAmount } = await ExchangeStore1155.getOrder(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(afterBuyCancelAmount).to.equal(0);

        // cancel 되어, 체결이 되지 않아야함
        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);

        orderIndex = await ExchangeStore1155.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc1155.address,
            tokenId1,
            toPeb(1),
        );

        // 위에서 buy 를 시도했을 때, buyMatch 주문조회 때문에 index 가 증가했음 (실제로는 체결될 수 없다고 판단, addOrder 전환)
        expect(orderIndex.turnIndex).to.equal(1);
        expect(orderIndex.endIndex).to.equal(2);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(1000);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1000);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));
    });

    it('(erc721) admin cancel check', async function () {
        await sell(user1, erc20_wETH.address, erc721.address, tokenId1, toPeb(1), 1, 0);

        let orderIndex = await ExchangeStore721.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc721.address,
            tokenId1,
            toPeb(1),
        );

        // 721 sellOrderBooks 는 turnIndex === 0, endIndex === 1 고정
        expect(orderIndex.turnIndex).to.equal(0);
        expect(orderIndex.endIndex).to.equal(1);

        const { price, maker, expireTime } = await ExchangeStore721.getOrder(
            sellSig,
            erc20_wETH.address,
            erc721.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(price).to.equal(toPeb(1));
        expect(maker).to.equal(user1.address);
        expect(expireTime).to.equal(BigNumber.from(2).pow(256).sub(1));

        await MasterExchange.connect(admin).adminCancel({
            methodSig: sellSig,
            paymentToken: erc20_wETH.address,
            targetToken: erc721.address,
            taker: user1.address,
            tokenId: tokenId1,
            price: toPeb(1),
            amount: 1,
            orderIndex: orderIndex.turnIndex,
        });

        const { price: afterCancelPrice } = await ExchangeStore721.getOrder(
            sellSig,
            erc20_wETH.address,
            erc721.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(afterCancelPrice).to.equal(toPeb(1));

        // cancel 되어, 체결이 되지 않아야함
        await buy(user2, erc20_wETH.address, erc721.address, tokenId1, toPeb(1), 1, 0);

        orderIndex = await ExchangeStore721.getOrderIndex(
            buySig,
            erc20_wETH.address,
            erc721.address,
            tokenId1,
            toPeb(1),
        );

        expect(orderIndex.turnIndex).to.equal(0);
        expect(orderIndex.endIndex).to.equal(1);

        expect(await erc721.ownerOf(tokenId1)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));

        const buyOrder = await ExchangeStore721.getOrder(
            buySig,
            erc20_wETH.address,
            erc721.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(buyOrder.price).to.equal(toPeb(1));
        await MasterExchange.connect(admin).adminCancel({
            methodSig: buySig,
            paymentToken: erc20_wETH.address,
            targetToken: erc721.address,
            taker: user2.address,
            tokenId: tokenId1,
            price: toPeb(1),
            amount: 1,
            orderIndex: orderIndex.turnIndex,
        });

        expect(buyOrder.maker).to.equal(user2.address);

        const { price: afterBuyCancelPrice } = await ExchangeStore721.getOrder(
            sellSig,
            erc20_wETH.address,
            erc721.address,
            tokenId1,
            toPeb(1),
            orderIndex.turnIndex,
        );

        expect(afterBuyCancelPrice).to.equal(toPeb(1));

        // cancel 되어, 체결이 되지 않아야함
        await sell(user1, erc20_wETH.address, erc721.address, tokenId1, toPeb(1), 1, 0);

        orderIndex = await ExchangeStore721.getOrderIndex(
            sellSig,
            erc20_wETH.address,
            erc721.address,
            tokenId1,
            toPeb(1),
        );

        // 721 sellOrderBooks 는 turnIndex === 0, endIndex === 1 고정
        expect(orderIndex.turnIndex).to.equal(0);
        expect(orderIndex.endIndex).to.equal(1);

        expect(await erc721.ownerOf(tokenId1)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(100));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(100));
    });

    /** @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     * MasterExchange revert or require fail case
     * @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ */
    it('(revert) approve', async function () {
        const reason_targetToken = 'caller is not owner nor approved';
        const reason_paymentToken = 'caller is not enough nor approved';

        /* erc1155 setApprove -> false (sell Test) */
        await erc1155.connect(user1).setApprovalForAll(MasterExchange.address, false);
        await expect(
            MasterExchange.connect(user1)['sell((address,address,uint256,uint256,uint256,uint256))']({
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                expireDate: 0,
            }),
        ).to.be.revertedWith(reason_targetToken);
        await erc1155.connect(user1).setApprovalForAll(MasterExchange.address, true);

        /* erc721 setApprove -> false (sell Test) */
        await erc721.connect(user1).setApprovalForAll(MasterExchange.address, false);
        await expect(
            MasterExchange.connect(user1)['sell((address,address,uint256,uint256,uint256,uint256))']({
                paymentToken: erc20_wETH.address,
                targetToken: erc721.address,
                tokenId: user1Tokens[0],
                price: toPeb(1),
                amount: 1,
                expireDate: 0,
            }),
        ).to.be.revertedWith(reason_targetToken);
        await erc721.connect(user1).setApprovalForAll(MasterExchange.address, true);

        /* erc20 approve -> 0 (buy Test) */
        await erc20_wETH.connect(user1).approve(MasterExchange.address, '0');
        await expect(
            MasterExchange.connect(user1)['buy((address,address,uint256,uint256,uint256,uint256))']({
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                expireDate: 0,
            }),
        ).to.be.revertedWith(reason_paymentToken);

        /* erc20 approve -> 0 (buy Test)  */
        await erc20.connect(user1).approve(MasterExchange.address, '0');
        await expect(
            MasterExchange.connect(user1)['buy((address,address,uint256,uint256,uint256,uint256))']({
                paymentToken: erc20.address,
                targetToken: erc1155.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                expireDate: 0,
            }),
        ).to.be.revertedWith(reason_paymentToken);
    });

    it('(revert) invalid method signature', async function () {
        const reason = 'invalid methodSig';
        const reason_fail = 'invalid order, fail OrderMatch';

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await MasterExchange.connect(user2).assignMatch({
            methodSig: buySig,
            paymentToken: erc20_wETH.address,
            targetToken: erc1155.address,
            taker: user2.address,
            tokenId: tokenId1,
            price: toPeb(1),
            amount: 1,
            orderIndex: 0,
        });

        await expect(
            MasterExchange.connect(user2).assignMatch({
                methodSig: buySig,
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                taker: user2.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                orderIndex: 0,
            }),
        ).to.be.revertedWith(reason_fail);

        expect(await erc1155.balanceOf(user1.address, tokenId1)).to.equal(999);
        expect(await erc1155.balanceOf(user2.address, tokenId1)).to.equal(1001);

        await sell(user1, erc20_wETH.address, erc1155.address, tokenId1, toPeb(1), 1, 0);
        await expect(
            MasterExchange.connect(user2).assignMatch({
                methodSig: '0x0F3Bba0b',
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                taker: user2.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                orderIndex: 1,
            }),
        ).to.be.revertedWith(reason);

        await sell(user2, erc20.address, erc721.address, user2Tokens[0], toPeb(1), 1, 0);
        await expect(
            MasterExchange.connect(user1).assignMatch({
                methodSig: '0x0F3Bba0b',
                paymentToken: erc20.address,
                targetToken: erc721.address,
                taker: user1.address,
                tokenId: user2Tokens[0],
                price: toPeb(1),
                amount: 1,
                orderIndex: 0,
            }),
        ).to.be.revertedWith(reason);
    });

    it('(revert) owner function call', async function () {
        const reason_notOwner = 'Ownable: caller is not the owner';
        const reason_notNull = 'exchange address can not null address';
        const reason_notMiniExchange = 'not a miniExchange';
        const reason_notMasterExchange = 'not a masterExchange';
        const reason_invalidAddress = 'invalid exchange address';

        const reason_paused = 'Pausable: paused';
        const reason_notPause = 'Pausable: not paused';

        /**
         * resister function test
         */
        await expect(
            MasterExchange.connect(user1).resister(
                Exchange721.address,
                ExchangeStore721.address,
                Exchange1155.address,
                ExchangeStore1155.address,
            ),
        ).to.be.revertedWith(reason_notOwner);
        await expect(
            MasterExchange.connect(admin).resister(
                address0(),
                ExchangeStore721.address,
                address0(),
                ExchangeStore1155.address,
            ),
        ).to.be.revertedWith(reason_notNull);
        await expect(
            MasterExchange.connect(admin).resister(
                MasterExchange.address,
                ExchangeStore721.address,
                MasterExchange.address,
                ExchangeStore1155.address,
            ),
        ).to.be.revertedWith(reason_notMiniExchange);

        /**
         * deResister function test
         */
        await expect(MasterExchange.connect(user1).deResister(Exchange721.address)).to.be.revertedWith(reason_notOwner);
        await expect(MasterExchange.connect(admin).deResister(address0())).to.be.revertedWith(reason_notNull);
        await expect(MasterExchange.connect(admin).deResister(MasterExchange.address)).to.be.revertedWith(
            reason_notMiniExchange,
        );
        const _Exchange721 = await ethers.getContractFactory('MiniExchange721');
        const _newExchange721 = (await upgrades.deployProxy(
            _Exchange721,
            [MasterExchange.address, MasterViewer.address],
            {
                initializer: 'initialize(address,address)',
            },
        )) as MiniExchange721;
        const newExchange721 = await _newExchange721.connect(admin).deployed();
        await expect(MasterExchange.connect(admin).deResister(newExchange721.address)).to.be.revertedWith(
            reason_invalidAddress,
        );

        /**
         * migration function test
         */
        await expect(MasterExchange.connect(user1).migration(Exchange721.address)).to.be.revertedWith(reason_notOwner);
        await expect(MasterExchange.connect(admin).migration(address0())).to.be.revertedWith(reason_notNull);
        await expect(MasterExchange.connect(admin).migration(Exchange721.address)).to.be.revertedWith(
            reason_notMasterExchange,
        );

        /**
         * pause function & whenNotPaused modifier test
         */
        await expect(MasterExchange.connect(user1).pause()).to.be.revertedWith(reason_notOwner);
        await MasterExchange.connect(admin).pause();
        await expect(
            MasterExchange.connect(user1)['sell((address,address,uint256,uint256,uint256,uint256))']({
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                tokenId: user1Tokens[0],
                price: toPeb(1),
                amount: 1,
                expireDate: 0,
            }),
        ).to.be.revertedWith(reason_paused);
    });

    it('(revert) Master function call', async function () {
        const reason = 'MiniRole: caller is not the Master Contract';

        await expect(Exchange721.connect(user1).setViewer(address0())).to.be.revertedWith(reason);
    });

    it('(revert) Migrate & prev Master exchange call', async function () {
        const reason_paused = 'Pausable: paused';

        const _MasterExchange = await ethers.getContractFactory('MasterExchange');
        const newMasterExchange = (await upgrades.deployProxy(
            _MasterExchange,
            [klaymintFeeWallet.address, 0, MasterViewer.address],
            {
                initializer: 'initialize(address,uint16,address)',
            },
        )) as MasterExchange;
        await newMasterExchange.connect(admin).deployed();

        // 마이그레이션 함수 호출시 master change & pause
        await MasterExchange.connect(admin).migration(newMasterExchange.address);

        await expect(
            MasterExchange.connect(user1)['sell((address,address,uint256,uint256,uint256,uint256))']({
                paymentToken: erc20_wETH.address,
                targetToken: erc1155.address,
                tokenId: tokenId1,
                price: toPeb(1),
                amount: 1,
                expireDate: 0,
            }),
        ).to.be.revertedWith(reason_paused);
    });

    /** @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     *          common function
     * @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ */
    const expireTimeCheck = async (expireTime: BigNumber, date: number) => {
        const now = await PassedTime.getNow();
        const endTime = now + 86401 * date;

        expect(+expireTime).to.be.within(now, endTime);
    };

    const ownerCheck = async () => {
        const masterOwner = await MasterExchange.owner();
        expect(masterOwner).to.equal(admin.address);

        const exchangeMaster721 = await Exchange721.master();
        const exchangeMaster1155 = await Exchange1155.master();

        expect(exchangeMaster721).to.equal(MasterExchange.address);
        expect(exchangeMaster1155).to.equal(MasterExchange.address);
    };

    const MasterViewerDeploy = async (): Promise<string> => {
        const _MasterViewer = await ethers.getContractFactory('ExchangeViewer');
        MasterViewer = (await upgrades.deployProxy(_MasterViewer, [], {
            initializer: 'initialize()',
        })) as ExchangeViewer;
        await MasterViewer.connect(admin).deployed();

        return MasterViewer.address;
    };
    const MiniExchange721Deploy = async (): Promise<string> => {
        const _Exchange721 = await ethers.getContractFactory('MiniExchange721');
        Exchange721 = (await upgrades.deployProxy(_Exchange721, [MasterExchange.address, MasterViewer.address], {
            initializer: 'initialize(address,address)',
        })) as MiniExchange721;
        await Exchange721.connect(admin).deployed();

        return Exchange721.address;
    };
    const MiniExchange1155Deploy = async (): Promise<string> => {
        const _Exchange1155 = await ethers.getContractFactory('MiniExchange1155');
        Exchange1155 = (await upgrades.deployProxy(_Exchange1155, [MasterExchange.address, MasterViewer.address], {
            initializer: 'initialize(address,address)',
        })) as MiniExchange1155;
        await Exchange1155.connect(admin).deployed();

        return Exchange1155.address;
    };
    const MiniExchangeStore721Deploy = async (): Promise<string> => {
        const _ExchangeStore721 = await ethers.getContractFactory('MiniExchangeStore721');
        ExchangeStore721 = (await upgrades.deployProxy(_ExchangeStore721, [MasterExchange.address], {
            initializer: 'initialize(address)',
        })) as MiniExchangeStore721;
        await ExchangeStore721.connect(admin).deployed;

        return ExchangeStore721.address;
    };
    const MiniExchangeStore1155Deploy = async (): Promise<string> => {
        const _ExchangeStore1155 = await ethers.getContractFactory('MiniExchangeStore1155');
        ExchangeStore1155 = (await upgrades.deployProxy(_ExchangeStore1155, [MasterExchange.address], {
            initializer: 'initialize(address)',
        })) as MiniExchangeStore1155;
        await ExchangeStore1155.connect(admin).deployed;

        return ExchangeStore1155.address;
    };
    const MasterExchangeDeploy = async (): Promise<string> => {
        const _MasterExchange = await ethers.getContractFactory('MasterExchange');
        MasterExchange = (await upgrades.deployProxy(
            _MasterExchange,
            [klaymintFeeWallet.address, 0, MasterViewer.address],
            {
                initializer: 'initialize(address,uint16,address)',
            },
        )) as MasterExchange;
        await MasterExchange.connect(admin).deployed();

        return MasterExchange.address;
    };

    async function paymentDeploy() {
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
    }

    const targetTokenDeploy = async () => {
        const _ERC1155 = await ethers.getContractFactory('KIP37Token');
        erc1155 = await _ERC1155.connect(admin).deploy('name_', 'symbol_');
        await erc1155.connect(admin).deployed();

        await erc1155.connect(admin).create(tokenId1, 0, 'uri');

        await erc1155.connect(admin).mint(tokenId1, user1.address, 1000);
        await erc1155.connect(admin).mint(tokenId1, user2.address, 1000);

        const _ERC721 = await ethers.getContractFactory('KIP17Token');
        erc721 = await _ERC721.connect(admin).deploy('name_', 'symbol_');
        await erc721.connect(admin).deployed();

        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        for await (const id of user1Tokens) await erc721.connect(admin).mintWithTokenURI(user1.address, id, '');
        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        for await (const id of user2Tokens) await erc721.connect(admin).mintWithTokenURI(user2.address, id, '');
    };

    const approveAll = async () => {
        await erc1155.connect(user1).setApprovalForAll(MasterExchange.address, true);
        await erc1155.connect(user2).setApprovalForAll(MasterExchange.address, true);

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

    const getOrderBooksByTokenId = async (payment: string, target: string, tokenId: number, type: string) => {
        return await MasterViewer['getOrderBooks(address,address,uint256,address)'](payment, target, tokenId, type);
    };

    const getOrderBooks = async (payment: string, target: string, type: string) => {
        return await MasterViewer['getOrderBooks(address,address,address)'](payment, target, type);
    };
});
