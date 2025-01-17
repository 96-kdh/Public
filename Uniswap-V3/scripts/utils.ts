import { BigNumber, BigNumberish, utils } from 'ethers';
import BN from 'bignumber.js';
import { encodeSqrtRatioX96, nearestUsableTick, priceToClosestTick, TickMath, tickToPrice } from '@uniswap/v3-sdk';
import { ChainId, Currency, CurrencyAmount, Fraction, Percent, Price, Token } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import { parseUnits } from 'ethers/lib/utils';

enum FeeAmount {
    LOWEST = 100,
    LOW = 500,
    MEDIUM = 3000,
    HIGH = 10000,
}

const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
    [FeeAmount.LOWEST]: 1,
    [FeeAmount.LOW]: 10,
    [FeeAmount.MEDIUM]: 60,
    [FeeAmount.HIGH]: 200,
};

BN.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

(function main() {
    try {
        const { bytecode } = require('../artifacts/contracts/core/UniswapV3Pool.sol/UniswapV3Pool.json');
        const POOL_BYTECODE_HASH = utils.keccak256(bytecode);

        console.log('POOL_BYTECODE_HASH: ', POOL_BYTECODE_HASH);
    } catch (e) {
        console.log('POOL_BYTECODE_HASH NOT FOUND');
    }
})();

// 소수점 두번째 자리까지 허용, 소수점 3번째 자리를 포함해서 넣으면 underflow error
export const toPeb = (input: number | string): BigNumber => {
    return BigNumber.from(Math.floor(+input * 10 ** 2)).mul(BigNumber.from(10).pow(16));
};

export const MAX_INT = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

export const isYes = (str: string): boolean => {
    return str.toLowerCase() === 'y' || str.toLowerCase() === 'yes';
};

export function isAscii(str: string): boolean {
    // eslint-disable-next-line no-control-regex
    return /^[\x00-\x7F]*$/.test(str);
}

/**
 * ASCII 문자열을 바이트32 16진수 값으로 변환합니다.
 *
 * @param {string} str - The ASCII string to convert.
 * @return {string} The converted bytes32 hexadecimal value.
 * @throws {Error} if the string length is greater than 32 or if the string contains non-ASCII characters.
 */
export function asciiStringToBytes32(str: string): string {
    if (str.length > 32 || !isAscii(str)) {
        throw new Error('Invalid label, must be less than 32 characters');
    }

    return '0x' + Buffer.from(str, 'ascii').toString('hex').padEnd(64, '0');
}

/**
 * 주어진 보유량을 기준으로 가격의 제곱근을 인코딩합니다.
 *
 * @param {BigNumberish} reserve1 - The first reserve.
 * @param {BigNumberish} reserve0 - The second reserve.
 *
 * @return {BigNumber} - The encoded price square root.
 */
export function encodePriceSqrt(reserve1: BigNumberish, reserve0: BigNumberish): BigNumber {
    return BigNumber.from(
        new BN(reserve1.toString())
            .div(reserve0.toString())
            .sqrt()
            .multipliedBy(new BN(2).pow(96))
            .integerValue(3)
            .toString(),
    );
}

/**
 * 제공된 매개변수를 사용하여 Uniswap V3 풀의 주소를 계산합니다.
 *
 * @param {string} factoryAddress - The address of the Uniswap V3 factory contract.
 * @param {Array} tokens - An array containing the addresses of the two tokens in the pool.
 * @param {number} fee - The fee level of the pool.
 *
 * @return {string} - The computed address of the pool.
 */
export function computePoolAddress(factoryAddress: string, [tokenA, tokenB]: [string, string], fee: number): string {
    const { bytecode } = require('../artifacts/contracts/core/UniswapV3Pool.sol/UniswapV3Pool.json');
    const POOL_BYTECODE_HASH = utils.keccak256(bytecode);

    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
    const constructorArgumentsEncoded = utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint24'],
        [token0, token1, fee],
    );
    const create2Inputs = [
        '0xff',
        factoryAddress,
        // salt
        utils.keccak256(constructorArgumentsEncoded),
        // init code hash
        POOL_BYTECODE_HASH,
    ];
    const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`;
    return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`);
}

