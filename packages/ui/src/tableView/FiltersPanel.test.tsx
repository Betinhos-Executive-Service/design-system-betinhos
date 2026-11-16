// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { FiltersPanel, type FiltersPanelProps } from './FiltersPanel'
import { emptyFilters, type FilterCondition, type FilterField, type TableFilters } from './filters'

const fields: FilterField[] = [
  { key: 'cliente', label: 'Cliente', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'choice', options: [{ value: '1', label: 'Pendente' }, { value: '2', label: 'Aprovado' }] },
  { key: 'valor', label: 'Valor total', kind: 'number' },
]
const c = (field: string, op: FilterCondition['op'], extra: Partial<FilterCondition> = {}): FilterCondition => ({ type: 'condition', id: `${field}-${op}`, field, op, ...extra })
const com = (quick: TableFilters['quick'], advanced = emptyFilters().advanced): TableFilters => ({ quick, advanced })

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
})
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

const mount = (extra: Partial<FiltersPanelProps> = {}) => {
  const p = { onClose: vi.fn(), onApply: vi.fn() }
  render(<FiltersPanel open fields={fields} value={com({})} {...p} {...extra} />)
  return p
}
const option = (name: RegExp) => screen.getByRole('option', { name, hidden: true })
const show = () => fireEvent.click(screen.getByRole('button', { name: /^Mostrar/ }))
const rows = () => screen.queryAllByRole('group').filter((g) => g.classList.contains('bt-frow'))

