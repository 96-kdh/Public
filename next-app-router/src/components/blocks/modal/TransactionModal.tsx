'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { styled } from 'styled-components';
import { TransactionReceipt } from 'web3-types';
import { useSendTransaction, useTransactionReceipt } from 'wagmi';
import { GetTransactionReceiptErrorType, SendTransactionErrorType as SendTransactionErrorType_ } from 'viem';

import { RootState } from '@/ducks/store';
import { deletePendingTransaction } from '@/ducks/slice/wallet.slice';
import ArrowUpRightFromSquare from '@/components/atoms/arrow/Arrow.up.right.from.square';
import ArrowDown from '@/components/atoms/arrow/Arrow.down';
import ArrowUp from '@/components/atoms/arrow/Arrow.up';
import { getScanLink } from '@/utils';

type SendTransactionErrorType = SendTransactionErrorType_ & {
    shortMessage?: string;
};

export interface TransactionActions {
    beforeAction?: () => void | Promise<void>; // ex) loading is true ..
    afterAction: (receipt: TransactionReceipt) => void | Promise<void>; // ex) loading is false, set balanceOf ..
    exceptionAction?: (error: SendTransactionErrorType | GetTransactionReceiptErrorType | null) => void | Promise<void>; // error handler
}

export interface TransactionObject {
    from: `0x${string}`; // 실행할 지갑 주소
    to: `0x${string}`; // 실행할 컨트랙트 주소
    data: `0x${string}` | string; // 실행할 function data
    value?: bigint; // payable value
}

export interface Transaction {
    title: string; // transaction modal title
    subTitle: string; // transaction modal desc, 추후에 해당 포인트에 JSX 를 들고와서 진행중인 트랜잭션의 자세한 내용을 담아야함
    btn?: string;

    transactionData: TransactionObject;
    transactionHash?: string;
    receipt?: TransactionReceipt;

    actions: TransactionActions;
}

