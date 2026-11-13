// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { normalizeConfig, setGroup, defaultConfig } from './config'
import type { FilterField } from './filters'
import { GROUP_LIMIT, OTHERS_GROUP_ID, groupRows } from './grouping'
import { TableGroups } from './TableGroups'

type Row = { id: number; status?: string; quando?: Date | string | null; pago?: boolean; cliente?: string }
const fields: FilterField[] = [
  { key: 'status', label: 'Status', kind: 'choice', options: [{ value: 'b', label: 'Aberta' }, { value: 'a', label: 'Paga' }] },
  { key: 'quando', label: 'Criada em', kind: 'date' },
  { key: 'pago', label: 'Pago', kind: 'bool' },
  { key: 'cliente', label: 'Cliente', kind: 'lookup' },
  { key: 'nome', label: 'Nome', kind: 'text' },
]
const read = (r: Row, key: string) => r[key as keyof Row]
const summary = (groups: ReturnType<typeof groupRows<Row>>) => groups?.map((g) => `${g.label}:${g.rows.map((r) => r.id).join(',')}`)

afterEach(cleanup)

it('escolha segue a ordem das opções e o vazio vai para o fim; a ordem das linhas fica', () => {
  const rows: Row[] = [{ id: 1, status: 'a' }, { id: 2 }, { id: 3, status: 'b' }, { id: 4, status: 'a' }]
  expect(summary(groupRows(rows, { key: 'status' }, fields, read))).toEqual(['Aberta:3', 'Paga:1,4', 'Vazio:2'])
})

it('data por mês (fuso de São Paulo) e por ano, do mais recente ao mais antigo', () => {
  const rows: Row[] = [
    { id: 1, quando: new Date('2026-10-15T12:00:00Z') },
    { id: 2, quando: new Date('2026-11-01T02:00:00Z') }, // 31/10 23h em São Paulo
    { id: 3, quando: new Date('2025-03-02T12:00:00Z') },
    { id: 4, quando: '2026-11-01T02:00:00Z' }, // texto do Dataverse em UTC: também 31/10 em São Paulo
    { id: 5, quando: '2026-11-01' }, // só data: vale como está
  ]
  expect(summary(groupRows(rows, { key: 'quando', by: 'month' }, fields, read))).toEqual(['novembro de 2026:5', 'outubro de 2026:1,2,4', 'março de 2025:3'])
  expect(summary(groupRows(rows, { key: 'quando', by: 'year' }, fields, read))).toEqual(['2026:1,2,4,5', '2025:3'])
})

it('Sim antes de Não; campo de texto ou desconhecido não agrupa', () => {
  const rows: Row[] = [{ id: 1, pago: false }, { id: 2, pago: true }]
  expect(summary(groupRows(rows, { key: 'pago' }, fields, read))).toEqual(['Sim:2', 'Não:1'])
  expect(groupRows(rows, { key: 'nome' }, fields, read)).toBeNull()
  expect(groupRows(rows, { key: 'sumiu' }, fields, read)).toBeNull()
  expect(groupRows(rows, undefined, fields, read)).toBeNull()
})

it('relação: maiores primeiro, até o limite, e o resto em "Outros"', () => {
  const rows: Row[] = Array.from({ length: GROUP_LIMIT + 3 }, (_, i) => ({ id: i, cliente: `c${i}` }))
  rows.push({ id: 999, cliente: 'c7' })
  const groups = groupRows(rows, { key: 'cliente' }, fields, read, (r) => `Cliente ${r.cliente}`)!
  expect(groups).toHaveLength(GROUP_LIMIT + 1)
  expect(groups[0]).toMatchObject({ label: 'Cliente c7', rows: [{ id: 7 }, { id: 999 }] })
  expect(groups.at(-1)).toMatchObject({ id: OTHERS_GROUP_ID, label: 'Outros (3)' })
  expect(groups.at(-1)!.rows).toHaveLength(3)
})

it('o agrupamento fica na visão e sobrevive à leitura do Dataverse', () => {
  const defs = [{ key: 'nome', label: 'Nome' }]
  const config = setGroup(defaultConfig(defs), { key: 'quando', by: 'year' })
  expect(normalizeConfig(JSON.parse(JSON.stringify(config)), defs).group).toEqual({ key: 'quando', by: 'year' })
  expect(normalizeConfig({ ...config, group: { key: 'quando', by: 'semana' } }, defs).group).toEqual({ key: 'quando' })
  expect('group' in setGroup(config, null)).toBe(false)
})

it('grupos começam fechados, abrem um por vez e fecham de novo quando o agrupamento muda', () => {
  const groups = groupRows<Row>([{ id: 1, status: 'a' }, { id: 2, status: 'b' }], { key: 'status' }, fields, read)!
  const view = (key: string) => <TableGroups groups={groups} resetKey={key}>{(rows) => <p>linhas {rows.map((r) => r.id).join(',')}</p>}</TableGroups>
  const { rerender } = render(view('status'))
  const paga = screen.getByRole('button', { name: /Paga/ })
  expect(paga.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByText(/linhas/)).toBeNull()
  fireEvent.click(paga)
  expect(screen.getByText('linhas 1')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Aberta/ }).getAttribute('aria-expanded')).toBe('false')
  rerender(view('status:outro'))
  expect(screen.queryByText(/linhas/)).toBeNull()
})

it('painel de colunas: "Agrupar por" lista só os campos que agrupam e grava o período da data', async () => {
  const { ColumnsPanel } = await import('./ColumnsPanel')
  const defs = [{ key: 'nome', label: 'Nome' }]
  const base = defaultConfig(defs)
  let applied: ReturnType<typeof defaultConfig> | null = null
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
  Element.prototype.scrollIntoView ??= function () {}
  globalThis.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  render(<ColumnsPanel open onClose={() => {}} columns={defs} config={base} defaults={base} onApply={(c) => { applied = c }} groupFields={fields} />)
  fireEvent.click(screen.getByRole('combobox', { name: 'Agrupar por', hidden: true }))
  const options = screen.getAllByRole('option', { hidden: true }).map((o) => o.textContent)
  expect(options).toEqual(['Status', 'Criada em', 'Pago', 'Cliente'])
  fireEvent.click(screen.getByRole('option', { name: 'Criada em', hidden: true }))
  expect(screen.getByRole('combobox', { name: 'Período do grupo', hidden: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar', hidden: true }))
  expect(applied!.group).toEqual({ key: 'quando', by: 'month' })
})
