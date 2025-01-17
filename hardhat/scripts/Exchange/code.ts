/**
 * Deploy Configs
 * AGORA CHANNEL CONTRACT DEPLOY를 위한 초기 설정 값
 * *** 반드시 설정 해 줘야 함.
 */
export interface EXCHANGE_DEPLOY_CONFIGS {
    contracts: {
        EXCHANGE_MASTER: string;
        EXCHANGE_MINI_721: string;
        EXCHANGE_MINI_721_STORE: string;
        EXCHANGE_MINI_1155: string;
        EXCHANGE_MINI_1155_STORE: string;
        EXCHANGE_VIEWER: string;
    };
    option: {
        INIT_FEE_WALLET: string;
        INIT_FEE_RATIO: number; // 10 %
    };
}

/**
 * upgrade deploy 를 사용할 때, 허용된 args 에 들어가는 type list
 */
export enum argsType {
    address = 'address',
    uint16 = 'uint16',
}

/**
 * getContractFactory 를 사용할 때, 불러오기를 위한 Contract name list
 */
export enum ExchangeContractName {
    EXCHANGE_MASTER = 'MasterExchange',
    EXCHANGE_MINI_721 = 'MiniExchange721',
    EXCHANGE_MINI_721_STORE = 'MiniExchangeStore721',
    EXCHANGE_MINI_1155 = 'MiniExchange1155',
    EXCHANGE_MINI_1155_STORE = 'MiniExchangeStore1155',
    EXCHANGE_VIEWER = 'ExchangeViewer',
}

export interface EXCHANGE_DEPLOY_OPTION {
    args: (string | number)[];
    type: argsType[];
}

/**
 * 설정값 또는 deploy Error code & Message
 */
const CODE = (...codes: number[]): string => {
    let sumMessage = '';
    for (const code of codes) {
        if (!__CODES__[code]) continue;
        sumMessage += `${Number(code).toString(16)}: ${__CODES__[code].MESSAGE} ${codes.length > 1 ? '\r\n' : ''}`;
    }
    return sumMessage;
};
const __CODES__: Record<string, any> = {
    0x0000: { CDDE: 0x0000, MESSAGE: 'SUCCESS' },
    0x0001: { CDDE: 0x0001, MESSAGE: 'faild Deploy (디플로이 실패)' },
    0x0002: { CDDE: 0x0002, MESSAGE: 'faild Change Logic (Change Logic 실패)' },
    0x0004: { CDDE: 0x0004, MESSAGE: 'invalid input (잘못된 입력)' },
    0x0008: {
        CDDE: 0x0008,
        MESSAGE: 'The resistor execution condition does not match. (resister 실행 조건이 일치하지 않음)',
    },
    0x0010: { CDDE: 0x0010, MESSAGE: 'invalid Address(유효하지 않는 계약주소)' },
    0x0020: { CDDE: 0x0020, MESSAGE: `option's array length muse be same(option 의 array length 가 서로 다름)` },
    0x0040: { CDDE: 0x0040, MESSAGE: 'undefined Message' },
    0x0080: { CDDE: 0x0080, MESSAGE: 'undefined Message' },
    0x0100: { CDDE: 0x0100, MESSAGE: 'undefined Message' },
    0x0200: { CDDE: 0x0200, MESSAGE: 'undefined Message' },
    0x0400: { CDDE: 0x0400, MESSAGE: 'undefined Message' },
    0x0800: { CDDE: 0x0800, MESSAGE: 'undefined Message' },
    0x1000: { CDDE: 0x1000, MESSAGE: 'undefined Message' },
    0x2000: { CDDE: 0x2000, MESSAGE: 'undefined Message' },
    0x4000: { CDDE: 0x4000, MESSAGE: 'undefined Message' },
    0x8000: { CDDE: 0x8000, MESSAGE: 'undefined Message' },
    CODE: CODE,
};

export default __CODES__;
