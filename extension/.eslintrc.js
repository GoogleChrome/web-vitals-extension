module.exports = {
  'env': {
    'browser': true,
    'es6': true,
  },
  'extends': [
    'google',
  ],
  'globals': {
    'Atomics': 'readonly',
    'SharedArrayBuffer': 'readonly',
  },
  'parser': 'babel-eslint',
  'parserOptions': {
    'ecmaVersion': 2018,
    'sourceType': 'module',
    'allowImportExportEverywhere': true
  },
  'rules': {
    'max-len': ["error", { "code": 150 }]
  },
};
