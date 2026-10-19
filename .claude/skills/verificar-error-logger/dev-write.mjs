// Grava 1 log real em new_appmotoristaslog pelo dist/error-logger.js (sem Xrm, via GetGlobalContext + fetch) e imprime status e OData-EntityId.
// Uso: DV_TOKEN=$(az account get-access-token --resource <url> --query accessToken -o tsv) node dev-write.mjs <file:///.../packages/ui/dist/error-logger.js>
// Só DEV. Apague a linha criada depois (ver SKILL.md).
const U = 'https://org23b93544.crm2.dynamics.com'
const token = process.env.DV_TOKEN
const realFetch = globalThis.fetch
const results = []
globalThis.fetch = async (url, init = {}) => {
  const res = await realFetch(url, { ...init, keepalive: undefined, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } })
  results.push({ method: init.method || 'GET', url: String(url).replace(U, ''), status: res.status, entityId: res.headers.get('OData-EntityId') })
  return res
}
const win = new EventTarget()
Object.assign(win, {
  parent: win,
  GetGlobalContext: () => ({ getClientUrl: () => U, userSettings: {} }),
  location: { href: `${U}/WebResources/teste-error-logger.html` }, document: { referrer: '', visibilityState: 'visible' },
  navigator: { userAgent: 'node error-logger DEV test', language: 'pt-BR', platform: 'node', onLine: true },
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  setInterval, clearInterval,
})
globalThis.window = win
const m = await import(process.argv[2])
const uninstall = m.installErrorLogger({ appName: 'Teste error-logger (DS)', appVersion: 'v1.11.0', builtAt: '19/10/2026', getScreen: () => 'Teste' })
const status = await m.logAppError(new Error('Teste do error-logger compartilhado — apagar'), { action: 'teste-dev', phase: 'verificacao', payload: { ok: true } })
uninstall()
console.log(JSON.stringify({ status, results }, null, 1))
