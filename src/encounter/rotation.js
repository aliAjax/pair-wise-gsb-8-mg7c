// 遭遇轮转逻辑：纯数据操作，不接触界面与存储。
// 规则：先攻高者先动；同一角色一轮只轮到一次；愿意延后的人排到本轮末尾；
// 倒下者保留位置、轮到跳过，复起后接回原顺序；
// 战斗结束后经过冻结，只能带原因补记，旧记录保留。

let seq = 0
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`
const clone = enc => structuredClone(enc)
const byId = (enc, id) => enc.combatants.find(c => c.id === id)

function pushLog(enc, text) {
  enc.log.push({ round: enc.round, text, at: new Date().toISOString() })
}

// picks: [{ name, initiative, hp }]
export function createEncounter(name, picks) {
  const combatants = picks.map(p => ({
    id: uid(),
    name: p.name,
    initiative: Number(p.initiative) || 0,
    hp: Math.max(0, Number(p.hp) || 0),
    maxHp: Math.max(0, Number(p.hp) || 0),
    down: false,
  }))
  // 数值高的先动；先攻相同则保持选择顺序
  const order = [...combatants].sort((a, b) => b.initiative - a.initiative).map(c => c.id)
  const enc = {
    id: uid(),
    name: name || '未命名遭遇',
    status: 'active',
    round: 1,
    order,             // 先攻顺序，整场不变（倒下也留位置）
    queue: [...order], // 本轮尚未行动的人（含倒下者，轮到会跳过）
    combatants,
    log: [],
    amendments: [],
    startedAt: new Date().toISOString(),
    endedAt: null,
  }
  pushLog(enc, `遭遇开始：${combatants.map(c => c.name).join('、')}，按先攻高到低行动`)
  return enc
}

// 当前行动者：本轮队列里第一个没倒下的人
export function currentActor(enc) {
  if (!enc || enc.status !== 'active') return null
  const id = enc.queue.find(x => !byId(enc, x).down)
  return id ? byId(enc, id) : null
}

function nextRound(enc) {
  enc.round += 1
  enc.queue = [...enc.order]
  pushLog(enc, `—— 第 ${enc.round} 轮开始 ——`)
}

// 当前行动者行动完毕；本轮没人可行动时进入下一轮
export function advanceTurn(enc) {
  if (!enc || enc.status !== 'active') return enc
  const actor = currentActor(enc)
  if (!actor) return enc
  const next = clone(enc)
  next.queue = next.queue.filter(id => id !== actor.id)
  pushLog(next, `${actor.name} 行动完毕`)
  if (next.queue.every(id => byId(next, id).down)) nextRound(next)
  return next
}

// 轮到的人才能延后，排到本轮末尾（本轮仍只行动一次）
export function delayTurn(enc, id) {
  if (!enc || enc.status !== 'active') return enc
  if (currentActor(enc)?.id !== id) return enc
  if (enc.queue.filter(x => x !== id).length === 0) return enc // 本轮只剩自己，延后无意义
  const next = clone(enc)
  next.queue = next.queue.filter(x => x !== id)
  next.queue.push(id)
  pushLog(next, `${byId(next, id).name} 选择延后，排到本轮末尾`)
  return next
}

// 调整当前生命：到 0 记倒下（留位置、轮到跳过），从 0 拉起记复起（接回原顺序）
export function setHp(enc, id, hp) {
  if (!enc || enc.status !== 'active') return enc
  const next = clone(enc)
  const c = byId(next, id)
  if (!c) return next
  const cap = c.maxHp > 0 ? c.maxHp : Infinity
  c.hp = Math.max(0, Math.min(cap, Number(hp) || 0))
  if (c.hp === 0 && !c.down) {
    c.down = true
    pushLog(next, `${c.name} 倒下：位置保留，轮到跳过`)
  } else if (c.hp > 0 && c.down) {
    c.down = false
    pushLog(next, `${c.name} 复起：接回原顺序`)
  }
  return next
}

// 结束战斗：冻结经过
export function endEncounter(enc) {
  if (!enc || enc.status !== 'active') return enc
  const next = clone(enc)
  next.status = 'ended'
  next.endedAt = new Date().toISOString()
  next.queue = []
  pushLog(next, '战斗结束，经过冻结；此后只能带原因补记')
  return next
}

// 补记：仅冻结后可用，且必须带原因
export function amendEncounter(enc, text, reason) {
  if (!enc || enc.status !== 'ended') return enc
  if (!text?.trim() || !reason?.trim()) return enc
  const next = clone(enc)
  const entry = { text: text.trim(), reason: reason.trim(), at: new Date().toISOString() }
  next.amendments.push(entry)
  pushLog(next, `补记（原因：${entry.reason}）：${entry.text}`)
  return next
}
