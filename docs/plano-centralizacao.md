# Centralização do Design System — plano

Data: 15/10/2026 · Status: aguardando aprovação

## Objetivo

Tudo o que é Design System mora neste repo e chega aos apps por versão, pelo GitHub Packages:

| O quê | Hoje | Depois |
|---|---|---|
| Regras e tokens | este repo (desde a 1.7.0) | este repo, `packages/tokens` gera o CSS |
| Componentes React | `Sistema Betinhos/packages/ui` (`workspace:*`) | `packages/ui` → `@betinhos/ui` no GitHub Packages |
| Vitrine | rota `#/componentes` do shell | `apps/vitrine` (Vite) neste repo |
| Fontes | Centabel em `packages/ui/src/fonts` e no App Motoristas; Manrope copiada em vários apps | `packages/tokens/fonts` com `@font-face` pronto |
| Marca | `Painel de Clientes/public/brand/betinhos-symbol.png` | `packages/tokens/brand` |
| CSS de tokens nos apps | 7 cópias, cada uma sincronizada de um jeito | `@betinhos/tokens` como dependência |

## Decisões (15/10/2026)

- Componentes e vitrine vêm para cá (monorepo pnpm).
- Distribuição pelo GitHub Packages, registro npm privado da organização. O GitHub exige o escopo igual ao dono do repo: os pacotes publicam como `@betinhos-executive-service/tokens` e `@betinhos-executive-service/ui`; os apps instalam com alias (`"@betinhos/ui": "npm:@betinhos-executive-service/ui@^1.8.0"`) e o código continua importando `@betinhos/ui`.
- Migração agora, antes da etapa de filtros: os filtros (DS §10.9.2) já são construídos aqui.
- Sem histórico de commits (mesma regra da migração da 1.7.0).
- `tenaris.svg` é logo de cliente: fica no Painel de Clientes.

## Estrutura

```text
design-system-betinhos/
  DESIGN_SYSTEM.md          regras (fonte)
  design-tokens.json        valores (fonte)
  scripts/                  gerar, validar, publicar no vscode/
  packages/
    tokens/                 @betinhos/tokens: design-tokens.css, fonts/, brand/, fonts.css
    ui/                     @betinhos/ui: componentes React (peer react ^19)
  apps/
    vitrine/                página de componentes (Vite), dados de exemplo
  .github/workflows/
    ci.yml                  check + testes + typecheck em PR
    release.yml             tag v* → publica @betinhos/tokens e @betinhos/ui
```

A versão é única: a do Design System (1.8.0 será a primeira empacotada) vale para os dois pacotes.

## Etapas

| # | Etapa | Prova |
|---|---|---|
| 0 | Mesclar design-system-betinhos#1, tela-qualidade#5 e o PR das etapas 1–4 do Sistema Betinhos | PRs mesclados |
| 1 | Monorepo pnpm aqui: `packages/tokens` (CSS gerado, fontes, marca) e scripts apontando para ele | `npm run check` passa; publish-parent continua copiando para `vscode/` |
| 2 | Mover `@betinhos/ui` (código, CSS, testes) para `packages/ui`, importando tokens e fontes de `@betinhos/tokens` | 48+ testes e typecheck passam aqui |
| 3 | `apps/vitrine` com a `ComponentsPage` atual | navegador: todas as seções, incluindo Visões e colunas |
| 4 | CI e release: `ci.yml` em PR; `release.yml` publica no GitHub Packages com `GITHUB_TOKEN` (`packages: write`) | tag `v1.8.0` publica os dois pacotes |
| 5 | Sistema Betinhos consome: `.npmrc` com `@betinhos:registry`, `@betinhos/ui@^1.8.0` no shell e no escala-fds, remove `packages/ui`, `sync-tokens` e a rota `#/componentes`; CI com acesso de leitura ao pacote | `pnpm install`, testes (1110) e build passam; DEV publicado e conferido |
| 6 | Demais consumidores, um PR por repo: Módulo Qualidade, Painel de Clientes, Composição de Preço, Pedir Cotação, Planner, WhatsApp Inbox, App Motoristas — trocam a cópia por `@betinhos/tokens` | cada app builda igual |
| 7 | Filtros (etapa 4b do plano de visões) já aqui, em `packages/ui` | testes + vitrine |

## O que depende do Renan

1. **Token local com leitura de pacotes:** `gh auth refresh -h github.com -s read:packages` e um `~/.npmrc` com `//npm.pkg.github.com/:_authToken=${GH_TOKEN}` (eu monto o arquivo; o token não entra em repo).
2. **Acesso dos repos consumidores:** depois da primeira publicação, em cada pacote → *Package settings* → *Manage Actions access*, adicionar `Betinhos-Sistema` (e os demais) com leitura. Sem isso o CI deles não instala.
3. Aprovar os merges da etapa 0.

## Riscos

- **Iteração mais lenta:** mudar componente exige release e atualizar a versão no app. Mitigação: `pnpm link` para desenvolvimento local e releases de patch frequentes.
- **React 18 vs 19:** `@betinhos/ui` usa React 19. Apps em React 18 (Módulo Qualidade) consomem só `@betinhos/tokens` até migrarem.
- **Worktrees:** o `vscode/` continua recebendo as cópias publicadas para telas vanilla e WebResources, que não usam npm.