it('sem filtro mostra o estado vazio, sem abas', () => {
  mount()
  expect(screen.getByText('Nenhum filtro')).toBeTruthy()
  expect(screen.getByRole('button', { name: '+ Adicionar filtro' })).toBeTruthy()
  expect(screen.queryByRole('tab')).toBeNull()
})
it('estado vazio diz quantos registros aparecem', async () => {
  mount({ countPreview: () => Promise.resolve(42), noun: { one: 'composição', other: 'composições' } })
  await act(async () => { vi.advanceTimersByTime(400) })
  expect(screen.getByText('Mostrando todas as 42 composições.')).toBeTruthy()
})
it('rápidos e avançados aparecem na mesma lista, com Onde / e', () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'Tenaris' }) }, { type: 'group', id: 'raiz', logic: 'and', items: [c('valor', 'gt', { value: 1000 })] }) })
  expect(rows().map((g) => g.getAttribute('aria-label'))).toEqual(['Cliente contém Tenaris', 'Valor total maior que 1.000'])
  expect(screen.getByText('Onde')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Trocar para ou' })).toBeTruthy()
})
it('abrir sem mexer deixa o primário desabilitado', () => {
  mount({ value: com({}, { type: 'group', id: 'raiz', logic: 'and', items: [c('valor', 'gt', { value: 1 })] }) })
  expect((screen.getByRole('button', { name: /^Mostrar/ }) as HTMLButtonElement).disabled).toBe(true)
})
it('adicionar filtro e aplicar grava no formato de sempre', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'x' }) }) })
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar filtro' }))
  fireEvent.click(option(/Valor total/))
  // O editor do valor já abre na linha nova.
  fireEvent.change(screen.getByRole('textbox', { name: 'Valor de Valor total', hidden: true }), { target: { value: '500' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Remover filtro' })[0]) // remove a 1ª (cliente)
  show()
  expect(p.onApply).toHaveBeenCalledWith({ quick: { valor: expect.objectContaining({ op: 'eq', value: 500 }) }, advanced: emptyFilters().advanced })
})
it('filtro sem valor avisa no rodapé', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar filtro' }))
  fireEvent.click(option(/Cliente/))
  expect(screen.getByText('1 filtro sem valor não entra')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'escolha um valor' })).toBeTruthy()
})
it('e/ou alterna a lógica da raiz', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }), valor: c('valor', 'gt', { value: 1 }) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Trocar para ou' }))
  expect(screen.getByRole('button', { name: 'Trocar para e' })).toBeTruthy()
  show()
  expect(p.onApply.mock.calls[0][0]).toMatchObject({ quick: {}, advanced: { logic: 'or' } })
})
it('colocar num grupo embrulha a linha num grupo ou', () => {
  const p = mount({ value: com({ valor: c('valor', 'gt', { value: 1 }) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações do filtro' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar num grupo', hidden: true }))
  fireEvent.click(option(/Cliente/))
  expect(screen.getByRole('button', { name: 'Remover grupo' })).toBeTruthy()
  expect(screen.getAllByRole('button', { name: '+ Adicionar grupo' })).toHaveLength(1) // só na raiz
  expect(screen.getByRole('button', { name: '+ Filtro' })).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: 'Texto de Cliente', hidden: true }), { target: { value: 'Tenaris' } })
  show()
  expect(p.onApply.mock.calls[0][0]).toMatchObject({ quick: {}, advanced: { id: 'raiz', logic: 'or', items: [{ field: 'valor' }, { field: 'cliente' }] } })
})
it('dentro do grupo não há outro grupo; remover o último filtro tira o grupo', () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }, { type: 'group', id: 'raiz', logic: 'or', items: [c('valor', 'gt', { value: 1 }), c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] })] }) })
  const valor = rows().find((r) => r.getAttribute('aria-label')?.startsWith('Valor'))!
  fireEvent.click(valor.querySelector('[aria-label="Mais ações do filtro"]')!)
  expect(screen.queryByRole('menuitem', { name: 'Colocar num grupo', hidden: true })).toBeNull()
  fireEvent.keyDown(valor, { key: 'Delete' })
  const status = rows().find((r) => r.getAttribute('aria-label')?.startsWith('Status'))!
  fireEvent.keyDown(status, { key: 'Delete' })
  expect(screen.queryByRole('button', { name: 'Remover grupo' })).toBeNull()
})
it('Del remove a linha e leva o foco para a seguinte', () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }), valor: c('valor', 'gt', { value: 1 }) }) })
  fireEvent.keyDown(rows()[0], { key: 'Delete' })
  expect(rows()).toHaveLength(1)
  expect(document.activeElement).toBe(rows()[0])
})
it('condição só leitura fica no topo com Sempre; × só com onRemoveLocked', () => {
  const onRemoveLocked = vi.fn()
  mount({ locked: [{ id: 'l1', label: 'Região da origem é Sul', reason: 'Não editável aqui' }], onRemoveLocked })
  expect(screen.queryByText('Nenhum filtro')).toBeNull()
  expect(screen.getByText('Sempre')).toBeTruthy()
  expect(screen.getByText('Região da origem é Sul')).toBeTruthy()
  expect(screen.getByRole('img', { name: 'Não editável aqui' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remover condição da visão' }))
  expect(onRemoveLocked).toHaveBeenCalledWith('l1')
  cleanup()
  mount({ locked: [{ id: 'l1', label: 'Região da origem é Sul' }] })
  expect(screen.queryByRole('button', { name: 'Remover condição da visão' })).toBeNull()
  cleanup()
  mount({ locked: [{ id: 'n1', label: 'Origem da visão', removable: false }], onRemoveLocked })
  expect(screen.queryByRole('button', { name: 'Remover condição da visão' })).toBeNull()
})
it('Limpar esvazia o rascunho e mantém as condições só leitura', () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }), locked: [{ id: 'l1', label: 'Região é Sul' }] })
  fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))
  expect(rows()).toHaveLength(0)
  expect(screen.getByText('Região é Sul')).toBeTruthy()
})
it('aviso de visão alterada e Restaurar', () => {
  const saved = com({ cliente: c('cliente', 'contains', { value: 'Tenaris' }) })
  mount({ value: saved, saved })
  expect(screen.queryByText('Filtros diferentes da visão salva')).toBeNull()
  fireEvent.keyDown(rows()[0], { key: 'Delete' })
  expect(screen.getByText('Filtros diferentes da visão salva')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
  expect(screen.queryByText('Filtros diferentes da visão salva')).toBeNull()
  expect(rows()).toHaveLength(1)
})
it('contagem no primário com o substantivo; o número antigo esmaece no recálculo', async () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }), countPreview: () => Promise.resolve(42), noun: { one: 'composição', other: 'composições' } })
  await act(async () => { vi.advanceTimersByTime(400) })
  expect(screen.getByRole('button', { name: 'Mostrar 42 composições' })).toBeTruthy()
  fireEvent.keyDown(rows()[0], { key: 'Delete' })
  expect(screen.getByText('Mostrar 42 composições').className).toContain('is-stale')
})
it('sem contagem, o primário diz Mostrar resultados', () => {
  mount()
  expect(screen.getByRole('button', { name: 'Mostrar resultados' })).toBeTruthy()
})
it('Esc sem mudança fecha; com mudança pede confirmação', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }) })
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(p.onClose).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(rows()[0], { key: 'Delete' })
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(p.onClose).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Descartar alterações?')).toBeTruthy()
})
it('Esc no seletor de campo fecha só o seletor', () => {
  const p = mount()
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar filtro' }))
  fireEvent.keyDown(screen.getByPlaceholderText('Buscar campo…'), { key: 'Escape' })
  expect(screen.queryByPlaceholderText('Buscar campo…')).toBeNull()
  expect(p.onClose).not.toHaveBeenCalled()
})
it('Ctrl+Enter aplica', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro' }))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true })
  expect(p.onApply).toHaveBeenCalledWith(com({}))
})
it('o × anima a saída e só então tira a linha', () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro' }), { detail: 1 })
  expect(rows()[0].closest('li')?.className).toContain('is-leaving')
  act(() => { vi.advanceTimersByTime(120) })
  expect(screen.getByText('Nenhum filtro')).toBeTruthy()
})
it('três níveis de grupo não aplicam (o gravado cortaria o subgrupo)', () => {
  const value = com({ status: c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] }) }, { type: 'group', id: 'raiz', logic: 'or', items: [c('cliente', 'contains', { value: 'x' }), { type: 'group', id: 'g2', logic: 'and', items: [c('valor', 'gt', { value: 1 })] }] })
  const p = mount({ value })
  fireEvent.click(screen.getAllByRole('button', { name: 'Mais ações do filtro' })[0])
  fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar', hidden: true }))
  expect(screen.getByRole('alert').textContent).toMatch(/Grupos demais/)
  expect((screen.getByRole('button', { name: /^Mostrar/ }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true })
  expect(p.onApply).not.toHaveBeenCalled()
})
it('Ctrl+Enter no campo do valor aplica', () => {
  const p = mount()
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar filtro' }))
  fireEvent.click(option(/Cliente/))
  const input = screen.getByRole('textbox', { name: 'Texto de Cliente', hidden: true })
  fireEvent.change(input, { target: { value: 'Tenaris' } })
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  expect(p.onApply).toHaveBeenCalledWith(com({ cliente: expect.objectContaining({ value: 'Tenaris' }) }))
})
it('remover grupo leva o foco à linha seguinte', () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }, { type: 'group', id: 'raiz', logic: 'and', items: [{ type: 'group', id: 'g1', logic: 'or', items: [c('valor', 'gt', { value: 1 })] }, c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] })] }) })
  fireEvent.click(screen.getByRole('button', { name: 'Remover grupo' }))
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Status é um de Pendente')
})
