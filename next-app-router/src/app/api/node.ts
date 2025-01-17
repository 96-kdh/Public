import { ethers } from 'ethers';

import { getPublicRPCNodes } from '@/utils';
import { defaultChain } from '@/lib/Web3Modal';

// eslint-disable-next-line @typescript-eslint/naming-convention
class __PublicNode {
    private index = 0;
    private retryDelay = 10; // ms
    private reentry = false;

    public rpc: string = '';
    public chainId: number;

    constructor(chainId: number) {
        this.chainId = chainId;
        this.rpc = getPublicRPCNodes(chainId)[this.index];
    }

    public async changeNode() {
        await this.set();
    }

    private async set() {
        if (this.reentry) return;
        this.reentry = true;
        let isFail = false;

        const nodes = getPublicRPCNodes(this.chainId);

        if (nodes.length === 0) throw new Error('can`t used public rpc');

        if (this.index >= nodes.length) this.index = 0;

        try {
            const node = nodes[this.index];
            const provider = new ethers.JsonRpcProvider(node); // zero index
            await provider.getBlockNumber();
            this.rpc = node;
        } catch (e) {
            console.log('public rpc fail');
            isFail = true;
            this.index += 1;
        } finally {
            if (isFail) setTimeout(() => this.set(), this.retryDelay);
            this.reentry = false;
        }
    }

    public changeChainId(chainId: number) {
        if (chainId === this.chainId) return this.rpc;

        this.chainId = chainId;
        this.rpc = getPublicRPCNodes(chainId)[this.index];

        this.set().catch(console.error);

        return this.rpc;
    }
}

const PublicNode = new __PublicNode(defaultChain.id);

export default PublicNode;
