# 05 — Banco de dados

## Onde fica

**PostgreSQL 16 self-hosted** — container `funil-postgres` na VPS **db-sejaap**
(179.197.237.95), banco `funil_vendas`, role `funil_app`. Um único banco atende a
aplicação (não há ambiente de homologação).

- A porta `5434` é **loopback-only** na db-sejaap: não há acesso direto pela
  internet. O backend chega nela pelo serviço `db-tunnel` do compose (autossh) —
  ver [09](09-deploy-operacao.md).
- Conexão do Django: `DATABASE_URL=postgresql://funil_app:<senha>@db-tunnel:5434/funil_vendas`
  (ver [07](07-configuracao.md)).
- Compose do banco na db-sejaap: `/opt/funil/docker-compose.yml` (volume
  `funil_pgdata`, rede `funil_net`, SSL on, backups em `/opt/funil/backups`).

> **Histórico:** até 2026-07-23 o banco era um Postgres gerenciado no Supabase
> (projeto `uemwpavjpfqoqgmdzxav`). Os dados foram migrados por dump/restore com
> contagens conferidas, e o projeto Supabase segue intacto mas **não é mais
> consumido**.
>
> O schema é gerido pelo **Django (migrations)** — não edite tabelas direto no
> Postgres.

## Tabelas do domínio

Prefixo `crm_` (padrão Django `app_model`).

### `crm_funil`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | bigint PK | |
| nome | varchar(80) | único |
| slug | varchar(80) | único |
| cor | varchar(9) | hex |
| descricao | varchar(200) | |
| ativo | boolean | |
| ordem | smallint | |
| criado_em / atualizado_em | timestamptz | |

### `crm_cliente`
Colunas principais (ver a lista completa de campos em [02 — Backend](02-backend.md)):

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | bigint PK | |
| funil_id | bigint FK→crm_funil | `ON DELETE PROTECT`, nullable |
| etapa | varchar(30) | choices (slug), nullable = fora do funil |
| nome | varchar(200) | obrigatório |
| valor_contrato | numeric(12,2) | nullable |
| meses_contrato | smallint | nullable |
| prioridade | varchar(10) | P1–P5 (Indicados APN) |
| quem_fara_contato | varchar(120) | responsável (texto) |
| criado_por_id | int FK→auth_user | `ON DELETE SET NULL` |
| ordem | int | ordenação no Kanban |
| criado_em / atualizado_em | timestamptz | auto |
| … | | + campos de indicação, localização, comercial, operacional |

Índices: `etapa`, `quem_fara_contato`, `funil_id`.

### Tabelas do Django (padrão)
`auth_user`, `auth_group`, `auth_permission`, `django_migrations`,
`django_content_type`, `django_admin_log`, `django_session`.

## Modelo relacional

```
crm_funil 1 ───< N crm_cliente >─── N 1 auth_user (criado_por)
```

Um funil tem muitos clientes; um cliente pertence a um funil (ou nenhum) e referencia
o usuário que o criou (apenas metadado — não controla visibilidade; ver
[02 — permissões](02-backend.md)).

## Migrations

| Migration | O que faz |
|-----------|-----------|
| `0001_initial` | cria `crm_cliente` + enum de etapas |
| `0002_funil_cliente_funil` | cria `crm_funil` e a FK `funil` |
| `0003_seed_funis` | cria os 3 funis e vincula clientes existentes |
| `0004_...` | campos de indicação (indicador, faixa, prioridade, qtd) |
| `0005_apikey` | cria `crm_apikey` (chaves de integração externa) |

Aplicar: `python manage.py migrate`. Em produção, aplique **antes** de trocar o
container que serve tráfego — o procedimento está em [09](09-deploy-operacao.md).

## Dados atuais (referência)

- 3 funis: Indicados APN, Base Elite, Resgate.
- ~235 clientes reais no Indicados APN (importados da planilha do APN turma 107).

## Backup

> ⚠️ **Não há backup automático do `funil_vendas` hoje.** O Kanban tem um
> `/opt/kanban/backup.sh` agendado às 03:20 na mesma db-sejaap; o caminho é
> espelhar esse script para o `funil-postgres`. Enquanto isso não existir, o único
> backup é manual.

Dump manual (na db-sejaap):
```bash
docker exec funil-postgres pg_dump -U funil_app -d funil_vendas \
  --no-owner --no-privileges > /opt/funil/backups/funil_$(date +%F).sql
```

Faça um dump antes de qualquer migration que **altere ou remova** schema. Migration
que só cria tabela é aditiva e reverte com `migrate crm <numero_anterior>`.
