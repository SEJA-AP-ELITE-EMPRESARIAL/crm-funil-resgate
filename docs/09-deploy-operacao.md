# 09 — Deploy e operação

Conecta_CRM roda como **stack Docker isolada** (`docker-compose.yml`, projeto
`conecta-crm`) na VPS de soluções internas, atrás do nginx do host + Cloudflare, com
banco **self-hosted** alcançado por túnel SSH. O passo a passo completo (incluindo
instalação do zero) está em [`../deploy/RUNBOOK.md`](../deploy/RUNBOOK.md); aqui fica
a visão de operação.

## Ambiente

**Existe um ambiente só, e é produção.** Não há homologação.

| Item | Valor |
|------|-------|
| URL | https://conecta-crm.sejaap.com.br |
| VPS | 187.77.48.164 — `prod.solucoes.sejaap` |
| Aliases SSH | `prod.solucoes.sejaap` · `conecta-homolog` (**legado**, mesma máquina) |
| Repo na VPS | `/opt/conecta/app/conecta-crm`, branch `main` |
| Banco | `funil_vendas` no funil-postgres da VPS db-sejaap (179.197.237.95:5434) |

> Duas armadilhas de nomenclatura, herdadas da migração de 2026-07-23:
> o `hostname` da máquina é `prod` **e** o alias SSH histórico é `conecta-homolog`.
> É a mesma VPS, e é produção. A antiga `conecta-prod` (187.77.48.159) foi
> descomissionada — não tem containers, repo nem server block do CRM.

## Containers

| Container | Papel | Exposição |
|-----------|-------|-----------|
| `conecta-crm-frontend` | nginx servindo o build do Vite; proxya `/api`, `/admin`, `/static` | `127.0.0.1:8090` |
| `conecta-crm-backend` | gunicorn (3 workers, timeout 120) | só rede interna |
| `conecta-crm-db-tunnel` | `autossh` mantendo o túnel até o funil-postgres | só rede interna |

O CRM divide a VPS com o **Kanban**; o nginx do host separa os dois por SNI
(`conecta-crm.conf` × `kanban.conf`).

## Fluxo da requisição

```
Cloudflare (proxied, Full strict)
  → nginx do HOST (TLS via Origin Certificate) → 127.0.0.1:8090
    → conecta-crm-frontend → /api → conecta-crm-backend:8000
      → db-tunnel:5434 → (SSH) → 127.0.0.1:5434 na db-sejaap → funil-postgres
```

## Componentes do deploy

- **`docker-compose.yml`** — serviços `db-tunnel`, `backend` e `frontend` + healthchecks.
- **`deploy/db-tunnel/`** — `Dockerfile` (alpine + autossh) e `run.sh` do túnel.
- **`backend/Dockerfile`** — Python 3.12, `requirements-prod.txt`, `collectstatic`, gunicorn.
- **`frontend/Dockerfile`** — build Vite (Node 20) → nginx servindo o `dist`.
- **`frontend/nginx.conf`** — SPA + proxy `/api`, `/admin`, `/static` → backend.
- **`deploy/nginx-host-conecta-crm.conf`** — server block do **host**.
- **`.env`** (na VPS, não versionado) — segredos; ver [07](07-configuracao.md).
- **`/opt/conecta/env/db_tunnel_key`** (na VPS) — chave do túnel, `chmod 600`.

## Acesso à VPS

Chaves SSH (com passphrase) no `~/.ssh` local, carregadas no ssh-agent do Windows.
No Git Bash, use o ssh nativo do Windows:

```bash
WSSH="/c/Windows/System32/OpenSSH/ssh.exe"
"$WSSH" prod.solucoes.sejaap 'whoami; hostname'
```

A VPS tem **deploy key** própria do repo (`~/.ssh/crm_deploy` + alias `github-crm`
no `~/.ssh/config`), cadastrada em *Deploy keys* do GitHub.

## Atualizar

```bash
ssh prod.solucoes.sejaap
cd /opt/conecta/app/conecta-crm
git pull --ff-only origin main
docker compose up -d --build
```

