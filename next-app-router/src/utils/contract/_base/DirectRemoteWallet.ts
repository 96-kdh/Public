import { EthExecutionAPI, SupportedProviders, TransactionReceipt } from 'web3-types';
import { Web3ContextInitOptions } from 'web3-core';
import { Eip1193Provider, ethers } from 'ethers';
import Web3 from 'web3';

import { TransactionActions, TransactionObject } from '@/components/blocks/modal/TransactionModal';

export default class DirectRemoteWallet {
    private readonly provider;

    private readonly web3;

    constructor(provider: string | SupportedProviders<EthExecutionAPI> | Web3ContextInitOptions<EthExecutionAPI>) {
        this.provider = new ethers.BrowserProvider(provider as Eip1193Provider);
        this.web3 = new Web3(provider);
    }

    public async makeTransactionHash(
        tx:
            | TransactionObject
            | {
                  data: string;
                  from: string;
              }, // deploy contract object
        actions: TransactionActions,
    ): Promise<string> {
        console.log(tx);

        try {
            await this.provider.estimateGas(tx); // 만약 트랜잭션이 실패한다면 여기서 throw 날림
            const signer = await this.provider.getSigner();
            const TX = await signer.sendTransaction(tx);
            return TX.hash;
        } catch (error: any) {
            console.log('makeTransactionHash: ', error);
            if (actions.exceptionAction) actions.exceptionAction(error);
            return '';
        }
    }

    // external function,
    public async sendTransaction(txHash: string, actions: TransactionActions) {
        try {
            await this.transactionWaitFunction(txHash, actions);
        } catch (error: any) {
            console.log('sendTransaction: ', error);
            if (actions.exceptionAction) actions.exceptionAction(error);
        }
    }

    private async transactionWaitFunction(txHash: string, actions: TransactionActions) {
        try {
            const receipt: TransactionReceipt = await this.web3.eth.getTransactionReceipt(txHash);
            if (actions.afterAction) actions.afterAction(receipt);
        } catch (_) {
            setTimeout(async () => {
                await this.transactionWaitFunction(txHash, actions);
            }, 1000);
        }
    }
}
