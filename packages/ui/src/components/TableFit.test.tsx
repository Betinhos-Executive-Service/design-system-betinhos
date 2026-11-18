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
  const free = '(100cqw - 4 * var(--bt-table-gap) - 2 * var(--bt-table-pad) - 112px)'
  expect(layout.template).toBe(`40px max(195px, min(300px, calc(${free} * 0.75))) 48px max(72px, min(100px, calc(${free} * 0.25))) minmax(24px, 1fr)`)
  expect(layout.fitting).toBe(true)
  expect(layout.minWidth).toBeNull()
})

it('fit: sem seta a última trilha continua esticando; a largura salva vira o teto', () => {
  const columns = [col('nome'), col('status')]
  const defs = tableViewColumns(columns)
  const config = resizeColumn(defaultConfig(defs), 'status', 120)
  const { template } = viewLayout(columns, config, false, { fit: true })
  const free = '(100cqw - 2 * var(--bt-table-gap) - 2 * var(--bt-table-pad) - 0px)'
  expect(template).toBe(`max(156px, min(240px, calc(${free} * 0.666667))) max(78px, min(120px, calc(${free} * 0.333333))) minmax(0, 1fr)`)
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
