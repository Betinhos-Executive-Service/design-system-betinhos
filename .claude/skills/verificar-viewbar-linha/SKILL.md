---
name: verificar-viewbar-linha
description: "Verifica a linha de comando do ViewBar com espaços nomeados (§10.9.1/§10.9.6): uma linha só em qualquer largura, ordem de encolhimento medida, controles fixos parados com 0/1/3 linhas marcadas, menu único do ⋮ com selo, barra do rodapé no celular e modo legado intacto. Use após mudar packages/ui/src/tableView/ViewBar.tsx, viewBarFit.ts, Selection.tsx ou table-view.css."
---

# Verificar a linha de comando do ViewBar

## Cobre
- Código: `packages/ui/src/tableView/ViewBar.tsx`, `viewBarFit.ts` (cálculo puro do degrau), `Selection.tsx` (`SelectionInline`, `selectionOverflow`, `SelectionBar`), `table-view.css` (bloco "Linha com espaços nomeados").
- Testes: `ViewBar.fit.test.tsx` (larguras simuladas por `data-vb`, ResizeObserver falso) e `Selection.test.tsx`.

## Preparar ambiente
1. `pnpm install` na raiz; `pnpm --filter @betinhos-executive-service/ui test` e `pnpm typecheck`.
2. `pnpm build:vitrine` e sirva o build: `npx vite preview --port 36490 --strictPort` em `apps/vitrine` (porta reservada; encerre no fim).

## Roteiro
1. Medidas: `PLAYWRIGHT=<pacote playwright> CHROME_EXE=<chromium instalado> node .claude/skills/verificar-viewbar-linha/medir.cjs http://localhost:36490/ <pasta>`. Mede a seção "Visões, colunas e filtros" em 390, 600, 820, 821, 1000, 1280, 1440 e 1920 px com 0, 1 e 3 linhas marcadas e imprime a tabela (vai no PR).
2. Esperado na tabela: "1 linha" = sim, "Sobreposição" = nenhuma, "Fora da barra" = —, "Fixos parados" = sim em todas as linhas e "Erros de console: nenhum". "Texto cortado" = nenhum, salvo o nome da visão em 390 px (último recurso: a vitrine tem 324 px de barra e os 5 controles que nunca saem ocupam 252).
3. A ordem aparece na coluna "Estado": a seleção perde o texto antes dos fixos; fixos só ícone antes da principal; seleção vai para o ⋮ antes de Auditoria/Densidade/Colunas; lupa por último.
4. Interação (1000 px, 3 marcadas): o ⋮ tem `aria-label` "Mais ações (N da seleção)", selo com N e abre com "[3 selecionados]" em cima (inertes com o motivo), divisor e "Exportar CSV". Clique direito numa linha marcada lista todas as ações da seleção.
5. Celular (390 px): a lupa abre a busca por cima da linha com foco no campo; Tab para fora com o campo vazio fecha. Com 3 marcadas, "Mais" do rodapé abre o mesmo menu (seleção, ações da tela, "Lista": Colunas/Auditoria, "Densidade das linhas").

## Casos de borda
- Modo legado (`children` sem `search`/`more`/`primary`/`selection`): sem `.bt-viewbar--slots`, sem camada de medida; no celular os botões viram só ícone com `aria-label` (teste "modo legado").
- Barra escondida (largura 0): não mede e mantém o último degrau.
- A tela precisa passar as mesmas `selection.actions` com 0 ou N marcadas; senão a reserva muda e os fixos andam.

## Evidência obrigatória
- Saída dos testes, tabela do `medir.cjs` e os prints `viewbar-<largura>-<marcadas>.png` gerados na pasta de saída.

## Limites
- Mede só a vitrine; telas reais (ex.: Geral do Sistema Betinhos) verificam a própria barra depois de migrar.
