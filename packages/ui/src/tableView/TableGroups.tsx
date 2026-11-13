import { useState, type ReactNode } from 'react'
import type { RowGroup } from './grouping'
import { icons } from './icons'

export type TableGroupsProps<Row> = {
  /** Saída de `groupRows`. */
  groups: RowGroup<Row>[]
  /**
   * O que aparece no grupo aberto: a tabela (ou os cartões) só com as linhas dele. Com seleção, passe à tabela
   * `selection.all` = as linhas de todos os grupos (`groups.flatMap((g) => g.rows)`): sem isso, "Selecionar todas",
   * o Shift e o lote do clique direito só enxergam o grupo, e o "Selecionar todas" troca a seleção dos outros grupos.
   */
  children: (rows: Row[], group: RowGroup<Row>) => ReactNode
  /** Muda quando o agrupamento muda (campo e período): todos os grupos voltam a fechar. */
  resetKey: string
  /** A lista ainda está chegando: as contagens aparecem como "…" até a carga terminar. */
  counting?: boolean
  className?: string
}

const count = new Intl.NumberFormat('pt-BR')

/** Grupos da lista (§10.9.1): começam fechados; cada cabeçalho mostra o rótulo e quantas linhas tem e abre só aquele grupo. */
export function TableGroups<Row>({ groups, children, resetKey, counting = false, className }: TableGroupsProps<Row>) {
  const [state, setState] = useState<{ key: string; open: ReadonlySet<string> }>(() => ({ key: resetKey, open: new Set() }))
  const open = state.key === resetKey ? state.open : new Set<string>()
  const toggle = (id: string) => setState((s) => {
    const next = new Set(s.key === resetKey ? s.open : [])
    if (!next.delete(id)) next.add(id)
    return { key: resetKey, open: next }
  })

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
            {expanded ? <div className="bt-groups__body">{children(group.rows, group)}</div> : null}
          </section>
        )
      })}
    </div>
  )
}
