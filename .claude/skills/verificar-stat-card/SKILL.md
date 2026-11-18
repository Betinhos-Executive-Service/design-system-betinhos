---
name: verificar-stat-card
description: "Verifica StatCard, DeltaBadge, Sparkline, AlertCard e o drill-down de card (§10.7): selo pela cor do favorável com texto para leitor de tela, subgrid de 4 trilhas, valor em cqi sem corte, s/dado, carregando, barra de meta, card inteiro clicável por mouse, toque e teclado. Use após mudar packages/ui/src/components/StatCard.tsx, AlertCard.tsx, CardOpenButton.tsx, stat-card.css, alert-card.css, card-open.css ou os showcases da vitrine."
---

# Verificar StatCard e AlertCard

## Cobre
- Código: `StatCard.tsx` (`StatCard`, `DeltaBadge`, `Sparkline`, `sparklinePaths`), `AlertCard.tsx`, `CardOpenButton.tsx`, `stat-card.css`, `alert-card.css`, `card-open.css`, `Progress` (`valueLabel`, em `Misc.tsx`) e `.bt-sr-only` (`misc.css`).
- Testes: `StatCard.test.tsx` (jsdom) e `StatCardCss.test.ts` (node: `::after` com `inset: 0`, sem `transform` no `:active`, `container-type` só no `.bt-stat__box`, subgrid, sem hex).

## Preparar ambiente
1. `pnpm install` na raiz; `pnpm test` e `pnpm typecheck`.
2. `pnpm dev` em `apps/vitrine` (porta 36490, `dev-restart.mjs`; encerre no fim).

## Roteiro
1. `PLAYWRIGHT=<pacote playwright ou playwright-core> CHROME_EXE=<chromium headless> node .claude/skills/verificar-stat-card/medir.cjs http://localhost:36490/ <pasta>`. Nesta máquina (Linux): `PLAYWRIGHT=$HOME/.local/share/ctf-importar/node_modules/playwright-core` e `CHROME_EXE=$(ls ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | tail -1)`.
2. Esperado em 1440, 840 e 390 px: "detalhe: Serviços" (clique do mouse e toque no corpo do card, fora do chevron, chamam `onOpen`), rolagem lateral 0, valor cortado nenhum, anel de foco sim, `OK` em todas e "Erros de console: nenhum". Alturas de referência da vitrine (valor de 26 px desde a 3.1.1): StatCard ~139 px (até ~170 px a 840 e 390 px, quando o selo desce de linha) e AlertCard 60 px (74 com rótulo em duas linhas).
3. Prints `statcard-<largura>.png` e `alertcard-<largura>.png`: selo verde em +78,1% e −12,0% (CP pendente), vermelho em −3,1%, neutro com borda em 62%; "s/dado" em cinza sem selo; sparkline sangrando até as bordas; barra "Meta / R$ 3,20M"; ícones de 22 px nos cards de Treinamentos (Concluíram em verde). No AlertCard, chevron só nos dois primeiros.
4. Toggle "loading" da vitrine: barras no lugar do valor e do apoio, sem selo nem sparkline.

## Casos de borda
- Card estreito (2 colunas a 390 px): o selo desce para a linha de baixo, o valor não corta; todos os valores da fileira continuam alinhados no topo (`align-content: start`).
- Valor longo demais para a largura: termina em reticências (documentado no §10.7; a tela abrevia).
- Links ou botões em `children` com `onOpen`: ficam acima do `::after` (`z-index: 1`) e não abrem o detalhe.
- Status do AlertCard que já começa com "Atenção"/"OK" (qualquer caixa): o prefixo oculto não repete.

## Evidência obrigatória
- Saída dos testes, linhas do `medir.cjs` e os prints gerados.

## Limites
- Só tema claro (o tema escuro é PR próprio). Telas reais (dashboard do Sistema Betinhos) verificam os próprios cards depois do bump.
