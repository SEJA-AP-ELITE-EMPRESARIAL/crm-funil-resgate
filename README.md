# CRM — Funil de Resgate (Win-back)

[![CI](https://github.com/SEJA-AP-ELITE-EMPRESARIAL/crm-funil-resgate/actions/workflows/ci.yml/badge.svg)](https://github.com/SEJA-AP-ELITE-EMPRESARIAL/crm-funil-resgate/actions/workflows/ci.yml)

CRM para reativação de clientes cancelados: priorização → contato → diagnóstico →
proposta → **reativação**, com Kanban, Dashboard e Comissionamento.

Réplica do MVP feito no Lovable (React + Supabase), **reconstruída na stack do
ConectaAP** (React + Vite + MUI no front, Django + DRF no back) e com as
correções de negócio aplicadas.

- **Backend:** Django 5 + Django REST Framework + SimpleJWT (`backend/`)
- **Frontend:** React 18 + Vite + Material UI 7 + axios + Recharts + @dnd-kit (`frontend/`)

---

## O que mudou em relação ao MVP (correções aplicadas)

| # | MVP (Lovable/Supabase) | Aqui |
|---|---|---|
| 1 | **RLS por usuário** — cada consultor só via o que ele mesmo criou; board vazio para os demais | **Base compartilhada pela equipe** — todo autenticado enxerga/trabalha a base; `criado_por` vira só metadado ([`views/_helpers.py`](backend/apps/crm/views/_helpers.py)) |
| 2 | Comissão fixa em `valor / 12` | Campo **`meses_contrato`** parametriza a parcela (`valor ÷ meses`); taxa configurável via `CRM_COMISSAO_RATE` |
| 3 | `etapa` como texto livre | `EtapaFunil` (**TextChoices**) — slug + rótulo |
| 4 | Tipos desatualizados (`as any`) | Serializers DRF com campos derivados (`parcela_mensal`, `comissao_mensal`) |
| 5 | `.env` fora do `.gitignore` | `.gitignore` cobre `.env`; só `.env.example` versionado |

---

## Como rodar (dev)

Pré-requisitos: **Python 3.11+** e **Node 18+**.

### 1) Backend (porta 8000)

```bash
cd backend
python -m venv .venv
# Windows (Git Bash):
./.venv/Scripts/python.exe -m pip install -r requirements.txt
# Linux/Mac: source .venv/bin/activate && pip install -r requirements.txt

cp .env.example .env                      # opcional (defaults já rodam em SQLite)
python manage.py migrate
python manage.py seed_demo                # cria usuário demo + carteira de exemplo
python manage.py runserver 8000
```

Usuário demo criado pelo `seed_demo`: **`demo@sejaap.com` / `demo12345`**.
Superusuário do admin: `python manage.py createsuperuser` (admin em `/admin/`).

### 2) Frontend (porta 5173)

```bash
cd frontend
npm install
npm run dev
```

Abra **http://localhost:5173** e entre com o usuário demo. Em dev o Vite faz
proxy de `/api` para o Django (nada a configurar).

---

## Estrutura

```
crm-funil-resgate/
├── backend/                     # Django + DRF
│   ├── config/                  # settings, urls (JWT no raiz), wsgi/asgi
│   └── apps/crm/                # app do CRM (padrão ConectaAP)
│       ├── models/cliente.py    # Cliente + EtapaFunil + regras (parcela/comissão)
│       ├── serializers/         # leitura (derivados) + escrita
│       ├── services/            # regra de negócio (transações)
│       ├── views/               # function-based (@api_view), base compartilhada
│       ├── urls.py  admin.py    # rotas + admin com colunas coloridas
│       ├── management/commands/seed_demo.py
│       └── tests/test_api.py    # auth, base compartilhada, comissão
└── frontend/                    # React + Vite + MUI
    └── src/
        ├── theme/               # tema dourado (dark-first) — cores das etapas
        ├── services/api.js      # axios + interceptors JWT (+ refresh)
        ├── contexts/            # AuthContext + ClientesContext (base compartilhada)
        ├── features/funil/services/  # camada de dados (clientesService)
        ├── lib/stages.js        # 7 etapas (fonte única) + cores
        ├── pages/               # Login, Funil (header + tabs)
        └── components/funil/    # KanbanBoard, StageColumn, ClienteCard,
                                 # ClienteFormDialog, Dashboard, Comissionamento
```

## API (resumo)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/token/` | Login (e-mail **ou** username) → `{access, refresh}` |
| POST | `/api/token/refresh/` | Renova o access token |
| GET | `/api/crm/me/` | Usuário logado |
| GET | `/api/crm/config/` | Taxa de comissão, meses padrão, etapas |
| GET/POST | `/api/crm/clientes/` | Lista (base compartilhada) / cria |
| GET/PATCH/DELETE | `/api/crm/clientes/{id}/` | Detalha / atualiza (ex.: mover etapa) / remove |

## Testes

```bash
cd backend && python manage.py test apps.crm     # 6 testes
cd frontend && npm run build                       # valida a compilação
```

## Deploy (produção) — Conecta_CRM na VPS

Roda como stack Docker isolada (`docker-compose.yml`, projeto `conecta-crm`) na
mesma VPS do Conecta, atrás do **nginx do host** (que termina o TLS via Cloudflare
Origin Certificate), sob um **subdomínio** — banco no **Supabase**.

```
conecta-crm.sejaap.com.br ──Cloudflare──▶ nginx do host ──▶ [frontend nginx] ──/api──▶ [backend gunicorn] ──▶ Supabase
```

Frontend e API ficam na **mesma origem** (o nginx do container faz proxy de `/api`),
então **não há CORS**. O passo a passo completo (Cloudflare DNS, clone na VPS,
`docker compose up`, nginx do host) está em [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md).

Artefatos: `backend/Dockerfile`, `frontend/Dockerfile` + `frontend/nginx.conf`,
`docker-compose.yml`, `deploy/.env.prod.example`, `deploy/nginx-host-conecta-crm.conf`.
