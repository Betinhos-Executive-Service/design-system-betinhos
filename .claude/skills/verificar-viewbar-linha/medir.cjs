// Verificação da linha de comando (ViewBar com espaços nomeados) na vitrine: uma linha, sem sobreposição, fixos parados com
// 0/1/3 selecionados, nenhum texto cortado (inclusive o rodapé do celular e o placeholder da busca), sem vão nem fio junto a
// espaço vazio na superfície, superfície com a altura e o topo da ação principal (1.27.2), sem erro de console. Uso: node medir.cjs <url> <pasta-de-saida>
// PLAYWRIGHT: caminho do pacote playwright (ex.: o do @playwright/cli global); CHROME_EXE: Chromium já instalado (opcional);
// SCHEME: light (padrão) ou dark, emula prefers-color-scheme (o DS só tem tema claro: o escuro tem de sair igual, sem quebra).
// WIDTHS / COUNTS: listas separadas por vírgula que trocam as larguras (padrão 390…1920, com 1024) e as linhas marcadas (0,1,3).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const fs = require('fs')
const path = require('path')
const url = process.argv[2] || 'http://localhost:36490/'
const out = process.argv[3] || '.'
const WIDTHS = (process.env.WIDTHS || '390,600,820,821,1000,1024,1280,1440,1920').split(',').map(Number)
const COUNTS = (process.env.COUNTS || '0,1,3').split(',').map(Number)

