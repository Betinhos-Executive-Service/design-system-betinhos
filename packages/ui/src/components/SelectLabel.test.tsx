// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { Select } from './Select'

afterEach(cleanup)
beforeAll(() => {
  window.matchMedia = () => ({ matches: false }) as MediaQueryList
  Element.prototype.scrollIntoView = () => {}
})
const options = [{ value: 'a', label: 'Próprio' }, { value: 'b', label: 'Terceiro' }]

// No navegador, um clique não cancelado dentro de um <label> reativa o gatilho e reabre o painel
// (o jsdom não simula essa ativação, então o teste confere o cancelamento).
it('o clique na opção sai cancelado, para não reabrir o painel dentro de um label', () => {
  const onChange = vi.fn()
  render(<label>Ver como<Select options={options} value="a" onChange={onChange} /></label>)
  fireEvent.click(screen.getByRole('combobox'))
  const opcao = screen.getByRole('option', { name: 'Terceiro', hidden: true })
  expect(fireEvent.click(opcao)).toBe(false)
  expect(onChange).toHaveBeenCalledExactlyOnceWith('b')
  expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false')
})
