// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultConfig, pinColumn, resizeColumn } from '../tableView/config'
import { Table, fitMinimum, tableViewColumns, viewLayout, type TableColumn } from './Table'

type Row = { id: string }
const col = (key: string, extra: Partial<TableColumn<Row>> = {}): TableColumn<Row> => ({ key, header: key, cell: (r) => `${key}-${r.id}`, ...extra })
const rows: Row[] = [{ id: 'a' }, { id: 'b' }]

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// ---------- view.fit: modelo de colunas ----------

it('fitMinimum: 65% da largura, nunca abaixo de 72 px nem acima da própria largura', () => {
  expect(fitMinimum(200)).toBe(130)
  expect(fitMinimum(100)).toBe(72)
  expect(fitMinimum(64)).toBe(64)
})

it('fit: colunas ≥ 64 px encolhem na proporção da largura; menores, seleção e seta ficam fixas', () => {
  const columns = [col('nome', { defaultWidth: 300 }), col('ok', { defaultWidth: 48 }), col('valor', { defaultWidth: 100 })]
  const config = defaultConfig(tableViewColumns(columns))
  const layout = viewLayout(columns, config, true, { lead: 40, fit: true })
  // 5 trilhas (seleção, 3 colunas, seta); fixas: 40 + 48 + 24 (mínimo da seta, que estica) = 112 px.
  // Fator: tudo encolhe (sobra / 400) ou só a de menor mínimo/largura (nome) enquanto a outra fica no mínimo de 72 px.
  const spare = '100cqw - 4 * var(--bt-table-gap) - 2 * var(--bt-table-pad)'
  const f = `min((${spare} - 184px) / 300, (${spare} - 112px) / 400)`
  expect(layout.template).toBe(`40px max(195px, min(300px, calc(300 * ${f}))) 48px max(72px, min(100px, calc(100 * ${f}))) minmax(24px, 1fr)`)
  expect(layout.fitting).toBe(true)
  expect(layout.minWidth).toBeNull()
})

it('fit: sem seta a última trilha continua esticando; a largura salva vira o teto', () => {
  const columns = [col('nome'), col('status')]
  const defs = tableViewColumns(columns)
  const config = resizeColumn(defaultConfig(defs), 'status', 120)
  const { template } = viewLayout(columns, config, false, { fit: true })
  const spare = '100cqw - 2 * var(--bt-table-gap) - 2 * var(--bt-table-pad)'
  const f = `min((${spare} - 78px) / 240, (${spare} - 0px) / 360)`
  expect(template).toBe(`max(156px, min(240px, calc(240 * ${f}))) max(78px, min(120px, calc(120 * ${f}))) minmax(0, 1fr)`)
})

it('fit: coluna fixa não encolhe (o left das seguintes é somado em px)', () => {
  const columns = [col('nome'), col('status'), col('valor')]
  const defs = tableViewColumns(columns)
  const config = pinColumn(defaultConfig(defs), defs, 'nome')
  const layout = viewLayout(columns, config, false, { fit: true })
  expect(layout.template.startsWith('240px ')).toBe(true)
  expect(layout.template.match(/(^| )max\(/g)?.length).toBe(2)
  expect(layout.template).toContain('- 240px)')
})

it('fit com fluid: vale fluid; sem fit, nada muda', () => {
  const columns = [col('nome'), col('status')]
  const config = defaultConfig(tableViewColumns(columns))
  expect(viewLayout(columns, config, false, { fit: true, fluid: true })).toMatchObject({ template: 'minmax(240px, 240fr) minmax(160px, 160fr)', fitting: false })
  expect(viewLayout(columns, config, false)).toMatchObject({ template: '240px 160px minmax(0, 1fr)', fitting: false })
})

function Fit({ fit = true }: { fit?: boolean }) {
  const columns = [col('nome'), col('status')]
  const [config, setConfig] = useState(() => defaultConfig(tableViewColumns(columns)))
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} view={{ config, onChange: (fn) => setConfig(fn), fit }} />
}

it('fit liga bt-table--fit e grava o modelo encolhido nas duas faixas', () => {
  const { container, rerender } = render(<Fit />)
  const table = container.querySelector<HTMLElement>('.bt-table')!
  expect(table.classList.contains('bt-table--fit')).toBe(true)
  expect(table.style.getPropertyValue('--bt-table-columns')).toContain('100cqw')
  expect(table.style.getPropertyValue('--bt-table-columns-compact')).toBe(table.style.getPropertyValue('--bt-table-columns'))
  rerender(<Fit fit={false} />)
  expect(table.classList.contains('bt-table--fit')).toBe(false)
})

// ---------- loadingContent ----------

