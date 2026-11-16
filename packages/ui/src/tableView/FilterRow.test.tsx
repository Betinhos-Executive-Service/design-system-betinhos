// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FilterRow, type FilterRowProps } from './FilterRow'
import type { FilterCondition, FilterField } from './filters'

const fields: FilterField[] = [
  { key: 'status', label: 'Status', kind: 'choice', options: [{ value: '1', label: 'Pendente' }, { value: '2', label: 'Aprovado' }] },
  { key: 'tipo', label: 'Tipo', kind: 'choice', options: [{ value: '1', label: 'A' }] },
  { key: 'valor', label: 'Valor total', kind: 'number', money: true },
]
const cond: FilterCondition = { type: 'condition', id: 'c1', field: 'status', op: 'in', values: [{ value: '1', label: 'Pendente' }] }
beforeEach(() => { vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const mount = (extra: Partial<FilterRowProps> = {}) => {
  const p = { onChange: vi.fn(), onRemove: vi.fn(), onDuplicate: vi.fn(), onWrap: vi.fn(), ...extra }
  render(<FilterRow condition={cond} fields={fields} {...p} />)
  return p
}
const menu = (name: string) => screen.getByRole('menuitem', { name, hidden: true })

it('lê como frase', () => {
  mount()
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Status é um de Pendente')
})
it('trocar operador oferece os do tipo, com vazio/preenchido depois', () => {
  const p = mount()
  fireEvent.click(screen.getByRole('button', { name: 'é um de' }))
  const items = screen.getAllByRole('menuitemradio', { hidden: true }).map((i) => i.textContent)
  expect(items).toEqual(['é um de', 'não é nenhum de', 'está vazio', 'está preenchido'])
  expect(screen.getAllByRole('separator', { hidden: true })).toHaveLength(1)
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'está vazio', hidden: true }))
  expect(p.onChange).toHaveBeenCalledWith({ type: 'condition', id: 'c1', field: 'status', op: 'empty' })
})
it('trocar para campo do mesmo tipo mantém o operador; de outro tipo reinicia', () => {
  const p = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Status' }))
  fireEvent.click(screen.getByRole('option', { name: /Tipo/, hidden: true }))
  expect(p.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c1', field: 'tipo', op: 'in' }))
  fireEvent.click(screen.getByRole('button', { name: 'Status' }))
  fireEvent.click(screen.getByRole('option', { name: /Valor total/, hidden: true }))
  expect(p.onChange).toHaveBeenLastCalledWith({ type: 'condition', id: 'c1', field: 'valor', op: 'eq' })
})
it('Del na caixa remove; menu tem Colocar num grupo só com onWrap', () => {
  const p = mount()
  fireEvent.keyDown(screen.getByRole('group'), { key: 'Delete' })
  expect(p.onRemove).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações do filtro' }))
  expect(screen.getAllByRole('menuitem', { hidden: true }).map((i) => i.textContent)).toEqual(['Trocar campo', 'Duplicar', 'Colocar num grupo', 'Remover'])
  fireEvent.click(menu('Duplicar'))
  expect(p.onDuplicate).toHaveBeenCalled()
  cleanup()
  mount({ onWrap: undefined })
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações do filtro' }))
  expect(screen.queryByRole('menuitem', { name: 'Colocar num grupo', hidden: true })).toBeNull()
})
it('valor ausente mostra "escolha um valor"; o checklist marca as opções', () => {
  cleanup()
  const onChange = vi.fn()
  render(<FilterRow condition={{ ...cond, values: [] }} fields={fields} onChange={onChange} onRemove={vi.fn()} onDuplicate={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'escolha um valor' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Aprovado', hidden: true }))
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ values: [{ value: '2', label: 'Aprovado' }] }))
})
it('número em dinheiro aparece formatado no token', () => {
  cleanup()
  render(<FilterRow condition={{ type: 'condition', id: 'n', field: 'valor', op: 'gt', value: 1000 }} fields={fields} onChange={vi.fn()} onRemove={vi.fn()} onDuplicate={vi.fn()} />)
  expect(screen.getByRole('group').getAttribute('aria-label')).toMatch(/^Valor total maior que R\$\s1\.000,00$/)
})
