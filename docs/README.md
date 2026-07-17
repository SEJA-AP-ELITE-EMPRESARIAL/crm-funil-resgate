# Documentação — Conecta_CRM (Funil de Resgate)

CRM multi-funil para prospecção e reativação de clientes, construído na stack do
ConectaAP (Django/DRF + React/MUI) com banco no Supabase. Rodando em produção nas
VPS do Conecta.

## Índice

| # | Documento | Conteúdo |
|---|-----------|----------|
| 00 | [Visão geral](00-visao-geral.md) | O que é, para quem, funcionalidades, ambientes |
| 01 | [Arquitetura](01-arquitetura.md) | Stack, diagrama, fluxo de requisição, decisões |
| 02 | [Backend](02-backend.md) | App Django, models, services, views, auth, permissões |
| 03 | [API](03-api.md) | Referência de todos os endpoints |
| 04 | [Frontend](04-frontend.md) | Estrutura React, componentes, estado, tema |
| 05 | [Banco de dados](05-banco-de-dados.md) | Schema, tabelas, relações, Supabase |
| 06 | [Regras de negócio](06-regras-de-negocio.md) | Funis, etapas, comissão, prioridade, importação |
| 07 | [Configuração](07-configuracao.md) | Variáveis de ambiente (backend e frontend) |
| 08 | [Desenvolvimento](08-desenvolvimento.md) | Setup local, rodar, testar |
| 09 | [Deploy e operação](09-deploy-operacao.md) | VPS, Docker, nginx, CI, updates, troubleshooting |

## Links rápidos

- **Produção:** https://conecta-crm.sejaap.com.br
- **Homologação:** https://conecta-crm-homolog.sejaap.com.br
- **Repositório:** `github.com/SEJA-AP-ELITE-EMPRESARIAL/crm-funil-resgate`
- **Runbook operacional resumido:** [`../deploy/RUNBOOK.md`](../deploy/RUNBOOK.md)

## TL;DR do stack

- **Backend:** Django 5 + Django REST Framework + SimpleJWT (Python 3.12)
- **Frontend:** React 18 + Vite + Material UI 7 + Recharts + @dnd-kit (JavaScript, sem TS)
- **Banco:** PostgreSQL gerenciado (Supabase)
- **Deploy:** Docker Compose nas VPS do Conecta, atrás do nginx do host + Cloudflare