it('loadingContent: sem linhas mostra o conteúdo no lugar das linhas-esqueleto, com aria-busy', () => {
  const { container } = render(<Table columns={[col('nome')]} rows={[]} rowKey={(r) => r.id} loading loadingContent={<span>Carregando a lista…</span>} empty="Nada aqui" />)
  expect(screen.getByText('Carregando a lista…').closest('.bt-table__loading')).not.toBeNull()
  expect(container.querySelector('.bt-table__skeleton')).toBeNull()
  expect(screen.queryByText('Nada aqui')).toBeNull()
  expect(container.querySelector('.bt-table')?.getAttribute('aria-busy')).toBe('true')
})

it('loadingContent: com linhas elas ficam na tela durante a recarga', () => {
  const { container } = render(<Table columns={[col('nome')]} rows={rows} rowKey={(r) => r.id} loading loadingContent={<span>Carregando…</span>} />)
  expect(screen.getByText('nome-a')).toBeTruthy()
  expect(screen.queryByText('Carregando…')).toBeNull()
  expect(container.querySelector('.bt-table__skeleton')).toBeNull()
  expect(container.querySelector('.bt-table')?.getAttribute('aria-busy')).toBe('true')
})

it('sem loadingContent a carga continua com as linhas-esqueleto', () => {
  const { container } = render(<Table columns={[col('nome')]} rows={rows} rowKey={(r) => r.id} loading />)
  expect(container.querySelectorAll('.bt-table__skeleton').length).toBeGreaterThan(0)
  expect(screen.queryByText('nome-a')).toBeNull()
})

// ---------- stickyScrollbar ----------

function Wide({ sticky = false, on = true }: { sticky?: boolean; on?: boolean }) {
  const columns = [col('nome'), col('status')]
  const [config, setConfig] = useState(() => defaultConfig(tableViewColumns(columns)))
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} view={{ config, onChange: (fn) => setConfig(fn) }} stickyScrollbar={on} stickyHeader={sticky} />
}

it('stickyScrollbar: barra depois da área de rolagem, escondida sem sobra, e sincronizada nos dois sentidos', () => {
  const { container } = render(<Wide />)
  const table = container.querySelector<HTMLElement>('.bt-table')!
  const scroll = table.querySelector<HTMLElement>('.bt-table__scroll')!
  const bar = table.querySelector<HTMLElement>('.bt-table__xbar')!
  expect(table.classList.contains('bt-table--xbar')).toBe(true)
  expect(scroll.nextElementSibling).toBe(bar)
  expect(bar.getAttribute('aria-hidden')).toBe('true')
  expect(bar.hidden).toBe(true)

  // Com sobra: aparece e acompanha a rolagem.
  Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: 1500 })
  Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 1000 })
  Object.defineProperty(bar, 'clientWidth', { configurable: true, value: 1000 })
  render(<Wide />, { container })
  expect(bar.hidden).toBe(false)
  expect(bar.querySelector<HTMLElement>('.bt-table__xbar-fill')!.style.width).toBe('1500px')
  scroll.scrollLeft = 200
  scroll.dispatchEvent(new Event('scroll'))
  expect(bar.scrollLeft).toBe(200)
  bar.scrollLeft = 350
  bar.dispatchEvent(new Event('scroll'))
  expect(scroll.scrollLeft).toBe(350)
})

it('stickyScrollbar não se aplica com stickyHeader nem sem a prop', () => {
  const { container, rerender } = render(<Wide sticky />)
  expect(container.querySelector('.bt-table__xbar')).toBeNull()
  expect(container.querySelector('.bt-table')?.classList.contains('bt-table--xbar')).toBe(false)
  rerender(<Wide on={false} />)
  expect(container.querySelector('.bt-table__xbar')).toBeNull()
})

it('stickyScrollbar sem área de rolagem (sem view nem scrollRef) não desenha a barra', () => {
  const { container } = render(<Table columns={[col('nome')]} rows={rows} rowKey={(r) => r.id} stickyScrollbar />)
  expect(container.querySelector('.bt-table__xbar')).toBeNull()
})

it('fit: texto solto da célula vai num span (para cortar com reticências); sem fit fica como está', () => {
  const { container, rerender } = render(<Fit />)
  expect(screen.getByText('nome-a').classList.contains('bt-table__text')).toBe(true)
  rerender(<Fit fit={false} />)
  expect(container.querySelector('.bt-table__text')).toBeNull()
})

// ---------- virtual: qual área rola ----------

