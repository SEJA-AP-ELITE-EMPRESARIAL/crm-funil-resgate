# 07 — Configuração (variáveis de ambiente)

## Backend

Lidas pelo `config/settings.py` (via `.env` na raiz do `backend/` em dev, ou no `.env`
do compose em produção). Modelos: `backend/.env.example` e `deploy/.env.prod.example`.

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DJANGO_SECRET_KEY` | (dev inseguro) | **Obrigatória em produção.** Gere: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DJANGO_DEBUG` | `true` | `false` em produção |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Domínios servidos (inclua o subdomínio). O host do Render é adicionado sozinho via `RENDER_EXTERNAL_HOSTNAME` (legado). |
| `CSRF_TRUSTED_ORIGINS` | vazio | Origens https confiáveis (para o admin) |
| `SECURE_SSL_REDIRECT` | `true` (se DEBUG=false) | **`false` na VPS** — o nginx/Cloudflare já forçam HTTPS (evita loop no healthcheck) |
| `CORS_ALLOWED_ORIGINS` | origens de dev | Em produção é mesma origem → quase irrelevante |
| `DATABASE_URL` | — | String Postgres do Supabase (Session pooler). Tem prioridade sobre as `POSTGRES_*` |
| `DB_SSLMODE` | `require` (DATABASE_URL) | SSL do Postgres |
| `CRM_DB_ENGINE` | `sqlite` | `postgres` para usar as `POSTGRES_*` (alternativa ao `DATABASE_URL`) |
| `POSTGRES_DB/USER/PASSWORD/HOST/PORT` | — | Só quando `CRM_DB_ENGINE=postgres` e sem `DATABASE_URL` |
| `CRM_COMISSAO_RATE` | `0.03` | Taxa de comissão (fração) |
| `CRM_MESES_CONTRATO_PADRAO` | `12` | Meses padrão quando o cliente não define |

**Precedência do banco:** `DATABASE_URL` → `CRM_DB_ENGINE=postgres` → SQLite (default dev).

### Exemplo (produção / VPS)
```env
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<forte>
DJANGO_ALLOWED_HOSTS=conecta-crm.sejaap.com.br,conecta-crm-homolog.sejaap.com.br,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://conecta-crm.sejaap.com.br,https://conecta-crm-homolog.sejaap.com.br
SECURE_SSL_REDIRECT=false
DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
DB_SSLMODE=require
CRM_COMISSAO_RATE=0.03
CRM_MESES_CONTRATO_PADRAO=12
```

## Frontend

Lidas em build pelo Vite (prefixo `VITE_`). Modelo: `frontend/.env.example`.

| Variável | Default | Descrição |
|----------|---------|-----------|
| `VITE_PROXY_TARGET` | `http://localhost:8000` | Alvo do proxy `/api` em **dev** |
| `VITE_API_URL` | vazio | Só se o front for servido **separado** da API. Na VPS fica vazio (mesma origem) |
| `VITE_API_TIMEOUT` | `60000` | Timeout das requisições (ms) |

## Segurança

- Nunca versionar o `.env` real (o `.gitignore` já bloqueia; só os `*.env.example`
  vão para o Git).
- Na VPS o `.env` fica em `/opt/conecta/app/conecta-crm/.env` com `chmod 600`.
- `DJANGO_SECRET_KEY` é gerada **na própria VPS** no deploy (não trafega pelo Git).
