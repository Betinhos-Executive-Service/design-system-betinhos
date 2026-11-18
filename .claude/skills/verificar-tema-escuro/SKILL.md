---
name: verificar-tema-escuro
description: "Verifica o tema escuro opt-in (§2.3): modes.dark do design-tokens.json, blocos [data-theme=\"dark\"] e [data-theme=\"auto\"] gerados, contraste AA dos pares nos dois temas pelo npm run check, on-solid e component.shell nos componentes, e a vitrine em claro/escuro/sistema com axe. Use após mudar design-tokens.json, scripts/generate-design-tokens.mjs, scripts/validate-design-system.mjs, qualquer CSS de packages/ui ou o seletor de tema da vitrine."
---

# Verificar tema escuro

## Cobre
- Tokens: `$extensions["com.betinhos.design-system"].modes.dark` (papéis semânticos, `component.shell.*`, foco, sombras), `color.semantic.on-solid`, `component.shell.*`.
- Gerador: `modeDeclarations` em `scripts/generate-design-tokens.mjs` (`:root[data-theme="dark"]` e `@media (prefers-color-scheme: dark) { :root[data-theme="auto"] }`).
- Validador: `CONTRAST_PAIRS`/`validateContrast` em `scripts/validate-design-system.mjs` (4,5:1 nos dois temas; `DARK_ONLY_PAIRS` cobre no escuro o que é exceção no claro).
- CSS: `ThemeCss.test.ts` (sem hex nem primitivo `--bt-color-<white|navy|slate...>` em `packages/ui/src/**/*.css`, sem `color: white|#fff|surface`, sidebar com `--bt-shell-background`).
- Vitrine: `ThemeSwitcher` em `apps/vitrine/src/ComponentsPage.tsx` (Claro/Escuro/Sistema).

## Preparar ambiente
1. `pnpm install` na raiz; `npm run check`, `pnpm typecheck`, `pnpm test`.
2. `pnpm dev` em `apps/vitrine` (porta 36490, `dev-restart.mjs`; encerre no fim).
3. axe-core: `npm pack axe-core@4.10.3` numa pasta temporária e extraia (`package/axe.min.js`).

## Roteiro
1. `npm run check` → "claro + escuro com contraste AA". Um par abaixo de 4,5 sai com tema, par e razão.
2. `PLAYWRIGHT=<playwright-core> CHROME_EXE=<chromium> AXE=<axe.min.js> node .claude/skills/verificar-tema-escuro/medir-tema.cjs http://localhost:36490/ <pasta>`. Nesta máquina: `PLAYWRIGHT=$HOME/.local/share/ctf-importar/node_modules/playwright-core`, `CHROME_EXE=$(ls ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | tail -1)`.
3. Esperado: 12 linhas `OK` (padrao/claro/escuro/auto × 1440/840/390), canvas `#f0f0f0` no padrão (sem `data-theme`, sistema escuro) e no claro e `#0b1220` no escuro e no auto, rolagem lateral 0, "contraste: nenhum" nos quatro (o eyebrow fica em `CONTRASTE_CONHECIDO` só no padrão e no claro), "Erros de console: nenhum", saída 0.
4. Prints `pagina-<tema>-<largura>.png` e `<seção>-<tema>-<1440|390>.png`: sidebar/bottom-nav navy nos dois temas, botão primário claro com texto navy no escuro, selos e badges com texto, sparkline visível sobre o fundo escuro.

## Casos de borda
- Sem `data-theme` com o sistema em escuro: continua claro (opt-in; o bump não muda app).
- `data-theme` em elemento que não é o raiz: não suportado (os tokens ficam no `:root`).
- Backdrop (`rgba(0,26,61,…)`) é igual nos dois temas, por decisão.

## Evidência obrigatória
- Saída do `npm run check`, dos testes e do `medir-tema.cjs`; prints claro × escuro lado a lado.

## Limites
- Claro tem exceções conhecidas: `text-secondary` sobre `canvas` (eyebrow, 4,17/4,18) e sobre a sidebar. O axe também acusa `aria-prohibited-attr` (DateTile) e `aria-required-children` (Table), que não são de tema e aparecem iguais nos dois.
- Adoção nos apps do Sistema Betinhos é PR próprio de cada app.
