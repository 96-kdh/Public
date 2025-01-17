const dotenv = require('dotenv');
dotenv.config();

export const isTestNet = process.env.network === 'baobab';
export const isDev = process.env.NODE_ENV !== 'production';

/**
 * Baobab network variables
 * _TESTNET 환경변수 (실제 바오밥 환경)
 */
const EXCHANGE_VIEWER_TESTNET = '';
const MASTER_EXCHANGE_TESTNET = '';
const MINI_EXCHANGE_721_TESTNET = '';
const MINI_EXCHANGE_1155_TESTNET = '';
const MINI_EXCHANGE_STORE_721_TESTNET = '';
const MINI_EXCHANGE_STORE_1155_TESTNET = '';

/**
 * cypress network development variables
 * _MAINNET_DEV 환경변수(실제 메인넷의 Development 환경)
 */
const EXCHANGE_VIEWER_MAINNET_DEV = '';
const MASTER_EXCHANGE_MAINNET_DEV = '';
const MINI_EXCHANGE_721_MAINNET_DEV = '';
const MINI_EXCHANGE_1155_MAINNET_DEV = '';
const MINI_EXCHANGE_STORE_721_MAINNET_DEV = '';
const MINI_EXCHANGE_STORE_1155_MAINNET_DEV = '';

/**
 * cypress network production variables
 * _MAINNET 환경변수(실제 메인넷의 Production 환경)
 */
const EXCHANGE_VIEWER_MAINNET = '';
const MASTER_EXCHANGE_MAINNET = '';
const MINI_EXCHANGE_721_MAINNET = '';
const MINI_EXCHANGE_1155_MAINNET = '';
const MINI_EXCHANGE_STORE_721_MAINNET = '';
const MINI_EXCHANGE_STORE_1155_MAINNET = '';

export const klayMintFeeWallet = '0xC99Ca9040FAB9e7AAb64988276fAD532e0c10B65';

export const masterExchange = isTestNet
    ? MASTER_EXCHANGE_TESTNET
    : isDev
    ? MASTER_EXCHANGE_MAINNET_DEV
    : MASTER_EXCHANGE_MAINNET;

export const miniExchange721 = isTestNet
    ? MINI_EXCHANGE_721_TESTNET
    : isDev
    ? MINI_EXCHANGE_721_MAINNET_DEV
    : MINI_EXCHANGE_721_MAINNET;

export const miniExchange1155 = isTestNet
    ? MINI_EXCHANGE_1155_TESTNET
    : isDev
    ? MINI_EXCHANGE_1155_MAINNET_DEV
    : MINI_EXCHANGE_1155_MAINNET;

export const miniExchangeStore721 = isTestNet
    ? MINI_EXCHANGE_STORE_721_TESTNET
    : isDev
    ? MINI_EXCHANGE_STORE_721_MAINNET_DEV
    : MINI_EXCHANGE_STORE_721_MAINNET;

export const miniExchangeStore1155 = isTestNet
    ? MINI_EXCHANGE_STORE_1155_TESTNET
    : isDev
    ? MINI_EXCHANGE_STORE_1155_MAINNET_DEV
    : MINI_EXCHANGE_STORE_1155_MAINNET;

export const exchangeViewer = isTestNet
    ? EXCHANGE_VIEWER_TESTNET
    : isDev
    ? EXCHANGE_VIEWER_MAINNET_DEV
    : EXCHANGE_VIEWER_MAINNET;

console.log(`
-------------- 실행환경
  envVariables info
  
  network :                 ${process.env.network}
  NODE_ENV :                ${process.env.NODE_ENV}
`);
