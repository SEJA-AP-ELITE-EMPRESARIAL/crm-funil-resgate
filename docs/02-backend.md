# 02 — Backend (Django/DRF)

## Estrutura do app `apps/crm`

```
apps/crm/
├── models/
│   ├── api_key.py       # ApiKey (integração externa)
│   ├── cliente.py       # Cliente
│   ├── etapa.py         # Etapa + TipoEtapa (coluna por funil)
│   ├── funil.py         # Funil
│   └── api_key.py       # ApiKey + EscopoApiKey (integração externa)
├── serializers/
│   ├── cliente.py       # ClienteSerializer (read) + ClienteWriteSerializer
│   └── funil.py         # FunilSerializer
├── services/
│   ├── cliente_service.py   # criar/atualizar/remover (transações)
│   ├── etapa_service.py     # colunas: criar/editar/excluir/reordenar
│   └── importacao.py        # importação de Excel (openpyxl)
├── views/
│   ├── _helpers.py      # clientes_base() — base compartilhada
│   ├── cliente_views.py # CRUD de clientes
│   ├── funil_views.py   # lista de funis (+ etapas embutidas)
│   ├── etapa_views.py   # CRUD das colunas do Kanban
│   ├── auth_views.py    # login (e-mail/username), /me, /config
│   └── import_views.py  # importar + modelo .xlsx
├── management/commands/
│   ├── seed_demo.py         # usuário demo + funis (sem exemplos por padrão)
│   ├── importar_indicados.py# importa a planilha do APN
│   └── criar_api_key.py     # emite chave de API pela CLI
├── migrations/
├── tests/
│   ├── test_api.py      # 10 testes
│   ├── test_api_key.py  # 19 testes (integração externa)
│   └── test_etapas.py   # 22 testes (colunas por funil + migração de dados)
├── authentication.py    # ApiKeyAuthentication
├── permissions.py       # HasApiScope (leitura × escrita)
├── throttling.py        # ApiKeyRateThrottle (cota por chave)
├── pagination.py        # paginação opt-in de clientes
├── admin.py             # Django Admin (Funil + Cliente + ApiKey)
└── urls.py              # rotas do app
```

Padrão espelhado do ConectaAP: **views function-based** (`@api_view`), regra de
negócio em `services/`, leitura/escrita em serializers separados.

## Modelos

### `Funil` (`models/funil.py`)

Tabela gerenciável pelo admin — permite criar/renomear/desativar funis sem migration.

| Campo | Tipo | Observação |
|-------|------|-----------|
| `nome` | CharField(80), único | Ex.: "Indicados APN" |
| `slug` | SlugField, único | Ex.: `indicados_apn` (usado pelo front) |
| `cor` | CharField(9) | Hex do selo, ex.: `#3D7EC5` |
| `descricao` | CharField(200) | |
| `ativo` | BooleanField | Só funis ativos aparecem no seletor |
| `ordem` | PositiveSmallInteger | Ordenação |
| `criado_em` / `atualizado_em` | DateTime | auto |

### `Etapa` (`models/etapa.py`)

Coluna do Kanban, **pertencente a um funil** (`funil.etapas`). Substituiu o
`EtapaFunil` (TextChoices global) em 2026-07-27.

| Campo | Observação |
|-------|-----------|
| `funil` (FK) | dono da coluna; `on_delete=CASCADE` |
| `nome` / `emoji` / `cor` | o que aparece no board |
| `slug` | derivado do nome na criação, **único no funil** e estável ao renomear |
| `ordem` | posição no board |
| `tipo` | `progressao` · `ganho` · `perda` · `auxiliar` — é o que o Dashboard lê |

`Cliente.etapa` é FK para cá com **`on_delete=PROTECT`**: é o que impede excluir
uma coluna que ainda tem cartões.

### `Cliente` (`models/cliente.py`)

Cliente/lead trabalhado em um funil. Campos principais:

| Grupo | Campos |
|-------|--------|
| Funil | `funil` (FK→Funil), `etapa` (FK→Etapa, nullable = fora do funil), `ordem`, `notas` |
| Identificação | `nome` (obrigatório), `cnpj`, `email`, `telefone` |
| Localização | `municipio`, `estado`, `pais` |
| Comercial | `segmento`, `canal`, `status`, `produto_atual`, `consultor_atual`, `motivo_distrato` |
| Responsável | `quem_fara_contato` (texto — usado nos rankings), `responsavel` |
| **Indicação (APN)** | `indicador_nome`, `indicador_empresa`, `indicador_whatsapp`, `indicador_equipe`, `faixa_faturamento`, `prioridade` (P1–P5), `qtd_indicacoes` |
| Operacional | `data_onboarding`, `data_offboarding`, `qtd_socios`, `lt` |
| Contrato | `valor_contrato` (Decimal 12,2), `meses_contrato` (PositiveSmallInt) |
| Metadados | `criado_por` (FK→User, SET_NULL), `criado_em`, `atualizado_em` |

**Propriedades calculadas** (regras de negócio, ver [06](06-regras-de-negocio.md)):

- `meses_efetivos` → `meses_contrato` ou o padrão global (`CRM_MESES_CONTRATO_PADRAO`, 12).
- `parcela_mensal` → `valor_contrato / meses_efetivos`.
- `comissao_mensal` → `parcela_mensal * CRM_COMISSAO_RATE` (0,03).

`Meta`: `ordering = ("ordem", "nome")`, índices em `etapa`, `quem_fara_contato` e `funil`.

### `ApiKey` (`models/api_key.py`)

Credencial de integração externa. Formato `crm_<prefixo>_<segredo>`; o banco guarda
só o **SHA-256 da chave completa** — o texto puro aparece uma vez, na criação.

| Campo | Observação |
|-------|-----------|
| `nome` | identificação (ex.: "n8n — sync diária") |
| `prefixo` (8 chars) | parte pública, indexada; localiza o registro na validação |
| `hash_chave` | SHA-256; comparado com `secrets.compare_digest` |
| `usuario` (FK→User) | em nome de quem a chave age → vira `criado_por` nos registros |
| `escopo` | `leitura` (só GET) ou `escrita` (tudo) |
| `ativa` / `expira_em` | revogação imediata / validade opcional |
| `ultimo_uso_em` | gravado no máximo 1×/min, para não gerar um UPDATE por request |

## Autenticação

Duas credenciais convivem — o front usa JWT, integrações usam chave de API:

- **JWT via SimpleJWT.** `ACCESS_TOKEN_LIFETIME = 240min`, `REFRESH = 7 dias`.
- Endpoints no urlconf raiz: `/api/token/`, `/api/token/refresh/`, `/api/token/verify/`.
- **Login por e-mail OU username:** `EmailOrUsernameTokenSerializer`
  (`views/auth_views.py`) resolve e-mail → username antes de autenticar. Assim o
  app loga com e-mail e o Django Admin loga com o username.
- **Chave de API** (`authentication.py`): headers `Authorization: Api-Key <chave>`
  ou `X-API-Key`. Só reivindica o request quando o esquema é o dela, então o
  `Bearer` do front segue direto para o JWT. Ver [10](10-integracao-externa.md).
- Default global: `DEFAULT_PERMISSION_CLASSES = [IsAuthenticated]`; as views de
  dados somam `HasApiScope`, que exige escopo de escrita em métodos não-seguros.
- **Rate limit** (`throttling.py`): cota por chave (`CRM_API_RATE`, default
  `120/min`). Requisições JWT não são limitadas.

## Permissões — base compartilhada

**Correção-chave em relação ao MVP.** O MVP tinha RLS por usuário (cada consultor só
via o que criou → board vazio). Aqui a base é **compartilhada pela equipe**: qualquer
usuário autenticado vê e trabalha toda a base. O ponto único que define isso é:

```python
# apps/crm/views/_helpers.py
def clientes_base():
    return Cliente.objects.select_related("criado_por", "funil").all()
```

`criado_por` é apenas metadado/auditoria — **não** filtra visibilidade. Se um dia o
CRM entrar no ConectaAP, este é o único lugar para trocar por escopo de tenant
(`filter(cliente__in=user.get_clientes_visiveis())`).

## Serializers