const measure = () => {
  const section = [...document.querySelectorAll('section.showcase')].find((s) => s.querySelector('h2')?.textContent === 'Visões, colunas e filtros')
  const bar = section.querySelector('.bt-viewbar--slots')
  const br = bar.getBoundingClientRect()
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]') && !el.closest('.bt-viewbar__measure') }
  // Controles folha da linha (botões e a caixa de busca), fora da barra do rodapé e da camada de medida.
  const leaves = [...bar.querySelectorAll('.bt-viewbar__trigger, .bt-viewbar__end .bt-button, .bt-viewbar__end .bt-control--search, .bt-selection__label')]
    .filter((el) => visible(el) && !el.closest('.bt-selectionbar'))
  const rects = leaves.map((el) => ({ el, r: el.getBoundingClientRect() }))
  const name = (el) => el.getAttribute('aria-label') || el.getAttribute('data-vb') || el.closest('[data-vb]')?.getAttribute('data-vb') || el.textContent.trim().slice(0, 24) || el.className
  // Sobreposição: só entre controles que não estão um dentro do outro (o contador contém o ✕).
  const overlaps = []
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    const a = rects[i], b = rects[j]
    if (a.el.contains(b.el) || b.el.contains(a.el) || a.el.closest('.bt-selection__count') && b.el.closest('.bt-selection__count')) continue
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
    const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
    if (x > 0.5 && y > 0.5) overlaps.push(`${name(a.el)}×${name(b.el)}`)
  }
  const centers = rects.map(({ r }) => r.top + r.height / 2)
  const oneLine = Math.max(...centers) - Math.min(...centers) <= 2
  const outside = rects.filter(({ r }) => r.left < br.left - 0.5 || r.right > br.right + 0.5).map(({ el }) => name(el))
  // Texto cortado: rótulos visíveis (os só ícone ficam com 1 px e não contam) e o nome da visão.
  const texts = [...bar.querySelectorAll('.bt-button__label, .bt-viewbar__name, .bt-selection__label')].filter((el) => visible(el) && !el.closest('.bt-selectionbar'))
  const cut = texts.filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent.trim())
  // Rodapé do celular (1.27.1): nenhum rótulo cortado; o que não cabe vira só ícone (1 px, não conta).
  const footer = document.querySelector('.bt-selectionbar')
  if (footer) for (const el of footer.querySelectorAll('.bt-button__label, .bt-selection__label')) {
    const r = el.getBoundingClientRect()
    if (r.width > 2 && el.scrollWidth > el.clientWidth + 0.5) cut.push(`rodapé: ${el.textContent.trim()}`)
  }
  // Placeholder da busca (1.27.1): cortado só vale com espaço escasso (busca no mínimo de 140 px ou a linha já encolheu:
  // Colunas só ícone ou no ⋮). Com os fixos com texto, cortar é erro.
  const input = bar.querySelector('.bt-viewbar__search:not([hidden]) input')
  if (input && !input.value && input.placeholder && visible(input)) {
    const cs = getComputedStyle(input)
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const need = ctx.measureText(input.placeholder).width
    const box = bar.querySelector('.bt-viewbar__search').getBoundingClientRect().width
    const scarce = box <= 141 || Boolean(bar.querySelector('.bt-viewbar__end [data-vb="colunas"].is-compact, .bt-viewbar__end [data-vb="colunas"][hidden]'))
    if (need > room + 0.5) cut.push(scarce ? `placeholder (espaço escasso, ${Math.round(box)} px)` : `PLACEHOLDER com ${Math.round(box)} px`)
  }
  // Vãos na superfície (1.27.1; estrito na 1.28.0): entre itens consecutivos só o gap da superfície (±0,5 px), nas pontas só
  // o recuo; fio nunca ao lado de espaço vazio, nem dois fios seguidos, nem fio na ponta; item ou fio recolhido não ocupa nada.
  const surface = bar.querySelector('.bt-viewbar__surface')
  const holes = []
  if (surface) {
    const items = []
    const collapsed = (el) => { if (el.getBoundingClientRect().width > 0) holes.push(`RECOLHIDO OCUPA ${Math.round(el.getBoundingClientRect().width)}px (${name(el)})`) }
    for (const child of surface.children) {
      if (child.classList.contains('bt-viewbar__zone')) { for (const z of child.children) if (z.hidden) collapsed(z); else if (visible(z) && !z.classList.contains('is-floating')) items.push(z) }
      else if (child.hidden) collapsed(child)
      else if (visible(child)) items.push(child)
    }
    const isSep = (el) => el?.classList.contains('bt-viewbar__sep')
    items.forEach((el, i) => {
      if (isSep(el) && (i === 0 || i === items.length - 1)) holes.push('FIO NA PONTA')
      if (isSep(el) && isSep(items[i + 1])) holes.push('FIOS SEGUIDOS')
    })
    const sr = surface.getBoundingClientRect()
    const cs = getComputedStyle(surface)
    const inner = { left: sr.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), right: sr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) }
    const label = (el) => (el.classList.contains('bt-viewbar__sep') ? 'fio' : name(el.querySelector('.bt-button, input') || el))
    const edges = [{ el: null, right: inner.left }, ...items.map((el) => ({ el, ...el.getBoundingClientRect().toJSON() })), { el: null, left: inner.right }]
    const step = parseFloat(cs.columnGap) || 0
    for (let i = 0; i + 1 < edges.length; i += 1) {
      const a = edges[i], b = edges[i + 1]
      const hole = b.left - a.right - (a.el && b.el ? step : 0)
      if (hole > 0.5) holes.push(`${(a.el?.classList.contains('bt-viewbar__sep') || b.el?.classList.contains('bt-viewbar__sep')) ? 'FIO JUNTO A VAZIO' : 'vão'} ${Math.round(hole)}px (${a.el ? label(a.el) : 'início'}→${b.el ? label(b.el) : 'fim'})`)
    }
  }
  // Altura única (1.27.2): superfície e ação principal com o mesmo topo e a mesma altura (±0,5 px); a visão centrada na
  // mesma linha; itens da superfície sem passar da altura interna; botões do rodapé do celular com uma altura só.
  const altura = []
  const prim = bar.querySelector('.bt-viewbar__end [data-vb="primary"] .bt-button--primary')
  if (surface) {
    const sr = surface.getBoundingClientRect()
    const root = getComputedStyle(document.documentElement)
    const token = parseFloat(root.getPropertyValue(matchMedia('(pointer: coarse), (max-width: 820px)').matches ? '--bt-control-height-touch' : '--bt-control-height-default'))
    if (Math.abs(sr.height - token) > 0.5) altura.push(`superfície ${sr.height.toFixed(1)} ≠ controle ${token}`)
    if (prim && visible(prim)) {
      const pr = prim.getBoundingClientRect()
      if (Math.abs(sr.top - pr.top) > 0.5 || Math.abs(sr.height - pr.height) > 0.5) altura.push(`superfície ${sr.height.toFixed(1)}@${sr.top.toFixed(1)} × principal ${pr.height.toFixed(1)}@${pr.top.toFixed(1)}`)
    }
    const trig = bar.querySelector('.bt-viewbar__trigger')
    if (trig && visible(trig)) {
      const tr = trig.getBoundingClientRect()
      const d = (tr.top + tr.height / 2) - (sr.top + sr.height / 2)
      if (Math.abs(d) > 0.5) altura.push(`visão fora do centro ${d.toFixed(1)}px`)
    }
    const cs = getComputedStyle(surface)
    const innerTop = sr.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) - 0.5
    const innerBottom = sr.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom) + 0.5
    for (const el of surface.querySelectorAll('.bt-button, .bt-control, .bt-selection')) {
      if (!visible(el) || el.closest('.is-floating')) continue
      const r = el.getBoundingClientRect()
      if (r.top < innerTop || r.bottom > innerBottom) altura.push(`${name(el)} ${r.height.toFixed(1)}px vaza`)
    }
  }
  if (footer) {
    const hs = [...footer.querySelectorAll('.bt-selectionbar__actions .bt-button')].filter((el) => el.getBoundingClientRect().width > 2 && !el.closest('.bt-selectionbar__measure')).map((el) => el.getBoundingClientRect().height)
    if (hs.length && Math.max(...hs) - Math.min(...hs) > 0.5) altura.push(`rodapé ${hs.map((h) => h.toFixed(1)).join('/')}`)
  }
  // Posição x dos fixos (o que nunca depende da seleção).
  // A busca não é fixa (1.27.1): sem seleção ocupa a reserva; com seleção encolhe (e pode virar lupa no degrau dela).
  const fixedSel = { visao: '.bt-viewbar__trigger', colunas: '[data-vb="colunas"]', filtros: '[data-vb="filtros"]', densidade: '[data-vb="density"]', auditoria: '[data-vb="audit"]', mais: '.bt-viewbar__more', principal: '[data-vb="primary"]' }
  const fixed = {}
  for (const [key, sel] of Object.entries(fixedSel)) {
    const el = bar.querySelector(`.bt-viewbar__start ${sel}, .bt-viewbar__end ${sel}`)
    fixed[key] = el && visible(el) ? Math.round(el.getBoundingClientRect().left * 10) / 10 : null
  }
  const state = {
    texto: !bar.querySelector('[data-vb="colunas"].is-compact'),
    principalTexto: !bar.querySelector('[data-vb="primary"].is-compact'),
    selInline: [...bar.querySelectorAll('.bt-viewbar__end [data-vb^="sel:"]')].filter(visible).length,
    selTexto: !bar.querySelector('.bt-viewbar__end [data-vb^="sel:"].is-compact'),
    noMenu: ['colunas', 'densidade', 'auditoria'].filter((k) => fixed[k] === null),
    lupa: Boolean([...bar.querySelectorAll('button[aria-label="Buscar"]')].find(visible)),
    visaoCompacta: Boolean(bar.querySelector('[data-vb="view"].is-compact')),
    selo: bar.querySelector('.bt-viewbar__more .bt-viewbar__badge, .bt-viewbar__more .bt-viewbar__count')?.textContent ?? '',
    // Peça única (1.27): uma superfície, a principal fora dela, nenhuma pílula no contador.
    superficie: bar.querySelectorAll('.bt-viewbar__surface').length === 1 && !bar.querySelector('.bt-viewbar__surface [data-vb="primary"]'),
    pilula: [...bar.querySelectorAll('.bt-selection__count')].some((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'),
    rodape: Boolean(document.querySelector('.bt-selectionbar')),
  }
  return { barW: Math.round(br.width), barH: Math.round(br.height), altura, oneLine, overlaps, outside, cut, holes, fixed, state, pageScroll: document.documentElement.scrollWidth > window.innerWidth }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
  const rows = []
  const errors = []
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 820, colorScheme: process.env.SCHEME || 'light' })
    const page = await ctx.newPage()
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${width}px: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`${width}px: ${e.message}`))
    await page.goto(url, { waitUntil: 'networkidle' })
    const section = page.locator('section.showcase', { has: page.locator('h2', { hasText: 'Visões, colunas e filtros' }) })
    await section.scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready)
    const boxes = section.getByRole('checkbox', { name: /^Selecionar OC/ })
    let selected = 0
    for (const count of COUNTS) {
      while (selected < count) { await boxes.nth(selected).evaluate((el) => el.click()); selected += 1 }
      await page.waitForTimeout(150)
      const m = await page.evaluate(measure)
      rows.push({ width, count, ...m })
      await section.locator('.bt-viewbar--slots').screenshot({ path: path.join(out, `viewbar-${process.env.SCHEME || 'light'}-${width}-${count}.png`) })
      if (m.state.rodape) await page.locator('.bt-selectionbar').screenshot({ path: path.join(out, `viewbar-${process.env.SCHEME || 'light'}-${width}-${count}-rodape.png`) })
    }
    await ctx.close()
  }
  await browser.close()
  // Fixos parados: mesma posição x com 0, 1 e 3 selecionados.
  for (const width of WIDTHS) {
    const set = rows.filter((r) => r.width === width)
    const base = JSON.stringify(set[0].fixed)
    for (const r of set) r.fixosParados = JSON.stringify(r.fixed) === base
  }
  fs.writeFileSync(path.join(out, 'viewbar-medidas.json'), JSON.stringify({ rows, errors }, null, 2))
  console.log('| Viewport | Sel. | Barra (px) | Altura | 1 linha | Sobreposição | Fora da barra | Texto cortado | Vão / fio | Altura única | Fixos parados | Estado |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const s = r.state
    const estado = [s.texto ? 'fixos c/ texto' : 'fixos só ícone', s.principalTexto ? 'principal c/ texto' : 'principal só ícone', r.count ? (s.rodape ? 'seleção no rodapé' : `seleção ${s.selInline} inline${s.selTexto ? ' c/ texto' : ' só ícone'}`) : null, s.noMenu.length ? `no ⋮: ${s.noMenu.join(', ')}` : null, s.lupa ? 'lupa' : 'busca', s.visaoCompacta ? 'visão só ícone' : null, s.selo ? `selo ${s.selo}` : null, s.superficie ? null : 'SUPERFÍCIE ERRADA', s.pilula ? 'PÍLULA' : null].filter(Boolean).join('; ')
    console.log(`| ${r.width} | ${r.count} | ${r.barW} | ${r.barH} | ${r.oneLine ? 'sim' : 'NÃO'} | ${r.overlaps.length ? r.overlaps.join(' ') : 'nenhuma'} | ${r.outside.length ? r.outside.join(' ') : '—'} | ${r.cut.length ? r.cut.join(', ') : 'nenhum'} | ${r.holes.length ? r.holes.join(' ') : 'nenhum'} | ${r.altura.length ? r.altura.join(', ') : 'sim'} | ${r.fixosParados ? 'sim' : 'NÃO'} | ${estado}${r.pageScroll ? ' (ROLAGEM HORIZONTAL)' : ''} |`)
  }
  console.log(`Erros de console: ${errors.length ? errors.join(' | ') : 'nenhum'}`)
})().catch((e) => { console.error(e); process.exit(1) })
