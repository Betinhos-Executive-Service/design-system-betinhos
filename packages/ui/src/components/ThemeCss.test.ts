import { expect, it } from 'vitest'
// Ambiente node, como no StatCardCss.test.ts. O tema escuro só troca valores de --bt-*; estas regras impedem cor fixa que não troca.
it('CSS: componentes não fixam cor (o tema escuro só troca --bt-*)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('../', import.meta.url)
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.css'))
  const css = files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  expect(css).not.toMatch(/(^|[;{\s])color:\s*(white|var\(--bt-color-(white|surface)\))/im)
  // Primitivos (white, navy-900, slate-500...) não trocam no escuro; componente usa papel semântico.
  expect(css).not.toMatch(/var\(--bt-color-(white|navy|blue|ink|slate|gray|neutral|line|green|amber|red|orange)\b/)
  const shell = readFileSync(new URL('./app-shell.css', import.meta.url), 'utf8')
  expect(shell).toMatch(/background-color:\s*var\(--bt-shell-background\)/)
})
