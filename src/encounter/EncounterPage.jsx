import React, { useEffect, useState } from 'react';
import {
  advance,
  changeHp,
  createEncounter,
  currentUnit,
  delayCurrent,
  endEncounter,
  setDown,
  supplement,
  uid,
} from './rotation';
import {
  archiveEncounter,
  loadActive,
  loadArchive,
  loadDraft,
  saveActive,
  saveArchive,
  saveDraft,
} from './storage';

const clock = (ts) =>
  new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const dateText = (ts) =>
  new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const KIND_LABEL = {
  start: '开始',
  turn: '行动',
  round: '轮次',
  skip: '跳过',
  delay: '延后',
  down: '倒下',
  revive: '复起',
  damage: '伤害',
  heal: '治疗',
  end: '结束',
  stall: '停滞',
  supplement: '补记',
};

function blankRow(c) {
  return {
    uid: uid('p'),
    charName: c?.name ?? '',
    name: c?.name ?? '',
    role: c?.role ?? '敌人',
    color: c?.color ?? '#8a9a94',
    initiative: '',
    hp: c ? '' : '10',
    maxHp: c ? '' : '10',
  };
}

function HpControl({ unit, disabled, onCommit }) {
  const [text, setText] = useState(String(unit.hp));
  useEffect(() => setText(String(unit.hp)), [unit.hp]);
  if (!unit.maxHp)
    return <span className="hp-na">生命不追踪 · 状态由倒下开关管理</span>;
  const step = (d) => onCommit(unit.uid, unit.hp + d);
  return (
    <div className="hp-ctrl">
      <button
        type="button"
        className="hp-step"
        disabled={disabled}
        onClick={() => step(-5)}
      >
        −5
      </button>
      <input
        type="number"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          onCommit(unit.uid, Number.isFinite(n) ? n : unit.hp);
          setText(String(unit.hp));
        }}
      />
      <span className="hp-max">/ {unit.maxHp}</span>
      <button
        type="button"
        className="hp-step"
        disabled={disabled}
        onClick={() => step(5)}
      >
        +5
      </button>
    </div>
  );
}

function LogPanel({ enc, onSupplement }) {
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const frozen = enc.status === 'frozen';
  const submit = () => {
    try {
      onSupplement(supplement(enc, { reason, text }));
      setReason('');
      setText('');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="log-panel">
      <div className="panel-head">
        <h3>经过</h3>
        <span>{enc.log.length} 条 · 自动存档</span>
      </div>
      <div className="log-list">
        {enc.log.map((l) => (
          <div key={l.id} className={`log-item log-${l.kind}`}>
            <div className="log-meta">
              <span className="log-kind">{KIND_LABEL[l.kind] || l.kind}</span>
              <span>{l.round ? `第 ${l.round} 轮` : frozen ? '战后' : '—'}</span>
              <span>{clock(l.at)}</span>
            </div>
            <p>{l.text}</p>
            {l.reason && (
              <div className="log-reason">补记原因：{l.reason}</div>
            )}
          </div>
        ))}
      </div>
      {frozen && (
        <div className="supplement">
          <strong>带原因补记（旧记录保持不动，仅追加）</strong>
          <input
            placeholder="为什么现在补记？例：散场后核对角色卡"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <textarea
            rows={2}
            placeholder="补记内容，例：第三轮瑟琳的先攻应为 17"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <small className="form-error">{error}</small>}
          <button type="button" className="primary" onClick={submit}>
            追加补记
          </button>
        </div>
      )}
    </div>
  );
}

