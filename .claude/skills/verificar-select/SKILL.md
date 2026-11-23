---
name: verificar-select
description: "Verifica o Select pesquisável do @betinhos-executive-service/ui (§10.5): busca, teclado, painel em popover e o Select dentro de <label>. Use após mudar packages/ui/src/components/Select.tsx, select.css ou os testes Select*.test.ts(x)."
---
# Verificar Select

## Cobre
- Código: `packages/ui/src/components/Select.tsx`, `select.css`, `Select.test.ts` (busca sem acento), `SelectLabel.test.tsx` (clique na opção sai cancelado).
- Exemplo vivo: vitrine, seção do Select.

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz; `pnpm -C apps/vitrine dev` (porta 36490).

## Roteiro
1. `pnpm --filter @betinhos-executive-service/ui exec vitest run --maxWorkers=2 src/components/Select` passa.
2. Na vitrine, abrir o Select, digitar parte de um nome sem acento: a lista filtra; setas movem o destaque (`.is-active`), Enter escolhe e fecha, Esc fecha e devolve o foco ao gatilho.
3. **Dentro de `<label>`** (o jsdom não simula a ativação do rótulo; prove no Chromium): página mínima com `<label><span>Rótulo</span><Select … /></label>`, abrir, clicar numa opção. Esperado: `aria-expanded="false"` no gatilho logo depois e, ao reabrir, `.is-active` na opção escolhida. Antes da 3.8.3 o painel reabria sozinho com o destaque na opção anterior.
4. Clique fora fecha; rolar a página com o painel aberto mantém o painel colado ao campo.
