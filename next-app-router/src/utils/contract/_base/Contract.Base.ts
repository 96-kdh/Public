import Web3, { AbiParameter, ContractAbi, Log } from 'web3';
import { id, Interface, Contract, ethers, Signer, ErrorDescription, BytesLike } from 'ethers';

import PublicNode from '@/app/api/node';

/**
 * ContractBase 클래스는 이더리움 블록체인의 스마트 컨트랙트와 상호작용하기 위한 기본 구현을 제공하는 추상 클래스입니다.
 * 이 클래스는 컨트랙트 초기화, 로그 필터링, 로그 디코딩을 위한 메서드를 제공합니다.
 */
export default abstract class ContractBase {
    protected web3: Web3;

    protected address: `0x${string}`;

    protected contract: Contract;

    private publicNode = PublicNode;
    private retryLimit: number = 1; // Number of retries before giving up

    protected constructor(
        provider: string,
        contractObj: { baseAddress: `0x${string}`; baseABI: ContractAbi },
        signer?: Signer,
    ) {
        this.web3 = new Web3(provider);
        this.address = contractObj.baseAddress;

        const iface = new Interface(contractObj.baseABI);
        const jsonProvider = signer || new ethers.JsonRpcProvider(provider);

        this.contract = new Contract(contractObj.baseAddress, iface.format(), jsonProvider);
    }

    public filterLogs(logs: Log[], eventId: string): Log {
        const eventSignature = id(eventId); // === web3.eth.abi.encodeEventSignature(eventId)
        const filterArr = logs.filter(
            (item) => item?.topics?.length && item?.topics[0].toString().toLowerCase() === eventSignature.toLowerCase(),
        );
        return filterArr[0];
    }

    public decodeLog(inputs: AbiParameter[], data: string, topics: string[]) {
        return this.web3.eth.abi.decodeLog(inputs, data, topics.slice(1)); // topic 0 index === eventSig
    }

    protected getMethod(methodName: string) {
        return this.contract.getFunction(methodName);
    }

    public parseError = (data: BytesLike): null | ErrorDescription => {
        try {
            return this.contract.interface.parseError(data);
        } catch (e) {
            return null;
        }
    };

    public getAbiJson = () => {
        return this.contract.interface.formatJson();
    };
    public getAddress = () => {
        return this.address;
    };

    protected safeCall<T extends any[], R>(
        call: (...args: T) => Promise<R>,
        retries: number = this.retryLimit,
    ): (...args: T) => Promise<R> {
        return async (...args: T): Promise<R> => {
            try {
                const result = await call(...args);
                return result;
            } catch (e) {
                if (retries > 0) {
                    console.error(e);
                    console.log(`Retries left: ${retries - 1}`);
                    console.error('arg: ', JSON.stringify(args), 'calls: ', JSON.stringify(call));
                    await this.publicNode.changeNode();
                    return this.safeCall(call, retries - 1)(...args);
                }
                throw new Error('Operation failed after maximum retries');
            }
        };
    }
}
