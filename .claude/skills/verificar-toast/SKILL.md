---
name: verificar-toast
description: "Verifica Alert, ToastProvider, useToast e os timers dos toasts (toastTimers) do @betinhos-executive-service/ui (§10.13). Use após mudar packages/ui/src/components/Alert.tsx, alert.css ou Toast.test.ts."
---
# Verificar toast e alerta

## Cobre
- Código: `packages/ui/src/components/Alert.tsx` (`Alert`, `ToastProvider`, `toastTimers`, `topModalDialog`), `alert.css`, `Toast.test.ts`.
- Exemplo vivo: vitrine, seção de Toast/Alerta (botões "Sucesso (some em 4 s)" e "Erro (fica até fechar)").

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz; `pnpm -C apps/vitrine dev` (porta 36490).
- Navegador interno: se o painel estiver oculto a página fica 0×0 e `requestAnimationFrame` não roda. Use `resize_window` 1280x800 antes de clicar e clique por `ref` (`find`).

## Roteiro
1. `pnpm --filter @betinhos-executive-service/ui exec vitest run src/components/Toast.test.ts` → 3 testes (some no tempo, X cancela o timer, `clear` deixa `vi.getTimerCount() === 0`). `pnpm typecheck` sem erros.
2. Vitrine: observar `.bt-toast` com `MutationObserver` no pai de `.bt-toast-region` registrando `performance.now()` e a contagem.
3. Clicar 2× em "Sucesso (some em 4 s)" → 2 toasts; clicar no X (`.bt-alert__close`) do primeiro → 1 na hora; o segundo some sozinho ~4 s depois do clique.
4. "Erro (fica até fechar)" → toast `role="alert"` que não some sozinho; X fecha.
5. Dentro de um Drawer/Dialog aberto, o toast nasce dentro do `<dialog>` modal (portal em `topModalDialog()`), visível e clicável.
6. Console sem erros.

## Casos de borda
- Nenhum timer pode disparar depois do unmount do `ToastProvider`: no consumidor (Sistema Betinhos) isso virava "Uncaught Exception: ReferenceError: window is not defined" depois do teardown do jsdom e reprovava o CI com todos os testes passando (28/10/2026, corrigido na 1.15.3).
- `ToastProvider` dentro de `<Activity mode="hidden">` não é suportado: a limpeza cancela os timers e os toasts ficariam na tela até o X.

## Evidência obrigatória
- Saída do vitest e o log do `MutationObserver` (contagens e tempos), em `.verificacao/<data>-<branch>/`.