Health e smoke:
```bash
docker ps --filter name=conecta-crm --format 'table {{.Names}}\t{{.Status}}'
curl -s http://127.0.0.1:8090/api/crm/config/ | head -c 80
```

## Migrations em produção

O compose **não** roda `migrate` no boot, e o banco é **único** (não há ambiente de
ensaio). Quando o release traz migration, aplique **antes** de trocar o container que
serve tráfego:

```bash
git pull --ff-only origin main
docker compose build backend
docker compose run --rm --no-deps backend python manage.py showmigrations crm
docker compose run --rm --no-deps backend python manage.py migrate crm
docker compose up -d --build
```

Backup antes de qualquer migration **destrutiva**. Criação de tabela é aditiva e
reverte com `migrate crm <numero_anterior>`.

## Chaves de API

Emissão e revogação das credenciais de integração:

```bash
docker exec conecta-crm-backend python manage.py criar_api_key \
  "nome da integração" --usuario integracao --escopo leitura
```

Revogação pelo admin (`/admin/crm/apikey/`). Ver
[10](10-integracao-externa.md) e [11](11-api-guia-completo.md).

## CI (GitHub Actions)

`.github/workflows/ci.yml` roda a cada push/PR: **backend** (`manage.py check` +
testes) e **frontend** (`npm ci` + `npm run build`). O CI **não** faz deploy — o
deploy é manual, pela VPS.

## Rollback

```bash
cd /opt/conecta/app/conecta-crm
git checkout <commit-anterior>
docker compose up -d --build
git checkout main     # quando a correção estiver pronta
```
Se havia migration, reverta o schema antes de voltar o código. Não existe rollback
"para a VPS antiga" — a `.159` foi esvaziada.

## Troubleshooting

| Sintoma | Causa provável / ação |
|---------|----------------------|
| Backend não sobe / erro de conexão no banco | o `db-tunnel` caiu ou perdeu a chave → `docker logs conecta-crm-db-tunnel`; confira `/opt/conecta/env/db_tunnel_key` e se a db-sejaap está de pé |
| `could not connect to server` intermitente | reconexão do autossh; se persistir, `docker compose restart db-tunnel` |
| Container `frontend` fica `starting` | healthcheck usa `127.0.0.1` (nginx só escuta IPv4) — já corrigido |
| `502/522` no subdomínio | container caiu ou nginx do host apontando errado (`127.0.0.1:8090`); veja `docker ps` e `sudo nginx -t` |
| Erro TLS no Cloudflare (strict) | cert origin não cobre o subdomínio → use o Origin Certificate `*.sejaap.com.br` |
| `relation "crm_apikey" does not exist` | migration não aplicada → rode o `migrate` da seção acima |
| Login falha | token expirado / credenciais; veja os logs do backend |

Logs:
```bash
docker compose logs -f backend            # ou frontend, ou db-tunnel
docker logs conecta-crm-backend --tail 100
```

## Segurança / manutenção

- Segredos só no `.env` da VPS (`chmod 600`) e em `/opt/conecta/env/`, nunca no Git.
- A porta 5434 do funil-postgres é **loopback-only** na db-sejaap; o acesso só existe
  pelo túnel, com chave restrita a `permitopen="127.0.0.1:5434"` (não abre shell).
- Rotacionar periodicamente: senha do `funil_app`, senha do superusuário e as chaves
  de API ativas (`/admin/crm/apikey/` mostra o último uso de cada uma).
- O nginx do host + Cloudflare terminam TLS; `SECURE_SSL_REDIRECT=false` no backend
  evita loop (o redirect para HTTPS é feito na borda).

### Pendência conhecida

**Não há cron de backup do `funil_vendas`.** O Kanban tem `/opt/kanban/backup.sh`
às 03:20 na mesma db-sejaap — o caminho é espelhar esse script para o
`funil-postgres`. Enquanto isso não existe, o banco do CRM não tem backup
automático.
