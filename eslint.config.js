// ESLint do BACKEND (server.js, lib/, test/). O frontend tem a config própria em
// client/eslint.config.js — os dois não se cruzam.
//
// O motivo de existir é `no-undef`. Desde a Fase 8, as rotas vivem em fábricas
// dentro de routes/ e recebem explicitamente seus helpers e constantes. Se uma
// dependência deixar de ser passada/importada, ela viraria ReferenceError só ao
// chamar aquela rota — silencioso no boot e no `node --check`. `no-undef`
// transforma isso em erro estático, antes do deploy.

const globaisNode = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  structuredClone: 'readonly',
};

module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['client/**', 'node_modules/**', 'data/**'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: globaisNode,
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // A regra que justifica esta config.
      'no-undef': 'error',
      // Helper que ficou para trás numa extração vira aviso, não erro: durante o
      // split é normal um arquivo ainda não usar tudo que importou.
      // `ignoreRestSiblings` porque `const { sessoes, ...backup } = db` é a forma
      // idiomática de OMITIR uma chave — a variável não usada ali é o objetivo,
      // não um descuido (ver GET /api/backup).
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      // Duas rotas com o mesmo nome de função de handler, ou um helper declarado
      // duas vezes depois de um merge — o tipo de coisa que a divisão pode gerar.
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
    },
  },
];
