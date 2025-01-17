module.exports = {
    env: {
        browser: false,
        es2021: true,
        mocha: true,
        node: true,
    },
    plugins: ['@typescript-eslint'],
    extends: ['standard', 'plugin:prettier/recommended', 'plugin:node/recommended'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 12,
    },
    rules: {
        'node/no-unsupported-features/es-syntax': ['error', { ignores: ['modules'] }],
        'camelcase': 0,
        'no-throw-literal': 0,
        'no-unused-vars': 0,
        'node/no-extraneous-import': 0,
        'node/no-extraneous-require': 0,
        'no-unused-expressions': 0,
        'node/no-missing-import': 0,
        'array-callback-return': 0,
    },
};
