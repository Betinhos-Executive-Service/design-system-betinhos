import { useCallback, useMemo } from 'react'
import type { TableQuickFilters } from '../components/Table'
import type { LookupSearch } from './FilterEditors'
import { conditionProblem, filtersToFetchXml, readFilters, storedFilters, type FilterCondition, type FilterField, type FilterGroup, type TableFilters } from './filters'
import type { TableViewState } from './useTableView'

/** Colunas com alguma condição valendo (rápida ou avançada): o cabeçalho mostra o funil. */
function filteredKeys(filters: TableFilters, fields: FilterField[]): string[] {
  const map = new Map(fields.map((f) => [f.key, f]))
  const keys = new Set<string>()
  for (const c of Object.values(filters.quick)) if (!conditionProblem(c, map.get(c.field))) keys.add(c.field)
  const walk = (group: FilterGroup) => group.items.forEach((item) => (item.type === 'group' ? walk(item) : !conditionProblem(item, map.get(item.field)) && keys.add(item.field)))
  walk(filters.advanced)
  return [...keys]
}

/**
 * Filtros da lista lidos da visão (§10.9.2): o que a tela passa para a `Table` (`quickFilters`) e o `<filter>` do
 * FetchXML para consultar a fonte. Os filtros moram em `view.config.filters`; mudar qualquer um marca a visão "Alterada".
 */
export function useTableFilters(view: TableViewState, fields: FilterField[], search?: LookupSearch) {
  const filters = useMemo(() => readFilters(view.config.filters, fields), [view.config.filters, fields])
  const setFilters = useCallback((next: TableFilters) => view.setConfig((config) => ({ ...config, filters: storedFilters(next) })), [view])
  const setQuick = useCallback((key: string, condition: FilterCondition | null) => {
    view.setConfig((config) => {
      const current = readFilters(config.filters, fields)
      const quick = { ...current.quick }
      if (condition) quick[key] = condition
      else delete quick[key]
      return { ...config, filters: storedFilters({ ...current, quick }) }
    })
  }, [view, fields])
  const fetchXml = useMemo(() => filtersToFetchXml(filters, fields), [filters, fields])
  const quickFilters: TableQuickFilters = useMemo(() => ({
    fields, value: filters.quick, onChange: setQuick, search, visible: view.quickRow, filtered: filteredKeys(filters, fields),
  }), [fields, filters, setQuick, search, view.quickRow])
  return { filters, setFilters, setQuick, fetchXml, quickFilters }
}
