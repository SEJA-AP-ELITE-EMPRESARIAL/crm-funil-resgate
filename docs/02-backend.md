# 02 — Backend (Django/DRF)

## Estrutura do app `apps/crm`

```
apps/crm/
├── models/
│   ├── cliente.py       # Cliente + EtapaFunil (TextChoices)
│   └── funil.py         # Funil
├── serializers/
│   ├── cliente.py       # ClienteSerializer (read) + ClienteWriteSerializer
│   └── funil.py         # FunilSerializer
├── services/
│   ├── cliente_service.py   # criar/atualizar/remover (transações)
│   └── importacao.py        # importação de Excel (openpyxl)
├── views/
│   ├── _helpers.py      # clientes_base() — base compartilhada
│   ├── cliente_views.py # CRUD de clientes
│   ├── funil_views.py   # lista de funis
│   ├── auth_views.py    # login (e-mail/username), /me, /config
│   └── import_views.py  # importar + modelo .xlsx
├── management/commands/
│   ├── seed_demo.py         # usuário demo + funis (sem exemplos por padrão)
│   └── importar_indicados.py# importa a planilha do APN
├── migrations/
├── tests/test_api.py    # 10 testes
├── admin.py             # Django Admin (Funil + Cliente)
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

### `EtapaFunil` (TextChoices)

`priorizado`, `contato_realizado`, `conectado`, `diagnostico`, `proposta`,
`reativado`, `perdido`. O valor guardado é o slug; o rótulo é exibido via
`get_etapa_display()`.

### `Cliente` (`models/cliente.py`)

Cliente/lead trabalhado em um funil. Campos principais:

| Grupo | Campos |
|-------|--------|
| Funil | `funil` (FK→Funil), `etapa` (choices, nullable = fora do funil), `ordem`, `notas` |
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

## Autenticação

- **JWT via SimpleJWT.** `ACCESS_TOKEN_LIFETIME = 240min`, `REFRESH = 7 dias`.
- Endpoints no urlconf raiz: `/api/token/`, `/api/token/refresh/`, `/api/token/verify/`.
- **Login por e-mail OU username:** `EmailOrUsernameTokenSerializer`
  (`views/auth_views.py`) resolve e-mail → username antes de autenticar. Assim o
  app loga com e-mail e o Django Admin loga com o username.
- Default global: `DEFAULT_PERMISSION_CLASSES = [IsAuthenticated]`.

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
  (`etapa_display`, `funil_nome`, `funil_slug`, `funil_cor`, `parcela_mensal`,
  `comissao_mensal`, `meses_efetivos`, `criado_por_nome`). Todo `read_only`.
- **`ClienteWriteSerializer`** (create/update): só campos editáveis; valida `nome`,
  `valor_contrato` (≥0) e `meses_contrato` (>0). `criado_por` é injetado pela view.
- **`FunilSerializer`**: id, nome, slug, cor, descricao, ativo, ordem.

## Services

- **`ClienteService`** (`services/cliente_service.py`): `criar` (seta `criado_por`),
  `atualizar`, `remover` — cada um em `transaction.atomic`.
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

## Testes

`python manage.py test apps.crm` — 10 testes cobrindo: exigência de auth, base
compartilhada, `criado_por` na criação, comissão parametrizada por `meses_contrato`,
padrão de meses, `nome` obrigatório, funis semeados, filtro por funil, dados do funil
no serializer e importação de Excel (válidos + erros).

## Comandos de management

- **`seed_demo`** — cria o usuário `demo` (superuser) e garante os 3 funis. **Não**
  cria clientes fictícios por padrão; use `--com-exemplos` para popular carteira demo.
- **`importar_indicados <arquivo.xlsx>`** — importa a aba "Indicados" das planilhas do
  APN para o funil `indicados_apn`. Flags: `--aba`, `--funil`, `--dry-run`, `--limpar`.