function TransactionModal() {
    const dispatch = useDispatch();
    let loadingTimeout: NodeJS.Timeout; // 각 button 로딩 timeout

    const { transactions, rpc } = useSelector((state: RootState) => state.walletReducer);

    const { sendTransaction, data: txHash, status: hashStatus, error: hashError, reset } = useSendTransaction();
    const { data: receipt, isLoading, status: txStatus, error: txError } = useTransactionReceipt({ hash: txHash });

    const [close, setClose] = useState<boolean>(false); // close button
    const [isSpread, setIsSpread] = useState<boolean[]>([]); // fold 여부 boolean[]
    const [isAble, setIsAble] = useState<boolean[]>([]); // 각 step 의 button 의 disable 상태 boolean[]

    const [currentTxIndex, setCurrentTxIndex] = useState<number>(0);
    const [txHashes, setTxHashes] = useState<string[]>([]); // 각 거래 tx hash, 아래 complete 의 key 값이 됨
    const [complete, setComplete] = useState<Map<string, boolean>>(new Map()); // Map<txHash, isComplete>

    const foldHandler = (index: number) => {
        const temp = [...isSpread];
        temp[index] = !isSpread[index];
        setIsSpread(temp);
    };

    const nextHandler = (index: number) => {
        if (transactions.pending.length > index) {
            const isSpreadCopy = [...isSpread];
            isSpreadCopy[index] = false;
            isSpreadCopy[index + 1] = true;
            setIsSpread(isSpreadCopy);

            const isAbleCopy = [...isAble];
            isAbleCopy[index] = false;
            isAbleCopy[index + 1] = true;
            setIsAble(isAbleCopy);

            setCurrentTxIndex(currentTxIndex + 1);
        }

        if (index === transactions.pending.length - 1) {
            dispatch(deletePendingTransaction());
        }
    };

    const clickHandler = useCallback(
        async (index: number) => {
            const currentTx = transactions.pending[index];
            if (currentTx.actions?.beforeAction) await currentTx.actions.beforeAction();

            const tx = { ...currentTx.transactionData };

            sendTransaction({
                to: tx.to,
                value: tx.value,
                account: tx.from || undefined,
                data: tx.data as `0x${string}`,
            });
        },
        [transactions.pending.length],
    );

    // 해당 단계는 계산서 생성단계
    useEffect(() => {
        if (hashStatus === 'error') {
            const currentTx = transactions.pending[currentTxIndex];
            if (currentTx.actions && currentTx.actions.exceptionAction) {
                currentTx.actions.exceptionAction(hashError as SendTransactionErrorType);
            }

            const shortMsg: string | undefined = (hashError as SendTransactionErrorType)?.shortMessage;
            if (shortMsg) window.toast('error', shortMsg);
            else if (hashError?.message) window.toast('error', hashError?.message);
            else window.toast('error', 'Undefined Errors');
            console.error(hashError);

            dispatch(deletePendingTransaction());
        } else if (hashStatus === 'success' && txHash && !complete.get(txHash)) {
            setComplete((prev) => new Map([...prev, [txHash, false]]));
            setTxHashes((prev) => [...prev, txHash]);
        }
    }, [txHash, hashStatus, hashError, currentTxIndex]);

    // 해당 단계는 생성된 계산서를 바탕으로 실제 계산하는 단계, receipt 는 영수증
    useEffect(() => {
        const currentTx = transactions.pending[currentTxIndex];

        if (txStatus === 'error') {
            if (currentTx.actions && currentTx.actions.exceptionAction) currentTx.actions.exceptionAction(txError);
            else window.toast('error', txError.message);

            console.error(txError);
            dispatch(deletePendingTransaction());
        } else if (txStatus === 'success' && receipt && txHash && complete.get(txHash) === false) {
            // status "reverted" or "success"
            if (receipt.status === 'reverted') {
                dispatch(deletePendingTransaction());
                window.toast('error', 'reverted');
            } else if (receipt.status === 'success') {
                setComplete((prev) => new Map([...prev, [txHash, true]]));
                nextHandler(currentTxIndex);

                if (currentTx.actions?.afterAction) currentTx.actions?.afterAction(receipt as TransactionReceipt);
            }
        }
    }, [txHash, txStatus, txError, receipt, currentTxIndex]);

    // initializing
    useEffect(() => {
        if (transactions.pending.length > 0) {
            setIsSpread([true, ...new Array(transactions.pending.length - 1).fill(false)]);
            setIsAble([true, ...new Array(transactions.pending.length - 1).fill(false)]);
            setClose(true);
        } else {
            setIsSpread([]);
            setIsAble([]);
            setClose(false);

            reset();
            setCurrentTxIndex(0);
            setTxHashes([]);
            setComplete(new Map());
        }
    }, [transactions.pending.length]);

    // isLoading 에 따라 버튼 text 변경
    useEffect(() => {
        const currentTx = transactions.pending[currentTxIndex];
        const originBtnText = currentTx?.btn || 'Confirm';
        const btnElement = document.getElementById(`TransactionModalBtn${currentTxIndex}`) as HTMLButtonElement;

        if (!btnElement) return () => clearTimeout(loadingTimeout);

        if (!isLoading) {
            btnElement.innerText = originBtnText;
            return () => clearTimeout(loadingTimeout);
        }

        let nextText = '.';

        (function tick() {
            console.log('tick');
            if (nextText.length >= 3) nextText = '.';
            else nextText += '.';

            btnElement.innerText = nextText;

            loadingTimeout = setTimeout(tick, 500);
        })();

        return () => clearTimeout(loadingTimeout);
    }, [isLoading]);

    return (
        <Container>
            <div className="modalContainer">
                {close && (
                    <button className="close" onClick={() => dispatch(deletePendingTransaction())}>
                        <span>X</span>
                    </button>
                )}
                <div className="transactionModal">
                    {transactions.pending.map((item, index) => {
                        return (
                            <div key={index}>
                                <div
                                    className="header"
                                    style={index === 0 ? { borderRadius: '15px 15px 0 0' } : undefined}
                                >
                                    <span className="title">{item.title}</span>
                                    <div className="foldBtn" onClick={() => foldHandler(index)}>
                                        <div className="arrowCircle">
                                            {isSpread[index] ? (
                                                <ArrowDown width="16px" height="16px" color="#fff" />
                                            ) : (
                                                <ArrowUp width="16px" height="16px" color="#fff" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className={`body ${isSpread[index] && 'spread'}`}>
                                    <div className="desc">
                                        <span className="grayF">{item.subTitle}</span>
                                    </div>

                                    <div className="pending">
                                        {currentTxIndex === index && isLoading && (
                                            <span className="grayF p">Waiting for Transaction...</span>
                                        )}
                                        {txHashes[index] && (
                                            <span
                                                className="red"
                                                onClick={() =>
                                                    window.open(`${getScanLink(rpc.chainId)}/tx/${txHashes[index]}`)
                                                }
                                            >
                                                View on Etherscan
                                                <ArrowUpRightFromSquare width="16px" height="16px" color="#fff" />
                                            </span>
                                        )}
                                    </div>

                                    <div className="buttons">
                                        <button
                                            onClick={() => clickHandler(index)}
                                            disabled={!isAble[index] || isLoading}
                                            id={`TransactionModalBtn${index}`}
                                        >
                                            {item.btn || 'Confirm'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {transactions.pending.length > 0 && <div className="modalBackShadow" />}
        </Container>
    );
}

const Container = styled.div`
    width: 100%;
    height: 100%;

    .modalContainer {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        margin: auto;
        max-height: 90%;
        height: fit-content;
        width: 35%;
        min-width: 280px;
        max-width: 360px;
        background-color: rgba(28, 27, 27, 0.901);

        z-index: 1001;
        border-radius: 15px;

        .transactionModal {
            width: 100%;
            height: 100%;
            position: relative;

            &.header:first-child {
                border-radius: 15px 15px 0 0;
            }

            .header {
                display: flex;
                justify-content: space-between;
                background: rgba(59, 59, 59, 0.4);
                padding: 18px;

                .title {
                    font-size: 18px;
                    color: #fff;
                    display: flex;
                    align-items: center;
                }

                .foldBtn {
                    cursor: pointer;
                    background: none;
                    display: flex;
                    align-items: center;

                    .arrowCircle {
                        width: 24px;
                        height: 24px;
                        transition: background-color 0.5s;
                        border-radius: 50%;
                        display: flex;
                        justify-content: center;
                        align-items: center;

                        &:hover {
                            background-color: #4f4f4f;
                        }
                    }
                }
            }

            .body {
                overflow-y: scroll;
                -ms-overflow-style: none;

                &::-webkit-scrollbar {
                    display: none;
                }

                transform: translate3d(0, 50%, 0);
                transition:
                    opacity 1s,
                    transform 1s,
                    max-height 1.2s -0.5s;
                max-height: 0;
                opacity: 0;

                .desc {
                    padding: 16px;

                    p {
                        font-size: 16px;
                        color: #9d9d9d;
                        margin: 0 0 9px 0;
                    }
                }

                .pending {
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    margin: 12px 0 2px;

                    .red {
                        margin-top: 4px;
                        cursor: pointer;
                        color: #d41002;
                        display: flex;
                        align-self: center;
                    }
                }

                .buttons {
                    padding: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    grid-gap: 6px;

                    button {
                        padding: 14px 24px;
                        backdrop-filter: blur(30px);
                        border-radius: 8px;
                        border: none;
                        width: 100%;

                        &:disabled {
                            cursor: auto;
                            opacity: 0.45;
                        }
                    }

                    button:first-child {
                        background: rgba(10, 10, 10, 0.6);
                        color: #9d9d9d;
                    }

                    button:last-child {
                        background: rgba(131, 14, 5, 0.6);
                        color: #ffffff;
                        transition: background 0.5s;

                        &:enabled:hover {
                            background: rgba(131, 14, 5);
                        }
                    }
                }
            }

            .body.spread {
                transition:
                    opacity 1s,
                    transform 1s,
                    max-height 3s;
                transform: translate3d(0, 0, 0);
                max-height: 100vh;
                opacity: 1;
            }
        }
    }

    .close {
        position: absolute;
        top: -30px;
        right: 5px;
        padding: 4px 10px;
        border-radius: 8px;
        background: rgba(59, 59, 59, 0.5);
        //border: 1px solid rgba(59, 59, 59, 0.805);
        transition: all 0.5s;

        &:hover {
            background: rgba(0, 0, 0, 0.65);
        }
    }

    .modalBackShadow {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 100vw;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.65);
    }
`;

export default TransactionModal;
