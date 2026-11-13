/**
 * Quanto cabe na linha de comando com espaços nomeados (§10.9.1/§10.9.6). Função pura: recebe as larguras medidas e
 * devolve o primeiro degrau de encolhimento em que tudo cabe numa linha. O que é fixo depende só da largura; a seleção
 * tem espaço reservado (contador + ações inline só ícone), então marcar linhas nunca mexe nos controles fixos.
 */

export type FitSize = { full: number; compact: number }

export type FitInput = {
  /** Largura da barra. */
  avail: number
  /** Espaço entre os comandos da direita. */
  gap: number
  /** Espaço entre o seletor de visão e os comandos. */
  startGap: number
  /** Seletor de visão (largura natural). */
  start: number
  /** Botão só ícone (Densidade, ⋮, lupa). */
  square: number
  colunas: FitSize
  filtros?: FitSize
  audit?: FitSize
  primary?: FitSize
  /** `children` no modo de espaços nomeados (nunca encolhe). */
  extra: number
  search: boolean
  searchMin: number
  searchMax: number
  /** O ⋮ aparece mesmo sem nada dobrado (há `more` ou `selection`). */
  menu: boolean
  /** Reserva da seleção no desktop: contador de exemplo e ações inline (só ícone). */
  selection?: { counter: number; inline: number[] }
}

export type FitPlan = {
  /** Degrau escolhido (0 = tudo com texto). */
  level: number
  /** Colunas, Filtros e Auditoria com texto. */
  labels: boolean
  /** Ação principal com texto. */
  primaryLabel: boolean
  /** Ações inline da seleção que a reserva já manda para o ⋮ (da direita para a esquerda). */
  selectionFolded: number
  fold: { audit: boolean; density: boolean; colunas: boolean }
  /** Busca recolhida na lupa. */
  lupa: boolean
  /** Largura da busca (0 = sem busca ou lupa). */
  searchWidth: number
  /** Sobra da linha no degrau (negativa só no último, quando nem ele cabe). */
  slack: number
  /** Espaço que a seleção pode ocupar (reserva + sobra que a busca não usou). */
  selectionSpace: number
}

const sum = (parts: number[], gap: number) => (parts.length ? parts.reduce((a, b) => a + b, 0) + gap * (parts.length - 1) : 0)

function reservation(input: FitInput, folded: number) {
  const sel = input.selection
  if (!sel) return 0
  const shown = sel.inline.slice(0, sel.inline.length - folded)
  return sum([sel.counter, ...shown], input.gap)
}

function required(input: FitInput, plan: Omit<FitPlan, 'level' | 'searchWidth' | 'slack' | 'selectionSpace'>) {
  const { gap } = input
  const end: number[] = []
  if (!plan.fold.colunas) end.push(plan.labels ? input.colunas.full : input.colunas.compact)
  if (input.filtros) end.push(plan.labels ? input.filtros.full : input.filtros.compact)
  if (!plan.fold.density) end.push(input.square)
  if (input.audit && !plan.fold.audit) end.push(plan.labels ? input.audit.full : input.audit.compact)
  const zone: number[] = []
  const reserved = reservation(input, plan.selectionFolded)
  if (reserved) zone.push(reserved)
  if (input.search) zone.push(plan.lupa ? input.square : input.searchMin)
  if (input.extra) zone.push(input.extra)
  // O espaço flexível existe sempre (mesmo vazio), então conta como item da linha.
  end.push(sum(zone, gap))
  const anyFold = plan.fold.audit || plan.fold.density || plan.fold.colunas
  if (input.menu || anyFold) end.push(input.square)
  if (input.primary) end.push(plan.primaryLabel ? input.primary.full : input.primary.compact)
  return { total: input.start + input.startGap + sum(end, gap), reserved }
}

/** Degraus na ordem do §10.9.1: texto da seleção (não mexe nos fixos), texto de Colunas/Filtros/Auditoria, texto da
 * principal, ações da seleção para o ⋮, Auditoria/Densidade/Colunas para o ⋮ e, por fim, a busca vira lupa. */
export function planFit(input: FitInput): FitPlan {
  const steps: Array<Omit<FitPlan, 'level' | 'searchWidth' | 'slack' | 'selectionSpace'>> = []
  let plan = { labels: true, primaryLabel: true, selectionFolded: 0, fold: { audit: false, density: false, colunas: false }, lupa: false }
  const push = (next: Partial<typeof plan>) => { plan = { ...plan, ...next, fold: { ...plan.fold, ...next.fold } }; steps.push(plan) }
  steps.push(plan)
  if (input.colunas.full > input.colunas.compact || (input.filtros && input.filtros.full > input.filtros.compact) || (input.audit && input.audit.full > input.audit.compact)) push({ labels: false })
  if (input.primary && input.primary.full > input.primary.compact) push({ primaryLabel: false })
  for (let i = 1; i <= (input.selection?.inline.length ?? 0); i += 1) push({ selectionFolded: i })
  if (input.audit) push({ fold: { ...plan.fold, audit: true } })
  push({ fold: { ...plan.fold, density: true } })
  push({ fold: { ...plan.fold, colunas: true } })
  if (input.search) push({ lupa: true })

  let level = steps.findIndex((step) => required(input, step).total <= input.avail + 0.5)
  if (level < 0) level = steps.length - 1
  const chosen = steps[level]
  const { total, reserved } = required(input, chosen)
  const slack = input.avail - total
  const extraSearch = input.search && !chosen.lupa ? Math.min(input.searchMax - input.searchMin, Math.max(0, slack)) : 0
  return {
    ...chosen,
    level,
    searchWidth: input.search && !chosen.lupa ? input.searchMin + extraSearch : 0,
    slack,
    selectionSpace: reserved + Math.max(0, slack - extraSearch),
  }
}

/** Como a seleção ocupa o seu espaço: com texto se couber; senão só ícone, e o que não couber vai para o ⋮ da direita
 * para a esquerda. `inline` são as larguras de cada ação inline, na ordem da tela. */
export function fitSelection(space: number, counter: number, inline: FitSize[], gap: number): { labels: boolean; shown: number } {
  if (sum([counter, ...inline.map((size) => size.full)], gap) <= space + 0.5) return { labels: true, shown: inline.length }
  for (let shown = inline.length; shown > 0; shown -= 1) {
    if (sum([counter, ...inline.slice(0, shown).map((size) => size.compact)], gap) <= space + 0.5) return { labels: false, shown }
  }
  return { labels: false, shown: 0 }
}
