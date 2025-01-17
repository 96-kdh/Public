import { resolve } from 'path';
import fs from 'fs';
import { AbiParameter, FunctionDeclaration } from 'typechain';
import { sync as globSync } from 'glob';
import { AbiOutputParameter } from 'typechain/dist/parser/abiParser';

interface GenerateTypeOptions {
    returnResultObject?: boolean;
    useStructs?: boolean;
    includeLabelsInTupleTypes?: boolean;
}

function splitAbiByFunctionName(abi: FunctionDeclaration[]) {
    // 객체로 이름별로 그룹화
    const grouped = abi.reduce((acc: { [key: string]: FunctionDeclaration[] }, item: FunctionDeclaration) => {
        if (item.name) {
            acc[item.name] = acc[item.name] || [];
            acc[item.name].push(item);
        }
        return acc;
    }, {});

    // 중복된 항목과 고유한 항목 분리
    const duplicates = [];
    const uniques = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const name in grouped) {
        if (grouped[name].length > 1) {
            duplicates.push(grouped[name]); // 중복된 항목을 이름별로 배열에 추가
        } else {
            uniques.push(...grouped[name]);
        }
    }

    return { duplicates, uniques };
}

/**
 * 주어진 항목과 선택적 길이에 따라 배열 또는 튜플 유형을 생성합니다.
 * 길이가 제공되고 6보다 작으면 튜플 유형을 생성합니다. 그렇지 않으면 배열 유형을 생성합니다.
 *
 * @param {string} item - The item to be used in the array or tuple type.
 * @param {number} [length] - The optional length of the tuple type. Defaults to undefined.
 *
 * @return {string} - The generated array or tuple type.
 */
function generateArrayOrTupleType(item: string, length?: number): string {
    if (length !== undefined && length < 6) {
        return `[${Array(length).fill(item).join(', ')}]`;
    }

    return `${item}[]`;
}

/**
 * 주어진 EVM 유형에 대한 입력 유형을 생성합니다.
 *
 * @param options - The options for generating the type.
 * @param evmType - The EVM type to generate the input type for.
 * @returns The generated input type as a string.
 */
function generateInputType(options: GenerateTypeOptions, evmType: any): string {
    switch (evmType.type) {
        case 'integer':
        case 'uinteger':
        case 'uint256':
        case 'uint128':
        case 'uint64':
        case 'uint32':
        case 'uint16':
        case 'uint8':
        case 'uint':
            return 'bigint | string';
        case 'address':
            return 'AddressLike';
        case 'address[]':
            return 'AddressLike[]';
        case 'bytes32':
        case 'bytes4':
        case 'bytes':
        case 'dynamic-bytes':
            return 'BytesLike';
        case 'array':
            return generateArrayOrTupleType(generateInputType(options, evmType.itemType), evmType.size);
        case 'boolean':
        case 'bool':
            return 'boolean';
        case 'string':
            return 'string';
        case 'tuple': {
            if (evmType.structName && options.useStructs) {
                // return evmType.structName.toString() + common_1.STRUCT_INPUT_POSTFIX;
            }

            let temp = '';
            for (let i = 0; i < evmType.components.length; i++) {
                temp += `${evmType.components[i].name}: ${generateInputType(options, evmType.components[i])};`;
            }
            return `{${temp}}${evmType.type === 'tuple[]' ? '[]' : ''}`;
        }
        case 'tuple[]':
        case 'unknown':
        default:
            return 'any';
    }
}

/**
 * 주어진 입력 배열과 옵션을 기반으로 입력 유형을 생성합니다.
 *
 * @param {Array<AbiParameter>} input - An array of AbiParameter objects representing the input parameters.
 * @param {GenerateTypeOptions} options - An object containing options for generating the input types.
 * @returns {string} - The generated input types as a string.
 */
function generateInputTypes(input: Array<AbiParameter>, options: GenerateTypeOptions) {
    if (input.length === 0) {
        return '';
    }
    return `${input.map((v, i) => `${v.name || `arg${i}`}: ${generateInputType(options, v)}`).join(', ')}, `;
}

