# 08 — Desenvolvimento local

Pré-requisitos: **Python 3.11+** e **Node 18+**.

## Backend (porta 8000)

```bash
cd backend
python -m venv .venv
# Windows (Git Bash):
./.venv/Scripts/python.exe -m pip install -r requirements.txt
# Linux/Mac:
# source .venv/bin/activate && pip install -r requirements.txt

# opcional: cria .env (o default já roda em SQLite, sem configurar nada)
cp .env.example .env

python manage.py migrate
python manage.py seed_demo            # cria usuário demo (superuser) + os 3 funis
# python manage.py seed_demo --com-exemplos   # + carteira fictícia
python manage.py runserver 8000
```

Por padrão em dev usa **SQLite** (`backend/db.sqlite3`), sem precisar de Postgres.
Para apontar ao Supabase em dev, defina `DATABASE_URL` no `.env`.

Usuário demo: `demo@sejaap.com` / `demo12345` (login no app por e-mail; no admin por
username `demo`).

## Frontend (porta 5173)

```bash
cd frontend
npm install
npm run dev
```

Abra **http://localhost:5173**. Em dev o Vite faz proxy de `/api` para o backend
(`VITE_PROXY_TARGET`, default `http://localhost:8000`) — nada a configurar.

## Rodar os testes

```bash
# Backend (10 testes)
cd backend && python manage.py test apps.crm

# Frontend (valida a compilação)
cd frontend && npm run build
```

## Fluxo de trabalho (Git)

- Branch principal: **`main`** (o deploy nas VPS sempre parte da `main`).
- Trabalhe em branch → PR → merge na `main` → deploy (ver [09](09-deploy-operacao.md)).
- O CI (GitHub Actions) roda os testes do backend e o build do frontend a cada push/PR.

## Comandos úteis

```bash
python manage.py makemigrations crm     # ao mudar models
python manage.py migrate                # aplica migrations
python manage.py createsuperuser        # cria admin (interativo)
python manage.py shell                  # shell Django
python manage.py importar_indicados "arquivo.xlsx" --dry-run   # testa importação APN
```

## Convenções

- **Backend:** views function-based (`@api_view`), regra em `services/`, serializers
  de leitura/escrita separados, nomes de domínio em pt-BR.
- **Frontend:** JS/JSX (sem TS), componentes MUI, estado via Context, imports com
  alias `@/` (configurado no `vite.config.js`).
