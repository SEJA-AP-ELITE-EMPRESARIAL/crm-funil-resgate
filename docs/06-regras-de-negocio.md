# 06 — Regras de negócio

## Funis

Sistema multi-funil. Os funis são registros em `crm_funil` (gerenciáveis pelo admin).
Hoje: **Indicados APN**, **Base Elite**, **Resgate**. Um seletor global filtra por
funil ou mostra "Todos". Por ora, os três compartilham as mesmas etapas.

## As 7 etapas do funil

Ordem de progressão + cores (usadas no Kanban e no tema):

| # | Etapa (slug) | Rótulo | Cor | Significado |
|---|--------------|--------|-----|-------------|
| 1 | `priorizado` | Priorizado | `#E4B744` | Selecionado para tentativa |
| 2 | `contato_realizado` | Contato Realizado | `#EA932E` | Primeiro contato |
| 3 | `conectado` | Conectado | `#E77123` | Conversa com decisor |
| 4 | `diagnostico` | Diagnóstico | `#DF5B3A` | Entendimento da dor/oportunidade |
| 5 | `proposta` | Proposta | `#B069D3` | Proposta enviada |
| 6 | `reativado` | Reativado | `#31C47F` | **Ganho** — cliente fechou |
| 7 | `perdido` | Perdido | `#666666` | Descartado (fora da progressão) |

Etapa **vazia** = cliente na base mas fora do funil. O gráfico de conversão usa a
progressão 1→6 (exclui Perdido).

## Comissão

**Correção sobre o MVP** (que fixava `valor / 12`): a parcela é parametrizada pela
duração do contrato.

```
meses_efetivos = meses_contrato do cliente  (ou CRM_MESES_CONTRATO_PADRAO = 12)
parcela_mensal = valor_contrato / meses_efetivos
comissao_mensal = parcela_mensal * CRM_COMISSAO_RATE        (0,03 = 3%)
```

- Calculado no **backend** (propriedades do modelo `Cliente`), exposto no serializer.
- A aba **Comissionamento** agrupa por `quem_fara_contato` e soma parcela e comissão
  dos clientes **Reativados**.
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
  CNPJ, Segmento, Município, Estado, Produto atual, Motivo distrato, Valor contrato,
  Meses contrato, Notas.
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
