---
name: verificar-viewbar-linha
description: "Verifica a linha de comando do ViewBar com espaços nomeados (§10.9.1/§10.9.6): uma linha só em qualquer largura, ordem de encolhimento medida, controles fixos parados com 0/1/3 linhas marcadas, peça única (uma superfície, principal fora, seleção sem pílula), menu único do ⋮ sem selo, barra do rodapé no celular e modo legado intacto. Use após mudar packages/ui/src/tableView/ViewBar.tsx, viewBarFit.ts, Selection.tsx ou table-view.css."
---

# Verificar a linha de comando do ViewBar

## Cobre
- Código: `packages/ui/src/tableView/ViewBar.tsx`, `viewBarFit.ts` (cálculo puro do degrau), `Selection.tsx` (`SelectionInline`, `selectionOverflow`, `SelectionBar`), `table-view.css` (bloco "Linha com espaços nomeados" e "Peça única").
- Testes: `ViewBar.fit.test.tsx` (larguras simuladas por `data-vb`, ResizeObserver falso) e `Selection.test.tsx`.

## Preparar ambiente
1. `pnpm install` na raiz; `pnpm --filter @betinhos-executive-service/ui test` e `pnpm typecheck`.
2. `pnpm build:vitrine` e sirva o build: `npx vite preview --port 36490 --strictPort` em `apps/vitrine` (porta reservada; encerre no fim).

## Roteiro
1. Medidas: `PLAYWRIGHT=<pacote playwright> CHROME_EXE=<chromium instalado> [SCHEME=dark] node .claude/skills/verificar-viewbar-linha/medir.cjs http://localhost:36490/ <pasta>`. Mede a seção "Visões, colunas e filtros" em 390, 600, 820, 821, 1000, 1280, 1440 e 1920 px com 0, 1 e 3 linhas marcadas e imprime a tabela (vai no PR). Rode também com `SCHEME=dark`: o DS é só claro, então o resultado e os prints têm de sair iguais aos do claro. Nesta máquina: `PLAYWRIGHT=$APPDATA/npm/node_modules/@playwright/cli/node_modules/playwright` e `CHROME_EXE=$LOCALAPPDATA/ms-playwright/chromium_headless_shell-<versão>/chrome-headless-shell-win64/chrome-headless-shell.exe` (a que existir; o playwright do CLI pode pedir uma versão não baixada).
2. Esperado na tabela: "1 linha" = sim, "Sobreposição" = nenhuma, "Fora da barra" = —, "Vão / fio" = nenhum, "Altura única" = sim, "Fixos parados" = sim em todas as linhas e "Erros de console: nenhum". "Texto cortado" = nenhum em todas as larguras, inclusive "rodapé: …" (rótulos da barra do celular; o que não cabe vira só ícone) e "PLACEHOLDER com N px" (placeholder da busca cortado com os fixos ainda com texto). Só é aceito "placeholder (espaço escasso, N px)": busca no mínimo ou linha já encolhida (Colunas só ícone ou no ⋮); na vitrine aparece em 600 px e, com seleção, em 821 e 1000 px. "Fixos parados" não inclui a busca (1.27.1: sem seleção ela ocupa a reserva; com seleção, encolhe e pode virar lupa no degrau dela). "Vão / fio" acusa espaço vazio entre itens da superfície (`vão`) e `FIO JUNTO A VAZIO` (ex.: a reserva vazia da 1.27.0, 260 px a 1440). Em 390 px a vitrine tem 324 px de barra e os controles que nunca saem ocupam 252: o "Estado" mostra "visão só ícone" (último degrau, 1.26.1) só aí. "Altura única" (1.27.2) compara a superfície com o token de controle (40 px; 44 px em toque/até 820 px) e com a altura e o topo do botão primário de fora (±0,5 px), o centro do seletor de visão com o da superfície, itens que vazam da altura interna (34/38 px) e alturas diferentes entre os botões do rodapé; na 1.27.1 acusava "superfície 50.0 ≠ controle 44" de 390 a 820 px. O "Estado" nunca pode trazer "SUPERFÍCIE ERRADA" (mais de uma superfície ou principal dentro dela) nem "PÍLULA" (contador com fundo) nem "selo" (1.27).
3. A ordem aparece na coluna "Estado": a seleção perde o texto antes dos fixos; fixos só ícone antes da principal; seleção vai para o ⋮ antes de Auditoria/Densidade/Colunas; depois a lupa; "visão só ícone" só quando nem a lupa basta.
4. Interação (1000 px, 3 marcadas): o ⋮ tem `aria-label` "Mais ações (N da seleção)", nenhum selo/texto dentro e abre com "[3 selecionados]" em cima (inertes com o motivo), divisor e "Exportar CSV". Clique direito numa linha marcada lista todas as ações da seleção.
5. Visual (prints de 1440 px com 0 e 1 marcada; sem seleção a busca começa logo depois do fio de Auditoria, sem vão; com 1, o trecho da seleção entra antes da busca e só a busca encolhe): visão fora à esquerda, uma superfície com fios entre Colunas | Filtros | Densidade | Auditoria | busca | ⋮ | Atualizar e "Nova ocorrência" sólida fora; com 1 marcada, trecho azul-claro com ✕, "1 selecionado" em texto azul e ações ghost.
6. Celular (390 px): a barra de cima não tem vão (só a lupa na zona: a superfície abraça os itens, `is-hug`); o print `viewbar-<esquema>-390-1-rodape.png` mostra o rodapé com "Copiar ocorrências" só ícone (quadrado, `title`) e Abrir/Mais com texto inteiro. A lupa abre a busca por cima da linha com foco no campo; Tab para fora com o campo vazio fecha. Com 3 marcadas, o rodapé mostra o contador em texto simples (sem fundo) e "Mais" (sem selo) abre o mesmo menu (seleção, ações da tela, "Lista": Colunas/Auditoria, "Densidade das linhas").

## Casos de borda
- Modo legado (`children` sem `search`/`more`/`primary`/`selection`): sem `.bt-viewbar--slots`, sem camada de medida; no celular os botões viram só ícone com `aria-label` (teste "modo legado").
- Tela que alinha a barra no topo (`.bt-viewbar { align-items: flex-start }`, ex.: Sistema Betinhos): `.bt-viewbar--slots` volta a centrar; toque em desktop (pointer grosso a 1440 px) também usa 44 px.
- Barra escondida (largura 0): não mede e mantém o último degrau.
- A tela precisa passar as mesmas `selection.actions` com 0 ou N marcadas; senão a reserva muda e os fixos andam.
- `primary` com só botões secondary/ghost/só ícone: nada fica fora da superfície (teste "só secondary em primary").
- Medida errada aparece como "Texto cortado" em pointer grosso (botões de 44 px e principal de 50 px): as cópias medidas precisam ficar nos contêineres `.bt-viewbar__surface`/`.bt-viewbar__end` da camada de medida.

## Evidência obrigatória
- Saída dos testes, tabela do `medir.cjs` e os prints `viewbar-<largura>-<marcadas>.png` gerados na pasta de saída.

## Limites
- Mede só a vitrine; telas reais (ex.: Geral do Sistema Betinhos) verificam a própria barra depois de migrar.
