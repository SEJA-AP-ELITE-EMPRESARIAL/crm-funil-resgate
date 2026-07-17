# 05 — Banco de dados

## Onde fica

**PostgreSQL 17 gerenciado no Supabase** (projeto `crm-funil-resgate`, ref
`uemwpavjpfqoqgmdzxav`, região sa-east-1 / São Paulo). O mesmo banco atende homolog
e produção (base compartilhada).

- Conexão do Django: variável `DATABASE_URL` (ver [07](07-configuracao.md)).
- Recomendado o **Session pooler** (IPv4): host
  `aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<ref>`.
- Painel: `https://supabase.com/dashboard/project/uemwpavjpfqoqgmdzxav`.

> O schema é gerido pelo **Django (migrations)** — não edite tabelas direto pelo
> Supabase. Use o Supabase para inspeção (Table editor / SQL) e backups.

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

Aplicar: `python manage.py migrate`. **Como o banco é compartilhado**, aplique as
migrations **uma vez** (cobre homolog e prod). Ver cuidados em [09](09-deploy-operacao.md).

## Dados atuais (referência)

- 3 funis: Indicados APN, Base Elite, Resgate.
- ~235 clientes reais no Indicados APN (importados da planilha do APN turma 107).

## Backup

O Supabase faz backups automáticos no plano do projeto. Para um dump manual, use o
SQL editor / `pg_dump` com a connection string. Recomenda-se um dump antes de
qualquer migration que altere schema.
