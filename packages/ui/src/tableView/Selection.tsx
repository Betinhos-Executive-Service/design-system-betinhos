import { useEffect, useId, useRef } from 'react'
import { Button } from '../components/Button'
import { Menu, type MenuAction } from '../components/Menu'
import { icons } from './icons'

/** Ação sobre as linhas marcadas (§10.9.6). A mesma lista alimenta a linha de comando, o menu "Ações", a barra do celular e o clique direito. */
export type SelectionAction = Omit<MenuAction, 'disabled' | 'title' | 'description'> & {
  /** Rótulo em texto puro: vai para o botão, para o `aria-label` e para o menu. */
  label: string
  /** Só vale com exatamente um registro marcado; com mais, fica inerte com "Selecione exatamente um registro.". */
  single?: boolean
  /** Motivo de a ação estar inerte agora (ex.: "Selecione só ativos ou só inativos."). Vazio = liberada. */
  blocked?: string | null
  /** Botão na linha de comando (até 3 no desktop largo, 1 abaixo de 1280 px, 2 no celular); o resto vai para "Ações". */
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
const countLabel = (selection: ViewBarSelection) => selection.label?.(selection.count) ?? (selection.count === 1 ? '1 selecionado' : `${selection.count} selecionados`)

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

function SelectionButton({ action, count, size }: { action: SelectionAction; count: number; size: 'default' | 'touch' }) {
  const reason = selectionBlock(action, count)
  const reasonId = useId()
  const variant = action.tone === 'danger' ? 'danger' : 'secondary'
  // title: sem espaço o botão vira só ícone (table-view.css) e o nome aparece no hover.
  if (reason == null) return <Button variant={variant} size={size} icon={action.icon} title={action.label} onClick={action.onSelect}>{action.label}</Button>
  // aria-disabled (não disabled): continua focável, o leitor de tela lê o motivo e o clique não faz nada.
  return (
    <>
      <Button variant={variant} size={size} icon={action.icon} className="bt-selection__blocked" aria-disabled="true" aria-describedby={reasonId} title={reason} onClick={(event) => event.preventDefault()}>{action.label}</Button>
      <span id={reasonId} hidden>{reason}</span>
    </>
  )
}

/** Contador com "✕": o que diferencia o modo seleção dos selos da página. */
function SelectionCount({ selection, size }: { selection: ViewBarSelection; size: 'default' | 'touch' }) {
  return (
    <span className="bt-selection__count">
      <Button variant="ghost" size={size} icon={icons.x} aria-label="Limpar seleção" title="Limpar seleção" onClick={selection.onClear} />
      <span role="status" className="bt-selection__label">{countLabel(selection)}</span>
    </span>
  )
}

function split(selection: ViewBarSelection, max: number) {
  const inline = selection.actions.filter((action) => action.inline).slice(0, max)
  const rest = selection.actions.filter((action) => !inline.includes(action))
  return { inline, rest: selectionMenuActions({ count: selection.count, actions: rest }) }
}

/** Modo seleção da linha de comando no desktop: ocupa o lugar da busca; o resto da linha não se mexe. */
export function SelectionCommands({ selection, maxInline }: { selection: ViewBarSelection; maxInline: number }) {
  const { inline, rest } = split(selection, maxInline)
  return (
    <div className="bt-selection" role="group" aria-label="Comandos da seleção">
      <SelectionCount selection={selection} size="default" />
      {inline.map((action) => <SelectionButton key={action.id} action={action} count={selection.count} size="default" />)}
      {rest.length ? (
        <Menu
          align="end"
          actions={rest}
          trigger={(props) => <Button {...props} variant="secondary" icon={icons.chevronDown} aria-label={`Ações (${rest.length})`}>Ações</Button>}
        />
      ) : null}
    </div>
  )
}

/** Barra fixa no rodapé do celular (até 820 px): contador e até 2 ações; o resto em "Mais". Publica a altura em `--bt-selectionbar-height`. */
export function SelectionBar({ selection }: { selection: ViewBarSelection }) {
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
  const { inline, rest } = split(selection, 2)
  return (
    <div ref={ref} className="bt-selectionbar" role="group" aria-label="Comandos da seleção">
      <SelectionCount selection={selection} size="touch" />
      <div className="bt-selectionbar__actions">
        {inline.map((action) => <SelectionButton key={action.id} action={action} count={selection.count} size="touch" />)}
        {rest.length ? (
          <Menu
            actions={rest}
            trigger={(props) => <Button {...props} variant="secondary" size="touch" icon={icons.more} aria-label={`Mais ações da seleção (${rest.length})`}>Mais</Button>}
          />
        ) : null}
      </div>
    </div>
  )
}
