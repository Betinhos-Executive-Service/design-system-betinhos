// Verificação do tema escuro na vitrine: padrão (sem data-theme, sistema escuro), claro, escuro (data-theme="dark") e auto (data-theme="auto" + sistema escuro), pelo seletor em
// 1440/840/390 px. Confere que o tema aplicou (--bt-color-canvas), sem rolagem lateral, console limpo, prints de página inteira
// e das seções-chave, e axe-core (sérios/críticos, contraste à parte) em 1440 px por tema.
// Uso: node medir-tema.cjs <url> <pasta-de-saida>. PLAYWRIGHT: pacote playwright/playwright-core; CHROME_EXE: Chromium
// (opcional); AXE: caminho do axe.min.js (opcional; sem ele o axe é pulado e o resultado sai como FALHOU).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const url = process.argv[2] || 'http://localhost:36490/'
const out = process.argv[3] || '.'
const TEMAS = [
  // Sem data-theme e sistema escuro: continua claro (opt-in).
  { nome: 'padrao', botao: null, scheme: 'dark', canvas: '#f0f0f0' },
  { nome: 'claro', botao: 'Claro', scheme: 'light', canvas: '#f0f0f0' },
  { nome: 'escuro', botao: 'Escuro', scheme: 'light', canvas: '#0b1220' },
  { nome: 'auto', botao: 'Sistema', scheme: 'dark', canvas: '#0b1220' },
]
// Contraste conhecido e fora do escopo do tema (text-secondary sobre canvas no claro, 4,17); só vale nos temas claros.
const CONTRASTE_CONHECIDO = ['.bt-page-header__eyebrow']
const TEMAS_CLAROS = ['padrao', 'claro']
const SECOES = ['Button', 'StatusBadge', 'StatCard', 'AlertCard', 'Table', 'Checkbox, Radio e Switch', 'Alert']

;(async () => {
  const browser = await chromium.launch(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {})
  const errs = []
  let falhou = !process.env.AXE
  for (const w of [1440, 840, 390]) {
    for (const t of TEMAS) {
      const touch = w === 390
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, hasTouch: touch, isMobile: touch, colorScheme: t.scheme })
      const page = await ctx.newPage()
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`${t.nome} ${w}: ${m.text()}`) })
      await page.goto(url, { waitUntil: 'networkidle' })
      // Troca pelo seletor da vitrine ("Sistema" grava data-theme="auto"; o sistema escuro vem do colorScheme do contexto).
      if (t.botao) await page.getByRole('radio', { name: t.botao, exact: true }).click()
      const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bt-color-canvas').trim().toLowerCase())
      const lateral = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      await page.screenshot({ path: `${out}/pagina-${t.nome}-${w}.png`, fullPage: true })
      if (w === 1440 || w === 390) {
        for (const name of SECOES) {
          const s = page.locator('section', { has: page.getByRole('heading', { name, exact: true }) }).first()
          await s.scrollIntoViewIfNeeded()
          await s.screenshot({ path: `${out}/${name.split(/[ ,]/)[0].toLowerCase()}-${t.nome}-${w}.png` })
        }
      }
      let axe = ''
      if (w === 1440 && process.env.AXE) {
        await page.addScriptTag({ path: process.env.AXE })
        const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
          .map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, alvo: x.nodes.map((n) => n.target.join(' ')) })))
        const contraste = v.filter((x) => x.id === 'color-contrast').flatMap((x) => x.alvo)
          .filter((alvo) => !TEMAS_CLAROS.includes(t.nome) || !CONTRASTE_CONHECIDO.some((sel) => alvo.endsWith(sel)))
        const outros = v.filter((x) => x.id !== 'color-contrast' && (x.impact === 'serious' || x.impact === 'critical'))
        if (contraste.length) falhou = true
        axe = ` | contraste: ${contraste.length ? contraste.join('; ') : 'nenhum'} | outros sérios/críticos (não são de tema): ${outros.map((x) => `${x.id} ${x.n}`).join(', ') || 'nenhum'}`
      }
      const ok = canvas === t.canvas && lateral === 0
      if (!ok) falhou = true
      console.log(`${t.nome} ${w} px | canvas ${canvas} | rolagem lateral ${lateral}${axe} | ${ok ? 'OK' : 'FALHOU'}`)
      await ctx.close()
    }
  }
  console.log(`Erros de console: ${errs.length ? errs.join(' | ') : 'nenhum'}`)
  await browser.close()
  if (falhou || errs.length) process.exitCode = 1
})()
