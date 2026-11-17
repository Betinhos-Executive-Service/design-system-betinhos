// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AlertCard } from './AlertCard'
import { DeltaBadge, StatCard, sparklinePaths } from './StatCard'

afterEach(cleanup)

it('selo: cor pelo favorável, seta e "favorável/desfavorável" no texto (nunca só cor)', () => {
  const { container } = render(<>
    <DeltaBadge trend="up">+78,1%</DeltaBadge>
    <DeltaBadge trend="down">−3,1%</DeltaBadge>
    <DeltaBadge trend="down" tone="positive">−12,0%</DeltaBadge>
    <DeltaBadge>62%</DeltaBadge>
  </>)
  const [sobe, cai, quedaBoa, proporcao] = Array.from(container.querySelectorAll('.bt-delta'))
  expect(sobe.className).toContain('bt-delta--positive')
  expect(sobe.textContent).toBe('+78,1%, favorável')
  expect(cai.className).toContain('bt-delta--negative')
  expect(cai.textContent).toBe('−3,1%, desfavorável')
  expect(quedaBoa.className).toContain('bt-delta--positive')
  expect(quedaBoa.querySelector('svg')).not.toBeNull()
  expect(proporcao.className).toContain('bt-delta--neutral')
  expect(proporcao.querySelector('svg')).toBeNull()
  expect(proporcao.textContent).toBe('62%')
})

it('sparkline: precisa de dois pontos; série constante fica no meio', () => {
  expect(sparklinePaths([])).toBeNull()
  expect(sparklinePaths([5])).toBeNull()
  expect(sparklinePaths([1, Number.NaN])).toBeNull()
  expect(sparklinePaths([3, 3])?.line).toBe('M0 14 L100 14')
  // Ponto sem dado no meio não desloca os outros no eixo do tempo.
  expect(sparklinePaths([0, Number.NaN, 10])).toEqual({ line: 'M0 26 L100 2', area: 'M0 26 L100 2 L100 28 L0 28 Z' })
  expect(sparklinePaths([Number.NaN, 0, 10])?.area).toBe('M50 26 L100 2 L100 28 L50 28 Z')
  const p = sparklinePaths([0, 10])!
  expect(p.line).toBe('M0 26 L100 2')
  expect(p.area).toBe('M0 26 L100 2 L100 28 L0 28 Z')
})

it('sempre quatro trilhas (subgrid), mesmo sem extras nem sparkline', () => {
  const { container } = render(<StatCard label="Ticket médio" value="R$ 1.557" />)
  expect(container.querySelector('.bt-stat')!.children).toHaveLength(4)
  expect(container.querySelector('.bt-spark')).toBeNull()
})

it('valor null vira "s/dado", sem selo', () => {
  render(<StatCard label="Inadimplência" value={null} delta={<DeltaBadge trend="up">+1%</DeltaBadge>} hint="Contas a receber não respondeu" progress={{ value: 40, label: 'Meta' }} trend={[1, 2]} />)
  const valor = screen.getByText('s/dado')
  expect(valor.className).toContain('bt-stat__value--empty')
  expect(document.querySelector('.bt-delta, .bt-progress, .bt-spark')).toBeNull()
  expect(screen.getByText('Contas a receber não respondeu')).toBeTruthy()
})

it('card nomeado pelo rótulo; barra de meta com rótulo e total', () => {
  render(<StatCard label="Meta do mês" value="R$ 2,00M" delta={<DeltaBadge>62%</DeltaBadge>} progress={{ value: 62, label: 'Meta', valueLabel: 'R$ 3,20M' }} trend={[1, 2, 3]} />)
  expect(screen.getByRole('article', { name: 'Meta do mês' })).toBeTruthy()
  const barra = screen.getByRole('progressbar', { name: 'Meta' })
  expect(barra.getAttribute('aria-valuenow')).toBe('62')
  expect(screen.getByText('R$ 3,20M')).toBeTruthy()
  expect(document.querySelector('.bt-spark--info')).not.toBeNull()
})

it('drill-down: chevron "<rótulo>: Ver detalhes" chama onOpen; sem onOpen não há botão', () => {
  const onOpen = vi.fn()
  const { rerender } = render(<StatCard label="Faturamento" value="R$ 2,00M" onOpen={onOpen} />)
  const botao = screen.getByRole('button', { name: 'Faturamento: Ver detalhes' })
  fireEvent.click(botao)
  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.bt-stat--open')).not.toBeNull()
  rerender(<StatCard label="Faturamento" value="R$ 2,00M" openLabel="Abrir Financeiro" onOpen={onOpen} />)
  expect(screen.getByRole('button', { name: 'Faturamento: Abrir Financeiro' })).toBeTruthy()
  rerender(<StatCard label="Faturamento" value="R$ 2,00M" />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('carregando: barras no lugar do valor, sem selo nem sparkline', () => {
  const { container } = render(<StatCard label="Serviços" value="1.284" loading hint="vs 1.325" delta={<DeltaBadge trend="down">−3,1%</DeltaBadge>} trend={[1, 2]} />)
  expect(container.querySelector('.bt-stat')!.getAttribute('aria-busy')).toBe('true')
  expect(container.querySelectorAll('.bt-skeleton')).toHaveLength(2)
  expect(container.querySelector('.bt-delta, .bt-spark')).toBeNull()
  expect(screen.queryByText('1.284')).toBeNull()
})

it('alerta: número no tom, selo com ícone e prefixo "Atenção:" para o leitor de tela', () => {
  const { container } = render(<ul><AlertCard as="li" value="12" label="Serviços sem motorista" status="Resolver hoje" tone="danger" /></ul>)
  const card = container.querySelector('li.bt-alert-card--danger')!
  expect(card).not.toBeNull()
  expect(card.querySelector('.bt-badge--danger svg')).not.toBeNull()
  expect(card.querySelector('.bt-badge')!.textContent).toBe('Atenção: Resolver hoje')
  expect(card.querySelector('.bt-card-open')).toBeNull()
})

it('alerta: sem repetir o prefixo; drill-down só com onOpen', () => {
  const onOpen = vi.fn()
  render(<AlertCard value="0" label="Pendências" status="OK, em dia" tone="success" onOpen={onOpen} />)
  expect(document.querySelector('.bt-badge')!.textContent).toBe('OK, em dia')
  fireEvent.click(screen.getByRole('button', { name: 'Pendências: Ver detalhes' }))
  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.bt-alert-card--open')).not.toBeNull()
})
