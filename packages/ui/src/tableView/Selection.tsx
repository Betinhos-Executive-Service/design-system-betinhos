import { useEffect, useId, useRef } from 'react'
import { Button } from '../components/Button'
import { Menu, type MenuAction } from '../components/Menu'
import { icons } from './icons'

/** Ação sobre as linhas marcadas (§10.9.6). A mesma lista alimenta a linha de comando, o menu ⋮, a barra do celular e o clique direito. */
export type SelectionAction = Omit<MenuAction, 'disabled' | 'title' | 'description'> & {
  /** Rótulo em texto puro: vai para o botão, para o `aria-label` e para o menu. */
  label: string
  /** Só vale com exatamente um registro marcado; com mais, fica inerte com "Selecione exatamente um registro.". */
  single?: boolean
  /** Motivo de a ação estar inerte agora (ex.: "Selecione só ativos ou só inativos."). Vazio = liberada. */
  blocked?: string | null
  /** Botão na linha de comando enquanto couber (2 na barra do celular); o que não couber e o que não é `inline` ficam no ⋮. */
  inline?: boolean
}

export type ViewBarSelection = {
  /** Quantos registros estão marcados. Com 0 a linha de comando volta ao normal. */
  count: number
  /** "✕": desmarca tudo. */
  onClear: () => void
  actions: SelectionAction[]
  /** Texto do contador; padrão "1 selecionado" / "N selecionados". */
  label?: (count: number) => string
}

export const SINGLE_REASON = 'Selecione exatamente um registro.'
export const countLabel = (selection: Pick<ViewBarSelection, 'count' | 'label'>) => selection.label?.(selection.count) ?? (selection.count === 1 ? '1 selecionado' : `${selection.count} selecionados`)

/** Motivo de a ação estar inerte com esta seleção, ou `null`. */
export function selectionBlock(action: SelectionAction, count: number): string | null {
  if (action.blocked) return action.blocked
  if (action.single && count !== 1) return SINGLE_REASON
  return null
}

/** As ações da seleção como itens de menu, com o motivo embaixo do item inerte. Use no `ContextMenu`/`rowActions` (§10.9.3). */
export function selectionMenuActions(selection: Pick<ViewBarSelection, 'count' | 'actions'>): MenuAction[] {
  return selection.actions.map(({ single: _single, blocked: _blocked, inline: _inline, ...action }, index) => {
    const reason = selectionBlock(selection.actions[index], selection.count)
    return { ...action, disabled: reason != null, description: reason ?? undefined }
  })
}

type ButtonSize = 'default' | 'touch'

function SelectionButton({ action, count, size, compact = false, hidden = false, ghost = false }: { action: SelectionAction; count: number; size: ButtonSize; compact?: boolean; hidden?: boolean; ghost?: boolean }) {
  const reason = selectionBlock(action, count)
  const reasonId = useId()
  const danger = action.tone === 'danger'
  // Na superfície do ViewBar (desktop) a ação é ghost; o CSS de lá pinta o ícone da perigosa.
  const variant = ghost ? 'ghost' : danger ? 'danger' : 'secondary'
  const className = [compact && 'is-compact', danger && 'bt-selection__danger'].filter(Boolean).join(' ') || undefined
  // title: sem espaço o botão vira só ícone e o nome aparece no hover; o rótulo continua como nome acessível.
  if (reason == null) return <Button variant={variant} size={size} icon={action.icon} className={className} hidden={hidden} data-vb={`sel:${action.id}`} title={action.label} onClick={action.onSelect}>{action.label}</Button>
  // aria-disabled (não disabled): continua focável, o leitor de tela lê o motivo e o clique não faz nada.
  return (
    <>
      <Button variant={variant} size={size} icon={action.icon} className={['bt-selection__blocked', className].filter(Boolean).join(' ')} hidden={hidden} data-vb={`sel:${action.id}`} aria-disabled="true" aria-describedby={reasonId} title={reason} onClick={(event) => event.preventDefault()}>{action.label}</Button>
      <span id={reasonId} hidden>{reason}</span>
    </>
  )
}

/** "✕" e o contador em texto simples (sem pílula nem selo), para não se confundir com os selos da página. */
function SelectionCount({ selection, size }: { selection: ViewBarSelection; size: ButtonSize }) {
  return (
    <span className="bt-selection__count" data-vb="sel-count">
      <Button variant="ghost" size={size} icon={icons.x} aria-label="Limpar seleção" title="Limpar seleção" onClick={selection.onClear} />
      <span role="status" className="bt-selection__label">{countLabel(selection)}</span>
    </span>
  )
}

export const inlineActions = (selection: Pick<ViewBarSelection, 'actions'>) => selection.actions.filter((action) => action.inline)

/** O que vai para o ⋮: as ações que não estão na linha (as não `inline` e as `inline` depois das `shown` primeiras), na
 * ordem da tela, sob o grupo "N selecionados". Inertes continuam com o motivo. */
export function selectionOverflow(selection: ViewBarSelection, shown: number): MenuAction[] {
  if (selection.count <= 0) return []
  const visible = new Set(inlineActions(selection).slice(0, shown))
  const rest = selection.actions.filter((action) => !visible.has(action))
  const group = countLabel(selection)
  return selectionMenuActions({ count: selection.count, actions: rest }).map((action) => ({ ...action, group }))
}

/** Comandos da seleção na linha de comando (desktop): trecho tingido dentro da superfície do ViewBar, com o contador e as
 * ações inline que couberem (`shown`); com `compact`, só ícone. Fica no DOM com 0 marcados (escondido) para a linha medir
 * a reserva. */
export function SelectionInline({ selection, shown, compact }: { selection: ViewBarSelection; shown: number; compact: boolean }) {
  return (
    <div className="bt-selection" role="group" aria-label="Comandos da seleção" hidden={selection.count <= 0}>
      <SelectionCount selection={selection} size="default" />
      {inlineActions(selection).map((action, index) => <SelectionButton key={action.id} action={action} count={selection.count} size="default" compact={compact} hidden={index >= shown} ghost />)}
    </div>
  )
}

/** Barra fixa no rodapé do celular (até 820 px): contador e até 2 ações; "Mais" abre o mesmo menu do ⋮ (o resto da
 * seleção em cima, `menu` embaixo). Publica a altura em `--bt-selectionbar-height`. */
export function SelectionBar({ selection, menu = [] }: { selection: ViewBarSelection; menu?: MenuAction[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = ref.current
    const root = document.documentElement
    if (!bar) return
    const publish = () => root.style.setProperty('--bt-selectionbar-height', `${bar.offsetHeight}px`)
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(bar)
    return () => { observer?.disconnect(); root.style.removeProperty('--bt-selectionbar-height') }
  }, [])
  const inline = inlineActions(selection).slice(0, 2)
  const rest = selectionOverflow(selection, 2)
  const actions = [...rest, ...menu.map((action) => (rest.length && action.group === undefined ? { ...action, group: '' } : action))]
  return (
    <div ref={ref} className="bt-selectionbar" role="group" aria-label="Comandos da seleção">
      <SelectionCount selection={selection} size="touch" />
      <div className="bt-selectionbar__actions">
        {inline.map((action) => <SelectionButton key={action.id} action={action} count={selection.count} size="touch" />)}
        {actions.length ? (
          <Menu
            actions={actions}
            trigger={(props) => <Button {...props} variant="secondary" size="touch" icon={icons.more} aria-label={rest.length ? `Mais ações (${rest.length} da seleção)` : 'Mais ações'}>Mais</Button>}
          />
        ) : null}
      </div>
    </div>
  )
}
