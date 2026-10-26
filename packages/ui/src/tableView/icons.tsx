import type { ReactNode } from 'react'

/** Ícones de traço (desenho do Lucide) usados pela barra de visão e pelo painel de colunas. */
const icon = (paths: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
)

export const icons = {
  columns: icon(<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="M15 3v18" /></>),
  grip: icon(<><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>),
  up: icon(<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>, 14),
  down: icon(<><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>, 14),
  chevronDown: icon(<path d="m6 9 6 6 6-6" />, 18),
  users: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  user: icon(<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  table: icon(<><path d="M12 3v18" /><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /></>),
  save: icon(<><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></>),
  saveAs: icon(<><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /><path d="M12 7v6" /><path d="M9 10h6" /></>),
  pencil: icon(<><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" /><path d="m15 5 4 4" /></>),
  trash: icon(<><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>),
  share: icon(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98" /><path d="m15.41 6.51-6.82 3.98" /></>),
  filter: icon(<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />),
  listFilter: icon(<><path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" /></>),
  arrowUp: icon(<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>),
  arrowDown: icon(<><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>),
  filterX: icon(<><path d="M13.013 3H2l8 9.46V19l4 2v-8.54l.9-1.055" /><path d="m22 3-5 5" /><path d="m17 3 5 5" /></>),
  eyeOff: icon(<><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></>),
  open: icon(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>),
  plus: icon(<><path d="M5 12h14" /><path d="M12 5v14" /></>),
  close: icon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 14),
  check: icon(<path d="M20 6 9 17l-5-5" />),
  back: icon(<><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>),
  chevronRight: icon(<path d="m9 18 6-6-6-6" />),
  lock: icon(<><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, 14),
  reset: icon(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>),
}
