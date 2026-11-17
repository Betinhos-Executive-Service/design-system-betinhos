// Verificação do StatCard e do AlertCard na vitrine: prints das seções em 1440/840/390 px, clique (mouse) e toque (390 px) no
// corpo do card abrindo o detalhe, foco visível no chevron, sem rolagem lateral, valor sem corte, alturas e console limpo.
// Uso: node medir.cjs <url> <pasta-de-saida>. PLAYWRIGHT: pacote playwright/playwright-core; CHROME_EXE: Chromium instalado (opcional).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const url = process.argv[2] || 'http://localhost:36490/'
const out = process.argv[3] || '.'

;(async () => {
  const browser = await chromium.launch(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {})
  const errs = []
  let falhou = false
  for (const w of [1440, 840, 390]) {
    const touch = w === 390
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, hasTouch: touch, isMobile: touch })
    const page = await ctx.newPage()
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`${w}: ${m.text()}`) })
    await page.goto(url, { waitUntil: 'networkidle' })
    const section = (name) => page.locator('section', { has: page.getByRole('heading', { name, exact: true }) }).first()
    for (const name of ['StatCard', 'AlertCard']) {
      await section(name).scrollIntoViewIfNeeded()
      await section(name).screenshot({ path: `${out}/${name.toLowerCase()}-${w}.png` })
    }
    // Clique/toque no corpo do card (canto inferior esquerdo, longe do chevron) tem de abrir o detalhe.
    const card = page.getByRole('article', { name: 'Serviços' }).first()
    await card.scrollIntoViewIfNeeded()
    const box = await card.boundingBox()
    const x = box.x + 30, y = box.y + box.height - 20
    if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y)
    const aberto = await section('StatCard').getByText(/Último detalhe aberto/).textContent()
    const lateral = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    const cortado = await page.$$eval('.bt-stat__value', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))
    const alturas = await page.$$eval('.bt-stat, .bt-alert-card', (els) => [
      Math.max(...els.filter((e) => e.classList.contains('bt-stat')).slice(0, 6).map((e) => e.getBoundingClientRect().height)),
      Math.max(...els.filter((e) => e.classList.contains('bt-alert-card')).map((e) => e.getBoundingClientRect().height)),
    ].map(Math.round))
    // Foco por teclado: o anel do ::after tem de existir (o overflow do card corta anel externo).
    await page.getByRole('button', { name: 'Faturamento: Ver detalhes' }).focus()
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab')
    const anel = await page.evaluate(() => getComputedStyle(document.activeElement, '::after').boxShadow)
    const ok = aberto.endsWith('Serviços') && lateral === 0 && cortado.length === 0 && anel !== 'none'
    if (!ok) falhou = true
    console.log(`${w} px | detalhe: ${aberto.replace('Último detalhe aberto: ', '')} | rolagem lateral: ${lateral} | valor cortado: ${cortado.join(', ') || 'nenhum'} | maior StatCard/AlertCard: ${alturas.join('/')} px | anel de foco: ${anel === 'none' ? 'AUSENTE' : 'sim'} | ${ok ? 'OK' : 'FALHOU'}`)
    await ctx.close()
  }
  console.log(`Erros de console: ${errs.length ? errs.join(' | ') : 'nenhum'}`)
  await browser.close()
  if (falhou || errs.length) process.exitCode = 1
})()
