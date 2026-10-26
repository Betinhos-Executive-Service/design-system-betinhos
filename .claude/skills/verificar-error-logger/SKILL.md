---
name: verificar-error-logger
description: "Verifica o logger de erros do front (@betinhos-executive-service/ui/error-logger): testes unitários, build do dist (ESM e IIFE) e gravação real em new_appmotoristaslog no Dataverse DEV. Use após mudar packages/ui/src/errorLogger*.ts, packages/ui/scripts/** ou packages/ui/dist/**."
---
# Verificar error-logger

## Cobre
- Código: `packages/ui/src/errorLogger.ts`, `packages/ui/scripts/build-error-logger.mjs`, `packages/ui/dist/error-logger*.js`
- Tabela: `new_appmotoristaslog` (entity set `new_appmotoristaslogs`) no DEV (URL em `DV_URL`, fora do repo)

## Preparar ambiente
- `pnpm install --frozen-lockfile` na raiz.
- Token DEV: `az account get-access-token --resource "$DV_URL" --query accessToken -o tsv` (nunca grave o token em arquivo).

## Roteiro
1. `pnpm --filter @betinhos-executive-service/ui exec vitest run src/errorLogger.test.ts` → 12 testes passando (registro, contexto, shim do shell via WhoAmI, POST com `credentials: include`, mock sem gravação, dedupe 60 s + limite 30, fila/retry 30 s, evento `online`, listeners e desinstalação, falha Dataverse HTTP e rede).
2. `pnpm --filter @betinhos-executive-service/ui exec tsc -p tsconfig.json --noEmit` → sem erros.
3. `pnpm --filter @betinhos-executive-service/ui build` e `git diff --exit-code -- packages/ui/dist` → dist em dia (a 1ª linha traz a versão do pacote).
4. IIFE expõe o global: `node -e "const vm=require('vm');const c={};vm.createContext(c);vm.runInContext(require('fs').readFileSync('packages/ui/dist/error-logger.iife.js','utf8'),c);console.log(Object.keys(c.BetinhosErrorLogger))"` → lista com `installErrorLogger`, `logAppError`, `logDataverseFailure`, `setErrorLogContext`.
5. Gravação real (DEV): `DV_TOKEN=<token> node .claude/skills/verificar-error-logger/dev-write.mjs "file:///<raiz absoluta>/packages/ui/dist/error-logger.js"` → `status: "sent"`, `GET /WhoAmI 200`, `GET /systemusers(...) 200`, `POST /new_appmotoristaslogs 204` com `OData-EntityId` (204 = criado; o Dataverse só devolve 201 com `Prefer: return=representation`).
6. Ler a linha: `GET /api/data/v9.2/new_appmotoristaslogs(<id>)?$select=new_appname,new_appversion,new_screen,new_useremail,new_message` → app `Teste error-logger (DS)`, versão, tela `Teste` e e-mail do usuário do token.
7. Apagar a linha de teste: `DELETE /api/data/v9.2/new_appmotoristaslogs(<id>)` → 204; `GET` depois → 404.

## Casos de borda
- Sem `Xrm`/`GetGlobalContext` → `skipped`, sem fetch nem localStorage (teste "modo mock").
- Falha ao gravar → fica na fila (`betinhos-error-log-queue-v1:<appName>`), sem gerar novo log.

## Evidência obrigatória
- Saída do vitest, do `git diff --exit-code` do dist e do script DEV (status + entityId) e o 404 após o DELETE, em `.verificacao/<data>-<branch>/`.

## Limites
- PROD é somente leitura: nunca rode o passo 5 em PROD.
- Comportamento dentro do Dynamics (iframe do shell, `Xrm.WebApi`) é coberto por testes com Xrm simulado; a prova autenticada no navegador fica para a instalação em cada tela.
