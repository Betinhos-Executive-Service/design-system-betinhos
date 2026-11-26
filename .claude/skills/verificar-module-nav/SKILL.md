---
name: verificar-module-nav
description: "Verifica o ModuleNav do @betinhos-executive-service/ui (§10.1.1): faixa de seções do módulo, aria-current, indicadores, menu \"Mais\" medido sem rolagem, ativo nunca escondido e, no celular, barra flutuante embaixo (4 + "Mais", some ao rolar) com título/ações no cabeçalho do AppShell. Use após mudar ModuleNav.tsx, module-nav.css ou o showcase do ModuleNav na vitrine."
---
# Verificar ModuleNav

## Cobre
- Código: `packages/ui/src/components/ModuleNav.tsx` (`fitModuleNav` puro + componente), `module-nav.css`, `ModuleNav.test.tsx`.
- Exemplo vivo: vitrine, seção "ModuleNav" (`section[aria-labelledby="showcase-ModuleNav"]`): caso do Planner, compacta, excesso com slider de largura, estados com href e, abaixo de 820 px, um AppShell de 320 px.

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz; `pnpm -C apps/vitrine dev` (porta 36490).
- Chromium: playwright-core (`npx playwright-core`) com o chrome de `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome`.

## Roteiro
1. `pnpm --filter @betinhos-executive-service/ui exec vitest run src/components/ModuleNav` passa (15 testes) e `pnpm -r typecheck` sem erros.
2. Vitrine em 1440 px:
   - altura da 1ª faixa 48 px e da `.bt-module-nav--compact` 40 px;
   - nenhuma `.bt-module-nav__items` com `scrollWidth > clientWidth`;
   - `document.documentElement.scrollWidth <= innerWidth` (a camada de medida não pode criar rolagem na página).
3. Slider do "Excesso" (ativo = Configurações):
   - 400 → `Tarefas | Configurações | Mais•`;
   - 600 → `Tarefas | Gestão | Configurações | Mais•`;
   - 1000 → 7 itens + "Mais".
   O ativo nunca sai da faixa; o "Mais" ganha ponto quando esconde um item com ponto ou alerta.
4. Abrir o "Mais": menu com os itens escondidos (ícone + indicador); escolher um navega e o item vira o ativo na faixa.
5. Foco num item e Tab: vai para o próximo item (sem setas); anel de foco visível por dentro.
6. Tema escuro (`document.documentElement.dataset.theme = 'dark'`): sublinhado e badges legíveis.
7. Em 390 px: nenhuma faixa visível; no AppShell de exemplo o cabeçalho mostra o rótulo da seção como título e só os ícones (`mobileActions`); a `.bt-shell .bt-module-nav__dock` fica embaixo, dentro do palco, com Tarefas | Gestão | Boas ideias | Cotações | Mais (botões ~55 px), indicador lido depois do nome, `aria-current` na atual, `main` com `padding-bottom` 96 px e sem rolagem horizontal.
8. Tocar em "Mais": abre a 2ª linha (`aria-expanded=true`) com Projetos e Configurações; escolher Configurações troca o título, fecha a linha e o "Mais" fica ativo lendo "Mais, seção atual: Configurações". Esc fecha e devolve o foco ao "Mais"; toque fora fecha. Rolar o `main` para baixo esconde a barra (`.is-away`) e rolar para cima a traz de volta. Repetir no tema escuro.
9. Console: zero erros, exceto o 404 conhecido de `/favicon.ico` (a vitrine não declara ícone).

## Casos de borda
- Até 5 seções: sem "Mais"; `shortLabel` diferente de `label` mostra o curto e lê o nome inteiro.
- `count: 0` não mostra badge; `count > 99` mostra `99+`.
- Contagem com `tone: 'alert'` tem texto oculto ", em alerta"; ponto tem ", com novidades".
- `mobileActions={null}` deixa o cabeçalho do celular sem ações; `shellHeader={false}` não mexe no cabeçalho.
- Link com `onNavigate`: clique simples navega pela SPA; Ctrl/⌘+clique fica com o navegador.
