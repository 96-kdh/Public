import { ethers } from 'hardhat';

class PassedBlock {
    private now: number = 0;

    public passedBlock = async (block: number): Promise<number> => {
        if (this.now === 0) this.now = await ethers.provider.getBlockNumber();

        const calls = [];
        for (let i = 0; i < block; i++) {
            calls.push(ethers.provider.send('evm_mine', []));
        }
        await Promise.all(calls);
        console.log(`console : ${block} block mined`);

        this.now += block;

        return this.now;
    };

    public getBlock = async (): Promise<number> => {
        this.now = await ethers.provider.getBlockNumber();

        return this.now;
    };
}

export default new PassedBlock();
