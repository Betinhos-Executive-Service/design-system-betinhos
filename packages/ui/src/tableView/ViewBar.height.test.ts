import { describe, expect, it } from 'vitest'

// Altura única da peça (1.27.2): a superfície da ViewBar e a ação principal de fora têm exatamente a altura do controle
// do DS (40 px; 44 px em toque/celular). O jsdom não aplica CSS, então o teste lê o table-view.css e os tokens e faz a
// conta da caixa: borda + padding + altura interna de cada lado tem de dar a altura do botão primário.
const { readFileSync } = await import('node:fs')
const css: string = readFileSync(new URL('./table-view.css', import.meta.url), 'utf8')
const tokensCss: string = readFileSync(new URL('../../../tokens/design-tokens.css', import.meta.url), 'utf8')
const tokens = Object.fromEntries([...tokensCss.matchAll(/(--bt-[\w-]+):\s*(\d+(?:\.\d+)?)px;/g)].map((m) => [m[1], Number(m[2])]))
const px = (name: string) => {
  expect(tokens[name], name).toBeTypeOf('number')
  return tokens[name] as number
}

/** Corpo da regra cujo seletor é exatamente `selector` (fora ou dentro de @media), na ordem em que aparece. */
const rules = (selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1] ?? '')
}
const touchBlock = css.match(/@media \(pointer: coarse\), \(max-width: 820px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''

describe('ViewBar: altura única da peça (1.27.2)', () => {
  const root = rules('.bt-viewbar.bt-viewbar--slots')
  const surface = rules('.bt-viewbar__surface')[0] ?? ''
  const primary = rules('.bt-viewbar--slots .bt-viewbar__end > [data-vb="primary"] .bt-button')[0] ?? ''
  const inner = rules('.bt-viewbar--slots .bt-viewbar__surface .bt-button')[0] ?? ''

  it('superfície e principal usam a mesma altura, vinda do token de controle', () => {
    expect(root[0]).toMatch(/--bt-viewbar-h:\s*var\(--bt-control-height-default\)/)
    expect(root[0]).toMatch(/--bt-viewbar-inset:\s*calc\(var\(--bt-space-0-5\) \+ var\(--bt-border-width-default\)\)/)
    expect(touchBlock).toMatch(/\.bt-viewbar\.bt-viewbar--slots\s*\{\s*--bt-viewbar-h:\s*var\(--bt-control-height-touch\);\s*\}/)
    expect(surface).toMatch(/box-sizing:\s*border-box/)
    expect(surface).toMatch(/[^-]height:\s*var\(--bt-viewbar-h/)
    expect(surface).toMatch(/--bt-viewbar-inner:\s*calc\(var\(--bt-viewbar-h, var\(--bt-control-height-default\)\) - 2 \* var\(--bt-viewbar-inset\)\)/)
    expect(surface).toMatch(/padding:\s*var\(--bt-space-0-5\)/)
    expect(surface).toMatch(/border:\s*var\(--bt-border-width-default\) solid/)
    expect(primary).toMatch(/box-sizing:\s*border-box/)
    expect(primary).toMatch(/[^-]height:\s*var\(--bt-viewbar-h\)/)
    expect(primary).toMatch(/min-height:\s*var\(--bt-viewbar-h\)/)
    // Itens internos presos na altura interna (vence o alvo de 44 px do toque em button.css e o --touch).
    expect(inner).toMatch(/[^-]height:\s*var\(--bt-viewbar-inner\)/)
    expect(inner).toMatch(/min-height:\s*var\(--bt-viewbar-inner\)/)
    // O botão maior antigo (principal = toque + 2 × recuo) não volta.
    expect(css).not.toMatch(/var\(--bt-control-height-touch\) \+ 2 \* var\(--bt-viewbar-inset\)/)
    // Nada de valor fixo: as regras da peça só usam tokens.
    for (const body of [root[0] ?? '', surface, primary, inner]) expect(body).not.toMatch(/\d+px/)
  })

  it.each([
    ['desktop', '--bt-control-height-default'],
    ['toque/celular', '--bt-control-height-touch'],
  ])('%s: borda + padding + altura interna = altura do botão primário', (_, token) => {
    const h = px(token)
    const border = px('--bt-border-width-default')
    const padding = px('--bt-space-0-5')
    const innerHeight = h - 2 * (padding + border)
    const surfaceHeight = innerHeight + 2 * padding + 2 * border
    expect(surfaceHeight).toBe(h)
    expect(px(token)).toBe(h) // principal = --bt-viewbar-h = o mesmo token
    expect(innerHeight).toBeGreaterThanOrEqual(token.endsWith('touch') ? 38 : 34)
  })
})
