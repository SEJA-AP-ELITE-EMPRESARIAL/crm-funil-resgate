# 11 — Guia completo da API

Manual de uso da API do Conecta_CRM para quem vai **integrar** — automações (n8n),
outros sistemas (ConectaAP), planilhas, BI e scripts internos.

- Referência seca dos endpoints: [03 — API](03-api.md)
- Emissão e gestão de chaves: [10 — Integração externa](10-integracao-externa.md)
- Este documento: como usar de ponta a ponta, com receitas prontas e limites reais.

**Base URL de produção:** `https://conecta-crm.sejaap.com.br`

---

## Sumário

1. [O que dá para fazer com a API](#1-o-que-dá-para-fazer-com-a-api)
2. [Modelo de dados em 2 minutos](#2-modelo-de-dados-em-2-minutos)
3. [Escolher a credencial: JWT ou chave de API](#3-escolher-a-credencial-jwt-ou-chave-de-api)
4. [Primeira chamada em 3 passos](#4-primeira-chamada-em-3-passos)
5. [Convenções da API](#5-convenções-da-api)
6. [Referência dos endpoints](#6-referência-dos-endpoints)
7. [Dicionário de campos do Cliente](#7-dicionário-de-campos-do-cliente)
8. [Vocabulário controlado](#8-vocabulário-controlado)
9. [Regras de negócio refletidas na API](#9-regras-de-negócio-refletidas-na-api)
10. [Erros e como tratá-los](#10-erros-e-como-tratá-los)
11. [Limites, performance e paginação](#11-limites-performance-e-paginação)
12. [Receitas de integração](#12-receitas-de-integração)
13. [Aplicações práticas](#13-aplicações-práticas)
14. [Segurança](#14-segurança)
15. [Troubleshooting](#15-troubleshooting)
16. [Limitações conhecidas](#16-limitações-conhecidas)

---

## 1. O que dá para fazer com a API

| Você quer | Endpoint | Escopo necessário |
|-----------|----------|-------------------|
| Listar toda a carteira, ou só um funil | `GET /api/crm/clientes/` | leitura |
| Ver um cliente específico | `GET /api/crm/clientes/{id}/` | leitura |
| Criar lead/cliente (formulário, planilha, outro sistema) | `POST /api/crm/clientes/` | escrita |
| Mover de etapa no funil | `PATCH /api/crm/clientes/{id}/` | escrita |
| Atualizar qualquer campo (valor fechado, responsável, notas) | `PATCH /api/crm/clientes/{id}/` | escrita |
| Remover um registro | `DELETE /api/crm/clientes/{id}/` | escrita |
| Importar uma planilha inteira | `POST /api/crm/clientes/importar/` | escrita |
| Descobrir os funis existentes | `GET /api/crm/funis/` | leitura |
| Descobrir etapas e taxa de comissão | `GET /api/crm/config/` | público |
| Conferir se a credencial funciona | `GET /api/crm/me/` | leitura |

O que **não** existe hoje (ver [limitações](#16-limitações-conhecidas)): webhooks,
busca textual, filtro por data, endpoints agregados de dashboard e OpenAPI/Swagger.

## 2. Modelo de dados em 2 minutos

```
Funil (Indicados APN | Base Elite | Resgate)
  └── Cliente  ──  etapa (7 valores) ── ordem (posição na coluna do Kanban)
                └─ contrato: valor_contrato + meses_contrato
                   └─ derivados: parcela_mensal, comissao_mensal
```

Três fatos que mudam como você integra:

1. **A base é compartilhada.** Não há isolamento por usuário: qualquer credencial
   autenticada enxerga e altera a carteira inteira. `criado_por` é só auditoria.
2. **`etapa` pode ser nula.** Cliente sem etapa está "na base", fora do Kanban.
   Útil para carregar uma carteira sem jogá-la no funil.
3. **`funil` pode ser nulo.** Cliente sem funil não aparece em nenhum filtro por
   funil — evite criar assim via integração; sempre informe `funil`.

## 3. Escolher a credencial: JWT ou chave de API

| | JWT (`Bearer`) | Chave de API (`Api-Key`) |
|---|---|---|
| Para quem | o app web | integrações, scripts, BI |
| Como obtém | `POST /api/token/` com usuário e senha | emitida no admin ou por CLI |
| Validade | access 4h, refresh 7 dias | vida longa (ou `--dias N`) |
| Precisa renovar | sim, via `/api/token/refresh/` | não |
| Escopo | tudo que o usuário pode | `leitura` ou `escrita` |
| Rate limit | não | sim, por chave |
| Revogação | trocar a senha | desmarcar `ativa` no admin |

**Para integração, use chave de API.** JWT em automação significa lidar com refresh,
expiração no meio de um job e senha de pessoa guardada em ferramenta.

### Emitir a chave

Admin (`/admin/crm/apikey/add/`) ou linha de comando na VPS:

```bash
docker exec conecta-crm-backend python manage.py criar_api_key \
  "n8n — sync diária" --usuario integracao --escopo leitura
```

A chave em texto puro aparece **uma única vez**. O banco guarda só o SHA-256.

Recomendações:
- Um **usuário de serviço** dedicado (ex.: `integracao`) — é ele que vai constar em
  `criado_por` nos registros criados pela automação.
- Uma chave **por integração**, para revogar uma sem derrubar as outras.
- `--escopo leitura` sempre que a integração só consulta.
- `--dias 90` em chaves entregues a terceiros.

## 4. Primeira chamada em 3 passos

**1) Confira a credencial.**
```bash
curl -s https://conecta-crm.sejaap.com.br/api/crm/me/ \
  -H "Authorization: Api-Key crm_ab12cd34_SEU_SEGREDO"
```
```json
{ "id": 7, "username": "integracao", "email": "", "nome": "integracao",
  "is_staff": false, "is_superuser": false,
  "api_key": { "nome": "n8n — sync diária", "prefixo": "ab12cd34",
               "escopo": "leitura", "expira_em": null } }
```

**2) Descubra os funis.**
```bash
curl -s https://conecta-crm.sejaap.com.br/api/crm/funis/ \
  -H "Authorization: Api-Key crm_ab12cd34_SEU_SEGREDO"
```

**3) Leia a carteira de um funil.**
```bash
curl -s "https://conecta-crm.sejaap.com.br/api/crm/clientes/?funil=resgate" \
  -H "Authorization: Api-Key crm_ab12cd34_SEU_SEGREDO"
```

## 5. Convenções da API

| Assunto | Regra |
|---------|-------|
| Protocolo | HTTPS obrigatório (a borda redireciona HTTP) |
| Formato | JSON em tudo, exceto o upload de planilha (`multipart/form-data`) e o modelo `.xlsx` (binário) |
| `Content-Type` no envio | `application/json` |
| Autenticação | `Authorization: Api-Key <chave>` **ou** `X-API-Key: <chave>` **ou** `Authorization: Bearer <jwt>` |
| Barra final | **obrigatória** nas rotas (`/api/crm/clientes/`, não `/api/crm/clientes`) |
| Datas do sistema | ISO 8601 com timezone (`2026-07-27T14:03:11.482-03:00`), fuso `America/Sao_Paulo` |
| Datas de negócio | `data_onboarding` / `data_offboarding` são **texto livre** — não são validadas |
| Decimais | string com 2 casas (`"12000.00"`) — ponto como separador, não vírgula |
| Nulos | campos de texto vazios vêm como `""`; numéricos e FKs vazios vêm como `null` |
| Ordenação | sempre `ordem` (asc), depois `nome` — não é configurável |
| Idioma dos erros | pt-BR |

### CORS

`CORS_ALLOWED_ORIGINS` cobre apenas as origens de desenvolvimento. Em produção o
front é servido na **mesma origem** da API, então não há CORS configurado para
terceiros: **chamadas direto do navegador de outro domínio serão bloqueadas**.
Integre sempre pelo servidor (n8n, backend, script) — o que também evita expor a
chave no código do cliente.

## 6. Referência dos endpoints

### 6.1 `POST /api/token/` — login (JWT)

Público. Aceita **e-mail ou username** no campo `username`.

```json
// request
{ "username": "fulano@sejaap.com.br", "password": "••••••" }
// 200
{ "access": "eyJhbGciOi...", "refresh": "eyJhbGciOi..." }
```
`401` com credenciais inválidas. Só use se a integração precisar agir como uma
pessoa específica; caso contrário, chave de API.

### 6.2 `POST /api/token/refresh/`
```json
{ "refresh": "eyJ..." }   →   { "access": "eyJ..." }
```

### 6.3 `POST /api/token/verify/`
```json
{ "token": "eyJ..." }   →   200 (válido) | 401 (inválido)
```

### 6.4 `GET /api/crm/me/` — quem sou eu

Devolve o usuário autenticado. Com chave de API, inclui o objeto `api_key`
(`nome`, `prefixo`, `escopo`, `expira_em`) — é o **health check da credencial**.

### 6.5 `GET /api/crm/config/` — configuração (público)

Não exige autenticação. Fonte da verdade para rotular a UI e validar entradas:

```json
{ "comissao_rate": 0.03,
  "meses_contrato_padrao": 12,
  "etapas": [ { "value": "priorizado", "label": "Priorizado" },
              { "value": "contato_realizado", "label": "Contato Realizado" },
              { "value": "conectado", "label": "Conectado" },
              { "value": "diagnostico", "label": "Diagnóstico" },
              { "value": "proposta", "label": "Proposta" },
              { "value": "reativado", "label": "Reativado" },
              { "value": "perdido", "label": "Perdido" } ] }
```

> Leia as etapas daqui em vez de fixá-las no código da integração — se o CRM
> ganhar etapas novas, a automação acompanha sozinha.

### 6.6 `GET /api/crm/funis/` — funis ativos

```json
{ "results": [
  { "id": 1, "nome": "Indicados APN", "slug": "indicados_apn",
    "cor": "#3D7EC5", "descricao": "...", "ativo": true, "ordem": 1 },
  { "id": 2, "nome": "Base Elite", "slug": "base_elite", "...": "..." },
  { "id": 3, "nome": "Resgate", "slug": "resgate", "...": "..." } ] }
```

Só funis **ativos**. Guarde o `id` ou use o `slug` — ambos servem no filtro e o
`slug` é mais estável para escrever no código.

### 6.7 `GET /api/crm/clientes/` — listar

Parâmetros:

| Parâmetro | Valores | Efeito |
|-----------|---------|--------|
| `funil` | `<id>`, `<slug>` ou `all` | filtra por funil; `all` (ou ausente) = tudo |
| `page` | inteiro ≥ 1 | ativa a paginação |
| `page_size` | 1–500 (default 100) | tamanho da página; também ativa a paginação |

Sem `page`/`page_size`, devolve **a base inteira**:
```json
{ "results": [ { "id": 1, "nome": "...", "...": "..." } ] }
```

Com paginação:
```json
{ "count": 512,
  "next": "https://conecta-crm.sejaap.com.br/api/crm/clientes/?page=2&page_size=100",
  "previous": null,
  "results": [ ... ] }
```

O objeto cliente é o mesmo nos dois formatos — ver o
[dicionário de campos](#7-dicionário-de-campos-do-cliente).

### 6.8 `POST /api/crm/clientes/` — criar

Só `nome` é obrigatório. `criado_por` é preenchido com o usuário da credencial.

```bash
curl -X POST https://conecta-crm.sejaap.com.br/api/crm/clientes/ \
  -H "Authorization: Api-Key $CRM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "funil": 3,
    "nome": "Empresa Exemplo Ltda",
    "etapa": "priorizado",
    "telefone": "+55 48 99999-0000",
    "email": "contato@exemplo.com",
    "municipio": "Florianópolis",
    "estado": "SC",
    "quem_fara_contato": "Ana Souza",
    "prioridade": "P2",
    "motivo_distrato": "Preço",
    "notas": "Veio do formulário do site."
  }'
```
**201** com o cliente serializado (incluindo `id` e derivados). **400** se a
validação falhar, **403** se a chave for de leitura.

### 6.9 `GET /api/crm/clientes/{id}/` — detalhar
**200** com o objeto, **404** se não existir.

### 6.10 `PATCH /api/crm/clientes/{id}/` — atualizar parcial

O caso mais comum de integração. Envie **só** o que muda:

```bash
# mover de etapa
curl -X PATCH https://conecta-crm.sejaap.com.br/api/crm/clientes/42/ \
  -H "Authorization: Api-Key $CRM_KEY" -H "Content-Type: application/json" \
  -d '{"etapa": "conectado"}'

# registrar a reativação com o contrato fechado
curl -X PATCH https://conecta-crm.sejaap.com.br/api/crm/clientes/42/ \
  -H "Authorization: Api-Key $CRM_KEY" -H "Content-Type: application/json" \
  -d '{"etapa": "reativado", "valor_contrato": "24000.00", "meses_contrato": 12}'
```

`PUT` também é aceito, mas exige o objeto completo (inclusive `nome`) e **apaga**
o que você omitir. Na dúvida, `PATCH`.

### 6.11 `DELETE /api/crm/clientes/{id}/` — remover
**204** sem corpo. Remoção é definitiva — não há lixeira nem histórico.

### 6.12 `POST /api/crm/clientes/importar/` — importar planilha

`multipart/form-data`, campo **`arquivo`**, extensão `.xlsx`.

```bash
curl -X POST https://conecta-crm.sejaap.com.br/api/crm/clientes/importar/ \
  -H "Authorization: Api-Key $CRM_KEY" \
  -F "arquivo=@carteira.xlsx"
```
```json
{ "criados": 12, "total": 14,
  "erros": [ { "linha": 5, "erro": "coluna 'Funil': funil 'X' não encontrado" },
             { "linha": 9, "erro": "nome vazio" } ] }
```

Comportamento:
- A **primeira linha é o cabeçalho**; os títulos são normalizados (sem acento,
  minúsculas), então "Município", "MUNICIPIO" e "cidade" caem no mesmo campo.
- A planilha **precisa** ter uma coluna de nome (`Nome / Empresa`, `Nome` ou
  `Empresa`) — sem ela, **400**.
- Linhas totalmente em branco são ignoradas silenciosamente.
- Linha com erro é **reportada e pulada**; as demais são criadas.
- `Valor contrato` aceita formato pt-BR (`"12.000,00"`, `"R$ 12000,00"`).
- `Etapa` e `Funil` são resolvidos por **rótulo ou slug** ("Contato Realizado" ou
  `contato_realizado`).
- Sempre **cria** — não atualiza nem deduplica. Importar duas vezes duplica.

Cabeçalhos reconhecidos (sinônimos entre parênteses):

| Coluna | Campo | Coluna | Campo |
|--------|-------|--------|-------|
| Funil | `funil` | Prioridade | `prioridade` |
| Nome / Empresa (Nome, Empresa) | `nome` | Faixa de faturamento (Faixa) | `faixa_faturamento` |
| Etapa | `etapa` | Indicado por (Indicador) | `indicador_nome` |
| Consultor (Quem fará o contato) | `quem_fara_contato` | Empresa do indicador | `indicador_empresa` |
| Responsavel | `responsavel` | WhatsApp do indicador | `indicador_whatsapp` |
| Telefone (Fone) | `telefone` | Equipe do indicador (Equipe) | `indicador_equipe` |
| Email (E-mail) | `email` | Qtd indicacoes | `qtd_indicacoes` |
| CNPJ | `cnpj` | Valor contrato (Valor) | `valor_contrato` |
| Segmento / Canal / Status | idem | Meses contrato (Meses, Duracao) | `meses_contrato` |
| Municipio (Cidade) | `municipio` | Data onboarding / offboarding | `data_*` |
| Estado (UF) | `estado` | Qtd socios (Socios) | `qtd_socios` |
| Pais | `pais` | LT | `lt` |
| Produto (Produto atual) | `produto_atual` | Notas (Observacoes, Obs) | `notas` |
| Motivo (Motivo distrato) | `motivo_distrato` | | |

### 6.13 `GET /api/crm/clientes/modelo-importacao/`
Baixa um `.xlsx` com o cabeçalho aceito + uma linha de exemplo. Útil para gerar a
planilha programaticamente com as colunas certas.

## 7. Dicionário de campos do Cliente

**E** = editável (aceito em `POST`/`PATCH`) · **L** = só leitura.

### Identificação e contato
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `id` | int | L | |
| `nome` | string(200) | E | **Obrigatório.** Espaços nas bordas são removidos; ausente ou só espaços → 400 |
| `cnpj` | string(40) | E | Texto livre, sem validação nem máscara |
| `email` | string(160) | E | Validado como e-mail quando preenchido |
| `telefone` | string(40) | E | Texto livre |

### Localização
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `municipio` | string(120) | E | |
| `estado` | string(40) | E | Texto livre — não é enum de UF |
| `pais` | string(60) | E | |

### Classificação comercial
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `segmento` | string(120) | E | |
| `canal` | string(120) | E | |
| `status` | string(60) | E | Texto livre — **não** confundir com `etapa` |
| `produto_atual` | string(120) | E | |
| `consultor_atual` | string(120) | E | |
| `motivo_distrato` | string(160) | E | Usado nos gráficos do dashboard |
| `quem_fara_contato` | string(120) | E | Texto livre; base dos rankings por consultor |
| `responsavel` | string(120) | E | |

### Indicação (funil Indicados APN)
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `indicador_nome` | string(120) | E | |
| `indicador_empresa` | string(160) | E | |
| `indicador_whatsapp` | string(40) | E | |
| `indicador_equipe` | string(120) | E | |
| `faixa_faturamento` | string(60) | E | Texto livre (ex.: `"R$ 500k a 1MM"`) |
| `prioridade` | string(10) | E | Convenção `P1`–`P5`; não é validado |
| `qtd_indicacoes` | int ≥ 0 \| null | E | |

### Operacional
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `data_onboarding` | string(40) | E | **Texto**, não data. Padronize no seu lado |
| `data_offboarding` | string(40) | E | idem |
| `qtd_socios` | int ≥ 0 \| null | E | |
| `lt` | string(60) | E | Lifetime, texto livre |

### Funil
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `funil` | int (id) \| null | E | FK; envie o **id**. `400` se o id não existir |
| `funil_nome` / `funil_slug` / `funil_cor` | string \| null | L | Derivados do funil |
| `etapa` | enum \| null | E | Um dos 7 slugs; `null` = fora do funil |
| `etapa_display` | string | L | Rótulo legível ("Contato Realizado") |
| `ordem` | int | E | Posição na coluna do Kanban; default 0 |
| `notas` | text(2000) | E | |

### Contrato e derivados
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `valor_contrato` | decimal(12,2) \| null | E | ≥ 0. Envie string ou número; recebe string |
| `meses_contrato` | int > 0 \| null | E | Vazio → cai no padrão global (12) |
| `meses_efetivos` | int | L | `meses_contrato` ou o padrão global |
| `parcela_mensal` | decimal | L | `valor_contrato ÷ meses_efetivos` |
| `comissao_mensal` | decimal | L | `parcela_mensal × comissao_rate` (3%) |

### Metadados
| Campo | Tipo | | Observação |
|-------|------|---|-----------|
| `criado_por` | int (user id) \| null | L | Definido pela credencial na criação |
| `criado_por_nome` | string \| null | L | Username |
| `criado_em` / `atualizado_em` | datetime ISO | L | `atualizado_em` muda a cada `PATCH` |

## 8. Vocabulário controlado

### Etapas (`etapa`) — na ordem do funil
| Slug | Rótulo | Significado |
|------|--------|-------------|
| `priorizado` | Priorizado | Entrou na fila de resgate |
| `contato_realizado` | Contato Realizado | Tentativa feita, sem resposta ainda |
| `conectado` | Conectado | Conversa aconteceu |
| `diagnostico` | Diagnóstico | Levantamento da necessidade |
| `proposta` | Proposta | Proposta enviada |
| `reativado` | Reativado | **Ganho** — preencha `valor_contrato` e `meses_contrato` |
| `perdido` | Perdido | **Perda** |
| `null` | — | Na base, fora do Kanban |

Enviar um slug fora dessa lista devolve **400**.

### Funis (seed inicial)
| id | slug | nome |
|----|------|------|
| 1 | `indicados_apn` | Indicados APN |
| 2 | `base_elite` | Base Elite |
| 3 | `resgate` | Resgate |

Funis são gerenciáveis pelo admin — novos podem existir. Consulte
`GET /api/crm/funis/` em vez de fixar ids.

### Prioridade
`P1` (maior) a `P5`. É convenção, não validação — a API aceita qualquer texto até
10 caracteres.

## 9. Regras de negócio refletidas na API

**Comissão recorrente.** Ao gravar `valor_contrato` e `meses_contrato`, a API
devolve na mesma resposta:

```
meses_efetivos  = meses_contrato ou 12 (padrão global)
parcela_mensal  = valor_contrato / meses_efetivos      (2 casas)
comissao_mensal = parcela_mensal * 0,03                (2 casas)
```

Exemplo: `valor_contrato = 24000.00`, `meses_contrato = 12` →
`parcela_mensal = "2000.00"`, `comissao_mensal = "60.00"`.

Não recalcule isso na sua integração — leia os campos derivados. A taxa
(`comissao_rate`) e o padrão de meses vêm de `GET /api/crm/config/` e podem mudar
por variável de ambiente.

**Base compartilhada.** Não existe visibilidade por usuário. Qualquer chave de
escrita alcança a carteira inteira. Se a integração só precisa ler, use `leitura`.

## 10. Erros e como tratá-los

| Status | Significado | O que fazer |
|--------|-------------|-------------|
| `200` | OK | |
| `201` | Criado | O corpo traz o `id` gerado |
| `204` | Removido | Sem corpo |
| `400` | Validação | O corpo mapeia campo → lista de mensagens. **Não** repita a chamada igual |
| `401` | Credencial ausente ou inválida | Ver mensagens abaixo |
| `403` | Autenticado, mas sem permissão | Chave de leitura tentando escrever |
| `404` | Não existe | `id` errado ou registro já removido |
| `429` | Cota estourada | Respeite o header `Retry-After` (segundos) |
| `500` | Erro no servidor | Verifique os logs do backend; abra chamado |

### Corpos de erro

Mensagens reais (verificadas contra a API, não parafraseadas):

```json
// 400 — validação, sempre no formato {campo: [mensagens]}
{ "nome": ["Este campo é obrigatório."] }              // nome ausente
{ "nome": ["Este campo não pode ser em branco."] }     // nome vazio ou só espaços
{ "etapa": ["\"reativada\" não é um escolha válido."] }   // slug fora do enum
{ "funil": ["Pk inválido \"9999\" - objeto não existe."] }
{ "valor_contrato": ["Valor do contrato não pode ser negativo."],
  "meses_contrato": ["Duração do contrato deve ser maior que zero."] }

// 401 — variações, cada uma com uma causa distinta
{ "detail": "As credenciais de autenticação não foram fornecidas." }  // sem header
{ "detail": "Chave de API inválida." }        // formato errado, inexistente ou segredo errado
{ "detail": "Chave de API revogada." }        // ativa = false
{ "detail": "Chave de API expirada." }        // passou de expira_em
{ "detail": "Usuário vinculado à chave está inativo." }

// 403 — escopo
{ "detail": "Esta chave de API é somente leitura." }

// 429 — throttle (a tradução pt-BR do DRF cobre só a primeira frase)
{ "detail": "Pedido foi limitado. Expected available in 60 seconds." }
```

O `429` acompanha o header **`Retry-After`** com os segundos a esperar — prefira
lê-lo em vez de extrair o número da mensagem.

> `"Chave de API inválida."` é deliberadamente genérica para chave inexistente e
> segredo errado — não confirma se um prefixo existe.

### Política de retry recomendada

| Status | Retry? |
|--------|--------|
| 429 | sim, após `Retry-After` |
| 500, 502, 503, 504 | sim, backoff exponencial (3 tentativas) |
| 400, 401, 403, 404 | **não** — o problema é o request, não o momento |

## 11. Limites, performance e paginação

**Rate limit:** `120/min` por chave (configurável em `CRM_API_RATE`). A cota é por
**chave**, então uma integração não derruba a outra. Requisições com JWT não são
limitadas.

> **Caveat honesto:** o contador vive no cache local do processo e o gunicorn roda
> com **3 workers**, cada um com o seu. Na prática o limite efetivo é de até **3×**
> o configurado, e a distribuição depende de qual worker atende a requisição. Para
> um limite exato seria preciso um cache compartilhado (Redis). Dimensione sua
> automação pelo valor configurado, não pelo efetivo.

**Custo de listar tudo.** Sem paginação, `GET /clientes/` serializa a base inteira
(~50 campos por registro) numa resposta só. Com carteiras grandes:
- use `?page_size=200` e siga o `next`;
- ou filtre por funil (`?funil=resgate`) quando só precisar de um.

**Frequência.** Não existe webhook nem filtro por data, então sincronização é por
polling. Uma varredura a cada 15–60 minutos costuma bastar; compare
`atualizado_em` do seu lado para detectar o que mudou.

**Concorrência.** Não há trava otimista (nem `ETag`/`If-Match`). Dois `PATCH`
simultâneos no mesmo cliente: vence o último. Evite duas automações escrevendo no
mesmo campo.

## 12. Receitas de integração

### 12.1 cURL / Bash — exportar um funil para CSV

```bash
#!/usr/bin/env bash
set -euo pipefail
: "${CRM_KEY:?defina CRM_KEY}"
BASE="https://conecta-crm.sejaap.com.br"

curl -sS "$BASE/api/crm/clientes/?funil=resgate" \
     -H "Authorization: Api-Key $CRM_KEY" \
| jq -r '["nome","etapa","consultor","valor","comissao"],
         (.results[] | [.nome, .etapa_display, .quem_fara_contato,
                        (.valor_contrato // "0"), .comissao_mensal])
         | @csv' > resgate.csv
```

### 12.2 Python — cliente reutilizável com paginação e retry

```python
"""pip install requests"""
import os, time, requests

BASE = "https://conecta-crm.sejaap.com.br"

class ConectaCRM:
    def __init__(self, chave: str, timeout: int = 30):
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Api-Key {chave}",
                               "Content-Type": "application/json"})
        self.timeout = timeout

    def _req(self, metodo, caminho, tentativas=3, **kw):
        for n in range(tentativas):
            r = self.s.request(metodo, f"{BASE}{caminho}", timeout=self.timeout, **kw)
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", 30)))
                continue
            if r.status_code >= 500 and n < tentativas - 1:
                time.sleep(2 ** n)
                continue
            if not r.ok:
                raise RuntimeError(f"{metodo} {caminho} → {r.status_code}: {r.text[:300]}")
            return r.json() if r.content else None
        raise RuntimeError(f"{metodo} {caminho}: esgotou as tentativas")

    def funis(self):
        return self._req("GET", "/api/crm/funis/")["results"]

    def clientes(self, funil=None, page_size=200):
        """Gera todos os clientes, paginando."""
        caminho = f"/api/crm/clientes/?page_size={page_size}"
        if funil:
            caminho += f"&funil={funil}"
        while caminho:
            dados = self._req("GET", caminho)
            yield from dados["results"]
            prox = dados.get("next")
            caminho = prox.replace(BASE, "") if prox else None

    def criar(self, **campos):
        return self._req("POST", "/api/crm/clientes/", json=campos)

    def atualizar(self, cliente_id, **campos):
        return self._req("PATCH", f"/api/crm/clientes/{cliente_id}/", json=campos)

    def mover(self, cliente_id, etapa):
        return self.atualizar(cliente_id, etapa=etapa)


if __name__ == "__main__":
    crm = ConectaCRM(os.environ["CRM_KEY"])
    reativados = [c for c in crm.clientes(funil="resgate") if c["etapa"] == "reativado"]
    total = sum(float(c["comissao_mensal"]) for c in reativados)
    print(f"{len(reativados)} reativados · comissão recorrente R$ {total:,.2f}")
```

### 12.3 Node.js — criar lead a partir de um formulário

```js
const BASE = "https://conecta-crm.sejaap.com.br";
const KEY = process.env.CRM_KEY;

export async function criarLead({ nome, email, telefone, origem }) {
  const resp = await fetch(`${BASE}/api/crm/clientes/`, {
    method: "POST",
    headers: { "Authorization": `Api-Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      funil: 1,                       // Indicados APN
      nome, email, telefone,
      etapa: "priorizado",
      canal: origem,
      notas: `Criado automaticamente em ${new Date().toISOString()}`,
    }),
  });
  if (!resp.ok) throw new Error(`CRM ${resp.status}: ${await resp.text()}`);
  return resp.json();                 // traz o id gerado
}
```

> Esse código roda **no servidor**. Não coloque a chave em bundle de front-end —
> além do risco óbvio, o CORS bloquearia a chamada.

### 12.4 n8n — sincronização periódica

1. **Schedule Trigger** — a cada 30 minutos.
2. **HTTP Request**
   - Method `GET`, URL `https://conecta-crm.sejaap.com.br/api/crm/clientes/`
   - Query: `funil=resgate`, `page_size=200`
   - Authentication → **Generic Credential Type** → **Header Auth**
     - Name: `Authorization` · Value: `Api-Key crm_ab12cd34_...`
     - (guarde como *Credential*, nunca no corpo do nó)
   - Options → **Pagination**: continue enquanto `{{ $json.next }}` não for nulo,
     usando `{{ $json.next }}` como próxima URL.
3. **Item Lists / Split Out** — campo `results`.
4. **IF** — `{{ $json.atualizado_em }}` maior que a última execução.
5. Destino (Google Sheets, Postgres, Slack…).

Para **escrever** de volta (ex.: mover etapa quando o WhatsApp responde), use um
segundo nó HTTP Request com `PATCH`,
URL `.../api/crm/clientes/{{ $json.id }}/`, body `{"etapa": "conectado"}` e uma
credencial de **escopo escrita**.

### 12.5 Google Sheets — carteira viva na planilha

`Extensões → Apps Script`:

```js
function atualizarCarteira() {
  const chave = PropertiesService.getScriptProperties().getProperty('CRM_KEY');
  const resp = UrlFetchApp.fetch(
    'https://conecta-crm.sejaap.com.br/api/crm/clientes/?funil=resgate',
    { headers: { Authorization: 'Api-Key ' + chave }, muteHttpExceptions: true });

  if (resp.getResponseCode() !== 200) throw new Error(resp.getContentText());
  const clientes = JSON.parse(resp.getContentText()).results;

  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Carteira');
  aba.clear();
  aba.appendRow(['ID', 'Nome', 'Etapa', 'Consultor', 'Município',
                 'Valor contrato', 'Comissão/mês', 'Atualizado em']);
  const linhas = clientes.map(c => [c.id, c.nome, c.etapa_display, c.quem_fara_contato,
                                    c.municipio, c.valor_contrato, c.comissao_mensal,
                                    c.atualizado_em]);
  if (linhas.length) aba.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
}
```
Guarde a chave em *Propriedades do script* e agende com um **acionador por tempo**.

### 12.6 Power BI / Excel

Power Query (`Obter Dados → Consulta em Branco → Editor Avançado`):

```m
let
    Chave  = "crm_ab12cd34_SEU_SEGREDO",
    Origem = Json.Document(Web.Contents(
        "https://conecta-crm.sejaap.com.br",
        [ RelativePath = "api/crm/clientes/",
          Query   = [ funil = "resgate", page_size = "500" ],
          Headers = [ Authorization = "Api-Key " & Chave ] ])),
    Lista  = Origem[results],
    Tabela = Table.FromRecords(Lista)
in
    Tabela
```

Para publicar no Power BI Service, configure a fonte como **Anônima** (a chave vai
no header) e use um **gateway** se a atualização for agendada.

### 12.7 Carga inicial via planilha

Para carteiras grandes, `POST /clientes/importar/` é muito mais eficiente que N
chamadas de criação — é uma requisição só, numa transação:

```python
with open("carteira.xlsx", "rb") as f:
    r = requests.post(f"{BASE}/api/crm/clientes/importar/",
                      headers={"Authorization": f"Api-Key {KEY}"},
                      files={"arquivo": ("carteira.xlsx", f)}, timeout=180)
resultado = r.json()
print(f"{resultado['criados']}/{resultado['total']} criados")
for e in resultado["erros"]:
    print(f"  linha {e['linha']}: {e['erro']}")
```
Baixe o modelo em `GET /api/crm/clientes/modelo-importacao/` para acertar as colunas.

## 13. Aplicações práticas

| Aplicação | Como montar |
|-----------|-------------|
| **Lead do site cai direto no funil** | Formulário → webhook do seu site → `POST /clientes/` com `funil` e `etapa: "priorizado"` |
| **WhatsApp/n8n move o card** | Resposta do cliente dispara `PATCH {"etapa": "conectado"}` — o Kanban atualiza sozinho |
| **Relatório de comissionamento** | Varre `?funil=<x>`, filtra `etapa == "reativado"`, soma `comissao_mensal` (já calculado pela API) |
| **BI executivo** | Power BI puxando a base a cada hora; agregue por `etapa_display`, `quem_fara_contato`, `motivo_distrato` |
| **Alerta de estagnação** | Diariamente, liste tudo e aponte quem está há N dias no mesmo `atualizado_em` sem mudar de etapa → notifica o consultor |
| **Higienização em massa** | Liste, detecte duplicidade por `cnpj`/`email` no seu lado, consolide com `PATCH` e remova o excedente com `DELETE` |
| **Carga de nova carteira** | Monte o `.xlsx` no formato do modelo → `POST /clientes/importar/` |
| **Espelhar no ConectaAP** | Chave de leitura + job periódico; use `id` do CRM como chave externa do outro lado |
| **Painel público de metas** | Chave de **leitura** num backend próprio que agrega e expõe só os números — nunca a chave no navegador |
| **Backup lógico** | `GET /clientes/` paginado → JSON versionado no seu storage (a API não tem export nativo) |

## 14. Segurança

- **A chave é um segredo de produção.** Ela dá acesso à carteira inteira. Guarde no
  cofre da ferramenta (n8n Credentials, Secret Manager, secrets do CI) — nunca no
  Git, no corpo de um fluxo, em planilha compartilhada ou no front-end.
- **Escopo mínimo:** `leitura` cobre a maior parte dos casos. `escrita` só quando a
  integração realmente grava.
- **Uma chave por integração**, com nome descritivo. A coluna *último uso* no admin
  mostra quais ainda estão vivas — é o que permite revogar as esquecidas com
  segurança.
- **Rotação:** emita a nova, troque na ferramenta, confirme o *último uso* mudando,
  revogue a antiga. Sem janela de indisponibilidade.
- **Vazou?** Admin → chaves de API → desmarque `ativa`. Efeito imediato na próxima
  requisição. Depois emita outra.
- **Sempre HTTPS.** A chave viaja no header; em HTTP ela é texto puro na rede.
- O banco guarda apenas o SHA-256 — nem quem tem acesso ao Postgres recupera a
  chave original.

## 15. Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `401 As credenciais... não foram fornecidas` | header ausente ou nome errado | Use exatamente `Authorization: Api-Key <chave>` ou `X-API-Key` |
| `401 Chave de API inválida` | chave truncada ao copiar, ou espaço no fim | Reemita e cole inteira (`crm_` + prefixo + segredo) |
| `401` só em algumas ferramentas | a ferramenta manda `Bearer` por padrão | Configure **Header Auth** com o valor completo `Api-Key ...` |
| `403 somente leitura` | escopo da chave | Emita uma chave de escrita para esse fluxo |
| `404` em `/api/crm/clientes` | faltou a barra final | `/api/crm/clientes/` |
| `429` frequente | polling agressivo | Aumente o intervalo, use `page_size` maior, ou suba `CRM_API_RATE` |
| Resposta gigante / timeout | base inteira sem paginação | `?page_size=200` e siga o `next` |
| Erro de CORS no navegador | chamada direto do front | Integre pelo servidor |
| `400` no `PATCH` de etapa | slug errado | Use os `value` de `GET /api/crm/config/`, não os rótulos |
| Importação criou duplicados | o importador sempre cria | Deduplique antes de enviar |
| Campo some depois de atualizar | usou `PUT` sem o objeto completo | Use `PATCH` |

Logs do backend (na VPS):
```bash
docker logs conecta-crm-backend --tail 100
```

## 16. Limitações conhecidas

Deliberadas, com o caminho de evolução:

| Limitação | Impacto | Caminho |
|-----------|---------|---------|
| **Sem webhooks** | integração só por polling | Emitir evento em `ClienteService.atualizar` → POST para URLs cadastradas |
| **Sem OpenAPI/Swagger** | nenhum client gerado automaticamente | `drf-spectacular` + `/api/schema/` |
| **Sem filtro por data ou busca textual** | varre tudo para achar o que mudou | `django-filter` com `atualizado_em__gte`, `search` |
| **Sem endpoints agregados** | dashboard/comissionamento são calculados no consumidor | `/api/crm/metricas/`, `/api/crm/comissionamento/` |
| **Rate limit aproximado** | limite efetivo ≈ 3× o configurado (3 workers, cache local) | Configurar Redis em `CACHES` |
| **Sem escopos por recurso** | escrita alcança tudo | Escopos granulares no modelo `ApiKey` |
| **Sem histórico/auditoria** | não há como saber quem moveu o card | `django-simple-history` ou tabela de eventos |
| **Base compartilhada** | toda credencial vê tudo | Trocar `views/_helpers.py:clientes_base()` por escopo de tenant |
| **Sem trava otimista** | último `PATCH` vence | `ETag`/`If-Match` |

---

**Ver também:** [03 — API](03-api.md) (referência seca) ·
[10 — Integração externa](10-integracao-externa.md) (emissão e gestão de chaves) ·
[06 — Regras de negócio](06-regras-de-negocio.md) ·
[07 — Configuração](07-configuracao.md)