- **`ClienteSerializer`** (leitura): todos os campos + derivados
  (`etapa_slug`, `etapa_display`, `etapa_emoji`, `etapa_cor`, `etapa_tipo`,
  `funil_nome`, `funil_slug`, `funil_cor`, `parcela_mensal`, `comissao_mensal`,
  `meses_efetivos`, `criado_por_nome`). Todo `read_only`.
- **`EtapaSerializer` / `EtapaWriteSerializer`**: colunas do Kanban; a escrita
  deriva `slug` e `ordem` e recusa nome duplicado no mesmo funil.
- **`ClienteWriteSerializer`** (create/update): só campos editáveis; valida `nome`,
  `valor_contrato` (≥0) e `meses_contrato` (>0). `criado_por` é injetado pela view.
  O campo `etapa` aceita **id ou slug**, sempre resolvido dentro do funil do cliente.
- **`FunilSerializer`**: id, nome, slug, cor, descricao, ativo, ordem.

## Services

- **`ClienteService`** (`services/cliente_service.py`): `criar` (seta `criado_por`),
  `atualizar`, `remover` — cada um em `transaction.atomic`.
- **`EtapaService`**: `criar` (deriva slug/ordem), `atualizar`, `remover` (levanta
  `EtapaEmUso` → HTTP 409 quando a coluna tem clientes) e `reordenar`.
- **`importacao.py`**: parsing e criação a partir de `.xlsx` (ver [06](06-regras-de-negocio.md)).

## Views (function-based)

Cada rota é uma view que despacha por método HTTP. Ex.:

```python
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def cliente_root(request):
    return _criar(request) if request.method == "POST" else _listar(request)
```

Lista aceita filtro opcional `?funil=<id|slug>`. Detalhe/alteração/remoção em
`cliente_item`. Ver a referência completa em [03 — API](03-api.md).

## Admin

- **`FunilAdmin`**: list_display com selo de cor e contagem de clientes; `slug`
  auto (`prepopulated_fields`); `ativo`/`ordem` editáveis na lista.
- **`ClienteAdmin`**: colunas com etapa colorida (`format_html`), valor e comissão
  formatados; filtros por funil/etapa/consultor/estado; busca por nome/cnpj/email;
  `list_select_related` para evitar N+1.
- **`ApiKeyAdmin`**: emissão e revogação das chaves de integração. A chave em texto
  puro é exibida uma única vez, como mensagem, após salvar. `usuario` e `prefixo`
  viram read-only depois da criação; ação em lote "Revogar chaves selecionadas".

## Testes

`python manage.py test apps.crm` — 51 testes.

- **`test_api.py`** (10): exigência de auth, base compartilhada, `criado_por` na
  criação, comissão parametrizada por `meses_contrato`, padrão de meses, `nome`
  obrigatório, funis semeados, filtro por funil, dados do funil no serializer e
  importação de Excel (válidos + erros).
- **`test_api_key.py`** (19): hash no lugar do segredo, os dois headers, chave
  inválida/revogada/expirada/usuário inativo, escopo de leitura barrando escrita,
  escrita criando com o `criado_por` certo, registro de uso, paginação opt-in,
  cota por chave e a garantia de que o JWT do front não foi afetado.
- **`test_etapas.py`** (22): o fluxo semeado no Indicados APN, os outros dois funis
  começando vazios, CRUD e reordenação de colunas, recusa de nome duplicado,
  bloqueio de exclusão com clientes, `etapa` por id ou slug, recusa de coluna de
  outro funil — e uma prova da **migração de dados**, que volta o schema para antes
  da 0007, insere as etapas antigas de produção e reaplica.

## Comandos de management

- **`seed_demo`** — cria o usuário `demo` (superuser) e garante os 3 funis. **Não**
  cria clientes fictícios por padrão; use `--com-exemplos` para popular carteira demo.
- **`importar_indicados <arquivo.xlsx>`** — importa a aba "Indicados" das planilhas do
  APN para o funil `indicados_apn`. Flags: `--aba`, `--funil`, `--dry-run`, `--limpar`.
- **`criar_api_key <nome> --usuario <login>`** — emite chave de integração pela CLI.
  Flags: `--escopo {leitura,escrita}`, `--dias <n>`. Imprime a chave uma única vez.
