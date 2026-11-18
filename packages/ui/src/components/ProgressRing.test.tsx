// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ProgressRing } from './ProgressRing'

afterEach(cleanup)

const dash = (container: HTMLElement) => {
  const arc = container.querySelector('.bt-ring__arc')!
  const [filled, total] = arc.getAttribute('stroke-dasharray')!.split(' ').map(Number)
  return { filled, total }
}

it('anel: role img com aria-label de label e caption, tom e texto central', () => {
  const { container } = render(<ProgressRing value={0.12} tone="warn" label="12%" caption="recebido" />)
  const ring = screen.getByRole('img', { name: '12% recebido' })
  expect(ring.className).toContain('bt-ring--warn')
  expect(container.querySelector('.bt-ring__label')?.textContent).toBe('12%')
  expect(container.querySelector('.bt-ring__caption')?.textContent).toBe('recebido')
})

it('anel: aria-label padrão é a porcentagem e pode ser trocado', () => {
  render(<><ProgressRing value={0.5} /><ProgressRing value={0.5} aria-label="Meta batida pela metade" /></>)
  expect(screen.getByRole('img', { name: '50%' })).not.toBeNull()
  expect(screen.getByRole('img', { name: 'Meta batida pela metade' })).not.toBeNull()
})

it('anel: dasharray proporcional ao valor e limitado entre 0 e 1', () => {
  const meio = dash(render(<ProgressRing value={0.5} size={100} />).container)
  expect(meio.filled / meio.total).toBeCloseTo(0.5, 5)
  cleanup()
  const cheio = dash(render(<ProgressRing value={3} />).container)
  expect(cheio.filled).toBeCloseTo(cheio.total, 5)
  cleanup()
  expect(dash(render(<ProgressRing value={-1} />).container).filled).toBe(0)
  cleanup()
  expect(dash(render(<ProgressRing value={Number.NaN} />).container).filled).toBe(0)
})

it('anel: tamanho padrão 150', () => {
  const { container } = render(<ProgressRing value={0.3} />)
  expect(container.querySelector('svg')?.getAttribute('width')).toBe('150')
})
