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
        'node/no-unsupported-features/es-builtins': 0,
        'node/no-unpublished-import': 0,
        'node/no-extraneous-import': 0,
        'node/no-unpublished-require': 0,
        'node/no-missing-import': 0,
        'node/no-unsupported-features/es-syntax': 0,
        'no-unused-vars': 0,
        'camelcase': 0,
        'node/no-missing-require': 0,
        'no-undef': 1,
    },
};
