# 00 — Visão Geral

## O que é

O **Conecta_CRM** (nome interno; título do produto: *Funil de Resgate*) é um CRM de
funis de vendas/relacionamento usado pela SEJA AP para organizar a prospecção e a
reativação de clientes. Cada cliente/lead é um cartão que percorre etapas até o
fechamento ("Reativado").

Origem: nasceu como MVP no Lovable (React + Supabase) e foi **reconstruído na stack
do ConectaAP** para virar a primeira versão do Conecta_CRM, com backend próprio
(Django/DRF), regras de negócio corrigidas e deploy na infra da empresa.

## Para quem

- **Consultores / equipe comercial:** trabalham os cartões no Kanban, arrastando
  entre etapas, registrando dados e valores.
- **Gestão:** acompanha Dashboard (conversão, rankings) e Comissionamento.
- **Admin:** gerencia funis e a base pelo Django Admin.

## Os 3 funis

O sistema é **multi-funil**. Hoje há três (gerenciáveis pelo admin):

| Funil | Uso |
|-------|-----|
| **Indicados APN** | Leads vindos de indicação (turmas do APN) |
| **Base Elite** | Carteira Base Elite |
| **Resgate** | Win-back de clientes cancelados |

Um **seletor global** permite ver um funil específico ou "Todos os funis". Por ora
os três compartilham as mesmas 7 etapas (o modelo já está preparado para etapas
próprias por funil no futuro).

## Funcionalidades

- **Kanban** com drag-and-drop entre as 7 etapas, filtros (consultor, motivo, busca)
  e selo de prioridade (P1–P5) nos cartões.
- **Cadastro/edição de cliente** com formulário que se adapta ao funil (ex.: bloco
  "Indicação" só no Indicados APN).
- **Dashboard:** KPIs, funil de conversão (gráfico), rankings de consultores e
  análise por motivo de distrato.
- **Comissionamento:** comissão recorrente por responsável, parametrizada pela
  duração do contrato.
- **Importação de Excel** (.xlsx) com modelo para download e relatório de erros,
  além de um comando dedicado para as planilhas de indicação do APN.

## As 7 etapas do funil

`Priorizado → Contato Realizado → Conectado → Diagnóstico → Proposta → Reativado`
(+ `Perdido`, fora da progressão). Detalhes e cores em
[06 — Regras de negócio](06-regras-de-negocio.md).

## Ambientes

| Ambiente | URL | Infra |
|----------|-----|-------|
| Produção | https://conecta-crm.sejaap.com.br | VPS conecta-prod (187.77.48.159) |
| Homologação | https://conecta-crm-homolog.sejaap.com.br | VPS conecta-homolog (187.77.48.164) |

Ambos usam o **mesmo banco Supabase** (base compartilhada). Detalhes de deploy em
[09 — Deploy e operação](09-deploy-operacao.md).
