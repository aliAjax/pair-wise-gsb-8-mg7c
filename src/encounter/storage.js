// 遭遇存档层：轮转中的经过、编排草稿、已结束档案分别存取。
// 全部走 localStorage，页面重开时从同一把手里继续。

const ACTIVE_KEY = 'encounter-active'; // 正在进行的遭遇（含轮转状态）
const DRAFT_KEY = 'encounter-draft'; // 尚未开打、正在编排的名单
const ARCHIVE_KEY = 'encounter-archive'; // 冻结后的旧记录
const LIMIT_KEY = 'encounter-limit'; // 档案最多保留份数

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const loadActive = () => readJson(ACTIVE_KEY, null);
export const loadDraft = () => readJson(DRAFT_KEY, null);
export const loadArchive = () => readJson(ARCHIVE_KEY, []);
export const saveArchive = (list) =>
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list));

export const saveActive = (enc) => {
  if (enc) localStorage.setItem(ACTIVE_KEY, JSON.stringify(enc));
  else localStorage.removeItem(ACTIVE_KEY);
};

export const saveDraft = (draft) => {
  if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  else localStorage.removeItem(DRAFT_KEY);
};

// 冻结时调用：从活动位取下、放进档案，旧记录一律保留
export const archiveEncounter = (enc) => {
  const list = loadArchive().filter((x) => x.id !== enc.id);
  list.unshift(enc);
  const limit = readJson(LIMIT_KEY, 30);
  localStorage.setItem(
    ARCHIVE_KEY,
    JSON.stringify(list.slice(0, Math.max(1, limit)))
  );
  localStorage.removeItem(ACTIVE_KEY);
  return list;
};
