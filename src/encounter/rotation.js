// 遭遇轮转引擎：纯函数，不依赖 React / DOM，可独立测试。
// 规则：
// - 先攻数值高者先动（并列按参战名单的稳定顺序）；
// - 同一单位一轮只轮到一次，全员过完才进入下一轮；
// - 延后的单位移到队尾，本轮仍有一次行动机会；
// - 倒下的单位轮次跳过，但保留在先攻序列中的位置，复起后接回原顺序；
// - 结束战斗后经过冻结，只允许带原因补记。

let seq = 0;
export const uid = (prefix = 'u') =>
  `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function createEncounter(name, rows) {
  const units = {};
  rows.forEach((r) => {
    const id = r.uid || uid();
    // 生命留空（'' / null）表示本场不追踪生命，不当成 0
    const parsed = (v) =>
      v === '' || v == null ? NaN : Number(v);
    const maxRaw = parsed(r.maxHp);
    const hpRaw = parsed(r.hp);
    const maxHp = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0;
    const hp = Number.isFinite(hpRaw)
      ? clamp(hpRaw, 0, maxHp || Infinity)
      : maxHp; // 当前生命留空则按满血算
    units[id] = {
      uid: id,
      name: String(r.name || '未命名').trim(),
      role: r.role || '',
      color: r.color || '#8a9a94',
      initiative: Number(r.initiative) || 0,
      maxHp,
      hp,
      down: maxHp > 0 && hp <= 0,
      done: false, // 本轮是否已轮到（行动 / 被跳过）
    };
  });

  // 先攻降序；sort 在现代引擎中是稳定的，并列值保留名单顺序
  const order = Object.keys(units).sort(
    (a, b) => units[b].initiative - units[a].initiative
  );

  const enc = {
    id: uid('enc'),
    name: name?.trim() || '未命名遭遇',
    status: 'active', // active | frozen
    round: 1,
    cursor: order.length ? 0 : -1, // 当前轮到的位置（order 的下标）
    order,
    units,
    createdAt: Date.now(),
    endedAt: null,
    log: [],
  };
  pushLog(enc, {
    kind: 'start',
    text: `遭遇开始：${order.length} 个单位参战，${units[order[0]]?.name ?? ''} 最先行动`,
  });
  return enc;
}

export const currentUnit = (enc) =>
  enc.cursor >= 0 ? enc.units[enc.order[enc.cursor]] ?? null : null;

function clone(enc) {
  return {
    ...enc,
    order: [...enc.order],
    units: Object.fromEntries(
      Object.entries(enc.units).map(([k, v]) => [k, { ...v }])
    ),
    log: [...enc.log],
  };
}

function pushLog(enc, entry) {
  enc.log.push({ id: uid('l'), at: Date.now(), round: enc.round, ...entry });
}

const actionable = (enc, i) => {
  const u = enc.units[enc.order[i]];
  return Boolean(u && !u.down && !u.done);
};

const hasActionable = (enc) =>
  enc.order.some((_, i) => actionable(enc, i));

// 从 start 起寻找下一个可行动单位；越过队尾即开启新一轮并重置 done。
// ignoreId：延后场景下，包装轮之前忽略刚被挪到队尾的单位自己。
function seekNext(enc, start, { firstOffset = 1, ignoreId = null } = {}) {
  const n = enc.order.length;
  let wrapped = false;
  for (let k = firstOffset; k < firstOffset + n; k++) {
    const raw = start + k;
    const i = ((raw % n) + n) % n;
    if (!wrapped && raw >= n) {
      wrapped = true;
      enc.round += 1;
      Object.values(enc.units).forEach((u) => {
        u.done = false;
      });
      pushLog(enc, { kind: 'round', text: `第 ${enc.round} 轮开始` });
    }
    const u = enc.units[enc.order[i]];
    if (!u) continue;
    if (u.down) {
      // 跳过倒下者，但不动 order —— 位置原样保留。
      // 新一轮扫到倒下者时不记“已行动”：本轮回血复起仍能在原位置接手。
      if (!u.done && !wrapped) {
        u.done = true;
        pushLog(enc, {
          kind: 'skip',
          text: `${u.name} 倒下，跳过本轮（先攻位置保留）`,
        });
      }
      continue;
    }
    if (u.done) continue;
    if (!wrapped && ignoreId === u.uid) continue;
    enc.cursor = i;
    pushLog(enc, { kind: 'turn', text: `轮到 ${u.name} 行动` });
    return true;
  }
  enc.cursor = -1;
  pushLog(enc, { kind: 'stall', text: '已无可行动单位，等待复起或结束遭遇' });
  return false;
}

// 若当前位已经无法行动，把轮次交出去；全场无人可动则进入停滞（cursor=-1）
function passTurnIfNeeded(enc) {
  if (actionable(enc, enc.cursor)) return;
  if (hasActionable(enc)) {
    seekNext(enc, enc.cursor === -1 ? -1 : enc.cursor);
  } else if (enc.cursor !== -1) {
    enc.cursor = -1;
    pushLog(enc, { kind: 'stall', text: '已无可行动单位，等待复起或结束遭遇' });
  }
}

// 当前单位完成行动，交下一位
export function advance(enc) {
  if (enc.status !== 'active') return enc;
  const e = clone(enc);
  if (!hasActionable(e)) return e;
  const cur = e.units[e.order[e.cursor]];
  if (cur) cur.done = true; // 一轮一次：标记后本轮不会再回到他
  seekNext(e, e.cursor === -1 ? -1 : e.cursor);
  return e;
}

// 当前单位自愿延后：挪到队尾，顺位交给下一位
export function delayCurrent(enc) {
  if (enc.status !== 'active') return enc;
  const e = clone(enc);
  const id = e.order[e.cursor];
  const u = id && e.units[id];
  if (!u || u.down || u.done) return enc;

  const wasLast = e.cursor === e.order.length - 1;
  e.order.splice(e.cursor, 1);
  e.order.push(id); // 位置移动仅此一次；倒下留位用的是 down，不挪数组
  pushLog(e, { kind: 'delay', text: `${u.name} 选择延后，移到队尾` });

  if (wasLast) {
    // 已是队尾再延后，等同把行动让到下一轮
    seekNext(e, e.cursor, { firstOffset: 1 });
  } else {
    // 原下一位此刻正好落在 cursor 下标；队尾的自己本轮轮到前先忽略
    seekNext(e, e.cursor, { firstOffset: 0, ignoreId: id });
  }
  return e;
}

export function setDown(enc, id, down) {
  if (enc.status !== 'active') return enc;
  const e = clone(enc);
  const u = e.units[id];
  if (!u || u.down === down) return enc;
  u.down = down;
  pushLog(e, {
    kind: down ? 'down' : 'revive',
    text: down
      ? `${u.name} 倒下：跳过回合，保留先攻位置`
      : `${u.name} 复起：接回原先攻顺序`,
  });
  passTurnIfNeeded(e);
  return e;
}

export function changeHp(enc, id, nextHp) {
  if (enc.status !== 'active') return enc;
  const e = clone(enc);
  const u = e.units[id];
  if (!u) return enc;
  const prev = u.hp;
  const hp = clamp(Number(nextHp), 0, u.maxHp || Infinity);
  if (!Number.isFinite(hp) || hp === prev) return enc;

  u.hp = hp;
  pushLog(e, {
    kind: hp < prev ? 'damage' : 'heal',
    text: `${u.name} 生命 ${prev} → ${hp}`,
  });

  // 生命与倒下状态联动：归零自动倒下，从 0 治回来自动复起接回原顺序
  if (hp <= 0 && !u.down) {
    u.down = true;
    pushLog(e, {
      kind: 'down',
      text: `${u.name} 倒下：跳过回合，保留先攻位置`,
    });
  } else if (prev <= 0 && hp > 0 && u.down) {
    u.down = false;
    pushLog(e, { kind: 'revive', text: `${u.name} 复起：接回原先攻顺序` });
  }
  passTurnIfNeeded(e);
  return e;
}

// 冻结经过：状态固化，之后轮转类操作一律拒绝
export function endEncounter(enc) {
  if (enc.status === 'frozen') return enc;
  const e = clone(enc);
  e.status = 'frozen';
  e.endedAt = Date.now();
  pushLog(e, {
    kind: 'end',
    text: `遭遇结束，经过冻结（共进行 ${e.round} 轮）`,
  });
  return e;
}

// 冻结后唯一允许的写入：必须带原因的补记，只追加，不改旧内容
export function supplement(enc, { reason, text } = {}) {
  const r = reason?.trim();
  const t = text?.trim();
  if (!r) throw new Error('补记必须填写原因');
  if (!t) throw new Error('补记内容不能为空');
  const e = clone(enc);
  e.log.push({
    id: uid('l'),
    at: Date.now(),
    round: null,
    kind: 'supplement',
    reason: r,
    text: t,
  });
  return e;
}
