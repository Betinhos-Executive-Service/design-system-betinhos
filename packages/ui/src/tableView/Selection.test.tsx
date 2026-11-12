import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SINGLE_REASON, SelectionBar, SelectionCommands, selectionMenuActions, type SelectionAction, type ViewBarSelection } from './Selection'

const noop = () => undefined
const actions: SelectionAction[] = [
  { id: 'editar', label: 'Editar', single: true, inline: true, onSelect: noop },
  { id: 'desativar', label: 'Desativar', tone: 'danger', inline: true, blocked: 'Selecione só ativos ou só inativos.', onSelect: noop },
  { id: 'copiar', label: 'Copiar', inline: true, onSelect: noop },
  { id: 'voucher', label: 'Gerar Voucher', inline: true, onSelect: noop },
  { id: 'op', label: 'Gerar OP', onSelect: noop },
]
const sel = (count: number): ViewBarSelection => ({ count, onClear: noop, actions })

describe('selectionMenuActions', () => {
  it('bloqueia o que exige um registro e mostra o motivo embaixo', () => {
    const items = selectionMenuActions(sel(3))
    expect(items.map((i) => [i.id, i.disabled, i.description])).toEqual([
      ['editar', true, SINGLE_REASON],
      ['desativar', true, 'Selecione só ativos ou só inativos.'],
      ['copiar', false, undefined],
      ['voucher', false, undefined],
      ['op', false, undefined],
    ])
  })
  it('com um registro, a ação single fica liberada', () => {
    expect(selectionMenuActions(sel(1))[0].disabled).toBe(false)
  })
  it('não vaza as chaves próprias para o item de menu', () => {
    expect(Object.keys(selectionMenuActions(sel(1))[0])).not.toContain('single')
  })
})

describe('SelectionCommands', () => {
  it('contador com limpar, até maxInline botões e o resto em Ações', () => {
    const out = renderToStaticMarkup(<SelectionCommands selection={sel(3)} maxInline={3} />)
    expect(out).toContain('aria-label="Limpar seleção"')
    expect(out).toContain('3 selecionados')
    expect(out).toContain('>Editar<')
    expect(out).toContain('>Copiar<')
    expect(out).not.toContain('>Gerar Voucher<')
    expect(out).toContain('aria-label="Ações (2)"')
  })
  it('ação inerte continua focável, com aria-disabled e o motivo', () => {
    const out = renderToStaticMarkup(<SelectionCommands selection={sel(3)} maxInline={3} />)
    expect(out).toMatch(/aria-disabled="true"[^>]*title="Selecione exatamente um registro\."/)
    expect(out).not.toMatch(/<button[^>]* disabled=""[^>]*>[^<]*Editar/)
  })
  it('sem resto, sem botão Ações', () => {
    const out = renderToStaticMarkup(<SelectionCommands selection={{ count: 1, onClear: noop, actions: actions.slice(0, 2) }} maxInline={3} />)
    expect(out).not.toContain('Ações (')
  })
  it('rótulo próprio do contador', () => {
    const out = renderToStaticMarkup(<SelectionCommands selection={{ ...sel(1), label: (n) => `${n} serviço` }} maxInline={1} />)
    expect(out).toContain('1 serviço')
  })
})

describe('SelectionBar (celular)', () => {
  it('duas ações na barra e o resto em Mais', () => {
    const out = renderToStaticMarkup(<SelectionBar selection={sel(2)} />)
    expect(out).toContain('bt-selectionbar')
    expect(out).toContain('>Editar<')
    expect(out).toContain('>Desativar<')
    expect(out).not.toContain('>Copiar<')
    expect(out).toContain('Mais ações da seleção (3)')
  })
})
