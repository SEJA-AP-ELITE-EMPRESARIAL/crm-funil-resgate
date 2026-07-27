# 00 — Visão Geral

## O que é

O **Conecta_CRM** é um CRM de funis de vendas/relacionamento usado pela SEJA AP para
organizar a prospecção e a reativação de clientes. Cada cliente/lead é um cartão que
percorre etapas até o fechamento ("Reativado"). ("Resgate" é um dos três funis — não
o nome do produto.)

Origem: nasceu como MVP no Lovable (React + Supabase) e foi **reconstruído na stack
do ConectaAP** para virar a primeira versão do Conecta_CRM, com backend próprio
(Django/DRF), regras de negócio corrigidas e deploy na infra da empresa.

## Para quem

- **Consultores / equipe comercial:** trabalham os cartões no Kanban, arrastando
  entre etapas, registrando dados e valores.
- **Gestão:** acompanha o Dashboard (conversão por etapa, prioridade, motivos).
- **Admin:** gerencia funis e a base pelo Django Admin.

## Os 3 funis

O sistema é **multi-funil**. Hoje há três (gerenciáveis pelo admin):

| Funil | Uso |
|-------|-----|
| **Indicados APN** | Leads vindos de indicação (turmas do APN) |
| **Base Elite** | Carteira Base Elite |
| **Resgate** | Win-back de clientes cancelados |

Um **seletor global** escolhe qual funil está em tela — **sempre um**, nunca
"todos": desde 27/07/2026 cada funil tem as próprias colunas, e misturá-las num
board só não significaria nada.

## Funcionalidades

- **Kanban** com drag-and-drop entre as colunas do funil, filtros (consultor,
  motivo, busca) e selo de prioridade (P1–P5) nos cartões.
- **Colunas configuráveis por funil:** criar, renomear, recolorir, reordenar e
  excluir direto no board. Cada funil tem o próprio fluxo.
- **Cadastro/edição de cliente** com formulário que se adapta ao funil (ex.: bloco
  "Indicação" só no Indicados APN).
- **Dashboard:** KPIs, funil de conversão (gráfico), distribuição por prioridade
  (P1–P5) e análise por motivo de distrato.
- **Comissão (regra de negócio, sem tela própria):** comissão recorrente por
  responsável, parametrizada pela
  duração do contrato.
- **Importação de Excel** (.xlsx) com modelo para download e relatório de erros,
  além de um comando dedicado para as planilhas de indicação do APN.

## Etapas (colunas), por funil

Não há lista fixa: cada funil define as suas. O **Indicados APN** hoje segue
`Priorizado → Primeiro Contato → Em Conversa → Interessado → Negociação → Inscrito`
(+ `Follow-up` e `Encerrado`, fora da esteira). **Base Elite** e **Resgate** começam
sem colunas. Detalhes, cores e tipos em
[06 — Regras de negócio](06-regras-de-negocio.md).

## Ambientes

**Só existe produção** — não há homologação (o domínio `conecta-crm-homolog` foi
descontinuado em 2026-07-23).

| Ambiente | URL | Infra |
|----------|-----|-------|
| Produção | https://conecta-crm.sejaap.com.br | VPS `prod.solucoes.sejaap` (187.77.48.164) |

Banco: `funil_vendas` no funil-postgres da VPS db-sejaap, alcançado por túnel SSH.
Detalhes de deploy em [09 — Deploy e operação](09-deploy-operacao.md).
