import { expect, it } from 'vitest'

// Sem scroll lateral nos popovers do painel "Filtros" (1.35.4). O jsdom não faz layout, então o teste lê o CSS:
// a trilha `auto` de um grid cresce até o min-content do item, e um rótulo em `nowrap` alargava a lista além do popover.
const { readFileSync } = await import('node:fs')
const css: string = readFileSync(new URL('./table-view.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: (m[1] ?? '').split(',').map((s) => s.trim()), body: m[2] ?? '' }))
/** Todas as declarações das regras que têm exatamente `selector` na lista de seletores. */
const rule = (selector: string) => blocks.filter((b) => b.selectors.includes(selector)).map((b) => b.body).join(';')

it('listas e grids dos popovers usam trilha minmax(0, 1fr)', () => {
  for (const sel of ['.bt-fpop__sheet', '.bt-fpick__list', '.bt-fpick__section', '.bt-fvalue', '.bt-fvalue__date', '.bt-fvalue__choices', '.bt-fvalue__list']) {
    expect(rule(sel), sel).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  }
})
it('nome do campo e relação quebram linha em vez de forçar largura', () => {
  const label = rule('.bt-fpick__label')
  expect(label).not.toMatch(/nowrap/)
  expect(label).toMatch(/min-width:\s*0/)
  expect(label).toMatch(/overflow-wrap:\s*anywhere/)
  expect(rule('.bt-fpick__relation')).toMatch(/overflow-wrap:\s*anywhere/)
  expect(rule('.bt-fpick__item')).toMatch(/min-width:\s*0/)
  expect(rule('.bt-fvalue__list .bt-choice__label')).toMatch(/overflow-wrap:\s*anywhere/)
})
it('popover nunca passa da largura da tela', () => {
  expect(rule('.bt-fpop')).toMatch(/width:\s*min\(320px,\s*calc\(100vw - 16px\)\)/)
})
