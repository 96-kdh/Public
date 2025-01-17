import { createSlice } from '@reduxjs/toolkit';

import { Transaction } from '@/components/blocks/modal/TransactionModal';
import PublicNode from '@/app/api/node';

type WalletState = {
    transactions: {
        pending: Transaction[];
    };
    rpc: {
        url: string;
        chainId: number;
    };
};

const initialState: WalletState = {
    transactions: {
        pending: [],
    },
    rpc: {
        url: PublicNode.rpc,
        chainId: PublicNode.chainId,
    },
};

export const wallet = createSlice({
    name: 'wallet',
    initialState,
    reducers: {
        deletePendingTransaction: (state) => {
            state.transactions.pending = [];
        },
        putPendingTransaction: (state, action: { payload: { pending: Transaction[] } }) => {
            state.transactions.pending = action.payload.pending;
        },
        setRpc: (state, action: { payload: { url: string; chainId: number } }) => {
            state.rpc = action.payload;
        },
    },
});

export const { deletePendingTransaction, putPendingTransaction, setRpc } = wallet.actions;
export default wallet.reducer;