export const ZERO_PERCENT = new Percent('0');
export const ONE_HUNDRED_PERCENT = new Percent('1');

export const MaxUint128 = BigNumber.from(2).pow(128).sub(1);

export const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing;

export const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing;

export function compareToken(a: { address: string }, b: { address: string }): -1 | 1 {
    return a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1;
}

export function sortedTokens(
    a: { address: string },
    b: { address: string },
): [typeof a, typeof b] | [typeof b, typeof a] {
    return compareToken(a, b) < 0 ? [a, b] : [b, a];
}

export function encodePath(path: string[], fees: FeeAmount[]): string {
    const FEE_SIZE = 3;
    if (path.length !== fees.length + 1) {
        throw new Error('path/fee lengths do not match');
    }

    let encoded = '0x';
    for (let i = 0; i < fees.length; i++) {
        // 20 byte encoding of the address
        encoded += path[i].slice(2);
        // 3 byte encoding of the fee
        encoded += fees[i].toString(16).padStart(2 * FEE_SIZE, '0');
    }
    // encode the final token
    encoded += path[path.length - 1].slice(2);

    return encoded.toLowerCase();
}

export function calculateSlippageAmount(value: BigNumber, slippage: Percent): [BigNumber, BigNumber] {
    const ONE = new Fraction(1, 1);

    if (slippage.lessThan(0) || slippage.greaterThan(ONE)) throw new Error('Unexpected slippage');
    return [value.mul(ONE.subtract(slippage).quotient.toString()), value.mul(ONE.add(slippage).quotient.toString())];
}

export function tryParsePrice(baseToken?: Token, quoteToken?: Token, value?: string) {
    if (!baseToken || !quoteToken || !value) {
        return undefined;
    }

    if (!value.match(/^\d*\.?\d+$/)) {
        return undefined;
    }

    const [whole, fraction] = value.split('.');

    const decimals = fraction?.length ?? 0;
    const withoutDecimals = JSBI.BigInt((whole ?? '') + (fraction ?? ''));

    return new Price(
        baseToken,
        quoteToken,
        JSBI.multiply(JSBI.BigInt(10 ** decimals), JSBI.BigInt(10 ** baseToken.decimals)),
        JSBI.multiply(withoutDecimals, JSBI.BigInt(10 ** quoteToken.decimals)),
    );
}

export function tryParseTick(
    baseToken?: Token,
    quoteToken?: Token,
    feeAmount?: FeeAmount,
    value?: string,
): number | undefined {
    if (!baseToken || !quoteToken || !feeAmount || !value) {
        return undefined;
    }

    const price = tryParsePrice(baseToken, quoteToken, value);

    if (!price) {
        return undefined;
    }

    let tick: number;

    // check price is within min/max bounds, if outside return min/max
    const sqrtRatioX96 = encodeSqrtRatioX96(price.numerator, price.denominator);

    if (JSBI.greaterThanOrEqual(sqrtRatioX96, TickMath.MAX_SQRT_RATIO)) {
        tick = TickMath.MAX_TICK;
    } else if (JSBI.lessThanOrEqual(sqrtRatioX96, TickMath.MIN_SQRT_RATIO)) {
        tick = TickMath.MIN_TICK;
    } else {
        // this function is agnostic to the base, will always return the correct tick
        tick = priceToClosestTick(price);
    }

    return nearestUsableTick(tick, TICK_SPACINGS[feeAmount]);
}

export function getTickToPrice(baseToken?: Token, quoteToken?: Token, tick?: number): Price<Token, Token> | undefined {
    if (!baseToken || !quoteToken || typeof tick !== 'number') {
        return undefined;
    }
    return tickToPrice(baseToken, quoteToken, tick);
}

export function tryParseCurrencyAmount<T extends Currency>(
    value?: string,
    currency?: T,
): CurrencyAmount<T> | undefined {
    if (!value || !currency) {
        return undefined;
    }
    try {
        const typedValueParsed = parseUnits(value, currency.decimals).toString();
        if (typedValueParsed !== '0') {
            return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed));
        }
    } catch (error) {
        // fails if the user specifies too many decimal places of precision (or maybe exceed max uint?)
        console.debug(`Failed to parse input amount: "${value}"`, error);
    }
    return undefined;
}