/**
 * 주어진 옵션과 evmType을 기반으로 출력 유형을 생성합니다.
 *
 * @param {GenerateTypeOptions} options - The options for generating the output type.
 * @param {any} evmType - The EVM type for which the output type needs to be generated.
 * @return {string} - The generated output type.
 */
function generateOutputType(options: GenerateTypeOptions, evmType: any): string {
    let returnValue = '';

    switch (evmType.type) {
        case 'integer':
        case 'uinteger':
        case 'uint256':
        case 'uint128':
        case 'uint64':
        case 'uint32':
        case 'uint16':
        case 'uint8':
        case 'uint':
            returnValue = 'bigint';
            break;
        case 'void':
            returnValue = 'void';
            break;
        case 'address':
        case 'bytes32':
        case 'bytes4':
        case 'bytes':
        case 'dynamic-bytes':
        case 'string':
            returnValue = 'string';
            break;
        case 'boolean':
        case 'bool':
            returnValue = 'boolean';
            break;
        case 'tuple[]':
        case 'tuple': {
            let temp = '';
            for (let i = 0; i < evmType.components.length; i++) {
                temp += `${evmType.components[i].name}: ${generateOutputType(options, evmType.components[i])};`;
            }
            return `{${temp}}${evmType.type === 'tuple[]' ? '[]' : ''}`;
        }
        case 'tuple[][]': {
            let temp = '';
            for (let i = 0; i < evmType.components.length; i++) {
                temp += `${evmType.components[i].name}: ${generateOutputType(options, evmType.components[i])};`;
            }
            return `{${temp}}[][]`;
        }
        case 'unknown':
        default:
            if (typeof evmType.type === 'string' && evmType.type.indexOf('[]') !== -1) {
                returnValue = `${generateOutputType(options, { type: evmType.type.replace('[]', '') })}[]`;
            }
            break;
    }

    if (!returnValue) return 'any';
    return returnValue;
}

/**
 * 제공된 옵션과 출력을 기반으로 출력 유형을 생성합니다.
 *
 * @param {GenerateTypeOptions} options - The options to use for generating the output types.
 * @param {Array<AbiOutputParameter>} outputs - The array of output parameters to generate types for.
 * @returns {any} - The generated output types.
 */
function generateOutputTypes(options: GenerateTypeOptions, outputs: Array<AbiOutputParameter>) {
    if (!options.returnResultObject && outputs.length === 1) {
        return generateOutputType(options, outputs[0]);
    }

    if (outputs.length === 0) {
        return 'Promise<void>';
    }

    //  & { amountA: undefined; amountB: undefined; liquidity: undefined }
    const arrayType: string[] = [];
    const objectType: Record<string, string> = {};
    let result = '';

    for (let i = 0; i < outputs.length; i++) {
        arrayType.push(generateOutputType(options, outputs[i]));
        objectType[outputs[i].name] = generateOutputType(options, outputs[i]);
    }
    result = `[${arrayType.join(',')}] & ${JSON.stringify(objectType)}`;

    return result;
}

/**
 * 함수 선언의 이름을 생성합니다.
 *
 * @param {FunctionDeclaration} fn - The function declaration object.
 * @returns {string} The generated name for the function declaration.
 */
function genName(fn: FunctionDeclaration): string {
    return `${fn.name}(${fn.inputs.map((item) => item.type)})`;
}

/**
 * 컨트랙트 함수를 호출하기 위해 컨트랙트 트랜잭션을 생성합니다.
 *
 * @param {FunctionDeclaration} fn - The contract function declaration.
 *
 * @return {string} The generated contract transaction.
 */
function generateContractTransaction(fn: FunctionDeclaration): string {
    // eslint-disable-next-line @typescript-eslint/naming-convention,no-underscore-dangle
    const _params = generateInputTypes(fn.inputs, { useStructs: true });
    const params = _params ? `params: {${_params}}, value = 0n` : `value = 0n`;
    const values = _params ? `, Object.values(params)` : '';

    return `public ${fn.name}(from: \`0x\${string}\`, ${params}): TransactionObject {
        return {
            from,
            to: this.address,
            data: this.contract.interface.encodeFunctionData('${fn.name}' ${values}),
            value,
        };
    }`;
}

