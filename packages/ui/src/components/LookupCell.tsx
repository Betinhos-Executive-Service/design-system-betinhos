import { createContext, useContext, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

/** Quem abre o registro de uma tabela (o shell escolhe o drawer). `canOpen` diz se há destino e permissão para a tabela. */
export type RecordOpener = {
  onOpenRecord: (table: string, id: string) => void
  canOpen?: (table: string) => boolean
}

const RecordOpenContext = createContext<RecordOpener | null>(null)

/** Liga todos os `LookupCell` abaixo dele a um só lugar que sabe abrir registros (§10.9.7). Sem ele, a célula só mostra o texto. */
export function RecordOpenProvider({ value, children }: { value: RecordOpener | null; children: ReactNode }) {
  return <RecordOpenContext.Provider value={value}>{children}</RecordOpenContext.Provider>
}

export const useRecordOpener = () => useContext(RecordOpenContext)

export type LookupCellProps = {
  /** Nome lógico da tabela do registro apontado (ex.: `cr40f_clientes`). */
  table: string
  /** Id do registro; vazio deixa só o texto. */
  id: string | null | undefined
  /** Texto do lookup (o nome do registro). Vazio mostra o traço. */
  children: ReactNode
  /** Substitui o abridor do `RecordOpenProvider`. */
  onOpenRecord?: (table: string, id: string) => void
  /** `false` (sem permissão ou sem drawer) deixa só o texto. Padrão: o `canOpen` do provedor, ou `true`. */
  canOpen?: boolean
}

/**
 * Célula de lookup clicável (§10.9.7): texto como link sutil que abre o registro sem navegar. O clique e o Enter param
 * ali (a linha não seleciona nem abre); sem destino, sem id ou sem permissão vira texto comum.
 */
export function LookupCell({ table, id, children, onOpenRecord, canOpen }: LookupCellProps) {
  const opener = useRecordOpener()
  const open = onOpenRecord ?? opener?.onOpenRecord
  const allowed = canOpen ?? opener?.canOpen?.(table) ?? true
  const empty = children === null || children === undefined || children === '' || children === false
  if (empty) return <span className="bt-lookup bt-lookup--empty">—</span>
  if (!open || !allowed || !id) return <span className="bt-lookup">{children}</span>

  const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation()
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined
  return (
    <button
      type="button"
      className="bt-lookup bt-lookup--link"
      title={text}
      aria-label={text ? `Abrir ${text}` : undefined}
      onClick={(event) => { stop(event); open(table, id) }}
      // Enter e espaço já disparam o clique do botão; a linha só não pode tratá-los como "abrir a linha".
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') stop(event) }}
      onDoubleClick={stop}
    >
      {children}
    </button>
  )
}
