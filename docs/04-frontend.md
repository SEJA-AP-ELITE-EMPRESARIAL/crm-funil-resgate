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
│   ├── format.js            # fmtBRL, parseValorBR, num
│   ├── presenca.js          # sinal de presença: relógio + pedido (TSK-1521)
│   ├── telaAtual.js         # texto de cada tela (rota → módulo · tela)
│   └── useTelaAtual.js      # hooks com que a página e as janelas dizem onde a pessoa está
├── components/
│   ├── SinalDePresenca.jsx  # liga o sinal à sessão e à rota (montado no App.jsx)
│   ├── auth/PrivateRoute.jsx
│   └── funil/
│       ├── KanbanBoard.jsx      # board drag-and-drop (@dnd-kit)
│       ├── StageColumn.jsx      # coluna droppable
│       ├── ClienteCard.jsx      # cartão (memoizado) + selo de prioridade
│       ├── ClienteFormDialog.jsx# criar/editar/excluir (form adapta ao funil)
│       ├── ImportarDialog.jsx   # importação de Excel
│       ├── EtapaFormDialog.jsx  # criar/editar coluna do Kanban
│       ├── FunilFormDialog.jsx  # criar/editar/desativar/excluir funil
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
  - `novoFunil()`, `editarFunil()`, `excluirFunil()` — desativar ou excluir tira o
    funil da lista e a seleção salta para o primeiro que sobrou, na hora (não por
    efeito), para o board nunca apontar para um funil que já saiu;
  - `novaEtapa()`, `editarEtapa()`, `excluirEtapa()`, `moverColuna()` (colunas);
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
`atualizarCliente`, `removerCliente`, `listarFunis`, `criarFunil`,
`atualizarFunil`, `removerFunil`, `criarEtapa`, `atualizarEtapa`, `removerEtapa`,
`reordenarEtapas`, `obterConfig`, `importarClientes`, `baixarModeloImportacao`).

## Sinal de presença (TSK-1521)

O painel "Uso em tempo real" do Conecta (só SuperAdmin) mostra quem está online
no CRM e em qual tela. O `SinalDePresenca` (no `App.jsx`, fora das rotas) manda
ao backend (`POST /api/crm/presenca/`, ver [03](03-api.md)):

- um sinal por minuto com a aba aberta, também em segundo plano;
- um na troca de tela, depois de 500 ms (o redirecionamento gera um só), e um na
  volta à aba se o último saiu há 30 s ou mais;
- com a tela em texto curto (`lib/telaAtual.js`: a aba é o módulo, o funil e a
  janela aberta são a tela; o nome do cliente não vai) e o momento da última
  interação (clique, tecla, roda/toque, Voltar/Avançar).

Só manda logado e em tela interna: a tela de login, as de senha públicas e a rota
desconhecida ficam caladas, e o `/admin/` do Django nem carrega o front. O erro do
sinal nunca aparece: sem aviso, sem nova tentativa, e o pedido passa longe do
interceptor de 401 (`validateStatus`), então nunca encerra a sessão; o access
recusado (401) não é mandado de novo até o token mudar. A exceção é o access
vencido (4 h) de quem está mexendo na tela (alguma das interações acima, ou
abrir a página, nos últimos 3 min):
quem só lê o CRM não chama a API, e sumiria do painel. Para ela, o sinal renova
o access em silêncio (`renovarAcessoEmSilencio` do `api.js`, que não sai do
sistema na falha) e manda de novo; uma vez só entre dois sinais aceitos, e
dividida quando dois sinais saem juntos (só o mais novo vai depois dela). O
refresh tem o prazo das outras chamadas. A aba esquecida aberta não renova nada. O GlitchTip
descarta o rastro do sinal. Testes no `npm test` (`lib/presenca.test.js`,
`lib/telaAtual.test.js`) e e2e em `e2e/rodar-presenca.sh` (ver o README).

Uma janela nova que conte como tela: um código em `DETALHES` (`telaAtual.js`) e
`useDetalheDaTela(open, "codigo")` no componente dela.

## Telas

### Funil (`pages/Funil.jsx`)
Header preto com logo + contadores; **seletor global de funil** (um item por funil
ativo, mais **Novo funil** no fim da lista, e o lápis ao lado para editar o funil
selecionado); botões "Importar" e "Novo cliente"; duas abas:

- **Kanban** — `KanbanBoard` + filtros (busca, consultor, motivo).
- **Dashboard** — `Dashboard`.

O seletor de funil **não tem mais a opção "Todos"**: cada funil tem as próprias
colunas, e a aba Comissionamento foi removida em 2026-07-27.

### Funil novo (`FunilFormDialog`)
**Novo funil** no seletor abre o formulário (nome, cor, descrição) e, ao salvar,
já entra no funil criado — que nasce **sem colunas** e cai direto no convite do
board para criar a primeira. Editando um funil existente, o mesmo diálogo oferece
**Desativar** (tira do seletor, preserva tudo) e **Excluir** (só funil sem cliente;
a confirmação diz quantas colunas caem junto).

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
