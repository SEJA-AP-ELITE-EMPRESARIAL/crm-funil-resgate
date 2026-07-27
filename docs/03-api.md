# 03 — Referência da API

Base: `https://conecta-crm.sejaap.com.br` (prod) ou `http://localhost:5173` (dev, via
proxy do Vite). Todas as rotas de dados exigem autenticação — **JWT** (front) ou
**chave de API** (integração externa) —, exceto onde indicado.

## Autenticação

### `POST /api/token/` — login
Aceita **e-mail ou username** no campo `username`.

```json
// request
{ "username": "mathias.waibel@sejaap.com.br", "password": "••••••" }
// response 200
{ "access": "eyJ...", "refresh": "eyJ..." }
```
`401` se as credenciais forem inválidas.

### `POST /api/token/refresh/`
```json
{ "refresh": "eyJ..." }  →  { "access": "eyJ..." }
```

### `POST /api/token/verify/`
```json
{ "token": "eyJ..." }  →  200 (válido) | 401 (inválido)
```

### Chave de API (integração externa)

Para consumidores que não são o front (n8n, ConectaAP, scripts): credencial de vida
longa, revogável, sem refresh. Ver [10 — Integração externa](10-integracao-externa.md)
para emissão, escopos e limites.

```http
GET /api/crm/clientes/
Authorization: Api-Key crm_ab12cd34_<segredo>
```
Alternativa equivalente: header `X-API-Key: crm_ab12cd34_<segredo>`.

## Sessão e configuração

### `GET /api/crm/me/` — usuário logado
```json
{ "id": 3, "username": "mathias.waibel", "email": "...", "nome": "...",
  "is_staff": true, "is_superuser": true }
```

Quando a autenticação é por chave de API, a resposta traz também qual chave está
sendo usada — é o endpoint para conferir se a credencial funciona:
```json
{ "id": 7, "username": "integracao", "...": "...",
  "api_key": { "nome": "n8n — sync diária", "prefixo": "ab12cd34",
               "escopo": "leitura", "expira_em": null } }
```

### `GET /api/crm/config/` — **público** (AllowAny)
Regra de negócio global.
```json
{ "comissao_rate": 0.03, "meses_contrato_padrao": 12 }
```
> As **etapas saíram daqui** em 2026-07-27: deixaram de ser uma lista global e
> passaram a pertencer a cada funil. Busque-as em `/api/crm/funis/` (embutidas em
> cada funil) ou em `/api/crm/etapas/?funil=<id|slug>`.

## Funis

### `GET /api/crm/funis/`
Lista os funis **ativos**, cada um com as suas **colunas** (etapas) embutidas — é a
chamada que o Kanban usa para montar o board.
```json
{ "results": [
  { "id": 1, "nome": "Indicados APN", "slug": "indicados_apn",
    "cor": "#3D7EC5", "descricao": "...", "ativo": true, "ordem": 1,
    "etapas": [
      { "id": 1, "funil": 1, "nome": "Priorizado", "slug": "priorizado",
        "emoji": "🟡", "cor": "#E4B744", "ordem": 0, "tipo": "progressao",
        "rotulo": "🟡 Priorizado", "total_clientes": 210 }, ... ] },
  { "id": 3, "nome": "Resgate", "slug": "resgate", "etapas": [] } ] }
```
Um funil pode legitimamente ter **zero** colunas (é o estado inicial de Base Elite
e Resgate).

## Etapas (colunas do Kanban)

Pertencem a um funil. Ver [06 — Regras de negócio](06-regras-de-negocio.md).

### `GET /api/crm/etapas/?funil=<id|slug>`
```json
{ "results": [ { "id": 1, "nome": "Priorizado", "slug": "priorizado", "...": "..." } ] }
```

### `POST /api/crm/etapas/` — criar coluna
`funil` e `nome` são obrigatórios. `slug` é derivado do nome (único no funil) e
`ordem` cai no fim do board quando omitida.
```json
{ "funil": 3, "nome": "Em Negociação", "emoji": "🤝",
  "cor": "#B069D3", "tipo": "progressao" }
```
`400` se já existir coluna com esse nome no mesmo funil.

