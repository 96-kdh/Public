import { chains, defaultChain } from '@/lib/Web3Modal';
import { getCreateAddress } from 'ethers';

export const getScanLink = (chainId: number) => {
    const chain = chains[chainId];
    if (!chain) return `${defaultChain.blockExplorers?.default.url}`;
    return `${chain.blockExplorers?.default.url}`;
};

export const getPublicRPCNodes = (chainId: number): string[] => {
    const chain = chains[chainId];

    if (!chain) return [...defaultChain.rpcUrls.default.http];
    return [...chain.rpcUrls.default.http];
};

export const calculateContractAddress = (deployerAddress: string, nonce: number) => {
    return getCreateAddress({
        from: deployerAddress,
        nonce, // 배포자의 트랜잭션 nonce
    });
};
