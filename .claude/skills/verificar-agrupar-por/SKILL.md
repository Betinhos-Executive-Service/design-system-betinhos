---
name: verificar-agrupar-por
description: "Verifica o Agrupar por das listas (§10.9.1, 1.30): ViewConfig.group, seção 'Agrupar por' do painel Colunas, groupRows/groupableFields e TableGroups. Use após mudar config.ts, grouping.ts, TableGroups.tsx, ColumnsPanel.tsx, ColumnMenu.tsx (itens de agrupar), table-view.css (bt-groups/bt-columns__group) ou grouping.test.tsx."
---
# Verificar Agrupar por

## Cobre
- `packages/ui/src/tableView/config.ts` (`ViewGroup`, `setGroup`, `normalizeConfig`), `grouping.ts`, `TableGroups.tsx`, `ColumnsPanel.tsx` (seção "Agrupar por"), `ViewBar.tsx` (`groupFields`), `table-view.css`, `grouping.test.tsx`.
- Exemplo vivo: vitrine, seção "Visões, colunas e filtros" (ocorrências).

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz; `pnpm --filter ./packages/ui build`; vitrine com `npx vite --port 36491 --strictPort` em `apps/vitrine` (encerre no fim).

## Roteiro
1. `pnpm --filter @betinhos-executive-service/ui test` — `grouping.test.tsx` verde (ordem do choice e Vazio, mês/ano em São Paulo, bool e texto→null, limite de 50 + Outros, round-trip da config, TableGroups abre/fecha/reset, painel só com campos agrupáveis).
2. Vitrine: Colunas → "Agrupar por" lista Status, Prazo, Cliente, Gravidade e Reincidente; não lista Ocorrência, Responsável, Local nem Valor.
3. Escolha Prazo: aparece "Período do grupo" (Por mês/Por ano), começa em Por mês.
4. Status → Aplicar: 3 grupos fechados (Atrasado 5, Em andamento 5, Concluído 4). Clique abre uma tabela só com aquelas linhas; `aria-expanded` muda.
5. Trocar o agrupamento fecha todos os grupos. "Sem agrupamento" (X do Select) volta à tabela única com rodapé.
5b. Seleção com dois grupos abertos: marcar o checkbox do cabeçalho de um grupo seleciona só as linhas dele; o cabeçalho do outro grupo fica desmarcado (sem traço). Desmarcar devolve só aquele grupo; Shift+clique dentro de um grupo não pega linha de outro (`selection.scope`, 1.31). Desde a 1.33 a vitrine não passa `all` nem `scope`: o `TableGroups` injeta os dois, então este passo também prova o automático.
5c. Menu do título (1.34, `view.groupable`): clique no título "Status" → "Agrupar por esta coluna" agrupa (mesmo resultado do painel); abra um grupo e clique de novo no título "Status" → só "Desagrupar", que volta à tabela única. Título "Prazo" → "Agrupar por mês" e "Agrupar por ano"; agrupado por mês, o menu mostra "Agrupar por ano" e "Desagrupar". Título de texto ("Ocorrência") não mostra agrupar. Teste: `TableGroupMenu.test.tsx`.
6. Salvar como visão e reabrir: o agrupamento volta junto.
7. Celular (390 px): grupos com cards dentro, sem rolagem lateral da página.

## Casos de borda
- Lookup com mais de 50 valores: 50 maiores + "Outros (N)" no fim, linhas na ordem original.
- Linhas sem valor: grupo "Vazio" no fim. Choice com vários valores: vale o primeiro.
- `group` com campo que saiu de `fields` ou `by` inválido: `groupRows` devolve `null` / `by` é descartado no `normalizeConfig`.

## Evidência obrigatória
- Saída dos testes e prints do painel com "Agrupar por" e da lista agrupada (desktop e celular).
