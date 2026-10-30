import { describe, expect, it } from 'vitest'
import { EMPTY_AUDIT_FILTERS, auditDayLabel, auditFacets, filterAuditEvents, groupAuditByDay, type AuditEvent } from './Audit'

// 30/10/2026 10:00 em São Paulo (UTC-3).
const NOW = new Date('2026-10-30T13:00:00Z')

const events: AuditEvent[] = [
  { id: '1', at: '2026-10-30T12:00:00Z', user: 'Marina Lopes', operation: 'update', record: { id: 'a', name: 'OS 1020' }, changes: [{ field: 'cr40f_status', label: 'Status', before: 'Aberto', after: 'Concluído' }] },
  { id: '2', at: '2026-10-30T02:30:00Z', user: 'João Araújo', operation: 'create', changes: [{ field: 'cr40f_valor', label: 'Valor', before: null, after: 'R$ 120,00' }] },
  { id: '3', at: '2026-10-28T15:00:00Z', user: 'Marina Lopes', operation: 'delete', changes: [] },
  { id: '4', at: '2025-12-31T15:00:00Z', user: 'Ana', operation: 'other', action: 'Compartilhamento', changes: [] },
]

describe('auditDayLabel', () => {
  it('usa o fuso de São Paulo para Hoje e Ontem', () => {
    expect(auditDayLabel('2026-10-30T12:00:00Z', NOW)).toBe('Hoje')
    // 02:30 UTC de 30/10 ainda é 29/10 em São Paulo.
    expect(auditDayLabel('2026-10-30T02:30:00Z', NOW)).toBe('Ontem')
  })
  it('mostra o dia por extenso e o ano só quando muda', () => {
    expect(auditDayLabel('2026-10-28T15:00:00Z', NOW)).toBe('28 de outubro')
    expect(auditDayLabel('2025-12-31T15:00:00Z', NOW)).toBe('31 de dezembro de 2025')
  })
})

it('agrupa por dia mantendo a ordem', () => {
  expect(groupAuditByDay(events, NOW).map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
    ['Hoje', ['1']], ['Ontem', ['2']], ['28 de outubro', ['3']], ['31 de dezembro de 2025', ['4']],
  ])
})

describe('filterAuditEvents', () => {
  it('sem filtro devolve tudo', () => {
    expect(filterAuditEvents(events, EMPTY_AUDIT_FILTERS)).toHaveLength(4)
  })
  it('busca sem acento em usuário, registro, campo e valores', () => {
    const ids = (query: string) => filterAuditEvents(events, { ...EMPTY_AUDIT_FILTERS, query }).map((e) => e.id)
    expect(ids('concluido')).toEqual(['1'])
    expect(ids('joao 120')).toEqual(['2'])
    expect(ids('os 1020')).toEqual(['1'])
    expect(ids('compartilhamento')).toEqual(['4'])
  })
  it('combina usuário, campo e operação', () => {
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTERS, user: 'Marina Lopes' }).map((e) => e.id)).toEqual(['1', '3'])
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTERS, user: 'Marina Lopes', operation: 'delete' }).map((e) => e.id)).toEqual(['3'])
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTERS, field: 'cr40f_valor' }).map((e) => e.id)).toEqual(['2'])
  })
})

it('tira usuários e campos únicos em ordem alfabética', () => {
  const facets = auditFacets(events)
  expect(facets.users.map((o) => o.value)).toEqual(['Ana', 'João Araújo', 'Marina Lopes'])
  expect(facets.fields).toEqual([{ value: 'cr40f_status', label: 'Status' }, { value: 'cr40f_valor', label: 'Valor' }])
})
