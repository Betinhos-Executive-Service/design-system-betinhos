# @betinhos-executive-service/tokens

Tokens, fontes e marca do Design System Betinhos. Gerado a partir do `design-tokens.json` da raiz deste repo: não edite `design-tokens.css` nem `design-tokens.json` aqui.

```css
@import '@betinhos-executive-service/tokens';                    /* fontes + variáveis */
@import '@betinhos-executive-service/tokens/design-tokens.css';  /* só as variáveis */
```

- `fonts/`: Manrope (SIL OFL 1.1) e Centabel Book (marca; uso interno da Betinhos).
- `brand/betinhos-symbol.png`: símbolo da marca.
- Instalação: `.npmrc` com `@betinhos-executive-service:registry=https://npm.pkg.github.com` e token com `read:packages`. O GitHub Packages exige o escopo igual ao dono do repo.
