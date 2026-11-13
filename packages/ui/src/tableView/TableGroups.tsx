import { createContext, useMemo, useState, type ReactNode } from 'react'
import type { RowGroup } from './grouping'
import { icons } from './icons'

export type TableGroupsProps<Row> = {
  /** Saída de `groupRows`. */
  groups: RowGroup<Row>[]
  /**
   * O que aparece no grupo aberto: a tabela (ou os cartões) só com as linhas dele. Um `Table` com `selection` aqui
   * dentro recebe sozinho `selection.all` (as linhas de todos os grupos, para o lote do clique direito) e
   * `selection.scope` (as do grupo, para o checkbox do cabeçalho marcar só ele); passe-os só para trocar o padrão.
   */
  children: (rows: Row[], group: RowGroup<Row>) => ReactNode
  /** Muda quando o agrupamento muda (campo e período): todos os grupos voltam a fechar. */
  resetKey: string
  /** A lista ainda está chegando: as contagens aparecem como "…" até a carga terminar. */
  counting?: boolean
  className?: string
}

const count = new Intl.NumberFormat('pt-BR')

/** Linhas da lista agrupada e do grupo aberto: o `Table` dentro do grupo usa como `selection.all` e `selection.scope`. */
export const TableGroupContext = createContext<{ all: unknown[]; scope: unknown[] } | null>(null)

/** Grupos da lista (§10.9.1): começam fechados; cada cabeçalho mostra o rótulo e quantas linhas tem e abre só aquele grupo. */
export function TableGroups<Row>({ groups, children, resetKey, counting = false, className }: TableGroupsProps<Row>) {
  const [state, setState] = useState<{ key: string; open: ReadonlySet<string> }>(() => ({ key: resetKey, open: new Set() }))
  const open = state.key === resetKey ? state.open : new Set<string>()
  const toggle = (id: string) => setState((s) => {
    const next = new Set(s.key === resetKey ? s.open : [])
    if (!next.delete(id)) next.add(id)
    return { key: resetKey, open: next }
  })

  // Valor estável por grupo: o contexto não força render de quem estiver memoizado dentro.
  const contexts = useMemo(() => {
    const all = groups.flatMap((g) => g.rows)
    return new Map(groups.map((g) => [g.id, { all, scope: g.rows as unknown[] }]))
  }, [groups])

  return (
    <div className={['bt-groups', className].filter(Boolean).join(' ')}>
      {groups.map((group) => {
        const expanded = open.has(group.id)
        const n = group.rows.length
        return (
          <section key={group.id} className={['bt-groups__group', expanded && 'is-open'].filter(Boolean).join(' ')}>
            <button type="button" className="bt-groups__toggle" aria-expanded={expanded} onClick={() => toggle(group.id)}>
              <span className="bt-groups__chevron" aria-hidden="true">{icons.chevronRight}</span>
              <span className="bt-groups__label">{group.label}</span>
              <span className="bt-groups__count" aria-label={counting ? 'contando' : `${n} ${n === 1 ? 'linha' : 'linhas'}`}>{counting ? '…' : count.format(n)}</span>
            </button>
            {expanded ? (
              <div className="bt-groups__body">
                <TableGroupContext.Provider value={contexts.get(group.id) ?? null}>{children(group.rows, group)}</TableGroupContext.Provider>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
