# Design System Betinhos

Fonte oficial do Design System da Betinhos Executive Service: regras (`DESIGN_SYSTEM.md`), tokens (`design-tokens.json`) e o CSS gerado (`design-tokens.css`).

## Estrutura

- `DESIGN_SYSTEM.md` e `design-tokens.json`: fonte das regras e dos valores.
- `scripts/`: gerar, validar e publicar no diretório pai (`vscode/`).
- `packages/tokens` (`@betinhos-executive-service/tokens`): CSS e JSON gerados, fontes (`fonts.css`) e marca. Versão igual à do Design System.
- `packages/ui` (`@betinhos-executive-service/ui`): componentes React (peer React 19); estilos em `@betinhos/ui/styles.css`, que já importa os tokens.
- `apps/vitrine`: página com todos os componentes e dados de exemplo. `pnpm dev` sobe em http://localhost:36490 (porta reservada).
- Publicação: tag `vX.Y.Z` (igual à versão do Design System) roda `.github/workflows/release.yml` e publica os dois pacotes no GitHub Packages.

## Como instalar num app

```ini
# .npmrc do app
@betinhos-executive-service:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```json
"@betinhos/ui": "npm:@betinhos-executive-service/ui@^1.8.0"
```

O alias mantém os imports `@betinhos/ui` no código. Localmente, `NODE_AUTH_TOKEN` é um token com `read:packages` (`gh auth refresh -h github.com -s read:packages` e `gh auth token`); no CI do app, o `GITHUB_TOKEN` com acesso liberado em *Package settings → Manage Actions access*.

Monorepo pnpm: `pnpm install`, `pnpm test` e `pnpm typecheck` na raiz.

## Como mudar

1. Edite `DESIGN_SYSTEM.md` e/ou `design-tokens.json`. Nunca edite `design-tokens.css` à mão.
2. Suba a versão em `design-tokens.json` (`$extensions` e `$description`), no topo do `DESIGN_SYSTEM.md`, no `package.json` da raiz e no de `packages/tokens`, e registre no changelog (§20).
3. Rode `npm run design:publish-parent`: gera o CSS e o snapshot, valida e copia os três arquivos para a pasta `vscode/` (diretório pai), de onde os apps leem.
4. Abra PR. Os arquivos ficam em LF (`.gitattributes`); a validação exige LF.

## Consumidores

- **Sistema Betinhos:** `pnpm tokens` copia `../design-tokens.css` para `packages/ui/src/design-tokens.css`.
- **Módulo Qualidade:** `npm run design:sync` copia `../design-tokens.css` para a raiz do app.
- Telas vanilla e WebResources: leem `vscode/DESIGN_SYSTEM.md` e `vscode/design-tokens.css`.
