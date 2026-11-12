import { useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { icons } from '../tableView/icons'
import { Button } from './Button'
import { Spinner, Tooltip } from './Misc'

/** Andamento da gravação de uma célula, controlado pela tela (§10.9.5). */
export type TableCellStatus =
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; message: string; onRetry?: () => void }

/** O que o editor recebe: o rascunho e como gravar ou desistir. */
export type TableEditorProps<Draft> = {
  draft: Draft
  setDraft: (draft: Draft) => void
  /** Grava já, com `draft` dado ou com o rascunho atual. Para escolhas que valem no clique (Select, Switch). */
  commit: (draft?: Draft) => void
  /** Sai da edição sem gravar e devolve o foco à célula. */
  cancel: () => void
  /** Mensagem do último `commit` recusado; o editor marca o campo como inválido. */
  error: string | null
  /** Nome da coluna, para o `aria-label` do controle. */
  label: string
}

/**
 * Edição na célula (grade editável, §10.9.5). Enter, F2 ou duplo clique abrem; Enter (Ctrl+Enter no textarea), Tab e sair
 * da célula gravam; Esc desiste. A gravação é da tela: `commit` só decide se o rascunho vale, e o andamento volta por `cellStatus`.
 */
export type TableCellEdit<Row, Draft> = {
  /** Rascunho ao abrir. `typed` é a tecla que abriu a edição (com `typing`). */
  start: (row: Row, typed?: string) => Draft
  editor: (row: Row, props: TableEditorProps<Draft>) => ReactNode
  /** Grava o rascunho. Um texto recusa: a edição continua aberta com a mensagem. Qualquer outro retorno fecha. */
  commit: (row: Row, draft: Draft) => string | void
  /** `false` deixa a célula só leitura nesta linha, com o cadeado. Padrão: editável. */
  enabled?: (row: Row) => boolean
  /** Digitar uma letra com a célula focada abre a edição com ela. Para editores de texto. */
  typing?: boolean
}

type Props<Row> = {
  row: Row
  label: string
  edit?: TableCellEdit<Row, unknown>
  /** Coluna só leitura na grade editável: `true` ou o motivo, mostrado no cadeado. */
  readOnly?: boolean | string
  status?: TableCellStatus | null
  role: string
  className: string
  style?: CSSProperties
  /** Entrou em edição: a tabela seleciona a linha. */
  onBegin: () => void
  children: ReactNode
}

const cellsOf = (row: Element) => Array.from(row.children).filter((child) => child.getAttribute('role') === 'gridcell')
const POPOVER = '.bt-select-panel, [role="listbox"], [role="dialog"], [role="menu"]'

/** Foca a célula; a que não é focável entrega o foco ao controle de dentro. */
function focusCell(target: Element | undefined) {
  if (!(target instanceof HTMLElement)) return
  if (target.hasAttribute('tabindex')) target.focus()
  else target.querySelector<HTMLElement>('button, input, [tabindex]')?.focus()
}

/** Setas: a célula vizinha na mesma coluna (cima e baixo, pulando espaçadores) ou na mesma linha. */
export function moveCellFocus(from: HTMLElement, rows: number, columns: number) {
  const row = from.closest('[role="row"]')
  if (!row) return
  const index = cellsOf(row).indexOf(from)
  let target: Element | null = row
  if (rows !== 0) {
    target = rows > 0 ? row.nextElementSibling : row.previousElementSibling
    while (target && target.getAttribute('role') !== 'row') target = rows > 0 ? target.nextElementSibling : target.previousElementSibling
  }
  if (target) focusCell(cellsOf(target)[index + columns])
}

/** Próxima (ou anterior) célula editável da mesma linha. */
function siblingEditable(from: HTMLElement, step: 1 | -1) {
  let next = step > 0 ? from.nextElementSibling : from.previousElementSibling
  while (next && !next.matches('.bt-table__cell--editable')) next = step > 0 ? next.nextElementSibling : next.previousElementSibling
  return next instanceof HTMLElement ? next : null
}

/** Enter grava em campo de uma linha; no textarea, só com Ctrl/⌘ (Enter sozinho quebra a linha). Em botões (gatilho do Select), não. */
function enterCommits(event: KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement
  if (target instanceof HTMLTextAreaElement) return event.ctrlKey || event.metaKey
  return target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio'
}

/**
 * Célula de grade (`role="gridcell"`) focável, com setas entre células. Com `edit`, abre o editor na própria célula e
 * mostra o andamento da gravação: gravando, salvo (pisca em verde) e erro (barra vermelha, mensagem e "Tentar de novo").
 */
