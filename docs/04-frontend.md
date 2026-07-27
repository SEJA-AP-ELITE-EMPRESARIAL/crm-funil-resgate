# 04 — Frontend (React + MUI)

JavaScript/JSX puro (sem TypeScript), espelhando o padrão do frontend ConectaAP.

## Estrutura de `src/`

```
src/
├── main.jsx                 # bootstrap: ThemeProvider + BrowserRouter + AuthProvider
├── App.jsx                  # rotas (/login e / protegida)
├── theme/index.js           # tema MUI dourado (dark-first) + cores das etapas
├── services/api.js          # axios + interceptors JWT (refresh automático)
├── contexts/
│   ├── AuthContext.jsx      # sessão (login/logout/usuário)
│   └── ClientesContext.jsx  # carteira + funis + funil selecionado
├── features/funil/services/
│   └── clientesService.js   # camada de dados (chama a API)
├── lib/
│   ├── stages.js            # helpers das etapas (a lista vem da API)
│   └── format.js            # fmtBRL, parseValorBR, num
├── components/
│   ├── auth/PrivateRoute.jsx
│   └── funil/
│       ├── KanbanBoard.jsx      # board drag-and-drop (@dnd-kit)
│       ├── StageColumn.jsx      # coluna droppable
│       ├── ClienteCard.jsx      # cartão (memoizado) + selo de prioridade
│       ├── ClienteFormDialog.jsx# criar/editar/excluir (form adapta ao funil)
│       ├── ImportarDialog.jsx   # importação de Excel
│       ├── EtapaFormDialog.jsx  # criar/editar coluna do Kanban
│       └── Dashboard.jsx        # KPIs, funil, rankings, motivos (Recharts)
├── pages/
│   ├── Login.jsx
│   └── Funil.jsx            # header + seletor de funil + abas + filtros
└── assets/logo-sejaap.png
```

## Roteamento

- `/login` — pública.
- `/` — protegida por `PrivateRoute` (redireciona para `/login` se não autenticado);
  renderiza a página `Funil`.

## Estado

Sem Redux/React Query — **Context API** (padrão ConectaAP):

- **`AuthContext`** — `user`, `isAuthenticated`, `loading`, `login()`, `logout()`.
  Tokens no `localStorage`; escuta o evento `crm-token-expired` (disparado pelo
  interceptor do axios) para deslogar.
- **`ClientesContext`** — carrega **clientes + funis + config** de uma vez e serve
  Kanban e Dashboard. Expõe:
  - `clientes` (toda a base) e `clientesDoFunil` (filtrado pelo funil selecionado);
  - `funis`, `funilSel`, `setFunilSel` (seletor global);
  - `reload()`, `moverEtapa(id, etapa)` (arraste otimista com rollback);
  - `config` (taxa de comissão, meses padrão).

## Camada de API (`services/api.js`)

- Instância axios única. Em **dev**, `baseURL` vazia → o Vite faz proxy de `/api`
  para o Django. Em **produção**, também vazia → chamadas relativas `/api` servidas
  pela mesma origem (o nginx do container proxya). `VITE_API_URL` só é usado se o
  front for servido separado da API.
- **Request interceptor:** injeta `Authorization: Bearer <access>`; remove o
  `Content-Type` em uploads `FormData`.
- **Response interceptor:** em `401`, tenta `refresh` uma vez e repete a request; se
  falhar, limpa os tokens e dispara `crm-token-expired`.

`clientesService.js` encapsula os endpoints (`listarClientes`, `criarCliente`,
`atualizarCliente`, `removerCliente`, `listarFunis`, `obterConfig`,
`importarClientes`, `baixarModeloImportacao`).

## Telas

### Funil (`pages/Funil.jsx`)
Header preto com logo + contadores; **seletor global de funil** (Todos / Indicados
APN / Base Elite / Resgate); botões "Importar" e "Novo cliente"; três abas:

- **Kanban** — `KanbanBoard` + filtros (busca, consultor, motivo).
- **Dashboard** — `Dashboard`.

O seletor de funil **não tem mais a opção "Todos"**: cada funil tem as próprias
colunas, e a aba Comissionamento foi removida em 2026-07-27.

### Kanban
`@dnd-kit`: colunas (`StageColumn`) por etapa, cartões (`ClienteCard`) arrastáveis.
Ao soltar, chama `moverEtapa` (atualização otimista + snackbar). Clicar no cartão
abre o formulário de edição.

**Performance:** o formulário de edição é **único no nível do board** (não um por
cartão) e o `ClienteCard` é **memoizado** — mover um cartão re-renderiza só ele, não
os 235. Cartões do Indicados APN mostram o **selo de prioridade** (P1–P5) colorido.

### Formulário de cliente (`ClienteFormDialog`)
Adapta-se ao funil: no **Indicados APN** aparece o bloco "Indicação" (indicador,
empresa, WhatsApp, equipe, prioridade, faixa, qtd) e somem os campos de win-back
(valor do contrato, duração, motivo distrato); nos demais, o inverso.

### Dashboard
KPIs (base, no funil, em andamento, reativados, taxa, valor recuperado), gráfico de
conversão por etapa (Recharts), **distribuição por prioridade** (P1–P5, com as cores
da prioridade) e análise por motivo de distrato. Os tooltips dos gráficos usam texto
branco.

### Gestão de colunas

O board é montado a partir das etapas do funil selecionado (`etapas` no contexto).
Cada coluna tem um menu com **renomear/cor**, **mover para a esquerda/direita** e
**excluir**; o botão **Nova coluna** fica ao fim do board. Excluir coluna com
clientes é bloqueado pelo backend (409) e vira mensagem no snackbar.

Funil sem colunas mostra um estado vazio convidando a criar a primeira — é o caso
de Base Elite e Resgate.

## Tema (`theme/index.js`)

MUI `createTheme`, **dark-first**, identidade SEJA AP (preto + dourado `#C7A444`).
Tipografia Montserrat (títulos) + Roboto (corpo). As 7 cores de etapa ficam em
`palette.stages.<etapa>`. Ver cores em [06 — Regras de negócio](06-regras-de-negocio.md).

## Build

`npm run build` → `dist/` (assets com hash). Em produção o `dist` é servido pelo
nginx do container (ver [09](09-deploy-operacao.md)).
