# Deploy do Conecta_CRM na VPS (Docker + nginx do host)

Conecta_CRM roda como stack isolada (`docker-compose.yml`, projeto `conecta-crm`)
na mesma VPS do Conecta, atrás do nginx do host, sob um subdomínio. Banco: Supabase.

- **Homolog:** VPS `187.77.48.164` · `conecta-crm-homolog.sejaap.com.br`
- **Prod:** VPS `187.77.48.159` · `conecta-crm.sejaap.com.br`
- Container frontend exposto em `127.0.0.1:8090`; backend só na rede interna.

> Faça primeiro em **homolog**, valide, depois repita em **prod**.

---

## 1. Cloudflare (DNS + TLS)

1. **DNS:** painel Cloudflare → zona `sejaap.com.br` → **Add record**
   - Tipo `A` · Nome `conecta-crm-homolog` · IPv4 `187.77.48.164` · **Proxied** (nuvem laranja).
   - (prod depois) `A` · `conecta-crm` · `187.77.48.159` · Proxied.
2. **SSL/TLS:** modo **Full (strict)**.
3. **Origin cert:** se o cert em `/opt/conecta/secrets/cf-origin.pem` for wildcard
   `*.sejaap.com.br`, já cobre o subdomínio. Senão, SSL/TLS → Origin Server →
   **Create Certificate** incluindo `conecta-crm*.sejaap.com.br` e salve o par em
   `/opt/conecta/secrets/`.

## 2. Preparar o repositório na VPS

```bash
WSSH="/c/Windows/System32/OpenSSH/ssh.exe"   # ssh nativo do Windows (Git Bash)
"$WSSH" conecta-homolog

# (na VPS) — clonar o repo do CRM (a deploy key da VPS precisa ter acesso ao repo)
sudo mkdir -p /opt/conecta/app && sudo chown deploy: /opt/conecta/app
cd /opt/conecta/app
git clone git@github.com:SEJA-AP-ELITE-EMPRESARIAL/crm-funil-resgate.git conecta-crm
cd conecta-crm

# env: copiar o exemplo e preencher (SECRET_KEY forte + senha do Supabase)
cp deploy/.env.prod.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # cola em DJANGO_SECRET_KEY
nano .env                                                        # ajusta DATABASE_URL (senha) etc.
chmod 600 .env
```

## 3. Subir os containers

```bash
cd /opt/conecta/app/conecta-crm
docker compose build
docker compose up -d
# health
for i in $(seq 1 30); do
  b=$(docker inspect -f '{{.State.Health.Status}}' conecta-crm-backend 2>/dev/null)
  f=$(docker inspect -f '{{.State.Health.Status}}' conecta-crm-frontend 2>/dev/null)
  echo "[$i] backend=$b frontend=$f"
  [ "$b" = healthy ] && [ "$f" = healthy ] && { echo OK; break; }; sleep 5
done
# smoke local (deve responder JSON)
curl -s http://127.0.0.1:8090/api/crm/config/ | head -c 120; echo
```

> O banco (Supabase) já tem schema e dados — o backend **não** roda migrate no boot
> por padrão neste compose; se algum dia precisar: `docker exec conecta-crm-backend python manage.py migrate`.

## 4. Nginx do host

```bash
# copiar o server block do repo para o nginx do host
sudo cp deploy/nginx-host-conecta-crm.conf /etc/nginx/sites-available/conecta-crm.conf
# HOMOLOG: trocar os server_name para conecta-crm-homolog.sejaap.com.br
sudo nano /etc/nginx/sites-available/conecta-crm.conf
sudo ln -sf /etc/nginx/sites-available/conecta-crm.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Testar

Abra **https://conecta-crm-homolog.sejaap.com.br** e entre com o usuário demo
(`demo@sejaap.com` / `demo12345`). Admin do Django em `/admin/` (login por username `demo`).

## 6. Promover para produção

Repita os passos 1–5 na VPS `conecta-prod` (`187.77.48.159`), usando o domínio
`conecta-crm.sejaap.com.br` nos `server_name`.

---

## Atualizar (novo deploy)

Deploy sempre a partir da `main`:

```bash
cd /opt/conecta/app/conecta-crm
git pull --ff-only origin main
docker compose up -d --build
```

## Rollback

```bash
cd /opt/conecta/app/conecta-crm
git checkout <commit-anterior>
docker compose up -d --build
```
