// 遭遇存档：独立于战役日志存放，每次轮转后落盘，
// 重开页面时从上次那一手接着走；结束的遭遇留在 list 里供回看。
const KEY = 'campaign-encounters'

export function loadEncounters() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw && Array.isArray(raw.list)) return { list: raw.list, activeId: raw.activeId ?? null }
  } catch { /* 存档损坏时按空档重开 */ }
  return { list: [], activeId: null }
}

export function saveEncounters(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 存储不可用时静默跳过 */ }
}
