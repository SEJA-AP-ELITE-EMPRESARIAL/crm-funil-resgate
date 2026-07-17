# 09 — Deploy e operação

Conecta_CRM roda como **stack Docker isolada** (`docker-compose.yml`, projeto
`conecta-crm`) nas VPS do Conecta, atrás do nginx do host + Cloudflare, com banco no
Supabase. O passo a passo de primeira instalação está em
[`../deploy/RUNBOOK.md`](../deploy/RUNBOOK.md); aqui fica a visão de operação.

## Ambientes

| Ambiente | Domínio | VPS | Repo na VPS |
|----------|---------|-----|-------------|
| Produção | conecta-crm.sejaap.com.br | conecta-prod (187.77.48.159) | `/opt/conecta/app/conecta-crm` |
| Homolog | conecta-crm-homolog.sejaap.com.br | conecta-homolog (187.77.48.164) | idem |

Cada VPS: containers `conecta-crm-backend` (gunicorn, interno) e
`conecta-crm-frontend` (nginx, `127.0.0.1:8090`). Deploy sempre da branch **`main`**.

## Componentes do deploy

- **`docker-compose.yml`** — serviços `backend` e `frontend` + healthchecks.
- **`backend/Dockerfile`** — Python 3.12, `pip install -r requirements-prod.txt`,
  `collectstatic`, `gunicorn`.
- **`frontend/Dockerfile`** — build Vite (Node 20) → nginx servindo o `dist`.
- **`frontend/nginx.conf`** — SPA + proxy `/api`,`/admin`,`/static` → backend.
- **`deploy/nginx-host-conecta-crm.conf`** — server block do **host** (TLS via cert
  origin Cloudflare, proxy para `127.0.0.1:8090`).
- **`.env`** (na VPS, não versionado) — segredos; ver [07](07-configuracao.md).

## Acesso à VPS

Chaves SSH (com passphrase) no `~/.ssh` local, carregadas no ssh-agent do Windows.
Aliases: `conecta-prod`, `conecta-homolog`. No Git Bash use o ssh nativo do Windows:

```bash
WSSH="/c/Windows/System32/OpenSSH/ssh.exe"
"$WSSH" conecta-prod 'whoami; hostname'
```

Cada VPS tem uma **deploy key** própria do repo (`~/.ssh/crm_deploy` + alias
`github-crm` no `~/.ssh/config`), cadastrada em *Deploy keys* do GitHub.

## Atualizar (novo deploy)

Sempre da `main`:

```bash
ssh conecta-prod        # ou conecta-homolog
cd /opt/conecta/app/conecta-crm
git pull --ff-only origin main
docker compose up -d --build
```

Health após subir:
```bash
docker ps --filter name=conecta-crm --format 'table {{.Names}}\t{{.Status}}'
# ambos devem ficar (healthy)
```

Smoke test (interno):
```bash
curl -s http://127.0.0.1:8090/api/crm/config/ | head -c 80
```

## Migrations em produção

O compose **não** roda `migrate` no boot. Como o banco (Supabase) é **compartilhado**
por homolog e prod, aplique as migrations **uma vez**, com cuidado (backup antes de
mexer em schema):

```bash
docker exec conecta-crm-backend python manage.py showmigrations crm
docker exec conecta-crm-backend python manage.py migrate crm
```

## CI (GitHub Actions)

`.github/workflows/ci.yml` roda a cada push/PR: **backend** (`manage.py check` +
testes) e **frontend** (`npm ci` + `npm run build`).

## Rollback

```bash
cd /opt/conecta/app/conecta-crm
git checkout <commit-anterior>
docker compose up -d --build
# depois, volte para main quando reaplicar a correção
```

## Troubleshooting

| Sintoma | Causa provável / ação |
|---------|----------------------|
| Deploy "exited status 1" no boot | `migrate` sem conseguir conectar no banco → confira `DATABASE_URL` (use o **Session pooler**, sem colchetes na senha) |
| Container `frontend` fica `starting` | healthcheck usa `127.0.0.1` (nginx só escuta IPv4) — já corrigido |
| `502/522` no subdomínio | container caiu ou nginx do host apontando errado (`127.0.0.1:8090`); veja `docker ps` e `sudo nginx -t` |
| Erro TLS no Cloudflare (strict) | cert origin não cobre o subdomínio → use um Origin Certificate `*.sejaap.com.br` |
| Login falha | token expirado / credenciais; veja logs do backend |

Logs:
```bash
docker compose logs -f backend      # ou frontend
docker logs conecta-crm-backend --tail 100
```

## Segurança / manutenção

- Segredos só no `.env` da VPS (`chmod 600`), nunca no Git.
- Rotacionar a senha do Supabase e do superusuário periodicamente (atualizar o
  `.env` e recriar o backend: `docker compose up -d`).
- O nginx do host + Cloudflare terminam TLS; `SECURE_SSL_REDIRECT=false` no backend
  evita loop (o redirect para HTTPS é feito na borda).
