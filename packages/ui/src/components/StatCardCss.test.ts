import { expect, it } from 'vitest'
// Ambiente node (o jsdom não lê import.meta.url como arquivo), como no Button.test.ts.
it('CSS: área de clique cobre o card e o toque não encolhe o card', async () => {
  const { readFileSync } = await import('node:fs')
  const read = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8')
  const css = ['./stat-card.css', './alert-card.css', './card-open.css'].map(read).join('\n')
  expect(css).toMatch(/\.bt-card-open::after\s*\{[^}]*position:\s*absolute;\s*inset:\s*0/)
  expect(css).not.toMatch(/\.bt-card-open[^{]*:active[^{]*\{[^}]*transform/)
  expect(css).toMatch(/\.bt-stat__box\s*\{[^}]*container-type:\s*inline-size/)
  expect(css.match(/container-type:/g)).toHaveLength(1)
  expect(css).toMatch(/grid-template-rows:\s*subgrid/)
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
})