function rolagens(run: () => void) {
  const alvos: Element[] = []
  const original = HTMLElement.prototype.addEventListener
  const spy = vi.spyOn(HTMLElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLElement, type: string, ...rest: unknown[]) {
    // Só o ouvinte passivo do virtualizador; o `onScroll` do React também ouve a área da tabela.
    if (type === 'scroll' && (rest[1] as { passive?: boolean } | undefined)?.passive) alvos.push(this)
    return (original as (...a: unknown[]) => void).call(this, type, ...rest)
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  // O jsdom não carrega o table.css: reproduz o que o navegador calcula para a área da tabela (overflow-x auto puxa o y).
  const style = document.head.appendChild(document.createElement('style'))
  style.textContent = '.bt-table__scroll { overflow-x: auto; overflow-y: auto; }'
  run()
  style.remove()
  spy.mockRestore()
  return alvos
}

it('virtual com visão e sem stickyHeader rola no ancestral, não na área horizontal da tabela', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }))
  const many = Array.from({ length: 150 }, (_, i) => ({ id: String(i) }))
  const columns = [col('nome')]
  const config = defaultConfig(tableViewColumns(columns))
  let container!: HTMLElement
  const alvos = rolagens(() => {
    container = render(
      <div data-testid="main" style={{ overflowY: 'auto' }}>
        <Table columns={columns} rows={many} rowKey={(r) => r.id} view={{ config, onChange: () => undefined }} virtual />
      </div>,
    ).container
  })
  const main = screen.getByTestId('main')
  const own = container.querySelector('.bt-table__scroll')
  expect(alvos).toContain(main)
  expect(alvos).not.toContain(own)
})

it('virtual com stickyHeader rola na própria área da tabela', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }))
  const many = Array.from({ length: 150 }, (_, i) => ({ id: String(i) }))
  let container!: HTMLElement
  const alvos = rolagens(() => {
    container = render(<div style={{ overflowY: 'auto' }}><Table columns={[col('nome')]} rows={many} rowKey={(r) => r.id} virtual stickyHeader /></div>).container
  })
  expect(alvos).toContain(container.querySelector('.bt-table__scroll'))
})

it('virtual com stickyHeader no celular (até 820 px) rola no ancestral', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: String(i) }))
  let container!: HTMLElement
  const alvos = rolagens(() => {
    container = render(<div data-testid="main" style={{ overflowY: 'auto' }}><Table columns={[col('nome')]} rows={many} rowKey={(r) => r.id} virtual stickyHeader /></div>).container
  })
  expect(alvos).toContain(screen.getByTestId('main'))
  expect(alvos).not.toContain(container.querySelector('.bt-table__scroll'))
})

// Avalia o modelo de trilhas como o navegador: as colunas que encolhem têm de fechar na largura visível sempre que
// os mínimos couberem (sem sobrar uns px que acenderiam a barra horizontal presa ao pé).
const splitTracks = (template: string) => {
  const out: string[] = []
  let depth = 0
  let from = 0
  ;[...template].forEach((ch, i) => {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ' ' && depth === 0) { out.push(template.slice(from, i)); from = i + 1 }
  })
  return [...out, template.slice(from)]
}
const trackWidths = (template: string, visible: number) => splitTracks(template).map((track) => {
  if (track.startsWith('minmax(')) return 0
  const expr = track.replace(/calc\(/g, '(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(').replace(/(\d)px/g, '$1')
    .replace(/var\(--bt-table-gap\)/g, '12').replace(/var\(--bt-table-pad\)/g, '14').replace(/100cqw/g, String(visible))
  return Number(new Function(`return ${expr}`)())
})

it('fit: coluna que bate no mínimo não deixa sobra; as outras cedem e a linha fecha na largura visível', () => {
  // Nomes e larguras como numa lista real: as estreitas (80 e 90 px) têm mínimo de 72 px, 80-90% da largura, e travam antes das largas.
  const columns = [col('a', { defaultWidth: 240 }), col('b', { defaultWidth: 160 }), col('c', { defaultWidth: 80 }), col('d', { defaultWidth: 90 }), col('e', { defaultWidth: 200 })]
  const config = defaultConfig(tableViewColumns(columns))
  const { template } = viewLayout(columns, config, false, { fit: true })
  const gaps = 5 * 12 // cinco trilhas, a última (cauda) com 0 px
  const pad = 2 * 14
  for (const visible of [1000, 900, 800, 700, 640]) {
    const sum = trackWidths(template, visible).reduce((a, b) => a + b, 0)
    // 770 px de colunas na largura salva; mínimos somam 156 + 104 + 72 + 72 + 130 = 534 px (622 com espaços e recuo).
    expect(Math.abs(sum + gaps + pad - Math.min(visible, 770 + gaps + pad))).toBeLessThan(0.01)
  }
  // A 700 px a razão geral (0,795) levaria as estreitas a 64 e 71 px, abaixo do mínimo de 72: elas travam e as largas
  // cedem o que falta (sem isso, a linha passaria uns 9 px da largura visível e a barra horizontal apareceria à toa).
  const tight = trackWidths(template, 700)
  expect(tight[2]).toBe(72)
  expect(tight[3]).toBe(72)
})
