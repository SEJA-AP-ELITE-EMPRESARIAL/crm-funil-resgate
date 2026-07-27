# Runbook — Conecta_CRM na VPS

Conecta_CRM roda como stack Docker isolada (`docker-compose.yml`, projeto
`conecta-crm`) atrás do nginx do host, sob o subdomínio `conecta-crm.sejaap.com.br`.

**Existe um único ambiente: produção.** O domínio de homologação
(`conecta-crm-homolog.sejaap.com.br`) foi descontinuado e a VPS `conecta-prod`
(187.77.48.159) não hospeda mais nada do CRM — nem containers, nem repo, nem
server block no nginx.

| Item | Valor |
|------|-------|
| VPS | **187.77.48.164** — `prod.solucoes.sejaap` (VPS de soluções internas) |
| Aliases SSH | `prod.solucoes.sejaap` · `conecta-homolog` (**alias legado**, mantido para o infra-monitor — aponta para a mesma máquina) |
| Usuário | `deploy` |
| Repo | `/opt/conecta/app/conecta-crm` (deploy sempre da `main`) |
| Containers | `conecta-crm-db-tunnel`, `conecta-crm-backend`, `conecta-crm-frontend` |
| Exposição | frontend em `127.0.0.1:8090`; backend só na rede interna do compose |
| Banco | `funil_vendas` no **funil-postgres** da VPS **db-sejaap** (179.197.237.95), via túnel SSH |
| Vizinhos na VPS | o Kanban roda na mesma máquina; o nginx separa por SNI (`kanban.conf` × `conecta-crm.conf`) |

> A VPS se chama `prod` no `hostname` e responde pelo alias `conecta-homolog`.
> Não se engane: **é produção**.

---

## Arquitetura de rede

```
conecta-crm.sejaap.com.br
   │  Cloudflare (proxied, Full strict)
   ▼
nginx do HOST  (TLS via Cloudflare Origin Certificate)
   │  proxy_pass 127.0.0.1:8090
   ▼
[conecta-crm-frontend]  nginx servindo o build Vite
   │  /api, /admin, /static → backend:8000
   ▼
[conecta-crm-backend]  gunicorn (3 workers)
   │  DATABASE_URL → db-tunnel:5434
   ▼
[conecta-crm-db-tunnel]  autossh -L 0.0.0.0:5434 → 127.0.0.1:5434 @ db-sejaap
   ▼
funil-postgres (db-sejaap, 179.197.237.95) — porta 5434 fechada para a internet
```

Front e API ficam na **mesma origem** (o nginx do container proxya `/api`), então
não há CORS entre eles.

## O túnel do banco

O `funil-postgres` só escuta em `127.0.0.1:5434` na db-sejaap — a porta nunca é
exposta à internet. O serviço `db-tunnel` (alpine + `autossh`) mantém um
encaminhamento SSH persistente e reconecta sozinho; o backend enxerga o banco como
o host `db-tunnel:5434` dentro da rede do compose.

Artefatos: [`deploy/db-tunnel/Dockerfile`](db-tunnel/Dockerfile) e
[`deploy/db-tunnel/run.sh`](db-tunnel/run.sh).

Credenciais **na VPS** (fora do Git, `chmod 600`):

| Arquivo | Papel |
|---------|-------|
| `/opt/conecta/env/db_tunnel_key` | chave privada do túnel (montada como `/keys/id`) |
| `/opt/conecta/env/db_tunnel_key.pub` | pública correspondente |
| `/opt/conecta/env/db_tunnel_known_hosts` | host key da db-sejaap (`StrictHostKeyChecking=yes`) |

No `root` da db-sejaap a chave está autorizada de forma restrita — só serve para
encaminhar aquela porta, não abre shell:

```
restrict,port-forwarding,permitopen="127.0.0.1:5434" ssh-ed25519 AAAA... conecta-crm-db-tunnel
```

## Atualizar (deploy do dia a dia)

```bash
WSSH="/c/Windows/System32/OpenSSH/ssh.exe"   # ssh nativo do Windows (Git Bash)
"$WSSH" prod.solucoes.sejaap

cd /opt/conecta/app/conecta-crm
git pull --ff-only origin main
docker compose up -d --build
```

Health:
```bash
for i in $(seq 1 24); do
  b=$(docker inspect -f '{{.State.Health.Status}}' conecta-crm-backend 2>/dev/null)
  f=$(docker inspect -f '{{.State.Health.Status}}' conecta-crm-frontend 2>/dev/null)
  echo "[$i] backend=$b frontend=$f"
  [ "$b" = healthy ] && [ "$f" = healthy ] && { echo OK; break; }; sleep 5
done
docker ps --filter name=conecta-crm --format 'table {{.Names}}\t{{.Status}}'
```

