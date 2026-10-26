---
name: verificar-tabela-filtros
description: "Verifica a Table com visão e filtros do @betinhos-executive-service/ui (§10.9.1 e §10.9.2): menu no título da coluna (ordenar, Filtrar por…, limpar, ocultar), painel ColumnFilter ancorado, chips e ViewBar, na vitrine. Use após mudar packages/ui/src/components/Table.tsx, table.css ou packages/ui/src/tableView/**."
---
# Verificar Table, visões e filtros

## Cobre
- Código: `packages/ui/src/components/Table.tsx`, `packages/ui/src/components/table.css`, `packages/ui/src/tableView/**` (`ColumnMenu`, `ColumnFilter`, `ViewBar`, `FilterChips`, `FiltersPanel`, `useTableView`, `useTableFilters`, `filters.ts`, `config.ts`)
- Exemplo vivo: vitrine, seção "Visões, colunas e filtros" (`apps/vitrine/src/ComponentsPage.tsx`, dados com "hoje" = 15/10/2026)

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz.
- `pnpm -C apps/vitrine dev` (porta 36490, `dev-restart.mjs` reinicia se a porta for da própria vitrine). Abra `http://localhost:36490/` no navegador interno e role até "Visões, colunas e filtros".

## Roteiro
1. `pnpm -C packages/ui typecheck` e `pnpm -C packages/ui test` → sem erros; `filters.test.ts`, `tableView.test.ts` (inclui `sortBy`) e `Table.test.ts` verdes.
2. `pnpm -C apps/vitrine typecheck` → sem erros.
3. Na vitrine, confirme no DOM: `.bt-colhead[data-col]` em cada coluna visível; nenhum `.bt-table__filters` (linha rápida) e nenhum `[aria-label="Filtro rápido"]` na barra.
4. Clique no título "Status" → menu com "Ordenar A→Z", "Ordenar Z→A", "Filtrar por…", "Ocultar coluna" (sem "Limpar filtro" enquanto não há filtro).
5. "Filtrar por…" → `.bt-colfilter` com `aria-label="Filtro da coluna Status"`, título "Filtrar por Status", posicionado logo abaixo do título (top = bottom do gatilho + 4 px). "Aplicar" desabilitado com a dica "Escolha ao menos um valor.".
6. Escolha "Atrasado" e "Aplicar" → painel fecha, chip "Status: Atrasado" aparece acima da tabela, só linhas atrasadas, título com `is-filtered` (▾ azul com ponto), menu ganha "Limpar filtro".
7. Clique no texto do chip → o painel reabre na coluna com "Filtro ativo: Status: Atrasado"; o painel "Filtros" (drawer) continua fechado. "Limpar" → chip some, `is-filtered` some, foco volta ao título.
8. Esc com o painel aberto fecha sem aplicar; "Ordenar Z→A" no menu de "Prazo" inverte a seta; "Ocultar coluna" tira a coluna (desabilitado quando só resta uma).

9. Painel "Colunas" → "Adicionar coluna": trilha "Esta lista", seções "Campos" e "Tabelas relacionadas". Abra Cliente › Gestor da conta, adicione "Telefone" (vira ✓ desabilitado), volte pela trilha a "Cliente", adicione "Cidade", "Concluir" → as duas no fim com "Adicionada" e ✕.
10. Arraste "Cliente › Cidade" pela alça até a 2ª posição (borda azul, vizinhas deslizam). Foco na alça de "Status" (JS `.focus()`), teclas `space Down Down space` → `.bt-columns__live` anuncia "Status solta na posição 5 de 9" e o foco continua na alça.
11. "Aplicar" → `.bt-colhead[data-col]` inclui "Cliente › Cidade" e "Cliente › Gestor da conta › Telefone" com valores nas linhas (`view.extraCell`).

## Casos de borda
- Coluna `x:` removida (✕) leva junto a ordenação por ela; campo já visível não pode ser adicionado de novo; relações só até 3 níveis.
- Coluna sem campo em `quickFilters.fields` (ou `advancedOnly`) não mostra "Filtrar por…".
- Mobile (≤ 820 px): o cabeçalho some nas listas em cartão e o chip abre o painel "Filtros" na aba "Por coluna".
- Arrastar o título para reordenar não abre o menu ao soltar (`suppressClick`).

## Evidência obrigatória
- Saída do typecheck/test e um resumo em texto dos passos 3–8 (DOM consultado via JS), mais a captura do painel aberto, em `.verificacao/<data>-<branch>/`.

## Limites
- A vitrine usa dados em memória (`matchesFilters`); o FetchXML gerado é coberto por `filters.test.ts`, e a consulta real ao Dataverse é verificada em cada tela do Sistema Betinhos.