function generateOverloadViewFunction(fn: FunctionDeclaration): string {
    return `public ${fn.name} = this.safeCall(async (sig: string, ...params: any[]) => {
         return this.contract[sig](params);
    });`;
}

function generateOverloadContractTransaction(fn: FunctionDeclaration): string {
    const params = generateInputTypes(fn.inputs, { useStructs: true });

    return `public ${fn.name}(from: \`0x\${string}\`, params?: {${params}} | bigint, value = 0n): TransactionObject {
        if (!params || typeof params === 'bigint') {
            return {
                from,
                to: this.address,
                data: this.contract.interface.encodeFunctionData('${fn.name}'),
                value,
            };
        }
    
        return {
            from,
            to: this.address,
            data: this.contract.interface.encodeFunctionData('${fn.name}', Object.values(params)),
            value,
        };
    }`;
}

function generateOverloadSignature(fn: FunctionDeclaration): string {
    let defaultParams = `value?: bigint`;

    const params = generateInputTypes(fn.inputs, { useStructs: true });
    if (params) defaultParams = `params: {${params}}, ${defaultParams}`;

    if (fn.stateMutability === 'pure' || fn.stateMutability === 'view') {
        // return `public ${fn.name}(from: \`0x\${string}\`, ${defaultParams}): ${`Promise<${generateOutputTypes({ useStructs: true }, fn.outputs)}>`};`;
        return '';
    }

    return `public ${fn.name}(from: \`0x\${string}\`, ${defaultParams}): TransactionObject;`;
}

/**
 * 스마트 컨트랙트에 대한 View, Pure 함수를 생성합니다.
 *
 * @param {FunctionDeclaration} fn - The function declaration representing the view function.
 * @returns {string} - The generated view function as a string.
 */
function generateViewFunction(fn: FunctionDeclaration): string {
    return `public ${fn.name} = this.safeCall(async (${generateInputTypes(fn.inputs, {
        useStructs: true,
    })}): ${`Promise<${generateOutputTypes({ useStructs: true }, fn.outputs)}>`} => {
         return this.contract['${genName(fn)}'](${fn.inputs.map((item, index) => item.name || `arg${index}`).join(',')});
    })`;
}

/**
 * 솔리디티 함수 선언에 대한 코드를 생성합니다.
 *
 * @param {FunctionDeclaration} fn - The function declaration object.
 *
 * @return {string} The generated code for the function.
 */
function codegenFunctions(fn: FunctionDeclaration): string {
    if (fn.stateMutability === 'pure' || fn.stateMutability === 'view') return generateViewFunction(fn);
    return generateContractTransaction(fn);
}

function codegenOverloadImplement(fn: FunctionDeclaration) {
    if (fn.stateMutability === 'pure' || fn.stateMutability === 'view') return generateOverloadViewFunction(fn);
    return generateOverloadContractTransaction(fn);
}

/**
 * Generates static call code for a function declaration.
 *
 * @param {FunctionDeclaration} fn The function declaration object containing details about inputs and outputs.
 * @return {string} The generated static call code as a string, formatted based on the function's inputs and outputs.
 */
function codeGenStaticCalls(fn: FunctionDeclaration): string {
    const params = generateInputTypes(fn.inputs, { useStructs: true });

    if (!params) {
        return `${fn.name}: async (options?: { from?: AddressLike; value?: bigint }): ${`Promise<${generateOutputTypes({ useStructs: true }, fn.outputs)}>`} => {
            return this.getMethod('${fn.name}').staticCall({ from: options?.from || AddressZero, value: options?.value || 0n });
        },`;
    }

    return `${fn.name}: async (${generateInputTypes(fn.inputs, {
        useStructs: true,
    })} options?: { from?: AddressLike; value?: bigint }): ${`Promise<${generateOutputTypes({ useStructs: true }, fn.outputs)}>`} => {
            return this.getMethod('${fn.name}').staticCall(${fn.inputs.map((item, index) => item.name || `arg${index}`).join(',')}, { from: options?.from || AddressZero, value: options?.value || 0n });
        },`;
}