Smoke test:
```bash
curl -s http://127.0.0.1:8090/api/crm/config/ | head -c 120; echo
curl -s -o /dev/null -w '%{http_code}\n' https://conecta-crm.sejaap.com.br/
```

## Deploy que inclui migration

O compose **não** roda `migrate` no boot. Quando o release traz migration, aplique
**antes** de trocar o container que atende tráfego — assim o código novo nunca roda
sem o schema:

```bash
cd /opt/conecta/app/conecta-crm
git pull --ff-only origin main

docker compose build backend                                    # imagem nova
docker compose run --rm --no-deps backend python manage.py showmigrations crm
docker compose run --rm --no-deps backend python manage.py migrate crm   # aplica
docker compose up -d --build                                    # só então troca
```

Cuidados:
- **Backup antes de migration destrutiva** (remoção/alteração de coluna). Criação de
  tabela é aditiva e reversível com `migrate crm <numero_anterior>`.
- O banco é **um só** — não há ambiente de ensaio. Valide localmente com SQLite
  (`DATABASE_URL= CRM_DB_ENGINE=sqlite python manage.py test apps.crm`) antes.

## Instalação do zero (disaster recovery)

Só é necessário se a VPS for perdida ou o serviço migrar de máquina.

### 1. Cloudflare
- DNS: registro `A` · `conecta-crm` · IPv4 da VPS · **Proxied** (nuvem laranja).
- SSL/TLS: modo **Full (strict)**.
- Origin cert em `/opt/conecta/secrets/cf-origin.pem` (+ `.key`). O wildcard
  `*.sejaap.com.br` já cobre o subdomínio.

### 2. Repositório
```bash
sudo mkdir -p /opt/conecta/app && sudo chown deploy: /opt/conecta/app
cd /opt/conecta/app
git clone git@github.com:SEJA-AP-ELITE-EMPRESARIAL/crm-funil-resgate.git conecta-crm
cd conecta-crm
```
A VPS usa uma **deploy key** própria (`~/.ssh/crm_deploy` + alias `github-crm` no
`~/.ssh/config`), cadastrada em *Deploy keys* do repositório.

### 3. Chave do túnel
```bash
sudo mkdir -p /opt/conecta/env && sudo chown deploy: /opt/conecta/env
ssh-keygen -t ed25519 -N '' -f /opt/conecta/env/db_tunnel_key -C conecta-crm-db-tunnel
ssh-keyscan -H 179.197.237.95 > /opt/conecta/env/db_tunnel_known_hosts
chmod 600 /opt/conecta/env/db_tunnel_key*
```
Na **db-sejaap**, autorize a pública no `root` com a restrição da seção acima.
Teste o encaminhamento antes de subir a stack.

### 4. `.env`
```bash
cp deploy/.env.prod.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # DJANGO_SECRET_KEY
nano .env        # preencha a SECRET_KEY e a senha do funil_app
chmod 600 .env
```

### 5. Subir
```bash
docker compose build
docker compose up -d
docker compose run --rm --no-deps backend python manage.py migrate   # banco novo
```

### 6. nginx do host
```bash
sudo cp deploy/nginx-host-conecta-crm.conf /etc/nginx/sites-available/conecta-crm.conf
sudo ln -sf /etc/nginx/sites-available/conecta-crm.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7. Validar
Abra **https://conecta-crm.sejaap.com.br**. Admin do Django em `/admin/`.

## Rollback

```bash
cd /opt/conecta/app/conecta-crm
git log --oneline -10
git checkout <commit-anterior>
docker compose up -d --build
# depois volte para a main quando a correção estiver pronta:
git checkout main
```

Se o release tinha migration, reverta o schema **antes** de voltar o código:
`docker compose run --rm --no-deps backend python manage.py migrate crm <numero_anterior>`.

> Não existe mais rollback "para a VPS antiga": a `conecta-prod` foi
> descomissionada e não guarda cópia do repo nem do `.env`.

## Histórico de infraestrutura

| Quando | O quê |
|--------|-------|
| 2026-07-17 | Primeiro deploy: prod na `conecta-prod` (.159) + homolog na `.164`, banco no Supabase cloud (`uemwpavjpfqoqgmdzxav`) |
| 2026-07-23 | Banco migrado do Supabase para o **funil-postgres** na db-sejaap (dump/restore validado: 235 clientes, 3 funis, 5 usuários); criado o `db-tunnel` |
| 2026-07-23 | App consolidado na `.164`; DNS repontado; homolog descontinuado; `.159` esvaziada |
| 2026-07-27 | Migration `0005_apikey` (chaves de API) aplicada em produção |

O projeto Supabase antigo segue intacto e pode ser pausado — não é mais consumido
por nada.
