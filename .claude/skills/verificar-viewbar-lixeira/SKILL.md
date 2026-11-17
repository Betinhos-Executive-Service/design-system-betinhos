---
name: verificar-viewbar-lixeira
description: "Verifica a lixeira das visões pessoais do ViewBar (§10.9.1, 3.0): ícone em cada visão 'Minhas', diálogo 'Excluir esta visão?' antes de excluir (useTableView.removeView) e MenuAction.secondary. Use após mudar ViewBar.tsx, useTableView.ts, Menu.tsx, menu.css ou viewDiscard.test.tsx."
---
# Verificar lixeira das visões

## Cobre
- `packages/ui/src/tableView/useTableView.ts` (`removeView`), `ViewBar.tsx` (itens do menu de visões e diálogo "Excluir"), `components/Menu.tsx` + `menu.css` (`MenuAction.secondary`, tecla Delete), `viewDiscard.test.tsx`.
- Exemplo vivo: vitrine, seção "Visões, colunas e filtros" (visão pessoal "Minhas da semana").

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz; `pnpm -C apps/vitrine dev --port 36490 --strictPort` (encerre no fim).

## Roteiro
1. `pnpm --filter @betinhos-executive-service/ui test` — `viewDiscard.test.tsx` verde (6 casos: só pessoais e confirmação, Manter visão, ativa volta à padrão, tecla Delete, falha do store, adaptador sem `removeView`).
2. Vitrine: abra o seletor de visão. Ao passar o mouse em "Minhas da semana" aparece a lixeira à direita; "Padrão" e as públicas não têm.
3. Clique na lixeira: abre "Excluir esta visão?" com o nome da visão; nada foi excluído ainda.
4. "Manter visão": fecha e a visão continua na lista.
5. Lixeira de novo e "Excluir visão": toast "Visão excluída." e a visão some do menu. Se era a ativa, a lista volta à padrão.
6. Teclado: setas até a pessoal, `Delete` abre o mesmo diálogo.

## Casos de borda
- Pública com `canEdit`: sem lixeira; "Excluir visão…" no menu com diálogo "será excluída para todos".
- Store rejeita: a visão fica e aparece o toast de erro com a mensagem do store.
- Adaptador sem `removeView`: sem lixeira; a pessoal ativa sai pelo "Excluir visão…".

## Evidência obrigatória
- Saída dos testes e prints do menu com a lixeira e do diálogo de confirmação.
