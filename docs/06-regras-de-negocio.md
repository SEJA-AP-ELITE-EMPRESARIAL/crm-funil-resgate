# 06 — Regras de negócio

## Funis

Sistema multi-funil. Os funis são registros em `crm_funil` (gerenciáveis pelo admin).
Hoje: **Indicados APN**, **Base Elite**, **Resgate**. Um seletor global escolhe **um**
funil — não existe visão "todos", porque cada funil tem as próprias colunas e
misturá-las num board só não significaria nada.

## Etapas (colunas) — por funil

Cada funil define as suas colunas, criáveis/renomeáveis/reordenáveis/excluíveis pela
interface (ou pelo admin). Não há mais lista fixa global.

Cada etapa tem um **tipo**, e é ele que o Dashboard lê — assim os indicadores
funcionam em qualquer funil, sem depender do nome da coluna:

| Tipo | Papel |
|------|-------|
| `progressao` | passo normal da esteira |
| `ganho` | fecha o funil com sucesso (KPI de conversão) |
| `perda` | sai do funil sem sucesso |
| `auxiliar` | fora da esteira (ex.: "Follow-up") |

### Fluxo do Indicados APN (semeado pela migration 0007)

| # | Slug | Rótulo | Cor | Tipo |
|---|------|--------|-----|------|
| 1 | `priorizado` | 🟡 Priorizado | `#E4B744` | progressao |
| 2 | `primeiro_contato` | 🪪 Primeiro Contato | `#EA932E` | progressao |
| 3 | `em_conversa` | 💬 Em Conversa | `#E77123` | progressao |
| 4 | `interessado` | 🔥 Interessado | `#DF5B3A` | progressao |
| 5 | `negociacao` | 🟠 Negociação | `#B069D3` | progressao |
| 6 | `inscrito` | ✅ Inscrito | `#31C47F` | **ganho** |
| 7 | `follow_up` | 🔁 Follow-up | `#3D7EC5` | auxiliar |
| 8 | `encerrado` | ❌ Encerrado | `#666666` | perda |

**Base Elite** e **Resgate** começam **sem colunas**, por decisão de produto — o
fluxo de cada um será desenhado pela interface.

Etapa **vazia** = cliente na base mas fora do funil. O gráfico de conversão usa as
etapas de `progressao` + `ganho`, na ordem do board.

### Renomear é seguro

O `slug` de uma coluna é fixado na criação e **não muda** quando ela é renomeada —
é o identificador que a API e a importação de planilha usam. Trocar o rótulo não
quebra integração.

## Comissão

**Correção sobre o MVP** (que fixava `valor / 12`): a parcela é parametrizada pela
duração do contrato.

```
meses_efetivos = meses_contrato do cliente  (ou CRM_MESES_CONTRATO_PADRAO = 12)
parcela_mensal = valor_contrato / meses_efetivos
comissao_mensal = parcela_mensal * CRM_COMISSAO_RATE        (0,03 = 3%)
```

- Calculado no **backend** (propriedades do modelo `Cliente`), exposto no serializer.
- Os campos e os derivados continuam existindo na API; a **aba Comissionamento foi
  removida da interface** em 2026-07-27 (estava sem dados: nenhum cliente tinha
  `valor_contrato` preenchido).
- A taxa (`CRM_COMISSAO_RATE`) e o padrão de meses (`CRM_MESES_CONTRATO_PADRAO`) são
  configuráveis por variável de ambiente (ver [07](07-configuracao.md)).

Exemplo: contrato de R$ 12.000 em 6 meses → parcela R$ 2.000 → comissão R$ 60/mês.

## Prioridade (Indicados APN)

Cada indicado tem uma **prioridade P1–P5** (P1 = mais quente). Ela:

- é exibida como **selo colorido** no cartão do Kanban (P1 vermelho → P5 cinza);
- define a **ordem** no Kanban (P1 no topo da coluna);
- é editável no bloco "Indicação" do formulário.

## Base compartilhada

Todo usuário autenticado enxerga e trabalha **toda a base**. `criado_por` é só
auditoria. Ver [02 — permissões](02-backend.md).

## Importação de Excel

### Genérica (botão "Importar")
- `POST /api/crm/clientes/importar/` com um `.xlsx`.
- 1ª linha = cabeçalhos (tolerante a acento/maiúscula). Colunas reconhecidas:
  **Funil**, **Nome / Empresa** (obrigatória), Etapa, Consultor, Telefone, Email,
  CNPJ, Segmento, Município, Estado, Produto atual, Motivo distrato,
  Prioridade, Faixa de faturamento, Indicado por, Empresa do indicador,
  WhatsApp do indicador, Equipe do indicador, Qtd indicacoes,
  Valor contrato, Meses contrato, Notas.
- Resolve Funil (por nome/slug) e Etapa (por rótulo/slug); valida linha a linha e
  devolve `{ criados, total, erros: [{linha, erro}] }`.
- Há um **modelo** para download (`GET /api/crm/clientes/modelo-importacao/`).

### Planilhas de indicação do APN (comando)
As planilhas do APN têm formato próprio (aba "Indicados", 1 linha por indicado).
Comando dedicado:

```
python manage.py importar_indicados "ARQUIVO.xlsx" [--aba Indicados] \
    [--funil indicados_apn] [--dry-run] [--limpar]
```

Mapeamento aplicado:

| Coluna da planilha | Campo no CRM |
|--------------------|--------------|
| Nome + Empresa Indicado | `nome` ("Nome — Empresa") |
| WhatsApp Indicado | `telefone` |
| Prioridade (P1–P5) | `prioridade` + `ordem` |
| Faixa de Faturamento | `faixa_faturamento` |
| Nome/Empresa/WhatsApp/Equipe Indicador | campos `indicador_*` |
| Qtd. de Indicações | `qtd_indicacoes` |
| Observações | `notas` |
| (Status vazio) | etapa `priorizado` |

- `--dry-run`: só mostra a prévia, não grava.
- `--limpar`: apaga os clientes do funil antes de importar (evita duplicar em
  reimportações).
- Atenção a **cabeçalhos duplicados** na planilha (ex.: "Prioridade" tem coluna
  auxiliar) — o comando usa sempre a **primeira** ocorrência (coluna principal).
