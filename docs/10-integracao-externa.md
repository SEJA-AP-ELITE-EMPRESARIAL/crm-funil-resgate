# 10 — Integração externa (chaves de API)

Como um sistema de fora (n8n, ConectaAP, scripts, dashboards) consome o Conecta_CRM.

O JWT do front expira em 4h e depende de refresh — inviável para automação. Para
isso existe a **chave de API**: credencial de vida longa, com escopo próprio,
revogável a qualquer momento e com cota separada.

## Emitir uma chave

### Pelo admin
`/admin/crm/apikey/add/` → preencha **nome**, **usuário**, **escopo** e (opcional)
**expira em** → salvar. A chave em texto puro aparece **uma única vez**, na mensagem
verde do topo. O banco guarda só o SHA-256 — perdeu, emita outra.

### Pela linha de comando (VPS)
```bash
python manage.py criar_api_key "n8n — sync diária" --usuario integracao
python manage.py criar_api_key "Dashboard externo" --usuario integracao --escopo escrita --dias 90
```

Na VPS, dentro do container:
```bash
docker compose -p conecta-crm exec backend python manage.py criar_api_key "n8n" --usuario integracao
```

## Usar a chave

Dois headers equivalentes — escolha o que a ferramenta facilitar:

```http
Authorization: Api-Key crm_ab12cd34_<segredo>
```
```http
X-API-Key: crm_ab12cd34_<segredo>
```

Exemplo completo:
```bash
curl https://conecta-crm.sejaap.com.br/api/crm/clientes/?funil=resgate \
  -H "Authorization: Api-Key crm_ab12cd34_<segredo>"
```

Para conferir se a credencial está válida, `GET /api/crm/me/` devolve o usuário e
os dados da chave (nome, prefixo, escopo, expiração).

Todos os endpoints de [03 — API](03-api.md) aceitam chave de API; o JWT continua
funcionando em paralelo, para o front.

## Escopos

| Escopo | Permite |
|--------|---------|
| `leitura` | apenas `GET`/`HEAD` — listar clientes, funis, `/me`, `/config` |
| `escrita` | tudo: criar, atualizar (mover de etapa), remover, importar planilha |

Uma chave de leitura recebe **403** com `{"detail": "Esta chave de API é somente
leitura."}` ao tentar `POST`/`PATCH`/`PUT`/`DELETE`. Prefira leitura sempre que a
integração só consulta.

## Usuário vinculado

Toda chave age **em nome de um usuário**. É esse usuário que aparece em `criado_por`
nos registros criados pela integração — a recomendação é criar um usuário dedicado
(ex.: `integracao`) em vez de usar uma conta pessoal, para a auditoria ficar legível.

Importante: o CRM tem **base compartilhada** ([02 — Backend](02-backend.md)). Não há
isolamento por usuário, então uma chave de escrita alcança a carteira inteira.

## Limites e erros

Rate limit **por chave** (a cota de uma integração não afeta a outra), configurável
em `CRM_API_RATE` (default `120/min`). Sessões JWT do front não são limitadas.

| Código | Situação |
|--------|----------|
| 401 | chave ausente, malformada, inexistente, revogada, expirada, ou usuário inativo |
| 403 | chave válida, mas sem escopo de escrita |
| 429 | cota estourada — o header `Retry-After` diz quantos segundos esperar |

Mensagens distinguem os casos: `"Chave de API inválida."`, `"Chave de API
revogada."`, `"Chave de API expirada."`.

## Paginação

`GET /api/crm/clientes/` devolve a base inteira por padrão (o Kanban do front
depende disso). Para consumo externo, peça paginação:

```
GET /api/crm/clientes/?page=1&page_size=100
```
Resposta: `{ "count": 512, "next": "...", "previous": null, "results": [...] }`.
Sem `page`/`page_size`, o formato antigo (`{"results": [...]}`) é mantido.
`page_size` máximo: 500.

## Revogar

Admin → **chaves de API** → desmarque `ativa` (ou use a ação "Revogar chaves
selecionadas"). Efeito imediato: a próxima requisição recebe 401. A coluna
**último uso** ajuda a identificar chaves esquecidas antes de revogar.

## Boas práticas

- Uma chave por integração — revogar uma não derruba as outras, e o "último uso"
  mostra quem ainda está viva.
- Escopo de leitura por padrão; escrita só quando a integração realmente grava.
- `--dias` em chaves de terceiros, para expirarem sozinhas.
- A chave é um segredo: guarde no cofre de credenciais da ferramenta (n8n
  Credentials, secrets do CI), nunca no corpo do fluxo nem no Git.

## Implementação (onde mexer)

| Arquivo | Papel |
|---------|-------|
| `apps/crm/models/api_key.py` | modelo `ApiKey`, geração e hash |
| `apps/crm/authentication.py` | `ApiKeyAuthentication` (lê os headers, valida) |
| `apps/crm/permissions.py` | `HasApiScope` (leitura × escrita) |
| `apps/crm/throttling.py` | `ApiKeyRateThrottle` (cota por chave) |
| `apps/crm/pagination.py` | paginação opt-in |
| `apps/crm/admin.py` | emissão/revogação no admin |
| `apps/crm/management/commands/criar_api_key.py` | emissão por CLI |
| `apps/crm/tests/test_api_key.py` | 19 testes da camada |
