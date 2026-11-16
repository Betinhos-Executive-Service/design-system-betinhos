// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FilterFieldPicker } from './FilterFieldPicker'
import type { FilterField } from './filters'

const fields: FilterField[] = [
  { key: 'cliente', label: 'Cliente', kind: 'lookup' },
  { key: 'valor', label: 'Valor total', kind: 'number' },
  { key: 'placa', label: 'Placa', kind: 'text', relation: 'Veículo', advancedOnly: true },
]
beforeEach(() => { vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const mount = (onPick = vi.fn(), onClose = vi.fn()) => {
  const anchor = document.createElement('button'); document.body.append(anchor)
  render(<FilterFieldPicker anchor={anchor} fields={fields} onPick={onPick} onClose={onClose} />)
  return { onPick, onClose }
}

it('separa colunas da tabela e outros campos', () => {
  mount()
  expect(screen.getByText('Colunas da tabela')).toBeTruthy()
  expect(screen.getByText('Outros campos')).toBeTruthy()
  expect(screen.getByRole('option', { name: /Placa/, hidden: true }).textContent).toContain('Veículo')
})
it('busca sem acento e escolhe com Enter', () => {
  const { onPick } = mount()
  const input = screen.getByPlaceholderText('Buscar campo…')
  fireEvent.change(input, { target: { value: 'veiculo' } })
  expect(screen.queryByText('Colunas da tabela')).toBeNull()
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onPick).toHaveBeenCalledWith(fields[2])
})
it('setas movem o item ativo e Esc fecha', () => {
  const { onPick, onClose } = mount()
  const input = screen.getByPlaceholderText('Buscar campo…')
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Valor total/, hidden: true }).id)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onPick).toHaveBeenCalledWith(fields[1])
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
it('clique escolhe o campo', () => {
  const { onPick } = mount()
  fireEvent.click(screen.getByRole('option', { name: /Cliente/, hidden: true }))
  expect(onPick).toHaveBeenCalledWith(fields[0])
})
it('no celular abre num Sheet e o Esc no X do Sheet não chega ao painel embaixo', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener() {}, removeEventListener() {} }))
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
  const panel = vi.fn()
  document.addEventListener('keydown', panel)
  mount()
  const close = screen.getAllByRole('button', { hidden: true }).find((b) => b.closest('dialog') && !b.closest('.bt-fpop__sheet'))!
  fireEvent.keyDown(close, { key: 'Escape' })
  document.removeEventListener('keydown', panel)
  expect(panel).not.toHaveBeenCalled()
  expect(screen.getByPlaceholderText('Buscar campo…')).toBeTruthy()
})
