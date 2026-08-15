import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Espelha o eslint.config.js do conecta-kanban e do ConectaAP, para os frontends
// do ecossistema seguirem a mesma régua (TSK-163). Antes deste arquivo o
// `npm run lint` saía com código 2 — "couldn't find a configuration file" — sem
// checar uma linha, apesar do script e dos plugins estarem instalados.
export default [
  // O flat config só ignora node_modules sozinho e NÃO lê o .gitignore. Sem
  // 'dist/**' aqui o lint varre o bundle minificado, que sozinho gera centenas
  // de erros.
  { ignores: ['dist/**', 'node_modules/**'] },

  {
    // É este padrão que descobre os .jsx: a flag `--ext` do ESLint 8 não faz
    // mais isso. Com '**/*.js' apenas, os .jsx ficariam de fora e o lint
    // passaria verde sem ter olhado a maior parte do projeto.
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      // Espalhar só o `.rules` e registrar o plugin à mão é proposital: o preset
      // `configs.recommended` do eslint-plugin-react-hooks ainda está no formato
      // eslintrc na 7.1.1, então espalhá-lo inteiro dentro deste array quebraria.
      ...reactHooks.configs.recommended.rules,

      // O projeto usa o JSX transform novo — nenhum arquivo importa React.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // Nenhum componente declara propTypes, e o pacote nem está instalado.
      // Ligada, esta regra sozinha produz 74 erros de ruído.
      'react/prop-types': 'off',

      // Foco em erros de correção, não em estilo.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Aviso de DX do hot reload, não de correção: AuthContext e ClientesContext
      // exportam o hook ao lado do Provider, que é o padrão idiomático de contexto.
      // Desligada também nos dois repos irmãos.
      'react-refresh/only-export-components': 'off',

      // Régua nova do react-hooks 7 (React Compiler). Medidas 4 ocorrências neste
      // repo em 15/08/2026: ClienteFormDialog.jsx:66, EtapaFormDialog.jsx:38,
      // AuthContext.jsx:38 e ClientesContext.jsx:48. Cada uma exige repensar o
      // efeito, não ajustar uma linha — está fora do escopo de "fazer o lint
      // rodar". As outras regras do preset (rules-of-hooks, exhaustive-deps,
      // immutability, purity, refs...) continuam LIGADAS e dão zero.
      // TODO(TSK-170): tratar os 4 efeitos e reativar esta regra.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // vite.config.js roda no Node (usa __dirname e process.env). Sem este bloco,
  // os globals de browser do bloco acima fariam os dois virarem no-undef.
  // Bloco só de globals: as regras do bloco anterior continuam valendo aqui.
  {
    files: ['*.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
]
