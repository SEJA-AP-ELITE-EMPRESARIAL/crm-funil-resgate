# 01 — Arquitetura

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite 5, Material UI 7, Emotion, Recharts, @dnd-kit, axios, react-router 6 — **JavaScript/JSX (sem TypeScript)** |
| Backend | Django 5, Django REST Framework, SimpleJWT, WhiteNoise, gunicorn — Python 3.12 |
| Banco | PostgreSQL 17 gerenciado (Supabase) |
| Infra | Docker Compose, nginx (host), Cloudflare (DNS + TLS) |

A escolha da stack espelha o ConectaAP (mesmo padrão de front MUI e back Django/DRF),
para facilitar a futura fusão no monorepo.

## Diagrama (produção)

```
Navegador
   │  HTTPS
   ▼
Cloudflare (DNS + proxy + TLS de borda)
   │  HTTPS (cert origin)
   ▼
nginx do HOST (VPS)  ── termina TLS, proxy para 127.0.0.1:8090
   │
   ▼
[container conecta-crm-frontend]  (nginx: serve a SPA React)
   │   /api, /admin, /static  ──proxy──▶  [container conecta-crm-backend] (gunicorn/Django)
   │                                              │
   │                                              ▼
   └── demais rotas → index.html (SPA)      PostgreSQL (Supabase, via Session pooler)
```

**Ponto-chave:** frontend e API ficam na **mesma origem** (`conecta-crm.sejaap.com.br`).
O nginx do container faz proxy de `/api`, `/admin` e `/static` para o backend; o resto
cai no `index.html` (roteamento client-side). Como é mesma origem, **não há CORS** em
produção.

## Fluxo de uma requisição autenticada

1. O usuário faz login → `POST /api/token/` retorna `access` + `refresh` (JWT).
2. O frontend guarda os tokens no `localStorage` e injeta `Authorization: Bearer <access>`
   em toda chamada (interceptor do axios).
3. Em `401`, o interceptor tenta `POST /api/token/refresh/` uma vez e repete a request;
   se falhar, desloga.
4. O Django valida o JWT (SimpleJWT) e aplica a permissão `IsAuthenticated`.

## Componentes de execução (produção)

| Container | Papel | Porta |
|-----------|-------|-------|
| `conecta-crm-frontend` | nginx servindo a SPA + proxy `/api` | `127.0.0.1:8090` → 80 |
| `conecta-crm-backend` | gunicorn/Django | interno `8000` |

O backend **não** é exposto na rede externa — só o frontend (via nginx do host).

## Decisões de arquitetura

- **Backend próprio (Django) em vez de Supabase direto:** o MVP falava direto com o
  Supabase; aqui há uma camada Django para centralizar auth (JWT), regras de negócio
  (comissão, importação), permissões de base compartilhada e uma API estável. O
  Supabase é usado apenas como **Postgres gerenciado**.
- **Base compartilhada pela equipe:** todo usuário autenticado enxerga toda a base
  (corrige o RLS por-usuário quebrado do MVP). Ver [02 — Backend](02-backend.md).
- **Views function-based (`@api_view`), sem ViewSets:** espelha o padrão do app
  `reunioes` do ConectaAP.
- **Deploy isolado na VPS do Conecta:** stack Docker própria (`conecta-crm`), sob
  subdomínio, sem tocar nos containers/nginx do Conecta. É a "v1" do Conecta_CRM;
  a fusão no monorepo (com Postgres do Conecta e SSO) fica para o futuro.

## Estrutura de pastas do repositório

```
crm-funil-resgate/
├── backend/                     # Django + DRF
│   ├── config/                  # settings, urls, wsgi/asgi
│   ├── apps/crm/                # app do CRM
│   ├── Dockerfile               # imagem do backend (gunicorn)
│   ├── requirements.txt         # deps core (roda em SQLite)
│   └── requirements-prod.txt    # + psycopg + gunicorn
├── frontend/                    # React + Vite + MUI
│   ├── src/                     # código da SPA
│   ├── Dockerfile               # build + nginx
│   ├── nginx.conf               # nginx do container (SPA + proxy /api)
│   └── public/_redirects        # fallback SPA (Cloudflare Pages, legado)
├── deploy/                      # artefatos de deploy
│   ├── RUNBOOK.md               # passo a passo na VPS
│   ├── nginx-host-conecta-crm.conf
│   └── .env.prod.example
├── docs/                        # esta documentação
├── docker-compose.yml           # stack conecta-crm (backend + frontend)
└── .github/workflows/ci.yml     # CI (testes + build)
```
