import React, { useEffect, useState } from 'react'
import { createEncounter, currentActor, advanceTurn, delayTurn, setHp, endEncounter, amendEncounter } from './rotation'
import { loadEncounters, saveEncounters } from './store'

export default function EncounterPage({ characters }) {
  const [state, setState] = useState(loadEncounters)
  const [viewId, setViewId] = useState(null) // 正在回看的已结束遭遇
  const [name, setName] = useState('')
  const [picks, setPicks] = useState({})     // 角色名 -> { initiative, hp }
  const [amend, setAmend] = useState({ text: '', reason: '' })

  // 每一手都落盘，重开页面接着走
  useEffect(() => { saveEncounters(state) }, [state])

  const active = state.list.find(e => e.id === state.activeId) || null
  const shown = (viewId && state.list.find(e => e.id === viewId)) || active
  const ended = state.list.filter(e => e.status === 'ended')
  const cur = shown && shown.status === 'active' ? currentActor(shown) : null
  const chosenCount = Object.keys(picks).length

  const replace = enc => setState(s => ({ ...s, list: s.list.map(e => (e.id === enc.id ? enc : e)) }))

  const toggle = c => setPicks(p => {
    const next = { ...p }
    if (next[c.name]) delete next[c.name]
    else next[c.name] = { initiative: 10, hp: 20 }
    return next
  })
  const setPick = (n, k, v) => setPicks(p => ({ ...p, [n]: { ...p[n], [k]: v } }))

  const start = () => {
    const chosen = characters.filter(c => picks[c.name]).map(c => ({ name: c.name, ...picks[c.name] }))
    if (!chosen.length) return
    const enc = createEncounter(name.trim(), chosen)
    setState(s => ({ list: [enc, ...s.list], activeId: enc.id }))
    setName(''); setPicks({}); setViewId(null)
  }

  const end = () => {
    if (!active || !window.confirm('结束战斗后经过将被冻结，之后只能带原因补记。确认结束？')) return
    const enc = endEncounter(active)
    setState(s => ({ activeId: null, list: s.list.map(e => (e.id === enc.id ? enc : e)) }))
    setViewId(enc.id)
  }

  const submitAmend = () => {
    if (!amend.text.trim() || !amend.reason.trim()) return
    replace(amendEncounter(shown, amend.text, amend.reason))
    setAmend({ text: '', reason: '' })
  }

  return (
    <div className="enc-layout">
      <section className="enc-main">
        {!shown && (
          <>
            <div className="enc-intro"><span>ENCOUNTER SETUP</span><h2>开局：选择参战角色</h2></div>
            <input className="enc-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="遭遇名称，例：钟楼顶层遭遇战" />
            {characters.map(c => {
              const p = picks[c.name]
              return (
                <div className={'pick-row' + (p ? '' : ' off')} key={c.name}>
                  <label>
                    <input type="checkbox" checked={!!p} onChange={() => toggle(c)} />
                    {c.name} <small>{c.role} · {c.player}</small>
                  </label>
                  {p ? (
                    <>
                      <input type="number" value={p.initiative} onChange={e => setPick(c.name, 'initiative', e.target.value)} placeholder="先攻" title="先攻" />
                      <input type="number" value={p.hp} onChange={e => setPick(c.name, 'hp', e.target.value)} placeholder="生命" title="当前生命" />
                    </>
                  ) : <span className="ph">勾选后填写先攻与生命</span>}
                </div>
              )
            })}
            <button className="primary tiny" disabled={!chosenCount} onClick={start}>开始遭遇（{chosenCount} 人参战）</button>
          </>
        )}

        {shown && (
          <>
            <div className="enc-intro">
              <span>{shown.status === 'active' ? 'ENCOUNTER IN PROGRESS' : 'ENCOUNTER FROZEN'}</span>
              <h2>{shown.name}</h2>
            </div>

            {shown.status === 'active' ? (
              <div className="enc-bar">
                <div><small>轮次</small><strong>第 {shown.round} 轮</strong></div>
                <div><small>当前行动</small><strong>{cur ? cur.name : '——'}</strong></div>
                <span className="spacer" />
                <button className="outline tiny" disabled={!cur} onClick={() => replace(delayTurn(shown, cur.id))}>↧ 延后到末尾</button>
                <button className="primary tiny" disabled={!cur} onClick={() => replace(advanceTurn(shown))}>行动完毕 →</button>
                <button className="outline tiny danger" onClick={end}>■ 结束战斗</button>
              </div>
            ) : (
              <div className="frozen-note">已冻结 · 共 {shown.round} 轮 · 经过不可更改，可在下方带原因补记</div>
            )}

            <div className="enc-list">
              {shown.order.map((id, i) => {
                const c = shown.combatants.find(x => x.id === id)
                const isCur = cur && cur.id === id
                const acted = shown.status === 'active' && !shown.queue.includes(id)
                const cls = 'combatant' + (isCur ? ' is-current' : '') + (c.down ? ' is-down' : '')
                const stateText = c.down ? '倒下' : isCur ? '行动中' : acted ? '已行动' : '待行动'
                const subText = shown.status === 'ended'
                  ? (c.down ? '战斗结束时倒下' : '战斗结束时幸存')
                  : (c.down ? '倒下 · 位置保留，轮到跳过' : acted ? '本轮已行动' : '等待行动')
                return (
                  <div className={cls} key={id}>
                    <span className="pos">{String(i + 1).padStart(2, '0')}</span>
                    <span className="init-badge" title="先攻">{c.initiative}</span>
                    <div className="c-name"><strong>{c.name}</strong><small>{subText}</small></div>
                    {shown.status === 'active' ? (
                      <div className="hp-ctrl">
                        <button onClick={() => replace(setHp(shown, id, c.hp - 1))}>−</button>
                        <input value={c.hp} onChange={e => e.target.value !== '' && replace(setHp(shown, id, e.target.value))} />
                        <button onClick={() => replace(setHp(shown, id, c.hp + 1))}>＋</button>
                        {!c.down && <button className="outline tiny danger" onClick={() => replace(setHp(shown, id, 0))}>击倒</button>}
                      </div>
                    ) : <span className="hp-static">{c.hp} / {c.maxHp}</span>}
                    <span className={'state-tag' + (isCur ? ' now' : '') + (c.down ? ' down' : '')}>{stateText}</span>
                  </div>
                )
              })}
            </div>

            {shown.status === 'ended' && (
              <div className="amend">
                <h3>补记这场战斗</h3>
                <textarea rows="2" value={amend.text} onChange={e => setAmend({ ...amend, text: e.target.value })} placeholder="要补充的记录，例：第三轮莫尔其实是在瑟琳之前倒下的" />
                <input value={amend.reason} onChange={e => setAmend({ ...amend, reason: e.target.value })} placeholder="补记原因（必填），例：当时漏记" />
                <button className="primary tiny" disabled={!amend.text.trim() || !amend.reason.trim()} onClick={submitAmend}>提交补记</button>
              </div>
            )}

            {shown.status === 'ended' && (
              <button className="outline tiny enc-back" onClick={() => setViewId(null)}>
                {active ? '← 返回进行中的战斗' : '＋ 新开一场遭遇'}
              </button>
            )}
          </>
        )}
      </section>

      <aside className="enc-side">
        <div className="enc-log-head"><span>THE ENCOUNTER LOG</span><h2>战斗经过</h2></div>
        <div className="enc-log">
          {!shown && <p className="enc-empty">开局后，这里会逐手记录轮转、倒下与复起，散场也能回看。</p>}
          {shown && shown.log.map((l, i) => (
            <div className="log-row" key={i}><b>R{l.round}</b><span>{l.text}</span></div>
          ))}
        </div>
        <div className="enc-hist">
          <span className="crumb">ARCHIVE</span>
          <h3>历史遭遇（{ended.length}）</h3>
          {ended.length === 0 && <p className="enc-empty">结束的战斗会留存在这里，随时回看。</p>}
          {ended.map(e => (
            <button className="hist-item" key={e.id} onClick={() => setViewId(e.id)}>
              {e.name}
              <small>{e.round} 轮 · {e.combatants.length} 人 · {new Date(e.endedAt).toLocaleString('zh-CN')}</small>
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