### `PATCH /api/crm/etapas/{id}/` — renomear / recolorir / trocar o tipo
O **`slug` não muda** ao renomear: é o identificador estável da integração.

### `DELETE /api/crm/etapas/{id}/`
`204` se a coluna estiver vazia. **`409`** se tiver clientes:
```json
{ "erro": "A coluna 'Priorizado' tem 2 cliente(s). Mova os cartões para outra coluna antes de excluí-la." }
```

### `POST /api/crm/etapas/reordenar/`
```json
{ "funil": 1, "ordem": [3, 1, 2] }   →   { "results": [ ...etapas na nova ordem... ] }
```

## Clientes

### `GET /api/crm/clientes/` — listar
Retorna **toda a base** (compartilhada). Filtro opcional por funil:
`?funil=<id>` ou `?funil=<slug>` (ex.: `?funil=indicados_apn`).

```json
{ "results": [ { ...cliente... }, ... ] }
```

Objeto **cliente** (leitura) inclui os campos editáveis + derivados:
`id, funil, funil_nome, funil_slug, funil_cor, nome, cnpj, email, telefone,
municipio, estado, pais, segmento, canal, status, produto_atual, consultor_atual,
motivo_distrato, quem_fara_contato, responsavel, indicador_nome, indicador_empresa,
indicador_whatsapp, indicador_equipe, faixa_faturamento, prioridade, qtd_indicacoes,
data_onboarding, data_offboarding, qtd_socios, lt, etapa, etapa_slug, etapa_display,
etapa_emoji, etapa_cor, etapa_tipo, ordem, notas, valor_contrato, meses_contrato,
meses_efetivos, parcela_mensal, comissao_mensal, criado_por, criado_por_nome,
criado_em, atualizado_em`.

**`etapa`** é o **id** da coluna na leitura. Na escrita aceita **id ou slug** — o
slug é resolvido dentro do funil do cliente, e `null` tira o cartão do board.

### `POST /api/crm/clientes/` — criar
Corpo com os campos editáveis (só `nome` é obrigatório). `criado_por` é definido
automaticamente. Retorna `201` com o cliente serializado.

```json
{ "funil": 1, "nome": "Empresa X", "etapa": "priorizado",
  "telefone": "+55 48 99999-0000", "prioridade": "P1" }
```

### `GET /api/crm/clientes/{id}/` — detalhar
Retorna o cliente. `404` se não existir.

### `PATCH /api/crm/clientes/{id}/` — atualizar parcial
Usado, por exemplo, pelo Kanban ao mover de etapa (id ou slug da coluna):
```json
{ "etapa": "em_conversa" }
```
`400` se a coluna não pertencer ao funil do cliente — a mensagem lista as
disponíveis.
`PUT` também é aceito (atualização completa).

### `DELETE /api/crm/clientes/{id}/` — remover
Retorna `204`.

## Importação de Excel

### `POST /api/crm/clientes/importar/` — enviar planilha
`multipart/form-data`, campo **`arquivo`** (`.xlsx`).
```json
// response 200
{ "criados": 12, "total": 14, "erros": [ { "linha": 5, "erro": "..." }, ... ] }
```
`400` se o arquivo faltar, não for `.xlsx` ou não tiver a coluna "Nome / Empresa".

### `GET /api/crm/clientes/modelo-importacao/` — baixar modelo
Retorna um `.xlsx` (attachment) com os cabeçalhos aceitos + uma linha de exemplo.

## Códigos de status

| Código | Significado |
|--------|-------------|
| 200 / 201 / 204 | sucesso / criado / removido |
| 400 | validação (corpo inválido) |
| 401 | sem token / token inválido ou expirado |
| 404 | recurso não encontrado |
| 409 | conflito — excluir coluna que ainda tem clientes |
