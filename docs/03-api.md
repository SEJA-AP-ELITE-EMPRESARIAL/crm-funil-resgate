# 03 — Referência da API

Base: `https://conecta-crm.sejaap.com.br` (prod) ou `http://localhost:5173` (dev, via
proxy do Vite). Todas as rotas de dados exigem `Authorization: Bearer <access>`,
exceto onde indicado.

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

## Sessão e configuração

### `GET /api/crm/me/` — usuário logado
```json
{ "id": 3, "username": "mathias.waibel", "email": "...", "nome": "...",
  "is_staff": true, "is_superuser": true }
```

### `GET /api/crm/config/` — **público** (AllowAny)
Regra de negócio + etapas (o front usa para rotular a UI).
```json
{ "comissao_rate": 0.03, "meses_contrato_padrao": 12,
  "etapas": [ { "value": "priorizado", "label": "Priorizado" }, ... ] }
```

## Funis

### `GET /api/crm/funis/`
Lista os funis **ativos**.
```json
{ "results": [
  { "id": 1, "nome": "Indicados APN", "slug": "indicados_apn",
    "cor": "#3D7EC5", "descricao": "...", "ativo": true, "ordem": 1 }, ... ] }
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
data_onboarding, data_offboarding, qtd_socios, lt, etapa, etapa_display, ordem,
notas, valor_contrato, meses_contrato, meses_efetivos, parcela_mensal,
comissao_mensal, criado_por, criado_por_nome, criado_em, atualizado_em`.

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
Usado, por exemplo, pelo Kanban ao mover de etapa:
```json
{ "etapa": "conectado" }
```
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
