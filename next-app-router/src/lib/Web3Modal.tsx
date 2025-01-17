'use client';

import { createWeb3Modal } from '@web3modal/wagmi/react';
import { State, WagmiProvider } from 'wagmi';
import { bscTestnet, polygonMumbai, arbitrumSepolia, baseSepolia } from 'viem/chains';
import React, { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import type { Chain } from 'viem';

// Setup queryClient
const queryClient = new QueryClient({});

// 1. Get projectId at https://cloud.walletconnect.com
const projectId = '178e3a1df5591e0679afb2c30476cc9e';

// 2. Create wagmiConfig
const metadata = {
    name: 'Web3Modal',
    description: 'Web3Modal Example',
    url: 'https://web3modal.com',
    icons: ['https://avatars.githubusercontent.com/u/37784886'],
};

const supportedChains: [Chain, ...Chain[]] = [bscTestnet, polygonMumbai, arbitrumSepolia, baseSepolia];

export const defaultChain = supportedChains[0];
export const chains: { [key: number]: Chain } = {};
for (const chain of supportedChains) chains[chain.id] = chain;

const config = defaultWagmiConfig({
    chains: supportedChains,
    projectId,
    metadata,
    ssr: false,
});

// 3. Create modal
createWeb3Modal({
    wagmiConfig: config,
    projectId,
    enableAnalytics: true, // Optional - defaults to your Cloud configuration
    enableOnramp: true, // Optional - false as default
    allowUnsupportedChain: true,
    defaultChain,
});

export function Web3Modal({ children, initialState }: { children: ReactNode; initialState?: State }) {
    return (
        <WagmiProvider config={config} initialState={initialState} reconnectOnMount>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WagmiProvider>
    );
}