export function TableGridCell<Row>({ row, label, edit, readOnly, status, role, className, style, onBegin, children }: Props<Row>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const describedBy = useId()
  const editingRef = useRef(false)
  const draftRef = useRef<unknown>(undefined)
  const [editing, setEditingState] = useState(false)
  const [draft, setDraftState] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const canEdit = Boolean(edit) && (edit?.enabled?.(row) ?? true)
  const locked = !canEdit && (Boolean(readOnly) || Boolean(edit))
  const hint = typeof readOnly === 'string' ? readOnly : null
  const saving = status?.state === 'saving'
  const message = error ?? (status?.state === 'error' ? status.message : null)
  const state = message ? 'error' : status?.state ?? null

  const setEditing = (value: boolean) => { editingRef.current = value; setEditingState(value) }
  const setDraft = (value: unknown) => { draftRef.current = value; setDraftState(value) }

  // Depois de gravar ou desistir: se o foco caiu no corpo da página (o controle saiu), volta à célula; se o usuário foi para outra, fica lá.
  const restoreFocus = () => {
    window.setTimeout(() => {
      const active = document.activeElement
      if (!active || active === document.body || rootRef.current?.contains(active)) rootRef.current?.focus()
    }, 0)
  }

  const begin = (typed?: string) => {
    if (!edit || !canEdit || editingRef.current || saving) return
    setError(null)
    setDraft(edit.start(row, typed))
    onBegin()
    setEditing(true)
  }

  useEffect(() => {
    if (!editing) return
    const control = rootRef.current?.querySelector<HTMLElement>('.bt-table__editor :is(input, textarea, select, button, [tabindex]:not([tabindex="-1"]))')
    if (!control) return
    control.focus()
    // O cursor vai para o fim do texto (o caractere digitado não fica selecionado).
    if ((control instanceof HTMLInputElement && control.type === 'text') || control instanceof HTMLTextAreaElement) control.setSelectionRange(control.value.length, control.value.length)
  }, [editing])

  /** Grava o rascunho; `false` quando `commit` recusou e a edição continua aberta. */
  const confirm = (value: unknown = draftRef.current): boolean => {
    if (!edit || !editingRef.current) return true
    const result = edit.commit(row, value)
    if (typeof result === 'string') { setError(result); return false }
    setError(null)
    setEditing(false)
    return true
  }
  const cancel = () => { setError(null); setEditing(false); restoreFocus() }

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // O Select consome o Esc no gatilho: na captura, Esc sempre desiste da edição inteira.
    if (editingRef.current && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    const root = event.currentTarget
    if (editingRef.current) {
      if (event.key === 'Tab') {
        event.preventDefault()
        if (!confirm()) return
        const next = siblingEditable(root, event.shiftKey ? -1 : 1)
        if (next) next.focus()
        else restoreFocus()
      } else if (event.key === 'Enter' && enterCommits(event)) {
        event.preventDefault()
        if (confirm()) restoreFocus()
      }
      return
    }
    if (event.target !== root) return
    const move = (rows: number, columns: number) => { event.preventDefault(); moveCellFocus(root, rows, columns) }
    switch (event.key) {
      case 'ArrowUp': return move(-1, 0)
      case 'ArrowDown': return move(1, 0)
      case 'ArrowLeft': return move(0, -1)
      case 'ArrowRight': return move(0, 1)
      case 'Enter': case 'F2':
        if (canEdit) { event.preventDefault(); event.stopPropagation(); begin(); return }
        // Célula sem edição com link ou botão (ex.: o "abrir" da coluna-título): Enter aciona o controle.
        if (event.key === 'Enter') {
          const control = root.querySelector<HTMLElement>('button, a[href]')
          if (control) { event.preventDefault(); event.stopPropagation(); control.click() }
        }
        return
      default:
        if (canEdit && edit?.typing && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          // A tecla entra como rascunho; sem isso o navegador a digitaria de novo no campo recém-aberto.
          event.preventDefault()
          begin(event.key)
        }
    }
  }
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!editingRef.current) return
    const next = event.relatedTarget
    if (next instanceof Node && (event.currentTarget.contains(next) || (next instanceof Element && next.closest(POPOVER)))) return
    confirm()
  }

  const classes = [className, 'bt-table__cell--grid', canEdit && 'bt-table__cell--editable', locked && 'bt-table__cell--readonly', editing && 'bt-table__cell--editing', state && `is-${state}`].filter(Boolean).join(' ')
  const focusable = Boolean(edit || readOnly)

  return (
    <div
      ref={rootRef}
      role={role}
      className={classes}
      style={style}
      tabIndex={focusable ? 0 : -1}
      aria-busy={saving || undefined}
      aria-invalid={message ? true : undefined}
      aria-describedby={message ? describedBy : undefined}
      aria-readonly={locked || undefined}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      onDoubleClick={canEdit ? () => begin() : undefined}
      onBlur={onBlur}
    >
      {editing && edit ? (
        <div className="bt-table__editor">{edit.editor(row, { draft, setDraft, commit: (...value: [unknown?]) => { if (confirm(value.length ? value[0] : draftRef.current)) restoreFocus() }, cancel, error, label })}</div>
      ) : <span className="bt-table__value">{children}</span>}
      {!editing && status?.state === 'saving' ? <span className="bt-table__mark"><Spinner size={12} label="Gravando" /></span> : null}
      {!editing && status?.state === 'saved' ? <span className="bt-table__mark" role="img" aria-label="Salvo">{icons.check}</span> : null}
      {message ? (
        <>
          <Tooltip text={message} placement="bottom"><span className="bt-table__mark">{alertIcon}</span></Tooltip>
          <span id={describedBy} className="bt-table__live">Erro: {message}</span>
        </>
      ) : null}
      {!editing && status?.state === 'error' && status.onRetry ? <Button variant="ghost" size="compact" onClick={status.onRetry}>Tentar de novo</Button> : null}
      {locked && !message ? <span className="bt-table__mark bt-table__lock" role="img" aria-label={hint ? `Somente leitura. ${hint}` : 'Somente leitura'} title={hint ?? undefined}>{icons.lock}</span> : null}
    </div>
  )
}

const alertIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
