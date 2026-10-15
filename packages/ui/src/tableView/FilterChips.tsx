import { Button } from '../components/Button'
import { describeCondition, describeGroup, emptyFilters, removeNode, type FilterField, type TableFilters } from './filters'

export type FilterChipsProps = {
  filters: TableFilters
  fields: FilterField[]
  onChange: (filters: TableFilters) => void
  /** O texto do chip reabre onde o filtro foi feito: a célula do filtro rápido ou o painel na condição. */
  onEditQuick?: (key: string) => void
  onEditAdvanced?: (id: string) => void
  /** Chaves (filtro rápido) ou ids (avançado) que a tela não conseguiu aplicar: ícone de alerta e "não aplicado". */
  notApplied?: string[]
}

const X = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
const WARN = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>

/** Faixa de filtros ativos acima da tabela (§10.9.2). Some quando não há filtro. */
export function FilterChips({ filters, fields, onChange, onEditQuick, onEditAdvanced, notApplied = [] }: FilterChipsProps) {
  const chips = [
    ...Object.entries(filters.quick).map(([key, c]) => ({
      id: key, text: describeCondition(c, fields), edit: () => onEditQuick?.(key),
      remove: () => { const quick = { ...filters.quick }; delete quick[key]; onChange({ ...filters, quick }) },
    })),
    ...filters.advanced.items.map((item) => ({
      id: item.id, text: item.type === 'group' ? describeGroup(item, fields) : describeCondition(item, fields), edit: () => onEditAdvanced?.(item.id),
      remove: () => onChange({ ...filters, advanced: removeNode(filters.advanced, item.id) }),
    })),
  ]
  if (!chips.length) return null
  return (
    <div className="bt-chips" role="group" aria-label="Filtros ativos">
      {chips.map((chip) => {
        const broken = notApplied.includes(chip.id)
        return (
          <span key={chip.id} className={broken ? 'bt-chip is-broken' : 'bt-chip'}>
            {broken ? <span className="bt-chip__warn" role="img" aria-label="Filtro não aplicado">{WARN}</span> : null}
            <button type="button" className="bt-chip__text" title={chip.text} onClick={chip.edit}>
              {chip.text}{broken ? <span className="bt-chip__note"> · não aplicado</span> : null}
            </button>
            <button type="button" className="bt-chip__remove" aria-label={`Remover filtro ${chip.text}`} onClick={chip.remove}>{X}</button>
          </span>
        )
      })}
      <Button variant="ghost" size="compact" onClick={() => onChange(emptyFilters())}>Limpar filtros</Button>
    </div>
  )
}
