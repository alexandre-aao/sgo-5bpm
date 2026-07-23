import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config(
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactRefresh.configs.vite,
    ],
    // eslint-plugin-react-hooks@7's configs['recommended-latest'] ainda usa
    // "plugins": ["react-hooks"] (formato legado do eslintrc) e quebra o flat
    // config do ESLint 10 ("plugins" precisa ser objeto) — registra o plugin
    // manualmente e só reaproveita as rules do preset deles.
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: reactHooks.configs['recommended-latest'].rules,
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
)
