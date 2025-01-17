'use client';

import React, { useState } from 'react';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { useDisconnect } from 'wagmi';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { TransactionReceipt } from 'web3-types';
import { ethers } from 'ethers';
import { createPublicClient, http } from 'viem';

import { Transaction } from '@/components/blocks/modal/TransactionModal';
import { putPendingTransaction } from '@/ducks/slice/wallet.slice';
import { RootState } from '@/ducks/store';
import useWalletHook from '@/hooks/useWallet.hook';
import Counter from '@/utils/contract/Counter';
import { calculateContractAddress } from '@/utils';
import DirectRemoteWallet from '@/utils/contract/_base/DirectRemoteWallet';
import { chains } from '@/lib/Web3Modal';

const Container = styled.div`
    display: grid;
    justify-content: center;
    padding-top: 100px;
    grid-gap: 40px;

    div {
        margin-bottom: 10px;
    }

    button {
        border: 1px solid black;
        padding: 4px 8px;
        + button {
            margin-left: 2px;
        }
    }
`;

/**
 * 월렛커넥트
 * 지갑을 연결하고 연결된 지갑을 사용하여 다양한 트랜잭션과 작업을 수행합니다.
 *
 * @returns {React.Component} The WalletConnect component
 */
export default function WalletConnect(): React.JSX.Element {
    const dispatch = useDispatch();

    const { open } = useWeb3Modal();
    const { disconnect } = useDisconnect();
    const { address } = useWalletHook();

    const { rpc } = useSelector((state: RootState) => state.walletReducer);

    const [count, setCount] = useState('');
    const [expectCount, setExpectCount] = useState('');

    const exceptions = {
        supportedNetworkCheck() {
            if (Number(window.ethereum.chainId) !== rpc.chainId) {
                window.toast('error', '지원되는 네트워크가 아닙니다. 네트워크 추가를 원하시면 리드미를 참고해주세요.');
                return false;
            }

            return true;
        },

        addressCheck(_address: string) {
            if (!_address) {
                window.toast(
                    'error',
                    '배포된 컨트랙트 주소가 없습니다. [count 배포] 버튼을 눌러 먼저 컨트랙트를 배포해주세요.',
                );
                return false;
            }

            return true;
        },
    };

    const deploy = async () => {
        if (!address) return;
        if (!exceptions.supportedNetworkCheck()) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
        const json = require('../../artifacts/contracts/Counter.sol/Counter.json');
        // eslint-disable-next-line consistent-return
        if (!json.bytecode) return window.toast('error', 'enter the "npm run compile" please');

        const provider = new ethers.JsonRpcProvider(rpc.url);
        const deployerAddress = address;
        const nonce = await provider.getTransactionCount(deployerAddress);
        console.log('current nonce: ', nonce, 'deployerAddress: ', deployerAddress, 'rpc.url: ', rpc.url);
        const expectCA = calculateContractAddress(deployerAddress, nonce);
        console.log('expectCA: ', expectCA);

        const remoteWallet = new DirectRemoteWallet(window.ethereum);
        const txHash = await remoteWallet.makeTransactionHash(
            {
                data: json.bytecode,
                from: address,
            },
            {
                afterAction: () => {},
            },
        );

        await remoteWallet.sendTransaction(txHash, {
            afterAction: (receipt: TransactionReceipt) => {
                console.log(receipt);
                console.log(receipt.contractAddress);

                fetch('/api/writeFile', {
                    method: 'POST',
                    body: JSON.stringify({
                        address: receipt.contractAddress,
                        chainId: rpc.chainId,
                    }),
                }).catch(console.error);

                window.toast('success', '트랜잭션 제출 완료');
            },
        });
    };

    const readCount = async () => {
        if (!exceptions.supportedNetworkCheck()) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
        const addressJSON = require('../utils/contract/_deployed/address.json');
        if (!exceptions.addressCheck(addressJSON.Counter[rpc.chainId])) return;

        const counter = new Counter(rpc.url, addressJSON.Counter[rpc.chainId]);
        const cnt = await counter.readCount();
        setCount(cnt.toString());
    };

    const upCount = () => {
        if (!address) return;
        if (!exceptions.supportedNetworkCheck()) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
        const addressJSON = require('../utils/contract/_deployed/address.json');
        if (!exceptions.addressCheck(addressJSON.Counter[rpc.chainId])) return;

        const transactionArray: Transaction[] = [];
        const counter = new Counter(rpc.url, addressJSON.Counter[rpc.chainId]);
        const upCountTx = counter.upCount(address);

        transactionArray.push({
            title: 'Counter',
            subTitle: 'count 1 증가시키기',
            transactionData: upCountTx,

            actions: {
                afterAction: (receipt: TransactionReceipt) => {
                    console.log(receipt);
                    window.toast('success', '트랜잭션 제출 완료');
                },
            },
        });

        dispatch(putPendingTransaction({ pending: transactionArray }));
    };

    const writeCount = async () => {
        if (!address) return;
        if (!exceptions.supportedNetworkCheck()) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
        const addressJSON = require('../utils/contract/_deployed/address.json');
        if (!exceptions.addressCheck(addressJSON.Counter[rpc.chainId])) return;

        const transactionArray: Transaction[] = [];
        const counter = new Counter(rpc.url, addressJSON.Counter[rpc.chainId]);
        const writeTx = counter.writeCount(address, { _cnt: BigInt(0) });

        transactionArray.push({
            title: 'Counter 변경',
            subTitle: 'count 변경',
            transactionData: writeTx,

            actions: {
                afterAction: (receipt: TransactionReceipt) => {
                    console.log(receipt);
                    window.toast('success', '트랜잭션 제출 완료');
                },
            },
        });

        dispatch(putPendingTransaction({ pending: transactionArray }));
    };

    const expectUpCount = async () => {
        if (!exceptions.supportedNetworkCheck()) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
        const addressJSON = require('../utils/contract/_deployed/address.json');
        if (!exceptions.addressCheck(addressJSON.Counter[rpc.chainId])) return;

        const counter = new Counter(rpc.url, addressJSON.Counter[rpc.chainId]);
        const nextCount = await counter.staticCall.upCount({});

        setExpectCount(nextCount.toString());
    };

    const stepTransaction = () => {
        if (!address) return;
        if (!exceptions.supportedNetworkCheck()) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
        const addressJSON = require('../utils/contract/_deployed/address.json');
        if (!exceptions.addressCheck(addressJSON.Counter[rpc.chainId])) return;

        const transactionArray: Transaction[] = [];
        const counter = new Counter(rpc.url, addressJSON.Counter[rpc.chainId]);
        const upCountTx = counter.upCount(address);

        transactionArray.push({
            title: 'Counter',
            subTitle: 'count 1 증가시키기',
            transactionData: upCountTx,

            actions: {
                afterAction: (receipt: TransactionReceipt) => {
                    console.log(receipt);
                    window.toast('success', '트랜잭션 제출 완료');
                },
            },
        });

        transactionArray.push({
            title: 'Counter',
            subTitle: 'count 1 증가시키기',
            transactionData: upCountTx,

            actions: {
                afterAction: (receipt: TransactionReceipt) => {
                    console.log(receipt);
                    window.toast('success', '트랜잭션 제출 완료');
                },
            },
        });

        dispatch(putPendingTransaction({ pending: transactionArray }));
    };

    const valueTransfer = () => {
        if (!address) return;
        if (!exceptions.supportedNetworkCheck()) return;

        const transactionArray: Transaction[] = [];
        transactionArray.push({
            title: 'Value Transfer',
            subTitle: 'Native 자산 전송',
            transactionData: {
                data: '0x',
                from: address,
                to: address, // 받을 사람
                value: BigInt(0.001 * 10 ** 18), // 0.001, 전송하고싶은 수량
            },

            actions: {
                afterAction: (receipt: TransactionReceipt) => {
                    console.log(receipt);
                    window.toast('success', '트랜잭션 제출 완료');
                },
            },
        });
        dispatch(putPendingTransaction({ pending: transactionArray }));
    };

    const multicallEx = async () => {
        if (!exceptions.supportedNetworkCheck()) return;

        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
        const addressJSON = require('../utils/contract/_deployed/address.json');
        if (!exceptions.addressCheck(addressJSON.Counter[rpc.chainId])) return;

        const counter = new Counter(rpc.url, addressJSON.Counter[rpc.chainId]);
        const publicClient = createPublicClient({
            chain: chains[rpc.chainId],
            transport: http(),
        });
        const ca = {
            address: counter.getAddress(),
            abi: JSON.parse(counter.getAbiJson()),
        };

        const results = await publicClient.multicall({
            contracts: [
                {
                    ...ca,
                    functionName: 'readCount',
                    args: [],
                },
                {
                    ...ca,
                    functionName: 'readCount',
                    args: [],
                },
            ],
        });

        console.log(results);
    };

    return (
        <Container>
            <div>
                {address && (
                    <div>
                        <button onClick={() => disconnect()}>지갑 연결 헤제</button>
                        <button onClick={() => open({ view: 'Networks' })}>네트워크 변경</button>
                    </div>
                )}
                <button onClick={() => open()}>{!address ? '지갑연결' : address.slice(0, 8)}</button>
            </div>

            {address && (
                <>
                    <div>
                        <div>
                            <button onClick={deploy}>count 배포</button>
                        </div>
                    </div>

                    <div>
                        <div>
                            <button onClick={readCount}>count 읽기</button>
                            {count && <p>{count}</p>}
                        </div>

                        <div>
                            <button onClick={upCount}>count 증가</button>
                        </div>

                        <div>
                            <button onClick={expectUpCount}>다음 count 예상하기</button>
                            {expectCount && <p>{expectCount}</p>}
                        </div>

                        <div>
                            <button onClick={writeCount}>writeCount (에러 상황 연출)</button>
                        </div>

                        <div>
                            <button onClick={multicallEx}>multicall 예제</button>
                        </div>
                    </div>

                    <div>
                        <button onClick={stepTransaction}>스탭 트랜잭션</button>
                    </div>

                    <div>
                        <button onClick={valueTransfer}>네이티브 자산 전송 (자기 자신에게)</button>
                    </div>
                </>
            )}
        </Container>
    );
}
