import { ethers, upgrades } from 'hardhat';
import { BigNumber, BigNumberish, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BN from 'bn.js';
import * as chai from 'chai';

import {
    MiniExchange721,
    MiniExchange1155,
    MasterExchange,
    ExchangeViewer,
    KIP17Token,
    KIP37Token,
    WETH9,
    PER,
    MiniExchangeStore721,
    MiniExchangeStore1155,
} from '../../typechain';
import PassedTime, { toPeb, address0 } from './common';
import { beforeEach } from 'mocha';

const expect = chai.expect;
chai.use(require('chai-bn')(BN));

describe('ViewerExchange', function () {
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

        const _Exchange1155 = await ethers.getContractFactory('MiniExchange1155');
        Exchange1155 = (await upgrades.deployProxy(_Exchange1155, [MasterExchange.address, MasterViewer.address], {
            initializer: 'initialize(address,address)',
        })) as MiniExchange1155;
        await Exchange1155.connect(admin).deployed();

        const _ExchangeStore721 = await ethers.getContractFactory('MiniExchangeStore721');
        ExchangeStore721 = (await upgrades.deployProxy(_ExchangeStore721, [MasterExchange.address], {
            initializer: 'initialize(address)',
        })) as MiniExchangeStore721;
        await ExchangeStore721.connect(admin).deployed;

        const _ExchangeStore1155 = await ethers.getContractFactory('MiniExchangeStore1155');
        ExchangeStore1155 = (await upgrades.deployProxy(_ExchangeStore1155, [MasterExchange.address], {
            initializer: 'initialize(address)',
        })) as MiniExchangeStore1155;
        await ExchangeStore1155.connect(admin).deployed;

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

    /**
     * level 1, ( 단수 sell or buy order viewer )
     */
    it('(erc1155) sellOrder view function __ level __ 1', async function () {
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;

        await sell(user1, payment, target, tokenId, toPeb(1), 1, 1);

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북)
         */
        const orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        expect(orderBooks_tokenId.sellOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);
        // console.log(orderBooks.sellOrderBook.orders[0].order);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.sellOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);
        expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

        // console.log(orderBooks_tokenId.sellOrderBook); // type => orderBooks_tokenId.sellOrderBook[]
        // console.log('////////////// < dif > ////////////////');
        // console.log(orderBooks.sellOrderBook); // type => orderBooks_tokenId.sellOrderBook[][]
    });
    it('(erc1155) buyOrder view function __ level __ 1', async function () {
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;

        await buy(user1, payment, target, tokenId, toPeb(1), 1, 1);

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북)
         */
        const orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        expect(orderBooks_tokenId.buyOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.buyOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);
        expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

        // console.log(orderBooks_tokenId.buyOrderBook); // type => orderBooks_tokenId.sellOrderBook[]
        // console.log('////////////// < dif > ////////////////');
        // console.log(orderBooks.buyOrderBook); // type => orderBooks_tokenId.sellOrderBook[][]
    });
    it('(erc721) sellOrder view function __ level __ 1', async function () {
        const payment = erc20.address;
        const target = erc721.address;
        const tokenId = user1Tokens[0];

        await sell(user1, payment, target, tokenId, toPeb(1), 1, 1);

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북)
         */
        const orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        expect(orderBooks_tokenId.sellOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);
        // console.log(orderBooks.sellOrderBook.orders[0].order);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.sellOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);
        expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

        // console.log(orderBooks_tokenId.sellOrderBook); // type => orderBooks_tokenId.sellOrderBook[]
        // console.log('////////////// < dif > ////////////////');
        // console.log(orderBooks.sellOrderBook); // type => orderBooks_tokenId.sellOrderBook[][]
    });
    it('(erc721) buyOrder view function __ level __ 1', async function () {
        const payment = erc20.address;
        const target = erc721.address;
        const tokenId = user1Tokens[0];

        await buy(user1, payment, target, tokenId, toPeb(1), 1, 1);

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북)
         */
        const orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        expect(orderBooks_tokenId.buyOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.buyOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);
        expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1); // order amount
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address); // order maker
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

        // console.log(orderBooks_tokenId.buyOrderBook); // type => orderBooks_tokenId.sellOrderBook[]
        // console.log('////////////// < dif > ////////////////');
        // console.log(orderBooks.buyOrderBook); // type => orderBooks_tokenId.sellOrderBook[][]
    });

    /**
     * level 2, ( 복수 sell or buy order viewer )
     */
    it('(erc1155) sellOrder view function __ level __ 2', async function () {
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;

        await sell(user1, payment, target, tokenId, toPeb(1), 2, 7); // orderIndex 0
        await sell(user1, payment, target, tokenId, toPeb(1), 3, 7); // orderIndex 1

        await sell(user2, payment, target, tokenId, toPeb(0.5), 10, 3); // orderIndex 0
        // => price 1 eth, total amount 5
        // => price 0.5 eth, total amount 10

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북)
         */
        const orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        expect(orderBooks_tokenId.sellOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(2);

        /** price 1eth orders */
        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(5); // total amount

        // first index
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(2);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 7);

        // second index
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].amount).to.equal(3);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].maker).to.equal(user1.address);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].orderIndex).to.equal(1);
        await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[1].expireTime, 7);

        /** price 0.5eth orders */
        expect(orderBooks_tokenId.sellOrderBook.orders[1].price).to.equal(toPeb(0.5));
        expect(orderBooks_tokenId.sellOrderBook.orders[1].amount).to.equal(10); // total amount

        // first index
        expect(orderBooks_tokenId.sellOrderBook.orders[1].order[0].amount).to.equal(10); // order amount
        expect(orderBooks_tokenId.sellOrderBook.orders[1].order[0].maker).to.equal(user2.address); // order maker
        expect(orderBooks_tokenId.sellOrderBook.orders[1].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[1].order[0].expireTime, 3);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.sellOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.sellOrderBook[0].orders.length).to.equal(2);

        /** price 1eth orders */
        expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(5); // total amount

        // first index
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(2);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 7);

        // second index
        expect(orderBooks.sellOrderBook[0].orders[0].order[1].amount).to.equal(3);
        expect(orderBooks.sellOrderBook[0].orders[0].order[1].maker).to.equal(user1.address);
        expect(orderBooks.sellOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[1].expireTime, 7);

        /** price 0.5eth orders */
        expect(orderBooks.sellOrderBook[0].orders[1].price).to.equal(toPeb(0.5));
        expect(orderBooks.sellOrderBook[0].orders[1].amount).to.equal(10); // total amount

        // first index
        expect(orderBooks.sellOrderBook[0].orders[1].order[0].amount).to.equal(10); // order amount
        expect(orderBooks.sellOrderBook[0].orders[1].order[0].maker).to.equal(user2.address); // order maker
        expect(orderBooks.sellOrderBook[0].orders[1].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[1].order[0].expireTime, 3);

        // console.log(orderBooks_tokenId.sellOrderBook); // type => orderBooks_tokenId.sellOrderBook[]
        // console.log('////////////// < dif > ////////////////');
        // console.log(orderBooks.sellOrderBook); // type => orderBooks_tokenId.sellOrderBook[][]
    });
    it('(erc1155) buyOrder view function __ level __ 2', async function () {
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;

        await buy(user1, payment, target, tokenId, toPeb(1), 2, 7); // orderIndex 0
        await buy(user1, payment, target, tokenId, toPeb(1), 3, 7); // orderIndex 1

        await buy(user2, payment, target, tokenId, toPeb(0.5), 10, 3); // orderIndex 0
        // => price 1 eth, total amount 5
        // => price 0.5 eth, total amount 10

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북)
         */
        const orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        expect(orderBooks_tokenId.buyOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(2);

        /** price 1eth orders */
        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(5); // total amount

        // first index
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(2);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 7);

        // second index
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].amount).to.equal(3);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].maker).to.equal(user1.address);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
        await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[1].expireTime, 7);

        /** price 0.5eth orders */
        expect(orderBooks_tokenId.buyOrderBook.orders[1].price).to.equal(toPeb(0.5));
        expect(orderBooks_tokenId.buyOrderBook.orders[1].amount).to.equal(10); // total amount

        // first index
        expect(orderBooks_tokenId.buyOrderBook.orders[1].order[0].amount).to.equal(10); // order amount
        expect(orderBooks_tokenId.buyOrderBook.orders[1].order[0].maker).to.equal(user2.address); // order maker
        expect(orderBooks_tokenId.buyOrderBook.orders[1].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[1].order[0].expireTime, 3);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.buyOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.buyOrderBook[0].orders.length).to.equal(2);

        /** price 1eth orders */
        expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(5); // total amount

        // first index
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(2);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 7);

        // second index
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(3);
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user1.address);
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime, 7);

        /** price 0.5eth orders */
        expect(orderBooks.buyOrderBook[0].orders[1].price).to.equal(toPeb(0.5));
        expect(orderBooks.buyOrderBook[0].orders[1].amount).to.equal(10); // total amount

        // first index
        expect(orderBooks.buyOrderBook[0].orders[1].order[0].amount).to.equal(10); // order amount
        expect(orderBooks.buyOrderBook[0].orders[1].order[0].maker).to.equal(user2.address); // order maker
        expect(orderBooks.buyOrderBook[0].orders[1].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[1].order[0].expireTime, 3);

        // console.log(orderBooks_tokenId.buyOrderBook); // type => orderBooks_tokenId.buyOrderBook[]
        // console.log('////////////// < dif > ////////////////');
        // console.log(orderBooks.buyOrderBook); // type => orderBooks_tokenId.buyOrderBook[][]
    });
    it('(erc721) sellOrder view function __ level __ 2', async function () {
        const payment = erc20_wETH.address;
        const target = erc721.address;
        const tokenId = user1Tokens[0];
        const tokenId2 = user1Tokens[1];

        await sell(user1, payment, target, tokenId, toPeb(1), 1, 7); // orderIndex 0
        await sell(user1, payment, target, tokenId2, toPeb(2), 1, 7); // orderIndex 0
        // => price 1 eth (tokenId 1)
        // => price 2 eth (tokenId 2)

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북) (tokenId 1)
         */
        const orderBooks_tokenId_1 = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        /** tokenId 1 orders */
        expect(orderBooks_tokenId_1.sellOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId_1.sellOrderBook.orders.length).to.equal(1);

        expect(orderBooks_tokenId_1.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId_1.sellOrderBook.orders[0].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId_1.sellOrderBook.orders[0].order[0].amount).to.equal(1);
        expect(orderBooks_tokenId_1.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks_tokenId_1.sellOrderBook.orders[0].order[0].expireTime, 7);

        const orderBooks_tokenId_2 = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId2,
            address0(),
        );

        /** tokenId 2 orders */
        expect(orderBooks_tokenId_2.sellOrderBook.tokenId).to.equal(tokenId2);
        expect(orderBooks_tokenId_2.sellOrderBook.orders.length).to.equal(1);

        expect(orderBooks_tokenId_2.sellOrderBook.orders[0].price).to.equal(toPeb(2));
        expect(orderBooks_tokenId_2.sellOrderBook.orders[0].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId_2.sellOrderBook.orders[0].order[0].amount).to.equal(1);
        expect(orderBooks_tokenId_2.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks_tokenId_2.sellOrderBook.orders[0].order[0].expireTime, 7);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.sellOrderBook.length).to.equal(2);

        expect(orderBooks.sellOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

        expect(orderBooks.sellOrderBook[1].tokenId).to.equal(tokenId2);
        expect(orderBooks.sellOrderBook[1].orders.length).to.equal(1);

        /** tokenId 1 orders */
        expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 7);

        /** tokenId 2 orders */
        expect(orderBooks.sellOrderBook[1].orders[0].price).to.equal(toPeb(2));
        expect(orderBooks.sellOrderBook[1].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.sellOrderBook[1].orders[0].order[0].amount).to.equal(1);
        expect(orderBooks.sellOrderBook[1].orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks.sellOrderBook[1].orders[0].order[0].expireTime, 7);
    });
    it('(erc721) buyOrder view function __ level __ 2', async function () {
        const payment = erc20_wETH.address;
        const target = erc721.address;
        const tokenId = user1Tokens[0];
        const tokenId2 = user1Tokens[1];

        await buy(user1, payment, target, tokenId, toPeb(1), 1, 7); // orderIndex 0
        await buy(user2, payment, target, tokenId, toPeb(1), 1, 7); // orderIndex 1
        // => price 1 eth (tokenId 1) x2

        await buy(user1, payment, target, tokenId2, toPeb(2), 1, 7); // orderIndex 0
        await buy(user2, payment, target, tokenId2, toPeb(1.5), 1, 7); // orderIndex 0
        // => price 2 eth (tokenId 2)
        // => price 1.5 eth (tokenId 2)

        /**
         * tokenId 를 넣은 오더북(해당 tokenId 에 대한 오더북) (tokenId 1)
         */
        const orderBooks_tokenId_1 = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );

        /** tokenId 1 orders */
        expect(orderBooks_tokenId_1.buyOrderBook.tokenId).to.equal(tokenId);
        expect(orderBooks_tokenId_1.buyOrderBook.orders.length).to.equal(1); // same price order length === 1
        expect(orderBooks_tokenId_1.buyOrderBook.orders[0].order.length).to.equal(2); // 1 eth price order length === 2

        /*  price 1 eth  */
        expect(orderBooks_tokenId_1.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId_1.buyOrderBook.orders[0].amount).to.equal(1); // total amount

        // first index (user1 order)
        expect(orderBooks_tokenId_1.buyOrderBook.orders[0].order[0].amount).to.equal(1);
        expect(orderBooks_tokenId_1.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks_tokenId_1.buyOrderBook.orders[0].order[0].expireTime, 7);

        // second index (user2 order)
        expect(orderBooks_tokenId_1.buyOrderBook.orders[0].order[1].amount).to.equal(1);
        expect(orderBooks_tokenId_1.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
        await expireTimeCheck(orderBooks_tokenId_1.buyOrderBook.orders[0].order[1].expireTime, 7);

        const orderBooks_tokenId_2 = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId2,
            address0(),
        );

        /** tokenId 2 orders */
        expect(orderBooks_tokenId_2.buyOrderBook.tokenId).to.equal(tokenId2);
        expect(orderBooks_tokenId_2.buyOrderBook.orders.length).to.equal(2); // same price order length === 2
        expect(orderBooks_tokenId_2.buyOrderBook.orders[0].order.length).to.equal(1); // 2 eth price order length === 1
        expect(orderBooks_tokenId_2.buyOrderBook.orders[1].order.length).to.equal(1); // 1.5 eth price order length === 1

        /*  price 2 eth  */
        expect(orderBooks_tokenId_2.buyOrderBook.orders[0].price).to.equal(toPeb(2));
        expect(orderBooks_tokenId_2.buyOrderBook.orders[0].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId_2.buyOrderBook.orders[0].order[0].amount).to.equal(1);
        expect(orderBooks_tokenId_2.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks_tokenId_2.buyOrderBook.orders[0].order[0].expireTime, 7);

        /*  price 1.5 eth  */
        expect(orderBooks_tokenId_2.buyOrderBook.orders[1].price).to.equal(toPeb(1.5));
        expect(orderBooks_tokenId_2.buyOrderBook.orders[1].amount).to.equal(1); // total amount

        expect(orderBooks_tokenId_2.buyOrderBook.orders[1].order[0].amount).to.equal(1);
        expect(orderBooks_tokenId_2.buyOrderBook.orders[1].order[0].maker).to.equal(user2.address);
        await expireTimeCheck(orderBooks_tokenId_2.buyOrderBook.orders[1].order[0].expireTime, 7);

        /**
         * tokenId 를 넣지 않은 오더북(오더북에 등록된 모든 tokenId 에 대한 오더북)
         */
        const orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks.buyOrderBook.length).to.equal(2);

        /** tokenId 1 orders */
        expect(orderBooks.buyOrderBook[0].tokenId).to.equal(tokenId);
        expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);
        expect(orderBooks.buyOrderBook[0].orders[0].order.length).to.equal(2);

        expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 7);

        expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(1);
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user2.address);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime, 7);

        /** tokenId 2 orders */
        expect(orderBooks.buyOrderBook[1].tokenId).to.equal(tokenId2);
        expect(orderBooks.buyOrderBook[1].orders.length).to.equal(2);
        expect(orderBooks.buyOrderBook[1].orders[0].order.length).to.equal(1);
        expect(orderBooks.buyOrderBook[1].orders[1].order.length).to.equal(1);

        expect(orderBooks.buyOrderBook[1].orders[0].price).to.equal(toPeb(2));
        expect(orderBooks.buyOrderBook[1].orders[0].amount).to.equal(1); // total amount

        expect(orderBooks.buyOrderBook[1].orders[0].order[0].amount).to.equal(1);
        expect(orderBooks.buyOrderBook[1].orders[0].order[0].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks.buyOrderBook[1].orders[0].order[0].expireTime, 7);

        expect(orderBooks.buyOrderBook[1].orders[1].price).to.equal(toPeb(1.5));
        expect(orderBooks.buyOrderBook[1].orders[1].amount).to.equal(1); // total amount

        expect(orderBooks.buyOrderBook[1].orders[1].order[0].amount).to.equal(1);
        expect(orderBooks.buyOrderBook[1].orders[1].order[0].maker).to.equal(user2.address);
        await expireTimeCheck(orderBooks.buyOrderBook[1].orders[1].order[0].expireTime, 7);
    });

    /**
     * level 3, ( canceled, matched order viewer )
     */
    it('(erc1155) sellOrder view function __ level __ 3', async function () {
        // canceled, matched view case
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;

        await sell(user1, payment, target, tokenId, toPeb(1), 5, 7); // orderIndex 0
        await sellCancel(user1, payment, target, tokenId, toPeb(1), 5, 0);

        let orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        let orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks.sellOrderBook.length).to.equal(0);

        await sell(user1, payment, target, tokenId, toPeb(1), 5, 7); // orderIndex 1
        await buy(user2, payment, target, tokenId, toPeb(1), 10, 7); // leftOver amount orderIndex 0

        orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(995);
        expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(1005);
        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(105));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(95));

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(5);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user2.address);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(5);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 7);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(1);
        expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);

        expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(5);
        expect(orderBooks.buyOrderBook[0].orders[0].order.length).to.equal(1);

        expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(5);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 7);

        // market match 는 leftOver amount 가 addOrder로 전환이 되지 않는 오더
        await MasterExchange.connect(user1).marketMatch({
            methodSig: sellSig,
            paymentToken: payment,
            targetToken: target,
            taker: user1.address,
            tokenId: tokenId,
            price: toPeb(1),
            amount: 10,
            orderIndex: 0, // anything
        });

        expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(990);
        expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(1010);
        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));

        orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);
    });
    it('(erc1155) buyOrder view function __ level __ 3', async function () {
        // canceled, matched view case
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;

        await buy(user1, payment, target, tokenId, toPeb(1), 5, 7); // orderIndex 0
        await buyCancel(user1, payment, target, tokenId, toPeb(1), 5, 0);

        let orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        let orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);

        await buy(user2, payment, target, tokenId, toPeb(1), 5, 7); // leftOver amount orderIndex 0
        await sell(user1, payment, target, tokenId, toPeb(1), 10, 7); // orderIndex 1

        orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(995);
        expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(1005);
        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(105));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(95));

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(5);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(5);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 7);

        expect(orderBooks.buyOrderBook.length).to.equal(0);
        expect(orderBooks.sellOrderBook.length).to.equal(1);
        expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

        expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(1));
        expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(5);
        expect(orderBooks.sellOrderBook[0].orders[0].order.length).to.equal(1);

        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(5);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 7);
    });
    it('(erc721) sellOrder view function __ level __ 3', async function () {
        // canceled, matched view case
        const payment = erc20_wETH.address;
        const target = erc721.address;
        const tokenId = user1Tokens[0];

        await sell(user1, payment, target, tokenId, toPeb(1), 1, 7); // orderIndex 0
        await sellCancel(user1, payment, target, tokenId, toPeb(1), 1, 0);

        let orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        let orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks.sellOrderBook.length).to.equal(0);

        await sell(user1, payment, target, tokenId, toPeb(1), 1, 7); // orderIndex 1
        await buy(user2, payment, target, tokenId, toPeb(1), 1, 7);

        orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(await erc721.ownerOf(tokenId)).to.equal(user2.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(101));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(99));

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);

        const reason = 'ERC721 Contract address can Not available.';
        await expect(
            MasterExchange.connect(user2).marketMatch({
                methodSig: sellSig,
                paymentToken: payment,
                targetToken: target,
                taker: user2.address,
                tokenId: tokenId,
                price: toPeb(1),
                amount: 1,
                orderIndex: 0, // anything
            }),
        ).to.be.revertedWith(reason);

        await sell(user2, payment, target, tokenId, toPeb(10), 1, 7); // orderIndex 2
        await MasterExchange.connect(user1).assignMatch({
            methodSig: buySig,
            paymentToken: payment,
            targetToken: target,
            taker: user1.address,
            tokenId: tokenId,
            price: toPeb(10),
            amount: 1,
            orderIndex: 0,
        });

        orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(await erc721.ownerOf(tokenId)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(91));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(109));

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);
    });
    it('(erc721) buyOrder view function __ level __ 3', async function () {
        // canceled, matched view case
        const payment = erc20_wETH.address;
        const target = erc721.address;
        const tokenId = user2Tokens[0];

        await buy(user1, payment, target, tokenId, toPeb(1), 1, 7); // orderIndex 0

        await buyCancel(user1, payment, target, tokenId, toPeb(1), 1, 0);

        let orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        let orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);

        await buy(user1, payment, target, tokenId, toPeb(1), 1, 7); // orderIndex 1
        await sell(user2, payment, target, tokenId, toPeb(1), 1, 7);

        orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(await erc721.ownerOf(tokenId)).to.equal(user1.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(99));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(101));

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);

        const reason = 'ERC721 Contract address can Not available.';
        await expect(
            MasterExchange.connect(user2).marketMatch({
                methodSig: buySig,
                paymentToken: payment,
                targetToken: target,
                taker: user2.address,
                tokenId: tokenId,
                price: toPeb(1),
                amount: 1,
                orderIndex: 0, // anything
            }),
        ).to.be.revertedWith(reason);

        await buy(user2, payment, target, tokenId, toPeb(10), 1, 7); // orderIndex 2
        await MasterExchange.connect(user1).assignMatch({
            methodSig: sellSig,
            paymentToken: payment,
            targetToken: target,
            taker: user1.address,
            tokenId: tokenId,
            price: toPeb(10),
            amount: 1,
            orderIndex: 0,
        });

        orderBooks_tokenId = await MasterViewer['getOrderBooks(address,address,uint256,address)'](
            payment,
            target,
            tokenId,
            address0(),
        );
        orderBooks = await MasterViewer['getOrderBooks(address,address,address)'](payment, target, address0());

        expect(await erc721.ownerOf(tokenId)).to.equal(user2.address);

        expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(109));
        expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(91));

        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(0);
    });

    /**
     * level 4, ( expireTime 만료 )
     */
    it.skip('(erc1155) sellOrder view function __ level __ 4', async function () {
        // sell 등록 후 expireTime 만료
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;
        const DAY_TO_SEC = 86400;

        await sell(user1, payment, target, tokenId, toPeb(1), 5, 1); // orderIndex 0

        await PassedTime.passTimes(DAY_TO_SEC);

        let orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        let orderBooks = await getOrderBooks(payment, target, address0());

        // dynamic array 로 정의한게 아니라서, 유효하지 않은 오더의 인덱스에는 빈값 (0x00.. or 0) 이 채워진 array 가 반환된다.
        // 때문에, array length === 1 이지만, 실제 값은 0x00... or 0 등으로 채워져있다.
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        // 당연하게도 따로 트랜잭션을 통해 priceBooks 또는 idBooks 를 수정하지 않았기때문에, 값은 존재한다.
        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(0); // total amount ==> 0, 유효한 오더 or 유효할 가능성이 있는 오더 모든 합 === 0

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(1);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(0);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(1);
        expect(orderBooks.buyOrderBook.length).to.equal(0);

        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(0);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);

        await sell(user1, payment, target, tokenId, toPeb(1), 5, 3); // orderIndex 1

        await PassedTime.passTimes(DAY_TO_SEC);

        orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        orderBooks = await getOrderBooks(payment, target, address0());

        // group by price 이기때문에, length 1
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(5);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(2);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].amount).to.equal(5);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[1].expireTime, 3);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].orderIndex).to.equal(1);

        expect(orderBooks.sellOrderBook.length).to.equal(1);
        expect(orderBooks.buyOrderBook.length).to.equal(0);

        expect(orderBooks.sellOrderBook[0].orders[0].order[1].amount).to.equal(5);
        expect(orderBooks.sellOrderBook[0].orders[0].order[1].maker).to.equal(user1.address);
        await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[1].expireTime, 3);

        expect(orderBooks.sellOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
    });
    it.skip('(erc1155) buyOrder view function __ level __ 4', async function () {
        // buy 등록 후 expireTime 만료
        const payment = erc20_wETH.address;
        const target = erc1155.address;
        const tokenId = tokenId1;
        const DAY_TO_SEC = 86400;

        await buy(user1, payment, target, tokenId, toPeb(1), 5, 1); // orderIndex 0

        await PassedTime.passTimes(DAY_TO_SEC);

        let orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        let orderBooks = await getOrderBooks(payment, target, address0());

        // dynamic array 로 정의한게 아니라서, 유효하지 않은 오더의 인덱스에는 빈값 (0x00.. or 0) 이 채워진 array 가 반환된다.
        // 때문에, array length === 1 이지만, 실제 값은 0x00... or 0 등으로 채워져있다.
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

        // 당연하게도 따로 트랜잭션을 통해 priceBooks 또는 idBooks 를 수정하지 않았기때문에, 값은 존재한다.
        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(0); // total amount ==> 0, 유효한 오더 or 유효할 가능성이 있는 오더 모든 합 === 0

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(1);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(1);

        expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(0);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);

        await buy(user1, payment, target, tokenId, toPeb(1), 5, 3); // orderIndex 1

        await PassedTime.passTimes(DAY_TO_SEC);

        orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        orderBooks = await getOrderBooks(payment, target, address0());

        // group by price 이기때문에, length 1
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(5);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(2);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].amount).to.equal(5);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].maker).to.equal(user1.address);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].expireTime).to.within(
            await PassedTime.getNow(),
            (await PassedTime.getNow()) + (DAY_TO_SEC + 300) * 2,
        );
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(1);

        expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(5);
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user1.address);
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime).to.within(
            await PassedTime.getNow(),
            (await PassedTime.getNow()) + (DAY_TO_SEC + 300) * 2,
        );
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
    });
    it.skip('(erc721) sellOrder view function __ level __ 4', async function () {
        // // sell 등록 후 expireTime 만료
        const payment = erc20_wETH.address;
        const target = erc721.address;
        const tokenId = user1Tokens[0];
        const DAY_TO_SEC = 86400;

        await sell(user1, payment, target, tokenId, toPeb(1), 1, 1); // orderIndex 0

        await PassedTime.passTimes(DAY_TO_SEC);

        let orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        let orderBooks = await getOrderBooks(payment, target, address0());

        // dynamic array 로 정의한게 아니라서, 유효하지 않은 오더의 인덱스에는 빈값 (0x00.. or 0) 이 채워진 array 가 반환된다.
        // 때문에, array length === 1 이지만, 실제 값은 0x00... or 0 등으로 채워져있다.
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

        // 당연하게도 따로 트랜잭션을 통해 priceBooks 또는 idBooks 를 수정하지 않았기때문에, 값은 존재한다.
        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(0); // total amount ==> 0, 유효한 오더 or 유효할 가능성이 있는 오더 모든 합 === 0

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(1);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(0);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(1);
        expect(orderBooks.buyOrderBook.length).to.equal(0);

        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(0);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);

        await sell(user1, payment, target, tokenId, toPeb(1), 5, 3); // orderIndex 1

        await PassedTime.passTimes(DAY_TO_SEC);

        orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        orderBooks = await getOrderBooks(payment, target, address0());

        // group by price 이기때문에, length 1
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1);

        // erc721 sellOrderBooks 은 무조건 array length 1
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(1);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1);
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);

        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime).to.within(
            await PassedTime.getNow(),
            (await PassedTime.getNow()) + (DAY_TO_SEC + 300) * 2,
        );
        // erc721 sell orderIndex 는 존재하지 않음, 무조건 0
        expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(1);
        expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

        expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime).to.within(
            await PassedTime.getNow(),
            (await PassedTime.getNow()) + (DAY_TO_SEC + 300) * 2,
        );
        // erc721 sell orderIndex 는 존재하지 않음, 무조건 0
        expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
    });
    it.skip('(erc721) buyOrder view function __ level __ 4', async function () {
        // buy 등록 후 expireTime 만료
        const payment = erc20_wETH.address;
        const target = erc721.address;
        const tokenId = user2Tokens[0];
        const DAY_TO_SEC = 86400;

        await buy(user1, payment, target, tokenId, toPeb(1), 1, 1); // orderIndex 0

        await PassedTime.passTimes(DAY_TO_SEC);

        let orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        let orderBooks = await getOrderBooks(payment, target, address0());

        // dynamic array 로 정의한게 아니라서, 유효하지 않은 오더의 인덱스에는 빈값 (0x00.. or 0) 이 채워진 array 가 반환된다.
        // 때문에, array length === 1 이지만, 실제 값은 0x00... or 0 등으로 채워져있다.
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

        // 당연하게도 따로 트랜잭션을 통해 priceBooks 또는 idBooks 를 수정하지 않았기때문에, 값은 존재한다.
        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(0); // total amount ==> 0, 유효한 오더 or 유효할 가능성이 있는 오더 모든 합 === 0

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(1);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(1);

        expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(0);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(address0());
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);

        await buy(user1, payment, target, tokenId, toPeb(1), 5, 3); // orderIndex 1

        await PassedTime.passTimes(DAY_TO_SEC);

        orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
        orderBooks = await getOrderBooks(payment, target, address0());

        // group by price 이기때문에, length 1
        expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
        expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
        expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(1);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(2);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].amount).to.equal(1);
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].maker).to.equal(user1.address);

        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].expireTime).to.within(
            await PassedTime.getNow(),
            (await PassedTime.getNow()) + (DAY_TO_SEC + 300) * 2,
        );
        expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);

        expect(orderBooks.sellOrderBook.length).to.equal(0);
        expect(orderBooks.buyOrderBook.length).to.equal(1);

        expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(1);
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user1.address);
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime).to.within(
            await PassedTime.getNow(),
            (await PassedTime.getNow()) + (DAY_TO_SEC + 300) * 2,
        );
        expect(orderBooks.buyOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
    });

    /**
     * level 5 __ innerCase ( sell or buy => 지불수단 상실 )
     *
     *  (innerCase __ 1) 곧 바로 다시 지불수단을 충족한 경우
     *  (innerCase __ 2) 다른 유저로 부터 같은 가격의 같은 methodSig(sell or buy) 가 생성된 후 지불수단을 충족한 경우
     *  (innerCase __ 3) 다른 유저로 부터 같은 가격의 반대의 methodSig(sell or buy) 가 생성된 후 지불수단을 충족한 경우
     */
    describe('(erc1155) sellOrder view function __ level __ 5 __ innerCase', function () {
        const initAmountERC1155 = 1000;
        const initAmountERC20 = toPeb(100);

        let payment: string;
        let target: string;
        let tokenId: number;

        let orderBooks_tokenId;
        let orderBooks;

        // sell 신청 후, 지불수단 상실에 대한 beforeEach
        beforeEach(async function () {
            payment = erc20_wETH.address;
            target = erc1155.address;
            tokenId = tokenId1;

            expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(initAmountERC1155);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(initAmountERC20);

            expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(initAmountERC1155);
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(initAmountERC20);

            await sell(user1, payment, target, tokenId, toPeb(1), 1000, 1); // orderIndex 0

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks.sellOrderBook.length).to.equal(1);

            await erc1155.connect(user1).safeTransferFrom(user1.address, user2.address, tokenId, 100, '0x');

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // 지불수단을 상실했지만, 직접적으로 onChain storage 를 수정한게 없기때문에, length 는 여전히 1,
            // 다만, getOrderBooks 에서 마지막 parameter 에 address(0) 를 넣었을 때, 유효할 가능성이 있는 오더를 같이 가져온다.
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1000);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            // address(0) 가 아닌 masterAddress 를 넣으면, 유효한 주문만 골라온다. 다만 array length 가 달라지진 않고, 내부 값이 비어있냐, 채워져있냐의 차이
            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(0);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        });

        it('(erc1155) sellOrder view function __ level __ 5 __ innerCase __ 1', async function () {
            /* (innerCase __ 1) 곧 바로 다시 지불수단을 충족한 경우 */
            await erc1155.connect(user2).safeTransferFrom(user2.address, user1.address, tokenId, 100, '0x');

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1000);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // 주문이 유효해졌기 때문에 address(0) 를 넣은 getOrderBooks 와 MasterAddress 를 넣은 getOrderBooks 의 결과는 동일하다.
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1000);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            // 체결되는지 check
            await buy(user2, payment, target, tokenId, toPeb(1), 10, 1);

            expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(990);
            expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(1010);

            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(990);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(990);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(990);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);
        });
        it('(erc1155) sellOrder view function __ level __ 5 __ innerCase __ 2', async function () {
            /* (innerCase __ 2) 다른 유저로 부터 같은 가격의 sellOrder 가 생성된 후 지불수단을 충족한 경우 */
            await sell(user2, payment, target, tokenId, toPeb(1), 1000, 1); // orderIndex 1

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // group by price, length === 1 ,
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(2000); // 실제 들어간 오더는 2000개, 유효한 오더는 1000개 뿐, address(0) 를 넣은 getOrderBooks 이라 유효하지 않은 오더까지 같이 출력

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(2);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[1].expireTime, 1);

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // group by price, length === 1 ,
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1000); // 실제 들어간 오더는 2000개, 유효한 오더는 1000개 뿐, MasterAddress 를 넣은 getOrderBooks 이라 유효한 오더 이외에는 빈 값을 리턴

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(2);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[1].expireTime, 1);

            // 지불수단 충족
            await erc1155.connect(user2).safeTransferFrom(user2.address, user1.address, tokenId, 100, '0x');

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // MasterAddress 를 넣은 getOrderBooks 는 유효한 주문만 리턴, cancel 되지 않았던 주문이고, matching 시도되어 다른 주문으로 우선체결권리가 넘어간것도 아니라
            // 다시 지불수단을 만족했을 때, 유효한 오더로 변환되는 모습
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(2000);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(2);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[1].expireTime, 1);

            await buy(user2, payment, target, tokenId, toPeb(1), 10, 1);

            expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(990);
            expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(1010);

            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(1990);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(2);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(990);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].amount).to.equal(1000);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[1].expireTime, 1);
        });
        it('(erc1155) sellOrder view function __ level __ 5 __ innerCase __ 3', async function () {
            /* (innerCase __ 3) 다른 유저로 부터 같은 가격의 buyOrder 가 생성된 후 지불수단을 충족한 경우 */
            await buy(user2, payment, target, tokenId, toPeb(1), 10, 1); // orderIndex 0

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // user1 의 sellOrder 는 findMatch 에 따라서, match 되지 않고 turnIndex 가 증가했다, 때문에 만료된 오더로 판단한다.(assignMatch 내부 조건에서 turnIndex 보다 작은 orderIndex 를 가져오면 revert)
            // 결과적으로 sellOrderBooks 의 p, buyOrderBooks 는 1
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(10);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(10);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            // 지불수단 충족
            await erc1155.connect(user2).safeTransferFrom(user2.address, user1.address, tokenId, 100, '0x');

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // 지불수단을 만족하더라도 전에 들고온 결과와 달리지지 않음
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(10);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(10);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);
        });
    });
    describe('(erc1155) buyOrder view function __ level __ 5 __ innerCase', function () {
        const initAmountERC1155 = 1000;
        const initAmountERC20 = toPeb(100);

        let payment: string;
        let target: string;
        let tokenId: number;

        let orderBooks_tokenId;
        let orderBooks;

        // buy 신청 후, 지불수단 상실에 대한 beforeEach
        beforeEach(async function () {
            payment = erc20_wETH.address;
            target = erc1155.address;
            tokenId = tokenId1;

            expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(initAmountERC1155);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(initAmountERC20);

            expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(initAmountERC1155);
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(initAmountERC20);

            await buy(user1, payment, target, tokenId, toPeb(1), 100, 1); // orderIndex 0

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks.buyOrderBook.length).to.equal(1);

            // 지불수단 상실
            await erc20_wETH.connect(user1).transfer(user2.address, toPeb(10));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // 지불수단을 상실했지만, 직접적으로 onChain storage 를 수정한게 없기때문에, length 는 여전히 1,
            // 다만, getOrderBooks 에서 마지막 parameter 에 address(0) 를 넣었을 때, 유효할 가능성이 있는 오더를 같이 가져온다.
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(100);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(100);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            // address(0) 가 아닌 masterAddress 를 넣으면, 유효한 주문만 골라온다. 다만 array length 가 달라지진 않고, 내부 값이 비어있냐, 채워져있냐의 차이
            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(0);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        });

        it('(erc1155) buyOrder view function __ level __ 5 __ innerCase __ 1', async function () {
            /* (innerCase __ 1) 곧 바로 다시 지불수단을 충족한 경우 */
            await erc20_wETH.connect(user2).transfer(user1.address, toPeb(10));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(100);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(100);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // 주문이 유효해졌기 때문에 address(0) 를 넣은 getOrderBooks 와 MasterAddress 를 넣은 getOrderBooks 의 결과는 동일하다.
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(100);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(100);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            // 체결되는지 check
            await sell(user2, payment, target, tokenId, toPeb(1), 10, 1);

            expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(1010);
            expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(990);

            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(90));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(110));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(90);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(90);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(90);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);
        });
        it('(erc1155) buyOrder view function __ level __ 5 __ innerCase __ 2', async function () {
            /* (innerCase __ 2) 다른 유저로 부터 같은 가격의 buyOrder 가 생성된 후 지불수단을 충족한 경우 */
            await buy(user2, payment, target, tokenId, toPeb(1), 100, 1); // orderIndex 1

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // group by price, length === 1 ,
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(200); // 실제 들어간 오더는 2000개, 유효한 오더는 1000개 뿐, address(0) 를 넣은 getOrderBooks 이라 유효하지 않은 오더까지 같이 출력

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(2);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[1].expireTime, 1);

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // group by price, length === 1 ,
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(100); // 실제 들어간 오더는 2000개, 유효한 오더는 1000개 뿐, MasterAddress 를 넣은 getOrderBooks 이라 유효한 오더 이외에는 빈 값을 리턴

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(2);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[1].expireTime, 1);

            // 지불수단 충족
            await erc20_wETH.connect(user2).transfer(user1.address, toPeb(10));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // MasterAddress 를 넣은 getOrderBooks 는 유효한 주문만 리턴, cancel 되지 않았던 주문이고, matching 시도되어 다른 주문으로 우선체결권리가 넘어간것도 아니라
            // 다시 지불수단을 만족했을 때, 유효한 오더로 변환되는 모습
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(200);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(2);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[1].expireTime, 1);

            await sell(user2, payment, target, tokenId, toPeb(1), 10, 1);

            expect(await erc1155.balanceOf(user1.address, tokenId)).to.equal(1010);
            expect(await erc1155.balanceOf(user2.address, tokenId)).to.equal(990);

            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(90));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(110));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.buyOrderBook.orders[0].amount).to.equal(190);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order.length).to.equal(2);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].amount).to.equal(90);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].amount).to.equal(100);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_tokenId.buyOrderBook.orders[0].order[1].expireTime, 1);
        });
        it('(erc1155) buyOrder view function __ level __ 5 __ innerCase __ 3', async function () {
            /* (innerCase __ 3) 다른 유저로 부터 같은 가격의 sellOrder 가 생성된 후 지불수단을 충족한 경우 */
            await sell(user2, payment, target, tokenId, toPeb(1), 10, 1); // orderIndex 0

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // user1 의 sellOrder 는 findMatch 에 따라서, match 되지 않고 turnIndex 가 증가했다, 때문에 만료된 오더로 판단한다.(assignMatch 내부 조건에서 turnIndex 보다 작은 orderIndex 를 가져오면 revert)
            // 결과적으로 sellOrderBooks 의 p, buyOrderBooks 는 1
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(10);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(10);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);

            // 지불수단 충족
            await erc20_wETH.connect(user2).transfer(user1.address, toPeb(10));

            orderBooks_tokenId = await getOrderBooksByTokenId(payment, target, tokenId, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // 지불수단을 만족하더라도 전에 들고온 결과와 달리지지 않음
            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.buyOrderBook.orders.length).to.equal(0);

            expect(orderBooks_tokenId.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].price).to.equal(toPeb(1));
            expect(orderBooks_tokenId.sellOrderBook.orders[0].amount).to.equal(10);

            expect(orderBooks_tokenId.sellOrderBook.orders[0].order.length).to.equal(1);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].amount).to.equal(10);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_tokenId.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_tokenId.sellOrderBook.orders[0].order[0].expireTime, 1);
        });
    });
    describe('(erc721) sellOrder view function __ level __ 5 __ innerCase', function () {
        const initAmountERC20 = toPeb(100);

        let payment: string;
        let target: string;
        let user1Token: number;

        let orderBooks_user1Token;
        let orderBooks;

        // user1 의 sell order, 이후 지불수단 상실
        beforeEach(async function () {
            payment = erc20_wETH.address;
            target = erc721.address;
            user1Token = user1Tokens[0];

            expect(await erc721.ownerOf(user1Token)).to.equal(user1.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(initAmountERC20);
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(initAmountERC20);

            await sell(user1, payment, target, user1Token, toPeb(10), 1, 1); // orderIndex 0

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks.sellOrderBook.length).to.equal(1);

            // 지불수단 상실
            await erc721.connect(user1).transferFrom(user1.address, user2.address, user1Token);

            expect(await erc721.ownerOf(user1Token)).to.equal(user2.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(initAmountERC20);
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(initAmountERC20);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // 지불수단을 상실했지만, 직접적으로 onChain storage 를 수정한게 없기때문에, length 는 여전히 1,
            // 다만, getOrderBooks 에서 마지막 parameter 에 address(0) 를 넣었을 때, 유효할 가능성이 있는 오더를 같이 가져온다.
            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.sellOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_user1Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            // address(0) 가 아닌 masterAddress 를 넣으면, 유효한 주문만 골라온다. 다만 array length 가 달라지진 않고, 내부 값이 비어있냐, 채워져있냐의 차이
            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.sellOrderBook.orders[0].amount).to.equal(0);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        });

        it('(erc721) sellOrder view function __ level __ 5 __ innerCase __ 1', async function () {
            /* (innerCase __ 1) 곧 바로 다시 지불수단을 충족한 경우 */
            await erc721.connect(user2).transferFrom(user2.address, user1.address, user1Token);

            expect(await erc721.ownerOf(user1Token)).to.equal(user1.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(initAmountERC20);
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(initAmountERC20);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.sellOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_user1Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.sellOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_user1Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            await MasterExchange.connect(user2).assignMatch({
                methodSig: buySig,
                paymentToken: payment,
                targetToken: target,
                taker: user2.address,
                tokenId: user1Token,
                price: toPeb(10),
                amount: 1,
                orderIndex: 0,
            });

            expect(await erc721.ownerOf(user1Token)).to.equal(user2.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));
        });
        it('(erc721) sellOrder view function __ level __ 5 __ innerCase __ 2', async function () {
            /* (innerCase __ 2) 다른 유저로 부터 같은 가격의 sellOrder 가 생성된 후 지불수단을 충족한 경우 */
            await sell(user2, payment, target, user1Token, toPeb(10), 1, 1);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // group by price, length === 1 ,
            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.sellOrderBook.orders[0].amount).to.equal(1);

            // 721 sellOrderBooks(group by tokenId) length <= 1 , 721 sellOrderBook 은 덮어쓰기 개념임
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            // 721 sellOrderBook 은 orderIndex 개념 없음,
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user1Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order.length).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(10));
            expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // group by price, length === 1 ,
            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.sellOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user1Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(10));
            expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            // 지불수단 충족
            await erc721.connect(user2).transferFrom(user2.address, user1.address, user1Token);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // 유효한 오더는 없지만, user2 의 sell 오더가 유효할 가능성을 가지고 있음(empty order)
            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.sellOrderBook.orders[0].amount).to.equal(0);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user1Token.sellOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(10));
            expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(0);

            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(address0());

            await sell(user1, payment, target, user1Token, toPeb(10), 1, 1);

            await MasterExchange.connect(user2).assignMatch({
                methodSig: buySig,
                paymentToken: payment,
                targetToken: target,
                taker: user2.address,
                tokenId: user1Token,
                price: toPeb(10),
                amount: 1,
                orderIndex: 9999, // 721 sellSig assignMatch 는 orderIndex => anything
            });

            expect(await erc721.ownerOf(user1Token)).to.equal(user2.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));
        });
        it('(erc721) sellOrder view function __ level __ 5 __ innerCase __ 3', async function () {
            /* (innerCase __ 3) 다른 유저로 부터 같은 가격의 buyOrder 가 생성된 후 지불수단을 충족한 경우 */
            await buy(user2, payment, target, user1Token, toPeb(10), 1, 1); // orderIndex 0

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // group by price, length === 1 ,
            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(0);
            expect(orderBooks_user1Token.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.buyOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.buyOrderBook.orders[0].amount).to.equal(1);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user1Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(0);
            expect(orderBooks.buyOrderBook.length).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(10));
            expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(0);
            expect(orderBooks_user1Token.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.buyOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.buyOrderBook.orders[0].amount).to.equal(1);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user1Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(0);
            expect(orderBooks.buyOrderBook.length).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(10));
            expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            // 지불수단 충족
            await erc721.connect(user2).transferFrom(user2.address, user1.address, user1Token);

            orderBooks_user1Token = await getOrderBooksByTokenId(payment, target, user1Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user1Token.sellOrderBook.orders.length).to.equal(0);
            expect(orderBooks_user1Token.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user1Token.buyOrderBook.orders[0].price).to.equal(toPeb(10));
            expect(orderBooks_user1Token.buyOrderBook.orders[0].amount).to.equal(1);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_user1Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user1Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(0);
            expect(orderBooks.buyOrderBook.length).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(10));
            expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            await sell(user1, payment, target, user1Token, toPeb(10), 1, 1);

            expect(await erc721.ownerOf(user1Token)).to.equal(user2.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(110));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(90));
        });
    });
    describe('(erc721) buyOrder view function __ level __ 5 __ innerCase', function () {
        const initAmountERC20 = toPeb(100);

        let payment: string;
        let target: string;
        let user2Token: number;

        let orderBooks_user2Token;
        let orderBooks;

        // user1 의 buy order, 이후 지불수단 상실
        beforeEach(async function () {
            payment = erc20_wETH.address;
            target = erc721.address;
            user2Token = user2Tokens[0];

            expect(await erc721.ownerOf(user2Token)).to.equal(user2.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(initAmountERC20);
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(initAmountERC20);

            await buy(user1, payment, target, user2Token, toPeb(100), 1, 1); // orderIndex 0

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks.buyOrderBook.length).to.equal(1);

            // 지불수단 상실
            await erc20_wETH.connect(user1).transfer(user2.address, toPeb(10));

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // 지불수단을 상실했지만, 직접적으로 onChain storage 를 수정한게 없기때문에, length 는 여전히 1,
            // 다만, getOrderBooks 에서 마지막 parameter 에 address(0) 를 넣었을 때, 유효할 가능성이 있는 오더를 같이 가져온다.
            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            // address(0) 가 아닌 masterAddress 를 넣으면, 유효한 주문만 골라온다. 다만 array length 가 달라지진 않고, 내부 값이 비어있냐, 채워져있냐의 차이
            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(0);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime).to.equal(0);
        });

        it('(erc721) buyOrder view function __ level __ 5 __ innerCase __ 1', async function () {
            /* (innerCase __ 1) 곧 바로 다시 지불수단을 충족한 경우 */
            await erc20_wETH.connect(user2).transfer(user1.address, toPeb(10));

            expect(await erc721.ownerOf(user2Token)).to.equal(user2.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(initAmountERC20);
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(initAmountERC20);

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            await MasterExchange.connect(user2).assignMatch({
                methodSig: sellSig,
                paymentToken: payment,
                targetToken: target,
                taker: user2.address,
                tokenId: user2Token,
                price: toPeb(100),
                amount: 1,
                orderIndex: 0,
            });

            expect(await erc721.ownerOf(user2Token)).to.equal(user1.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(0));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(200));
        });
        it('(erc721) buyOrder view function __ level __ 5 __ innerCase __ 2', async function () {
            /* (innerCase __ 2) 다른 유저로 부터 같은 가격의 buyOrder 가 생성된 후 지불수단을 충족한 경우 */
            await buy(user2, payment, target, user2Token, toPeb(100), 1, 1); // orderIndex 1

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            // group by price, length === 1 ,
            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order.length).to.equal(2);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[1].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order.length).to.equal(2);

            expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(100));
            expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime, 1);

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // group by price, length === 1 ,
            // 지불수단 충전 전, 0 orderIndex 는 empty order 로 표현되야함
            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order.length).to.equal(2);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[1].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order.length).to.equal(2);

            expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(100));
            expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime, 1);

            // 지불수단 충족
            await erc20_wETH.connect(user2).transfer(user1.address, toPeb(10));

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order.length).to.equal(2);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[1].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order.length).to.equal(2);

            expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(100));
            expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(user1.address);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime, 1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime, 1);

            await MasterExchange.connect(user2).assignMatch({
                methodSig: sellSig,
                paymentToken: payment,
                targetToken: target,
                taker: user2.address,
                tokenId: user2Token,
                price: toPeb(100),
                amount: 1,
                orderIndex: 0,
            });

            expect(await erc721.ownerOf(user2Token)).to.equal(user1.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(0));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(200));

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            // group by price, length === 1 ,
            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.buyOrderBook.orders[0].amount).to.equal(1);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order.length).to.equal(2);

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].amount).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[0].expireTime).to.equal(0); // 체결된 주문 expireTime === 0

            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].amount).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks_user2Token.buyOrderBook.orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks_user2Token.buyOrderBook.orders[0].order[1].expireTime, 1);

            expect(orderBooks.buyOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders.length).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order.length).to.equal(2);

            expect(orderBooks.buyOrderBook[0].orders[0].price).to.equal(toPeb(100));
            expect(orderBooks.buyOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.buyOrderBook[0].orders[0].order[0].amount).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].maker).to.equal(address0());
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.buyOrderBook[0].orders[0].order[0].expireTime).to.equal(0);

            expect(orderBooks.buyOrderBook[0].orders[0].order[1].amount).to.equal(1);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].maker).to.equal(user2.address);
            expect(orderBooks.buyOrderBook[0].orders[0].order[1].orderIndex).to.equal(1);
            await expireTimeCheck(orderBooks.buyOrderBook[0].orders[0].order[1].expireTime, 1);
        });
        it('(erc721) buyOrder view function __ level __ 5 __ innerCase __ 3', async function () {
            /* (innerCase __ 3) 다른 유저로 부터 같은 가격의 sellOrder 가 생성된 후 지불수단을 충족한 경우 */
            await sell(user2, payment, target, user2Token, toPeb(100), 1, 1);

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, address0());
            orderBooks = await getOrderBooks(payment, target, address0());

            expect(orderBooks_user2Token.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(0);

            expect(orderBooks_user2Token.sellOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.sellOrderBook.orders[0].amount).to.equal(1);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user2Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook.length).to.equal(0);

            expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(100));
            expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user2Token.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(0);

            expect(orderBooks_user2Token.sellOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.sellOrderBook.orders[0].amount).to.equal(1);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user2Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook.length).to.equal(0);

            expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(100));
            expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            // 지불수단 충족
            await erc20_wETH.connect(user2).transfer(user1.address, toPeb(10));

            orderBooks_user2Token = await getOrderBooksByTokenId(payment, target, user2Token, MasterExchange.address);
            orderBooks = await getOrderBooks(payment, target, MasterExchange.address);

            expect(orderBooks_user2Token.sellOrderBook.orders.length).to.equal(1);
            expect(orderBooks_user2Token.buyOrderBook.orders.length).to.equal(0);

            expect(orderBooks_user2Token.sellOrderBook.orders[0].price).to.equal(toPeb(100));
            expect(orderBooks_user2Token.sellOrderBook.orders[0].amount).to.equal(1);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order.length).to.equal(1);

            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].amount).to.equal(1);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].maker).to.equal(user2.address);
            expect(orderBooks_user2Token.sellOrderBook.orders[0].order[0].orderIndex).to.equal(0);
            await expireTimeCheck(orderBooks_user2Token.sellOrderBook.orders[0].order[0].expireTime, 1);

            expect(orderBooks.sellOrderBook.length).to.equal(1);
            expect(orderBooks.buyOrderBook.length).to.equal(0);

            expect(orderBooks.sellOrderBook[0].orders.length).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].price).to.equal(toPeb(100));
            expect(orderBooks.sellOrderBook[0].orders[0].amount).to.equal(1);

            expect(orderBooks.sellOrderBook[0].orders[0].order[0].orderIndex).to.equal(0);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].amount).to.equal(1);
            expect(orderBooks.sellOrderBook[0].orders[0].order[0].maker).to.equal(user2.address);
            await expireTimeCheck(orderBooks.sellOrderBook[0].orders[0].order[0].expireTime, 1);

            await buy(user1, payment, target, user2Token, toPeb(100), 1, 1);

            expect(await erc721.ownerOf(user2Token)).to.equal(user1.address);
            expect(await erc20_wETH.balanceOf(user1.address)).to.equal(toPeb(0));
            expect(await erc20_wETH.balanceOf(user2.address)).to.equal(toPeb(200));
        });
    });

    /** @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     *          common function
     * @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ */
    const expireTimeCheck = async (expireTime: BigNumber, date: number) => {
        const now = await PassedTime.getNow();
        const endTime = now + 86400 * date;

        expect(+expireTime).to.be.within(now, endTime);
    };

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
