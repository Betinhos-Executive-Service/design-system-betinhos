---
name: verificar-menu-contexto
description: "Verifica Menu (⋯), ContextMenu, useContextMenu, wantsNativeMenu e rowActions da Table do @betinhos-executive-service/ui (§10.9.3) na vitrine. Use após mudar packages/ui/src/components/Menu.tsx, menu.css ou o clique direito da Table."
---
# Verificar Menu e menu de contexto

## Cobre
- Código: `packages/ui/src/components/Menu.tsx` (`Menu`, `ContextMenu`, `useContextMenu`, `wantsNativeMenu`), `packages/ui/src/components/menu.css`, prop `rowActions` em `Table.tsx`, exports em `packages/ui/src/index.ts`
- Exemplo vivo: vitrine, seções "Table" (clique direito com Abrir, Duplicar, Excluir) e "Dialog e Menu" (botão "Mais ações")

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz.
- `pnpm -C apps/vitrine dev` (porta 36490). Abra `http://localhost:36490/` no navegador interno; se o painel do navegador estiver oculto, evite `setTimeout` em `javascript_tool` (os timers ficam congelados).

## Roteiro
1. `pnpm typecheck` e `pnpm test` na raiz → sem erros.
2. Seção "Table": screenshot, depois `right_click` (ferramenta `computer`) numa linha → `[role=menu]` com "Abrir", "Duplicar", divisor e "Excluir"; foco em "Abrir"; painel no ponto do clique (`style.left/top` ≈ coordenadas, dentro da tela).
3. Tecla ↓ → foco em "Duplicar"; Esc → menu fecha e o foco volta para onde estava; nenhum toast nem abertura da linha.
4. Clique direito perto da borda direita/inferior → o painel fica inteiro dentro da janela (8 px de margem).
5. Clique num item → executa a ação (toast) e fecha; o clique não abre a linha (`onRowClick` não dispara).
6. Rolar a página ou redimensionar com o menu aberto → fecha. Clique fora → fecha.
7. Ctrl + clique direito → `fireEvent`/`dispatchEvent` com `ctrlKey` não é cancelado (`defaultPrevented === false`) e nenhum menu abre. Mesmo dentro de `input`/`textarea`.
8. "Dialog e Menu" → foco no "Mais ações", Enter abre, ↓ move para "Duplicar", Esc fecha e devolve o foco ao botão.

## Casos de borda
- `rowActions` retornando `[]`: o clique direito mostra o menu do navegador.
- Tabela sem `rowActions` e com `onRowClick`: menu com "Abrir" só.
- Menu dentro de Drawer: Esc fecha só o menu.

## Evidência obrigatória
- Saída de typecheck/test e o resumo em texto dos passos 2–8 (DOM consultado via JS) em `.verificacao/<data>-<branch>/`.

## Limites
- Com o painel do navegador oculto não há rolagem real nem `requestAnimationFrame`: confirme o fechamento por rolagem com `document.dispatchEvent(new Event('scroll'))` e leia o DOM numa chamada seguinte (o React atualiza depois).
- O screenshot do navegador interno não mostra o painel na camada superior (`popover`): confirme pelo DOM (`:popover-open`, texto e posição).
- A seleção (linha fora da seleção vira a seleção) é de cada tela; no Sistema Betinhos ela é verificada na Geral (`verificar-shell`).