export default function EncounterPage({ characters, notify }) {
  const [active, setActive] = useState(loadActive);
  const [draft, setDraft] = useState(loadDraft);
  const [archive, setArchive] = useState(loadArchive);
  const [view, setView] = useState('board'); // board | archive
  const [ending, setEnding] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [openArch, setOpenArch] = useState(() => new Set());

  // 轮转中的每一手都立刻落盘，重开页面从上次位置接着走
  useEffect(() => saveActive(active), [active]);
  useEffect(() => saveDraft(draft), [draft]);
  useEffect(() => saveArchive(archive), [archive]);

  const cur = active ? currentUnit(active) : null;

  const commit = (next) => setActive(next);

  const startEncounter = () => {
    const rows = draft.rows.filter((r) => r.name.trim());
    if (rows.length === 0) {
      notify('请先选择参战角色或加入敌方单位');
      return;
    }
    const enc = createEncounter(draft.name, rows);
    setActive(enc);
    setDraft(null);
    setEnding(false);
    setView('board');
    notify('遭遇开始：已按先攻排出行动顺序');
  };

  const finishEncounter = () => {
    const frozen = endEncounter(active);
    setArchive(archiveEncounter(frozen));
    setActive(null);
    setEnding(false);
    notify('遭遇结束，经过已冻结并存入战档');
  };

  const abandonEncounter = () => {
    setActive(null); // 不冻结、不入档：直接从活动位移除
    setAbandoning(false);
    notify('该遭遇已放弃，未写入战档');
  };

  const patchActiveSupplemented = (next) => {
    setActive(next);
    notify('补记已追加');
  };

  const patchArchive = (next) => {
    setArchive(archive.map((x) => (x.id === next.id ? next : x)));
    notify('补记已追加到战档');
  };

  /* ---------- 编排草稿 ---------- */
  const ensureDraft = () =>
    draft || {
      name: '',
      rows: characters.map((c) => ({ ...blankRow(c) })),
    };
  const d = ensureDraft();

  const updateDraft = (patch) => setDraft({ ...d, ...patch });

  const toggleRoster = (c) => {
    const exists = d.rows.some((r) => r.charName === c.name);
    const rows = exists
      ? d.rows.filter((r) => r.charName !== c.name)
      : [...d.rows, { ...blankRow(c) }];
    setDraft({ ...d, rows });
  };

  const addFoe = () =>
    updateDraft({
      rows: [...d.rows, { ...blankRow(), name: '', charName: '' }],
    });

  const editRow = (id, patch) =>
    updateDraft({
      rows: d.rows.map((r) => (r.uid === id ? { ...r, ...patch } : r)),
    });

  const removeRow = (id) =>
    updateDraft({ rows: d.rows.filter((r) => r.uid !== id) });

  const rosterPicked = (name) => d.rows.some((r) => r.charName === name);

  /* ---------- 渲染 ---------- */
  return (
    <div className="encounter">
      <div className="enc-tabs">
        <button
          className={view === 'board' ? 'active' : ''}
          onClick={() => setView('board')}
        >
          ⚔ 遭遇记录台
          {active?.status === 'active' && <em>进行中</em>}
        </button>
        <button
          className={view === 'archive' ? 'active' : ''}
          onClick={() => setView('archive')}
        >
          ❖ 战档（{archive.length}）
        </button>
      </div>

      {view === 'archive' && (
        <section className="archive">
          {archive.length === 0 && (
            <div className="empty-note">
              还没有结束的遭遇。战斗结束并冻结后，旧记录会一直留在战档里。
            </div>
          )}
          {archive.map((enc) => {
            const open = openArch.has(enc.id);
            return (
              <article className="arch-card" key={enc.id}>
                <button
                  className="arch-head"
                  onClick={() =>
                    setOpenArch((s) => {
                      const n = new Set(s);
                      n.has(enc.id) ? n.delete(enc.id) : n.add(enc.id);
                      return n;
                    })
                  }
                >
                  <div>
                    <strong>{enc.name}</strong>
                    <span>
                      {dateText(enc.endedAt || enc.createdAt)} ·{' '}
                      {enc.order.length} 个单位 · {enc.round} 轮 ·{' '}
                      {enc.log.length} 条经过
                    </span>
                  </div>
                  <span className="arch-toggle">{open ? '收起' : '展开'}</span>
                </button>
                {open && (
                  <div className="arch-body">
                    <ol className="mini-order">
                      {enc.order.map((id, i) => {
                        const u = enc.units[id];
                        return (
                          <li
                            key={id}
                            className={u.down ? 'is-down' : ''}
                            style={{ borderColor: u.color }}
                          >
                            <b>{i + 1}</b>
                            <span>
                              {u.name}
                              {u.down && <em> 倒下</em>}
                            </span>
                            <small>
                              先攻 {u.initiative}
                              {u.maxHp ? ` · ${u.hp}/${u.maxHp}` : ''}
                            </small>
                          </li>
                        );
                      })}
                    </ol>
                    <LogPanel enc={enc} onSupplement={patchArchive} />
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {view === 'board' && active && (
        <section className="board">
          <div className="board-top">
            <div>
              <h2>{active.name}</h2>
              <span
                className={`status-chip ${active.status === 'frozen' ? 'frozen' : ''}`}
              >
                {active.status === 'frozen'
                  ? `已冻结 · 止于第 ${active.round} 轮`
                  : `进行中 · 第 ${active.round} 轮`}
              </span>
            </div>
            {active.status === 'active' && !ending && !abandoning && (
              <div className="end-actions">
                <button
                  className="outline danger"
                  onClick={() => setAbandoning(true)}
                >
                  弃战
                </button>
                <button className="outline" onClick={() => setEnding(true)}>
                  ■ 结束战斗
                </button>
              </div>
            )}
            {ending && (
              <div className="end-confirm">
                <span>确认战斗结束？经过将冻结，之后只能带原因补记。</span>
                <button className="primary" onClick={finishEncounter}>
                  确认冻结
                </button>
                <button className="outline" onClick={() => setEnding(false)}>
                  继续战斗
                </button>
              </div>
            )}
            {abandoning && (
              <div className="end-confirm">
                <span>弃战不会冻结、也不会存入战档，经过将无法回看。确定？</span>
                <button className="outline danger" onClick={abandonEncounter}>
                  确认弃战
                </button>
                <button
                  className="outline"
                  onClick={() => setAbandoning(false)}
                >
                  取消
                </button>
              </div>
            )}
          </div>

          <div className="board-grid">
            <div className="turn-track">
              <div className="panel-head">
                <h3>先攻顺序</h3>
                <span>高先攻先动 · 倒下留位 · 延后入尾</span>
              </div>
              {active.order.map((id, i) => {
                const u = active.units[id];
                const isCur = i === active.cursor;
                return (
                  <div
                    key={id}
                    className={
                      'order-card' +
                      (isCur ? ' current' : '') +
                      (u.down ? ' down' : '') +
                      (u.done && !isCur ? ' done' : '')
                    }
                    style={{ borderLeftColor: u.color }}
                  >
                    <div className="order-rank">
                      <b>{i + 1}</b>
                      <span className="init-badge">{u.initiative}</span>
                    </div>
                    <div className="order-main">
                      <div className="order-name">
                        <strong>{u.name}</strong>
                        <small>{u.role}</small>
                        {u.down && <em className="down-tag">倒下 · 留位</em>}
                        {isCur && !u.down && (
                          <em className="turn-tag">当前行动</em>
                        )}
                        {u.done && !isCur && !u.down && (
                          <em className="done-tag">本轮已行动</em>
                        )}
                      </div>
                      <HpControl
                        unit={u}
                        disabled={active.status === 'frozen'}
                        onCommit={(pid, hp) =>
                          commit(changeHp(active, pid, hp))
                        }
                      />
                    </div>
                    <div className="order-actions">
                      {active.status === 'active' && !u.down && (
                        <button
                          className="mini-btn"
                          onClick={() => commit(setDown(active, id, true))}
                        >
                          标记倒下
                        </button>
                      )}
                      {active.status === 'active' && u.down && (
                        <button
                          className="mini-btn revive"
                          onClick={() => commit(setDown(active, id, false))}
                        >
                          复起接回
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {active.status === 'active' && (
                <div className="turn-bar">
                  <div className="turn-now">
                    <small>当前行动</small>
                    <strong>{cur ? cur.name : '等待复起或结束'}</strong>
                  </div>
                  <button
                    className="primary"
                    disabled={!cur}
                    onClick={() => commit(advance(active))}
                  >
                    行动结束 →
                  </button>
                  <button
                    className="outline"
                    disabled={!cur}
                    onClick={() => commit(delayCurrent(active))}
                  >
                    延后到队尾
                  </button>
                </div>
              )}
            </div>

            <LogPanel enc={active} onSupplement={patchActiveSupplemented} />
          </div>
        </section>
      )}

      {view === 'board' && !active && (
        <section className="setup">
          <div className="setup-head">
            <h2>编排新遭遇</h2>
            <p>选参战角色、登记先攻与当前生命，开战后名单自动保存，重开不丢。</p>
          </div>

          <label className="setup-name">
            遭遇名称
            <input
              placeholder="例：灰港码头伏击"
              value={d.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
            />
          </label>

          <div className="roster-pick">
            <small>参战角色（点击勾选）</small>
            <div>
              {characters.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={
                    'roster-chip' + (rosterPicked(c.name) ? ' picked' : '')
                  }
                  style={
                    rosterPicked(c.name)
                      ? { background: c.color, borderColor: c.color }
                      : undefined
                  }
                  onClick={() => toggleRoster(c)}
                >
                  <i style={{ background: c.color }}>{c.name[0]}</i>
                  {c.name}
                  <small>{c.role}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="unit-rows">
            <div className="unit-row unit-row-head">
              <span>单位</span>
              <span>身份</span>
              <span>先攻</span>
              <span>当前生命</span>
              <span>最大生命</span>
              <span />
            </div>
            {d.rows.map((r) => (
              <div className="unit-row" key={r.uid}>
                <input
                  placeholder={r.charName ? '' : '敌方单位名'}
                  value={r.name}
                  disabled={Boolean(r.charName)}
                  onChange={(e) => editRow(r.uid, { name: e.target.value })}
                />
                <input
                  value={r.role}
                  onChange={(e) => editRow(r.uid, { role: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="0"
                  value={r.initiative}
                  onChange={(e) =>
                    editRow(r.uid, { initiative: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="—"
                  value={r.hp}
                  onChange={(e) => editRow(r.uid, { hp: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="—"
                  value={r.maxHp}
                  onChange={(e) => editRow(r.uid, { maxHp: e.target.value })}
                />
                <button
                  type="button"
                  className="row-del"
                  onClick={() => removeRow(r.uid)}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="outline" onClick={addFoe}>
              ＋ 加入敌方单位
            </button>
          </div>

          <div className="setup-actions">
            <button className="primary" onClick={startEncounter}>
              ⚔ 开战：按先攻排序
            </button>
            {draft && (
              <button
                className="outline"
                onClick={() => {
                  setDraft(null);
                  notify('编排草稿已丢弃');
                }}
              >
                清空草稿
              </button>
            )}
            <small>未开战时名单作为草稿自动保存</small>
          </div>
        </section>
      )}
    </div>
  );
}
