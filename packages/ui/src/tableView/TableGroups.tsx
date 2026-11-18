import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Spinner } from '../components/Misc'
import type { RowGroup } from './grouping'
import { icons } from './icons'

export type TableGroupsProps<Row> = {
  /** Saída de `groupRows`, ou grupos montados pela tela quando o agrupamento é no servidor (com `count`, `more`, `loading`, `error`). */
  groups: RowGroup<Row>[]
  /**
   * O que aparece no grupo aberto: a tabela (ou os cartões) só com as linhas dele. Um `Table` com `selection` aqui
   * dentro recebe sozinho `selection.all` (as linhas de todos os grupos, para o lote do clique direito) e
   * `selection.scope` (as do grupo, para o checkbox do cabeçalho marcar só ele); passe-os só para trocar o padrão.
   */
  children: (rows: Row[], group: RowGroup<Row>) => ReactNode
  /** Muda quando o agrupamento muda (campo e período): todos os grupos voltam a fechar. Com `open`, quem fecha é a tela. */
  resetKey: string
  /** A lista ainda está chegando: as contagens aparecem como "…" até a carga terminar. */
  counting?: boolean
  className?: string
  /** Grupos abertos, quando a tela controla (agrupamento no servidor). Sem esta prop, o próprio componente controla. */
  open?: ReadonlySet<string>
  /** Abrir ou fechar um grupo. Com `open`, a tela muda o estado e, ao abrir pela primeira vez, pede a primeira página. */
  onToggle?: (id: string, open: boolean) => void
  /**
   * O fim do grupo aberto chegou perto da tela e `more` é verdadeiro: a tela pede a próxima página. Vale também para a
   * primeira, se o grupo abrir com `more` e sem `loading`; a tela ignora o pedido enquanto uma página do grupo está chegando.
   */
  onLoadMore?: (id: string) => void
  /** "Tentar novamente" depois de um `error`. */
  onRetry?: (id: string) => void
  /** Raiz do observador do fim do grupo (o contêiner que rola). Padrão: a janela. */
  scrollRoot?: Element | null
  /** Texto do grupo aberto sem linhas. Padrão: "Nenhum registro neste grupo". */
  emptyGroup?: ReactNode
}

const count = new Intl.NumberFormat('pt-BR')

/** Linhas da lista agrupada e do grupo aberto: o `Table` dentro do grupo usa como `selection.all` e `selection.scope`. */
export const TableGroupContext = createContext<{ all: unknown[]; scope: unknown[] } | null>(null)

/**
 * Fim do grupo aberto: sentinela da próxima página, "Carregando…", erro com "Tentar novamente" ou o grupo vazio.
 * O sentinela chama `onLoadMore` uma vez por página: uma página nova (mais linhas) arma de novo.
 */
function GroupFoot<Row>({ group, loaded, onLoadMore, onRetry, scrollRoot, emptyGroup }: { group: RowGroup<Row>; loaded: number } & Pick<TableGroupsProps<Row>, 'onLoadMore' | 'onRetry' | 'scrollRoot' | 'emptyGroup'>) {
  const sentinel = useRef<HTMLDivElement>(null)
  const armed = Boolean(onLoadMore && group.more && !group.loading && !group.error)
  const asked = useRef(-1)
  const latest = useRef(onLoadMore)
  latest.current = onLoadMore
  useEffect(() => {
    const node = sentinel.current
    if (!armed || !node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || asked.current === loaded) return
      asked.current = loaded
      latest.current?.(group.id)
    }, { root: scrollRoot ?? null, rootMargin: '200px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [armed, loaded, group.id, scrollRoot])
  const empty = loaded === 0 && !group.more && !group.loading && !group.error
  if (!armed && !group.loading && !group.error && !empty) return null
  return (
    <div className="bt-groups__foot">
      {armed ? <div ref={sentinel} className="bt-groups__sentinel" aria-hidden="true" /> : null}
      {group.loading ? <span className="bt-groups__status" role="status"><Spinner size={16} label={`Carregando ${group.label}`} /><span>Carregando…</span></span> : null}
      {group.error ? (
        <Alert tone="danger" action={onRetry ? <Button variant="secondary" size="compact" onClick={() => onRetry(group.id)}>Tentar novamente</Button> : undefined}>{group.error}</Alert>
      ) : null}
      {empty ? <span className="bt-groups__status" role="status">{emptyGroup ?? 'Nenhum registro neste grupo'}</span> : null}
    </div>
  )
}

/** Grupos da lista (§10.9.1): começam fechados; cada cabeçalho mostra o rótulo e quantas linhas tem e abre só aquele grupo. */
export function TableGroups<Row>({ groups, children, resetKey, counting = false, className, open: openProp, onToggle, onLoadMore, onRetry, scrollRoot, emptyGroup }: TableGroupsProps<Row>) {
  const [state, setState] = useState<{ key: string; open: ReadonlySet<string> }>(() => ({ key: resetKey, open: new Set() }))
  const controlled = openProp !== undefined
  const open = controlled ? openProp : state.key === resetKey ? state.open : new Set<string>()
  const toggle = (id: string) => {
    const opening = !open.has(id)
    if (!controlled) {
      setState((s) => {
        const next = new Set(s.key === resetKey ? s.open : [])
        if (!next.delete(id)) next.add(id)
        return { key: resetKey, open: next }
      })
    }
    onToggle?.(id, opening)
  }

  // Valor estável por grupo: o contexto não força render de quem estiver memoizado dentro.
  const contexts = useMemo(() => {
    const all = groups.flatMap((g) => g.rows)
    return new Map(groups.map((g) => [g.id, { all, scope: g.rows as unknown[] }]))
  }, [groups])

  return (
    <div className={['bt-groups', className].filter(Boolean).join(' ')}>
      {groups.map((group) => {
        const expanded = open.has(group.id)
        const n = group.count ?? group.rows.length
        return (
          <section key={group.id} className={['bt-groups__group', expanded && 'is-open'].filter(Boolean).join(' ')}>
            <button type="button" className="bt-groups__toggle" aria-expanded={expanded} onClick={() => toggle(group.id)}>
              <span className="bt-groups__chevron" aria-hidden="true">{icons.chevronRight}</span>
              <span className="bt-groups__label">{group.label}</span>
              <span className="bt-groups__count" aria-label={counting ? 'contando' : `${count.format(n)} ${n === 1 ? 'linha' : 'linhas'}`}>{counting ? '…' : count.format(n)}</span>
            </button>
            {expanded ? (
              <div className="bt-groups__body">
                {group.rows.length === 0 ? null : (
                  <TableGroupContext.Provider value={contexts.get(group.id) ?? null}>{children(group.rows, group)}</TableGroupContext.Provider>
                )}
                <GroupFoot group={group} loaded={group.rows.length} onLoadMore={onLoadMore} onRetry={onRetry} scrollRoot={scrollRoot} emptyGroup={emptyGroup} />
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
