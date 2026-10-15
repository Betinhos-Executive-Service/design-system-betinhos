# Design System Betinhos

Fonte oficial do Design System da Betinhos Executive Service: regras (`DESIGN_SYSTEM.md`), tokens (`design-tokens.json`) e o CSS gerado (`design-tokens.css`).

## Como mudar

1. Edite `DESIGN_SYSTEM.md` e/ou `design-tokens.json`. Nunca edite `design-tokens.css` à mão.
2. Suba a versão em `design-tokens.json` (`$extensions` e `$description`), no topo do `DESIGN_SYSTEM.md` e no `package.json`, e registre no changelog (§20).
3. Rode `npm run design:publish-parent`: gera o CSS e o snapshot, valida e copia os três arquivos para a pasta `vscode/` (diretório pai), de onde os apps leem.
4. Abra PR. Os arquivos ficam em LF (`.gitattributes`); a validação exige LF.

## Consumidores

- **Sistema Betinhos:** `pnpm tokens` copia `../design-tokens.css` para `packages/ui/src/design-tokens.css`.
- **Módulo Qualidade:** `npm run design:sync` copia `../design-tokens.css` para a raiz do app.
- Telas vanilla e WebResources: leem `vscode/DESIGN_SYSTEM.md` e `vscode/design-tokens.css`.
