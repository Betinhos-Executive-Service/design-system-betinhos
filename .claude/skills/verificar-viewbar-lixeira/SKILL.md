---
name: verificar-viewbar-lixeira
description: "Verifica a lixeira das visões pessoais do ViewBar (§10.9.1, 1.28): ícone em cada visão 'Minhas', toast 'Desfazer', exclusão adiada (useTableView.discard), MenuAction.secondary e ToastOptions.action. Use após mudar ViewBar.tsx, useTableView.ts, Menu.tsx, menu.css, Alert.tsx ou viewDiscard.test.tsx."
---
# Verificar lixeira das visões

## Cobre
- `packages/ui/src/tableView/useTableView.ts` (`discard`, `VIEW_DISCARD_DELAY_MS`), `ViewBar.tsx` (itens do menu de visões), `components/Menu.tsx` + `menu.css` (`MenuAction.secondary`, tecla Delete), `components/Alert.tsx` + `alert.css` (`ToastOptions.action`), `viewDiscard.test.tsx`.
- Exemplo vivo: vitrine, seção "Visões, colunas e filtros" (visão pessoal "Minhas da semana").

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz; `pnpm -C apps/vitrine dev --port 36490 --strictPort` (encerre no fim).

## Roteiro
1. `pnpm --filter @betinhos-executive-service/ui test` — `viewDiscard.test.tsx` verde (4 casos: só pessoais, Desfazer, tecla Delete + desmontar confirma, falha do store devolve).
2. Vitrine: abra o seletor de visão. "Minhas da semana" tem a lixeira à direita; "Padrão" e as públicas não.
3. Clique na lixeira: a visão some, o menu continua aberto, toast "Visão “Minhas da semana” excluída." com "Desfazer" por ~6 s.
4. Desfazer: a visão volta com o mesmo nome; se era a ativa, volta a ser a ativa.
5. Selecione a pessoal, exclua: a lista volta à visão padrão. Espere o toast sumir: a visão não volta ao recarregar o menu.
6. Teclado: setas até a pessoal, `Delete` manda para a lixeira; o foco continua no menu.

## Casos de borda
- Pública com `canEdit`: sem lixeira; "Excluir visão…" no ⋮ com diálogo "será excluída para todos".
- Fechar a aba antes do prazo: a visão sobrevive (DELETE só no fim). Desmontar a lista (trocar de tela) confirma a exclusão.
- Store rejeita: a visão volta e aparece o toast de erro com a mensagem do store.

## Evidência obrigatória
- Saída dos testes e prints do menu com a lixeira e do toast com "Desfazer".