/**
 * Contract 디렉터리에서 JSON 파일을 찾습니다.
 *
 * @returns {object} an object containing the root directory, contracts directory, and an array of contracts.
 */
function findFiles() {
    const rootDir = resolve(__dirname, '../');
    const contractsDir = resolve(rootDir, 'artifacts/contracts');
    const contracts = globSync('**/*.json', { cwd: contractsDir }).filter((item) => !item.includes('.dbg.'));

    return {
        rootDir,
        contractsDir,
        contracts,
    };
}

type Files = ReturnType<typeof findFiles>;

/**
 * 지정된 컨트랙트 파일에 대한 구현 코드 생성 (초기 작성 후, 컨트랙트 파일에 맞춰 수정하다보니 불완전함, 특히 loverload)
 *
 * @param {Files} files - The contract files to generate implementation for
 * @returns {void}
 */
function generateImpl({ contracts, rootDir }: Files) {
    console.log('Generating Implements');

    for (const filePath of contracts) {
        const fileNames = filePath.replace('.json', '').split('/');
        const fileName = fileNames[fileNames.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require,import/no-dynamic-require
        const json = require(`${rootDir}/artifacts/contracts/${filePath}`);

        const functions = json.abi.filter((item: { type: string }) => item.type === 'function');
        const { duplicates: overloadFunctions, uniques: uniquesFunctions } = splitAbiByFunctionName(functions);

        let generatedDuplicatesFunctions = '';

        for (const methods of overloadFunctions) {
            const sortedMethods = methods.sort((a, b) => a.inputs.length - b.inputs.length);
            const overloadSignature = sortedMethods.map((item) => generateOverloadSignature(item)).join('');
            const overloadImplement = codegenOverloadImplement(sortedMethods[sortedMethods.length - 1]);

            generatedDuplicatesFunctions += overloadSignature;
            generatedDuplicatesFunctions += overloadImplement;
        }

        const staticCalls = json.abi
            .filter(
                (item: { type: string; stateMutability: string }) =>
                    item.type === 'function' && !(item.stateMutability === 'pure' || item.stateMutability === 'view'),
            )
            .map((item: FunctionDeclaration) => `${codeGenStaticCalls(item)}\n`)
            .join('');

        const myContractImplCode = `
import { AddressLike, BytesLike, Signer } from 'ethers';
import { AddressZero } from '@ethersproject/constants';

import ContractBase from '@/utils/contract/_base/Contract.Base';
import { TransactionObject } from '@/components/blocks/modal/TransactionModal';
import ${fileName}JSON from '@/../artifacts/contracts/${filePath}';

export default class ${fileName} extends ContractBase {
    constructor(provider: string, address: \`0x\${string}\`, signer?: Signer) {
        if (!${fileName}JSON.abi) throw new Error('enter the "npm run compile" please');

        super(provider, { baseABI: ${fileName}JSON.abi, baseAddress: address }, signer);
    }

    ${uniquesFunctions.map((item: FunctionDeclaration) => `${codegenFunctions(item)}\n`).join('')}
    
    ${generatedDuplicatesFunctions}
    
    public staticCall = {
        ${staticCalls}
    }
}`;

        // Write MyContractImpl.ts file
        const myContractImplFilePath = `${rootDir}/src/utils/contract/${fileName}.ts`; // Replace with the desired output path
        fs.writeFileSync(myContractImplFilePath, myContractImplCode, 'utf-8');

        console.log(`MyContractImpl.ts has been generated successfully at ${myContractImplFilePath}`);
    }
}

// 1. npx hardhat compile (artifacts/contracts 내부 .json abi 파일 생성)
// 2. 디렉토리 내부 모든 .sol 확장자를 찾음
// 3. .json 을 기반으로 call 가능한 구현체 코드 생성
(function main() {
    const files = findFiles();

    generateImpl(files);
})();
