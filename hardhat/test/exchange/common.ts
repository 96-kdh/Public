import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

/**
 *  evm_increaseTime method 는 모든 Test Case에 영향을 줌,
 *  때문에 Singleton Pattern 을 통해 increaseTime 을 모두 공유할 수 있도록 클래스 생성
 */
class PassedTime {
    private now: number = 0;

    public passTimes = async (seconds: number): Promise<number> => {
        // await ethers.provider.send('evm_increaseTime', [seconds]);
        const beforePassedTimeBlockNumber = await ethers.provider.getBlockNumber();
        const beforePassedTimeBlock = await ethers.provider.getBlock(beforePassedTimeBlockNumber);

        this.now = beforePassedTimeBlock.timestamp;

        const calls = [];
        for (let i = 0; i < seconds; i++) {
            calls.push(ethers.provider.send('evm_mine', []));
        }
        await Promise.all(calls);

        const afterPassedTimeBlockNumber = await ethers.provider.getBlockNumber();
        const afterPassedTimeBlock = await ethers.provider.getBlock(afterPassedTimeBlockNumber);

        const passedTime = afterPassedTimeBlock.timestamp - beforePassedTimeBlock.timestamp;
        const minedBlock = afterPassedTimeBlockNumber - beforePassedTimeBlockNumber;

        this.setNow(passedTime);

        console.log(`${passedTime} seconds evm_increaseTime & ${minedBlock} block mined\n`);

        return this.now;
    };

    public getNow = async (): Promise<number> => {
        if (!this.now) {
            const _currentBlockNumber = await ethers.provider.getBlockNumber();
            const _currentBlock = await ethers.provider.getBlock(_currentBlockNumber);

            this.now = _currentBlock.timestamp;

            return this.now;
        }

        // getNow 호출할 때 마다 1 block mine
        await ethers.provider.send('evm_mine', []);
        const currentBlockNumber = await ethers.provider.getBlockNumber();
        const currentBlock = await ethers.provider.getBlock(currentBlockNumber);

        const now = currentBlock.timestamp;
        const runTime = now - this.now;

        this.setNow(runTime);

        return this.now;
    };

    private setNow = (seconds: number) => {
        this.now += seconds;
    };
}

export default new PassedTime();

export const convertBigNumber = (input: number | string): BigNumber => {
    return BigNumber.from(input);
};

// 소수점 두번째 자리까지 허용, 소수점 3번째 자리를 포함해서 넣으면 underflow error
export const toPeb = (input: number): BigNumber => {
    return BigNumber.from(Math.floor(input * 10 ** 2)).mul(BigNumber.from(10).pow(16));
};

export const address0 = (): string => '0x0000000000000000000000000000000000000000';
