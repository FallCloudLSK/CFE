/* =====================================================================
 * 五行戰鬥牌 5.17 規則資料（戰局記錄器用）
 * 陣法、職業、能力、精靈、秘計、星辰、環境、圖騰
 * 陣法的 run(E, c, o) 透過引擎 E 提供的操作來產生效果。
 * ===================================================================== */
(function (root) {
'use strict';

const EL = ['金', '木', '水', '火', '土'];
const ELI = { 金: 0, 木: 1, 水: 2, 火: 3, 土: 4 };
const GEN = [2, 3, 1, 4, 0];          // 金生水 木生火 水生木 火生土 土生金
const KE = [1, 4, 3, 0, 2];           // 金剋木 木剋土 水剋火 火剋金 土剋水
const MOTHER = [4, 2, 0, 1, 3];       // 生我者：土生金 水生木 金生水 木生火 火生土

const MODULES = [
  { id: 'basic', name: '基礎規則', fixed: true },
  { id: 'star', name: '星辰圖記' },
  { id: 'five', name: '五方傳說' },
  { id: 'hero', name: '英雄學派' },
  { id: 'spirit', name: '精靈' },
  { id: 'jianghu', name: '江湖' },
  { id: 'conf', name: '匯流世代' },
  { id: 'pouch', name: '錦囊' },
  { id: 'dark', name: '黑暗微光' },
  { id: 'totem', name: '圖騰法陣' },
  { id: 'retrieve', name: '棄牌回收' },
];

/* ---------- 牌 ---------- */
function card(s) {                    // '金3' -> {e:0,l:3}
  if (s && typeof s === 'object') return s;
  return { e: ELI[s[0]], l: +s[1] };
}
function cs(c) { return EL[c.e] + c.l; }
function cardsText(arr) { return arr.map(cs).join(''); }

/* ---------- 牌組判斷工具 ---------- */
const H = {
  n: c => c.length,
  cnt: (c, e) => c.filter(x => x.e === e).length,
  all: (c, e) => c.length > 0 && c.every(x => x.e === e),
  sum: c => c.reduce((a, x) => a + x.l, 0),
  sameL: c => c.length > 0 && c.every(x => x.l === c[0].l),
  diffE: c => new Set(c.map(x => x.e)).size === c.length,
  diffL: c => new Set(c.map(x => x.l)).size === c.length,
  // 精確屬性組成，例如 'ww' 以字串表示：H.exact(c, '金金火水')
  exact(c, spec) {
    if (c.length !== spec.length) return false;
    const need = [0, 0, 0, 0, 0];
    for (const ch of spec) need[ELI[ch]]++;
    for (const x of c) need[x.e]--;
    return need.every(v => v === 0);
  },
  // 至少包含 spec，其餘 extra 張任意
  contains(c, spec, extra) {
    if (c.length !== spec.length + extra) return false;
    const need = [0, 0, 0, 0, 0];
    for (const ch of spec) need[ELI[ch]]++;
    for (const x of c) if (need[x.e] > 0) need[x.e]--;
    return need.every(v => v === 0);
  },
  // X＋同級牌：兩張，其中一張屬性X，另一張與之同級
  xSame(c, e) { return c.length === 2 && c[0].l === c[1].l && (c[0].e === e || c[1].e === e); },
  chainGen(c) {                     // 三張連續相生
    if (c.length !== 3 || !H.diffE(c)) return false;
    const s = new Set(c.map(x => x.e));
    return c.some(x => s.has(GEN[x.e]) && s.has(GEN[GEN[x.e]]));
  },
  chainKe(c) {
    if (c.length !== 3 || !H.diffE(c)) return false;
    const s = new Set(c.map(x => x.e));
    return c.some(x => s.has(KE[x.e]) && s.has(KE[KE[x.e]]));
  },
  pairGen: c => c.length === 2 && (GEN[c[0].e] === c[1].e || GEN[c[1].e] === c[0].e),
  pairKe: c => c.length === 2 && (KE[c[0].e] === c[1].e || KE[c[1].e] === c[0].e),
  levels: (c, arr) => c.length === arr.length && c.map(x => x.l).sort().join() === arr.slice().sort().join(),
  // 任意張數 e 行牌，等級總和 >= n
  elemSum: (c, e, n) => H.all(c, e) && H.sum(c) >= n,
  // 雙屬性各任意張，各自總和 >= a / b
  twoElemSum(c, e1, n1, e2, n2) {
    if (!c.every(x => x.e === e1 || x.e === e2)) return false;
    const s1 = c.filter(x => x.e === e1).reduce((a, x) => a + x.l, 0);
    const s2 = c.filter(x => x.e === e2).reduce((a, x) => a + x.l, 0);
    return s1 >= n1 && s2 >= n2;
  },
  maxL: c => Math.max(0, ...c.map(x => x.l)),
};

/* ---------- 星辰 ---------- */
const STARS = [
  { e: 0, name: '金星‧太白', short: '太白', strike: '太白星擊', array: '太白鍊天陣' },
  { e: 1, name: '木星‧歲星', short: '歲星', strike: '歲星星擊', array: '歲星柱天陣' },
  { e: 2, name: '水星‧辰星', short: '辰星', strike: '辰星星擊', array: '辰星淬天陣' },
  { e: 3, name: '火星‧熒惑', short: '熒惑', strike: '熒惑星擊', array: '熒惑燎天陣' },
  { e: 4, name: '土星‧鎮星', short: '鎮星', strike: '鎮星星擊', array: '鎮星堪天陣' },
];
// 第2項效果：生我者可視為我（土→金、水→木、金→水、木→火、火→土）

/* ---------- 環境 ---------- */
const ENV_INVALID = [
  ['防禦', '氣壁', '暗黑氣壁'],
  ['幻化', '混沌', '暗黑混沌'],
  ['反震', '震暴', '暗黑震暴'],
  ['武器', '光芒', '暗黑光芒'],
  ['封印', '歸元', '暗黑歸元'],
];
const TOTEMS = [
  { e: 0, name: '白牙圖騰', protect: ['武器', '光芒'] },
  { e: 1, name: '青角圖騰', protect: ['防禦', '氣壁'] },
  { e: 2, name: '玄甲圖騰', protect: ['封印', '歸元'] },
  { e: 3, name: '朱羽圖騰', protect: ['反震', '震暴'] },
  { e: 4, name: '黃鱗圖騰', protect: ['幻化', '混沌'] },
];

/* =====================================================================
 * 陣法
 *   cat: 'attack' | 'active' | 'passive'
 *   atk: 0-4 五行攻擊 / 'P' 物理 / 'S' 特殊（僅攻擊）
 *   pats: 組成方式 [{m(c,X), need?, adj?, tag?}]
 *     need: 'job:<能力名>' 需職業能力；'form' 需擁有該陣法（職業/星辰）
 *   pts(c, X): 點數（c 已套用點數用等級）
 *   run(E, c, o): 效果
 * ===================================================================== */
const F = [];
function def(f) { f.pats = f.pats || []; F.push(f); return f; }

/* ----- 基礎規則 ----- */
EL.forEach((n, e) => def({
  id: n + '擊術', mod: 'basic', basic: true, size: 1, cat: 'attack', atk: e,
  pats: [{ m: c => c.length === 1 && c[0].e === e }],
  pts: c => H.sum(c) + 4,
  run: (E, c, o) => E.attack(o.pts),
}));
def({ id: '武器', mod: 'basic', basic: true, size: 2, cat: 'attack', atk: 'P',
  pats: [{ m: c => H.exact(c, '金金') }, { m: c => c.length === 2 && H.cnt(c, 0) >= 1, need: 'job:武器專精', tag: '武器專精' }],
  pts: (c, X) => H.sum(c) * 2 * (X.ab('狂影') && H.exact(X.printed || c, '金金') ? 2 : 1),
  run: (E, c, o) => { E.attack(o.pts); if (E.ab('武器精研')) E.draw(1, '武器精研'); } });
def({ id: '防禦', mod: 'basic', basic: true, size: 2, cat: 'passive', counter: 'nullAtk',
  pats: [{ m: c => H.exact(c, '木木') }, { m: c => c.length === 2 && H.cnt(c, 1) >= 1, need: 'job:防禦專精', tag: '防禦專精' }] });
def({ id: '封印', mod: 'basic', basic: true, size: 2, cat: 'passive', counter: 'nullSpell',
  pats: [{ m: c => H.exact(c, '水水') }, { m: c => c.length === 2 && H.cnt(c, 2) >= 1, need: 'job:封印專精', tag: '封印專精' }] });
def({ id: '反震', mod: 'basic', basic: true, size: 2, cat: 'passive', counter: 'split',
  pats: [{ m: c => H.exact(c, '火火') }, { m: c => c.length === 2 && H.cnt(c, 3) >= 1, need: 'job:反震專精', tag: '反震專精' }] });
def({ id: '幻化', mod: 'basic', basic: true, size: 2, cat: 'active',
  pats: [{ m: c => H.exact(c, '土土') }, { m: c => c.length === 2 && H.cnt(c, 4) >= 1, need: 'job:幻化專精', tag: '幻化專精' }],
  run: (E, c, o) => E.metamorph(c) });
def({ id: '空城', mod: 'basic', basic: true, size: 2, cat: 'passive', counter: null,
  pats: [{ m: c => c.length === 2 && c[0].e !== c[1].e }] });
const TRI = ['鍠金', '樸木', '洄水', '熾火', '坱土'];
TRI.forEach((n, e) => def({
  id: n, mod: 'basic', basic: true, size: 3, cat: 'attack', atk: e,
  pats: [{ m: c => c.length === 3 && H.all(c, e) },
    { m: c => c.length === 3 && H.cnt(c, e) === 2, need: 'job:' + n + '專精', adj: -6, tag: n + '專精', noStar: true }],
  pts: c => H.sum(c) * 3,
  run: (E, c, o) => {
    E.attack(o.pts);
    if (o.pts >= 30 && (!o.pat.noStar || E.ab('法粹'))) E.summonStar(e);
  },
}));
def({ id: '生陣', mod: 'basic', basic: true, size: 3, cat: 'active',
  pats: [{ m: H.chainGen }, { m: H.pairGen, need: 'job:生陣專精', tag: '生陣專精' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => E.heal(E.me, o.pts, { formation: true }) });
def({ id: '剋陣', mod: 'basic', basic: true, size: 3, cat: 'active',
  pats: [{ m: H.chainKe }, { m: H.pairKe, need: 'job:剋陣專精', tag: '剋陣專精' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => E.shieldDown(E.opp, o.pts) });
def({ id: '光芒', mod: 'basic', basic: true, size: 4, cat: 'active',
  pats: [{ m: c => H.exact(c, '金金火水') }, { m: c => H.contains(c, '金金火', 1), need: 'job:光芒專精', tag: '光芒專精' }],
  run: (E) => { if (E.immuneShadow()) return E.note('影遁：不受光芒影響');
    E.view(); E.status(E.opp, 'stun', 2); E.status(E.opp, 'nodraw', 2); E.xianshu(); } });
def({ id: '氣壁', mod: 'basic', basic: true, size: 4, cat: 'active',
  pats: [{ m: c => H.exact(c, '木木金火') }, { m: c => H.contains(c, '木木金', 1), need: 'job:氣壁專精', tag: '氣壁專精' }],
  pts: c => H.sum(c) * 4, run: (E, c, o) => { E.buildShield(E.me, o.pts); E.xianshu(); } });
def({ id: '歸元', mod: 'basic', basic: true, size: 4, cat: 'active',
  pats: [{ m: c => H.exact(c, '水水土木') }, { m: c => H.contains(c, '水水土', 1), need: 'job:歸元專精', tag: '歸元專精' }],
  pts: c => H.sum(c) * 4, run: (E, c, o) => { E.heal(E.me, o.pts, { formation: true }); E.xianshu(); } });
def({ id: '震暴', mod: 'basic', basic: true, size: 4, cat: 'attack', atk: 'P',
  pats: [{ m: c => H.exact(c, '火火水土') }, { m: c => H.contains(c, '火火水', 1), need: 'job:震暴專精', tag: '震暴專精' }],
  pts: c => H.sum(c) * 4,
  run: (E, c, o) => { E.attack(o.pts); if (E.ab('戰魄')) { E.status(E.opp, 'stun', 1, '戰魄'); E.status(E.opp, 'nodraw', 1, '戰魄'); } E.xianshu(); } });
def({ id: '混沌', mod: 'basic', basic: true, size: 4, cat: 'active',
  pats: [{ m: c => H.exact(c, '土土木金') }, { m: c => H.contains(c, '土土木', 1), need: 'job:混沌專精', tag: '混沌專精' }],
  run: (E) => { if (E.immuneShadow()) return E.note('影遁：不受混沌影響'); E.view(); E.handDelta(E.opp, -2, '放回牌堆'); E.xianshu(); } });
def({ id: '五行輪迴', mod: 'basic', basic: true, size: 5, cat: 'active',
  pats: [{ m: c => c.length === 5 && H.diffE(c) }, { m: c => c.length === 4 && H.diffE(c), need: 'job:五行輪迴專精', tag: '五行輪迴專精' }],
  run: E => E.swapHp() });
def({ id: '五流歸一', mod: 'basic', basic: true, size: 5, cat: 'attack', atk: 'S',
  pats: [{ m: c => c.length === 5 && H.sameL(c) }, { m: c => c.length === 4 && H.sameL(c), need: 'job:五流歸一專精', adj: -15, tag: '五流歸一專精' }],
  pts: (c, X) => X.oppHand * 15 + (X.ab('純陽勁') ? 15 : 0),
  run: (E, c, o) => {
    if (E.ab('極陽勁')) { E.breakShield(E.opp, '極陽勁'); }
    E.attack(o.pts); E.draw(1, '五流歸一');
    if (E.ab('極陽勁')) E.status(E.opp, 'stun', 1, '極陽勁');
  } });

/* ----- 星辰圖記 ----- */
def({ id: '虛空破星術', mod: 'star', size: 3, cat: 'active', voidArt: true,
  pats: [{ m: c => c.length === 3 && H.sameL(c) }], run: E => E.voidStar() });
STARS.forEach(s => {
  def({ id: s.strike, mod: 'star', size: 1, cat: 'attack', atk: s.e, star: s.e,
    pats: [{ m: c => c.length === 1 && c[0].e === s.e, need: 'form' }], pts: () => 10, run: (E, c, o) => E.attack(o.pts) });
  def({ id: s.array, mod: 'star', size: 3, cat: 'attack', atk: s.e, star: s.e,
    pats: [{ m: c => H.exact(c, EL[s.e] + EL[s.e] + EL[MOTHER[s.e]]), need: 'form' }],
    pts: c => H.sum(c) * 3, run: (E, c, o) => { E.attack(o.pts); E.draw(1, s.array); E.breakOwnStar(s.e); } });
});

/* ----- 五方傳說 ----- */
const BEASTS = ['西‧白虎', '東‧青龍', '北‧玄武', '南‧朱雀', '中‧黃蛇'];
BEASTS.forEach((n, e) => def({
  id: n, mod: 'five', size: 5, cat: 'attack', atk: e, beast: true,
  pats: [{ m: c => c.length === 5 && H.all(c, e) }], pts: () => 81,
  run: (E, c, o) => { E.attack(o.pts); E.setEnv(e); },
}));
def({ id: '虛空斷脈術', mod: 'five', size: 3, cat: 'active', voidArt: true,
  pats: [{ m: c => c.length === 3 && H.sameL(c) }], run: E => E.voidEnv() });

/* ----- 英雄學派 ----- */
def({ id: '虛空返璞術', mod: 'hero', size: 3, cat: 'active', voidArt: true,
  pats: [{ m: c => c.length === 3 && H.sameL(c) }], run: (E, c) => E.voidJob(c[0].l <= 2) });
def({ id: '神兵', mod: 'hero', size: 2, cat: 'attack', atk: 'P', pats: [{ m: c => H.xSame(c, 0), need: 'form' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => E.attack(o.pts) });
def({ id: '落光斬', mod: 'hero', size: 4, cat: 'attack', atk: 'P', pats: [{ m: c => H.exact(c, '金金火火'), need: 'form' }],
  pts: c => H.sum(c) * 6, run: (E, c, o) => E.attack(o.pts) });
def({ id: '道禦', mod: 'hero', size: 2, cat: 'attack', atk: 'S', pats: [{ m: c => H.xSame(c, 1), need: 'form' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => { E.attack(o.pts); E.counter('nullAtk', '道禦'); } });
def({ id: '轉生術', mod: 'hero', size: 4, cat: 'active',
  pats: [{ m: c => zhuanSheng(c).length > 0, need: 'form' }],
  choice: c => { const w = zhuanSheng(c); return w.length > 1 ? { key: 'wood', title: '轉生術：指定單獨的木行牌', options: w.map(l => ({ v: l, label: '木' + l + '（' + l * 25 + '點）' })) } : null; },
  pts: (c, X) => { const w = zhuanSheng(c); const pick = X.choice && X.choice.wood; return (w.includes(pick) ? pick : Math.max(...w)) * 25; },
  run: (E, c, o) => E.heal(E.me, o.pts, { formation: true }) });
function zhuanSheng(c) {            // 回傳可作為「單獨木」的等級
  if (c.length !== 4) return [];
  const out = new Set();
  c.forEach((x, i) => {
    if (x.e !== 1) return;
    const rest = c.filter((_, j) => j !== i);
    if (H.chainGen(rest) && H.sum(rest) >= 10) out.add(x.l);
  });
  return [...out];
}
def({ id: '幻印', mod: 'hero', size: 2, cat: 'attack', atk: 'S', pats: [{ m: c => H.xSame(c, 2), need: 'form' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => { E.attack(o.pts); E.counter('nullSpell', '幻印'); } });
def({ id: '紫光防罩', mod: 'hero', size: 5, cat: 'active', pats: [{ m: c => H.contains(c, '水水', 3), need: 'form' }],
  pts: c => H.sum(c) * 5, run: (E, c, o) => E.buildShield(E.me, o.pts) });
def({ id: '法震', mod: 'hero', size: 2, cat: 'attack', atk: 'S', pats: [{ m: c => H.xSame(c, 3), need: 'form' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => { E.attack(o.pts); E.counter('split', '法震'); } });
def({ id: '魔法反光閃', mod: 'hero', size: 4, cat: 'attack', atk: 'S',
  pats: [{ m: c => c.length === 4 && H.cnt(c, 3) === 2, need: 'form' }],
  pts: c => { const f = c.filter(x => x.e === 3); return f[0].l * f[1].l * 5; },
  run: (E, c, o) => { E.attack(o.pts); E.noDraw('魔法反光閃'); } });
def({ id: '影襲', mod: 'hero', size: 2, cat: 'active', pats: [{ m: c => H.xSame(c, 4), need: 'form' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => E.lose(E.opp, o.pts, { formation: true }) });
def({ id: '刃影瞬殺', mod: 'hero', size: 0, cat: 'active', pats: [{ m: c => H.elemSum(c, 4, 10), need: 'form' }],
  run: E => E.halveHp(E.opp) });
def({ id: '凝華斷空箭', mod: 'hero', size: 3, cat: 'attack', atk: 'S', pats: [{ m: c => c.length === 3 && H.sameL(c), need: 'form' }],
  pts: () => 20, run: (E, c, o) => { E.attack(o.pts); E.draw(2, '凝華斷空箭'); } });
def({ id: '天弓嘯', mod: 'hero', size: 3, cat: 'attack', atk: 'S', pats: [{ m: c => H.levels(c, [5, 5, 5]), need: 'form' }],
  pts: () => 60, run: (E, c, o) => E.attack(o.pts) });
def({ id: '聖光破', mod: 'hero', size: 1, cat: 'attack', atk: 'S', pats: [{ m: c => c.length === 1 && c[0].l % 2 === 0, need: 'form' }],
  pts: () => 10, run: (E, c, o) => { E.attack(o.pts); E.counter('reveal', '聖光破'); } });
def({ id: '聖風', mod: 'hero', size: 3, cat: 'active', pats: [{ m: c => H.levels(c, [4, 4, 4]), need: 'form' }],
  run: E => { E.lose(E.opp, 20, { formation: true }); E.view(); E.handDelta(E.opp, -1, '聖風取牌'); E.handDelta(E.me, 1, '聖風取牌'); } });

/* ----- 精靈 ----- */
const SPIRIT_FORMS = ['金靈喚術', '木靈喚術', '水靈喚術', '火靈喚術', '土靈喚術'];
SPIRIT_FORMS.forEach((n, e) => def({ id: n, mod: 'spirit', size: 2, cat: 'active',
  pats: [{ m: c => c.length === 2 && H.all(c, e) }], run: E => E.summonSpirit(EL[e]) }));
def({ id: '虛空碎靈術', mod: 'spirit', size: 3, cat: 'active', voidArt: true,
  pats: [{ m: c => c.length === 3 && H.sameL(c) }], run: E => E.voidSpirit() });

/* ----- 江湖 ----- */
def({ id: '千鋒劍訣', mod: 'jianghu', size: 2, cat: 'attack', atk: 'P', pats: [{ m: c => H.xSame(c, 0), need: 'form' }],
  pts: c => H.sum(c) * 3, preStatus: 'qianfeng',
  run: (E, c, o) => E.attack(o.pts) });
def({ id: '踏雪劍訣', mod: 'jianghu', size: 2, cat: 'attack', atk: 'S', pats: [{ m: c => H.xSame(c, 2), need: 'form' }],
  pts: c => H.sum(c) * 3, preStatus: 'taxue',
  run: (E, c, o) => E.attack(o.pts) });
def({ id: '流影殘光劍', mod: 'jianghu', size: 3, cat: 'attack', atk: 'S', pats: [{ m: c => c.length === 3 && H.diffL(c), need: 'form' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => { E.attack(o.pts); E.counter('nullAtk40', '流影殘光劍'); } });
def({ id: '千鋒飛羽', mod: 'jianghu', size: 3, cat: 'attack', atk: 'P',
  pats: [{ m: c => c.length === 3 && fly(c, 0), need: 'form' }], pts: () => 30,
  run: (E, c, o) => { E.attack(o.pts); if (E.hasStatus(E.me, 'qianfeng')) E.lose(E.opp, 20, { formation: true }); } });
def({ id: '踏雪映月', mod: 'jianghu', size: 3, cat: 'attack', atk: 'S',
  pats: [{ m: c => c.length === 3 && fly(c, 2), need: 'form' }], pts: () => 30,
  run: (E, c, o) => { E.attack(o.pts); if (E.hasStatus(E.me, 'taxue')) { E.status(E.opp, 'stun', 1, '踏雪映月'); E.status(E.opp, 'nodraw', 1, '踏雪映月'); } } });
function fly(c, e) {                // XX＋５
  for (let i = 0; i < 3; i++) {
    if (c[i].l !== 5) continue;
    const r = c.filter((_, j) => j !== i);
    if (r.every(x => x.e === e)) return true;
  }
  return false;
}
def({ id: '流影崩雲劍', mod: 'jianghu', size: 5, cat: 'attack', atk: 'S', pats: [{ m: c => H.levels(c, [1, 2, 3, 4, 5]), need: 'form' }],
  pts: () => 80, run: (E, c, o) => {
    E.attack(o.pts);
    if (E.hasStatus(E.me, 'qianfeng')) E.lose(E.opp, 20, { formation: true });
    if (E.hasStatus(E.me, 'taxue')) { E.status(E.opp, 'stun', 1, '流影崩雲劍'); E.status(E.opp, 'nodraw', 1, '流影崩雲劍'); }
  } });
def({ id: '點水扇', mod: 'jianghu', size: 1, cat: 'attack', atk: 'S', pats: [{ m: c => c.length === 1 && c[0].l === 1, need: 'form' }],
  pts: () => 5, run: (E, c, o) => {
    E.attack(o.pts);
    const need = E.meteor() ? 3 : 4;
    if (E.oppLastFormSize() >= need) { E.status(E.opp, 'stun', 1, '點水扇'); E.status(E.opp, 'nodraw', 1, '點水扇'); }
  } });
def({ id: '凌風扇', mod: 'jianghu', size: 1, cat: 'attack', atk: 'S', pats: [{ m: c => c.length === 1 && c[0].l === 3, need: 'form' }],
  pts: () => 10, run: (E, c, o) => { E.attack(o.pts); if (E.meteor()) E.draw(1, '流星步'); } });
def({ id: '天外飛扇', mod: 'jianghu', size: 1, cat: 'attack', atk: 'S', pats: [{ m: c => c.length === 1 && c[0].l === 5, need: 'form' }],
  pts: () => 0, run: (E, c, o) => {
    E.attack(o.pts);
    if (E.meteor()) E.lose(E.opp, 20, { formation: true }); else E.delayedLose(E.opp, 20, '天外飛扇');
  } });
def({ id: '毒鏢', mod: 'jianghu', size: 1, cat: 'active', pats: [{ m: c => c.length === 1 && c[0].e === 0, need: 'form' }],
  run: E => E.poison(E.opp, 1) });
def({ id: '毒煙', mod: 'jianghu', size: 2, cat: 'passive', counter: 'poison',
  pats: [{ m: c => H.exact(c, '火木'), need: 'form' }] });
def({ id: '千毒手', mod: 'jianghu', size: 3, cat: 'active', pats: [{ m: c => c.length === 3 && H.diffE(c) && H.sameL(c), need: 'form' }],
  run: E => { E.lose(E.opp, 10, { formation: true }); E.poison(E.opp, 2); } });
def({ id: '殘霜手', mod: 'jianghu', size: 3, cat: 'active', pats: [{ m: c => H.exact(c, '水水水'), need: 'form' }],
  run: E => { E.status(E.opp, 'stun', 1, '殘霜手'); E.status(E.opp, 'nodraw', 1, '殘霜手'); E.poison(E.opp, 2); } });
def({ id: '閻王令', mod: 'jianghu', size: 1, cat: 'active', pats: [{ m: c => c.length === 1 && c[0].l === 1, need: 'form' }],
  run: E => { if (E.hp(E.opp) <= 40) E.win(E.me, '閻王令'); else E.note('對方生命高於40，無效果'); } });

/* ----- 匯流世代 ----- */
const RES = [
  { id: '鏡鳴', e: 0, run: E => { E.view(); E.handDelta(E.opp, -1, '鏡鳴捨棄'); } },
  { id: '森鳴', e: 1, run: E => E.heal(E.me, 20, { formation: true }) },
  { id: '淙鳴', e: 2, run: E => E.draw(2, '淙鳴') },
  { id: '煌鳴', e: 3, run: E => E.lose(E.opp, 20, { formation: true }) },
  { id: '垠鳴', e: 4, run: E => E.buildShield(E.me, 15) },
];
RES.forEach(r => def({ id: r.id, mod: 'conf', size: 2, cat: 'active', resonance: r.e,
  pats: [{ m: (c, X) => X.res && X.res.e === r.e && c.length === 2 && resPair(c, r.e, X.res.l), need: 'form' }],
  run: r.run }));
function resPair(c, e, l) {
  return (c[0].e === e && c[1].l === l) || (c[1].e === e && c[0].l === l);
}
def({ id: '千鳴', mod: 'conf', size: 3, cat: 'active',
  pats: [{ m: (c, X) => X.res && c.length === 3 && qianMing(c, X.res), need: 'form' }],
  choice: (c, X) => ({ key: 'res', title: '千鳴：指定另一個五鳴術', options: RES.filter(r => !X.res || r.e !== X.res.e).map(r => ({ v: r.id, label: r.id })) }),
  run: (E, c, o) => {
    const own = RES.find(r => E.res() && r.e === E.res().e);
    if (own) own.run(E);
    const other = RES.find(r => r.id === (o.choice && o.choice.res));
    if (other) other.run(E); else E.issue('warn', '千鳴未指定第二個五鳴術');
  } });
function qianMing(c, res) {         // 餘行牌＋餘級牌＋餘行餘級牌
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  return perms.some(([a, b, d]) => c[a].e === res.e && c[b].l === res.l && c[d].e === res.e && c[d].l === res.l);
}
def({ id: '萬鳴', mod: 'conf', size: 5, cat: 'active',
  pats: [{ m: (c, X) => X.res && c.length === 5 && H.diffE(c) && c.some(x => x.e === X.res.e && x.l === X.res.l), need: 'form' }],
  run: E => { E.lose(E.opp, 20, { formation: true }); E.heal(E.me, 20, { formation: true }); E.buildShield(E.me, 15); E.view(); E.handDelta(E.opp, -1, '萬鳴捨棄'); E.draw(1, '萬鳴'); } });
def({ id: '禁錮法陣', mod: 'conf', size: 1, cat: 'active', limited: '禁錮法陣',
  pats: [{ m: c => c.length === 1 && c[0].l === 5, need: 'form' }],
  run: E => { E.status(E.opp, 'stun', 1, '禁錮法陣'); E.status(E.opp, 'nodraw', 1, '禁錮法陣'); } });
def({ id: '無盡法陣', mod: 'conf', size: 1, cat: 'active', pats: [{ m: c => c.length === 1 && c[0].l === 5, need: 'form' }],
  run: E => E.resetUses('禁錮法陣') });
def({ id: '舞風', mod: 'conf', size: 2, cat: 'active', pats: [{ m: c => c.length === 2 && Math.abs(c[0].l - c[1].l) === 1, need: 'form' }],
  run: E => E.draw(1, '舞風') });
def({ id: '晴風萬里', mod: 'conf', size: 4, cat: 'active', pats: [{ m: c => H.levels(c, [1, 2, 3, 4]) || H.levels(c, [2, 3, 4, 5]), need: 'form' }],
  choice: () => ({ key: 'keep', title: '晴風萬里：加入手牌幾張？', options: [0, 1, 2, 3, 4, 5].map(v => ({ v, label: v + ' 張' })) }),
  run: (E, c, o) => { const k = o.choice && o.choice.keep; if (k == null) E.issue('warn', '晴風萬里未輸入加入手牌張數'); else E.handDelta(E.me, +k, '晴風萬里'); E.note('加入手牌' + k + '張'); const d = o.choice && o.choice.discards; if (d && d.length) E.note('捨棄' + d.join('')); } });
def({ id: '虛空絕壁術', mod: 'conf', size: 3, cat: 'active', voidArt: true, pats: [{ m: c => c.length === 3 && H.sameL(c), need: 'form' }],
  run: E => E.voidWall() });
def({ id: '虛空歸無術', mod: 'conf', size: 3, cat: 'active', voidArt: true, pats: [{ m: c => c.length === 3 && H.sameL(c), need: 'form' }],
  run: E => { E.halveHp(E.me); E.halveHp(E.opp); E.lose(E.opp, 20, { formation: true }); } });

/* ----- 錦囊 ----- */
def({ id: '連環', mod: 'pouch', size: 3, cat: 'active', pats: [{ m: c => c.length === 3 && H.diffE(c) && H.diffL(c) }],
  run: (E, c, o) => E.chain(o.choice || {}) });

/* ----- 黑暗微光 ----- */
const DARK = [
  { id: '暗黑光芒', spec: '金金火水', run: E => { if (E.immuneShadow()) return E.note('影遁：不受暗黑光芒影響'); E.view(); E.lose(E.opp, 15, { formation: true }); E.status(E.opp, 'stun', 2); E.status(E.opp, 'nodraw', 2); } },
  { id: '暗黑氣壁', spec: '木木金火', pts: c => H.sum(c) * 6, run: (E, c, o) => E.buildShield(E.me, o.pts) },
  { id: '暗黑歸元', spec: '水水土木', pts: c => H.sum(c) * 6, run: (E, c, o) => E.heal(E.me, o.pts, { formation: true }) },
  { id: '暗黑震暴', spec: '火火水土', atk: 'P', pts: c => H.sum(c) * 6, run: (E, c, o) => E.attack(o.pts) },
  { id: '暗黑混沌', spec: '土土木金', run: E => { if (E.immuneShadow()) return E.note('影遁：不受暗黑混沌影響'); E.view(); E.lose(E.opp, 15, { formation: true }); E.handDelta(E.opp, -2, '隨機放回牌堆'); } },
];
DARK.forEach(d => def({ id: d.id, mod: 'dark', size: 4, cat: d.atk ? 'attack' : 'active', atk: d.atk, dark: true,
  pats: [{ m: c => H.exact(c, d.spec) && H.sum(c) <= 10, need: 'form' }], pts: d.pts, run: d.run }));
def({ id: '暗行輪迴', mod: 'dark', size: 5, cat: 'active', dark: true,
  pats: [{ m: c => c.length === 5 && H.diffE(c) && H.sum(c) <= 10, need: 'form' }],
  run: E => { E.lose(E.opp, 50, { formation: true }); E.heal(E.me, 50, { formation: true }); E.breakOwnJob(); } });
def({ id: '殘影斬', mod: 'dark', size: 2, cat: 'attack', atk: 'P', pats: [{ m: c => c.length === 2 && H.cnt(c, 4) >= 1, need: 'form' }],
  pts: (c, X) => 8 * (X.ab('狂影') && H.exact(X.printed || c, '土土') ? 2 : 1),
  run: (E, c, o) => { E.attack(o.pts); E.lose(E.opp, 8, { formation: true }); } });
def({ id: '殘影狂刃斬', mod: 'dark', size: 2, cat: 'attack', atk: 'P', pats: [{ m: c => H.exact(c, '金土') && H.sum(c) % 2 === 0, need: 'form' }],
  pts: c => H.sum(c) * 3, run: (E, c, o) => { E.attack(o.pts); E.lose(E.opp, o.pts, { formation: true }); E.status(E.opp, 'stun', 1, '殘影狂刃斬'); E.status(E.opp, 'nodraw', 1, '殘影狂刃斬'); E.breakOwnJob(); } });
def({ id: '惡靈召喚陣', mod: 'dark', size: 2, cat: 'active', pats: [{ m: c => H.levels(c, [2, 2]), need: 'form' }],
  run: E => E.summonSpirit('惡', true) });
def({ id: '死靈召喚陣', mod: 'dark', size: 2, cat: 'active', pats: [{ m: c => H.levels(c, [4, 4]), need: 'form' }],
  run: E => E.summonSpirit('死', true) });

/* ----- 圖騰法陣 ----- */
function totemPat(e) { return c => c.length === 3 && H.all(c, e) && c.some(x => x.l === 5); }
def({ id: '東靈陣‧青角', mod: 'totem', size: 3, cat: 'active', pats: [{ m: totemPat(1) }],
  run: E => { E.heal(E.me, 15, { formation: true }); E.buildShield(E.me, 15); E.setEnv(1); E.setTotem(1); } });
def({ id: '西靈陣‧白牙', mod: 'totem', size: 3, cat: 'active', pats: [{ m: totemPat(0) }],
  run: E => { E.lose(E.opp, 30, { formation: true }); E.setEnv(0); E.setTotem(0); } });
def({ id: '南靈陣‧朱羽', mod: 'totem', size: 3, cat: 'attack', atk: 'choice', pats: [{ m: totemPat(3) }],
  choice: () => ({ key: 'el', title: '南靈陣‧朱羽：選擇攻擊屬性', options: EL.map((n, i) => ({ v: i, label: n + '行' })) }),
  pts: () => 20, run: (E, c, o) => { E.attack(o.pts); E.setEnv(3); E.setTotem(3); } });
def({ id: '北靈陣‧玄甲', mod: 'totem', size: 3, cat: 'active', pats: [{ m: totemPat(2) }],
  run: E => { E.draw(1, '北靈陣'); E.view(); E.status(E.opp, 'stun', 1, '北靈陣'); E.status(E.opp, 'nodraw', 1, '北靈陣'); E.setEnv(2); E.setTotem(2); } });
def({ id: '中靈陣‧黃鱗', mod: 'totem', size: 3, cat: 'active', pats: [{ m: totemPat(4) }],
  run: E => { E.view(); E.handDelta(E.opp, -1, '黃鱗取牌'); E.handDelta(E.me, 1, '黃鱗取牌'); E.setEnv(4); E.setTotem(4); } });
def({ id: '尋龍', mod: 'totem', size: 2, cat: 'active', pats: [{ m: c => c.length === 2 && c[0].e === c[1].e }],
  choice: () => ({ key: 'dragon', title: '尋龍：將哪一張５級牌置於牌堆頂？', options: ['金5', '木5', '水5', '火5', '土5'].map(v => ({ v, label: v })).concat([{ v: 'none', label: '不放' }]) }),
  run: (E, c, o) => { const d = o.choice && o.choice.dragon; E.note(d == null ? '檢索５級牌置於牌堆頂' : d === 'none' ? '未放置牌於牌堆頂' : '將' + d + '置於牌堆頂'); } });

const FMAP = {}; F.forEach(f => { FMAP[f.id] = f; });

/* =====================================================================
 * 職業
 *   prereq: null=無條件；陣列=目前職業須為其中之一；'none'=目前無職業
 *   cost(c, X)  轉職所需之牌
 *   inherit: 擁有哪些職業的能力
 *   ab: 能力名稱（普通/專精/發動）  forms: 專屬陣法
 * ===================================================================== */
const JOBS = [];
function job(j) { JOBS.push(j); return j; }
const T1 = ['戰士', '尋道者', '幻術師', '法師', '風行者'];
const T2 = ['戰神', '述道者', '幻靈使', '法導', '影行者'];
// 英雄學派
job({ id: '戰士', mod: 'hero', school: '戰士', tier: 1, prereq: null, costText: '金3', cost: c => H.elemSum(c, 0, 3),
  ab: ['卸勁', '武器專精', '防禦專精', '反震專精'] });
job({ id: '戰神', mod: 'hero', school: '戰士', tier: 2, prereq: ['戰士'], costText: '金6', cost: c => H.elemSum(c, 0, 6),
  inherit: ['戰士'], ab: ['武器精研', '震暴專精'], forms: ['神兵'] });
job({ id: '勇者', mod: 'hero', school: '戰士', tier: 3, legend: true, prereq: ['戰神'], costText: '金9', cost: c => H.elemSum(c, 0, 9),
  inherit: ['戰士', '戰神'], ab: ['金行抗性', '戰魄'], forms: ['落光斬'] });
job({ id: '尋道者', mod: 'hero', school: '尋道者', tier: 1, prereq: null, costText: '木3', cost: c => H.elemSum(c, 1, 3),
  ab: ['尋道術', '生陣專精', '剋陣專精'] });
job({ id: '述道者', mod: 'hero', school: '尋道者', tier: 2, prereq: ['尋道者'], costText: '木6', cost: c => H.elemSum(c, 1, 6),
  inherit: ['尋道者'], ab: ['歸元專精', '五行輪迴專精'], forms: ['道禦'] });
job({ id: '仁者', mod: 'hero', school: '尋道者', tier: 3, legend: true, prereq: ['述道者'], costText: '木9', cost: c => H.elemSum(c, 1, 9),
  inherit: ['尋道者', '述道者'], ab: ['木行抗性', '道源'], forms: ['轉生術'] });
job({ id: '幻術師', mod: 'hero', school: '幻術師', tier: 1, prereq: null, costText: '水3', cost: c => H.elemSum(c, 2, 3),
  ab: ['幻術', '封印專精'] });
job({ id: '幻靈使', mod: 'hero', school: '幻術師', tier: 2, prereq: ['幻術師'], costText: '水6', cost: c => H.elemSum(c, 2, 6),
  inherit: ['幻術師'], ab: ['幻術精研', '氣壁專精'], forms: ['幻印'] });
job({ id: '隱者', mod: 'hero', school: '幻術師', tier: 3, legend: true, prereq: ['幻靈使'], costText: '水9', cost: c => H.elemSum(c, 2, 9),
  inherit: ['幻術師', '幻靈使'], ab: ['水行抗性', '幻朧'], forms: ['紫光防罩'] });
job({ id: '法師', mod: 'hero', school: '法師', tier: 1, prereq: null, costText: '火3', cost: c => H.elemSum(c, 3, 3),
  ab: ['鍠金專精', '樸木專精', '洄水專精', '熾火專精', '坱土專精'] });
job({ id: '法導', mod: 'hero', school: '法師', tier: 2, prereq: ['法師'], costText: '火6', cost: c => H.elemSum(c, 3, 6),
  inherit: ['法師'], ab: ['光芒專精', '五流歸一專精'], forms: ['法震'] });
job({ id: '智者', mod: 'hero', school: '法師', tier: 3, legend: true, prereq: ['法導'], costText: '火9', cost: c => H.elemSum(c, 3, 9),
  inherit: ['法師', '法導'], ab: ['火行抗性', '法粹'], forms: ['魔法反光閃'] });
job({ id: '風行者', mod: 'hero', school: '風行者', tier: 1, prereq: null, costText: '土3', cost: c => H.elemSum(c, 4, 3),
  ab: ['風行術', '幻化專精'] });
job({ id: '影行者', mod: 'hero', school: '風行者', tier: 2, prereq: ['風行者'], costText: '土6', cost: c => H.elemSum(c, 4, 6),
  inherit: ['風行者'], ab: ['影切', '混沌專精'], forms: ['影襲'] });
job({ id: '武者', mod: 'hero', school: '風行者', tier: 3, legend: true, prereq: ['影行者'], costText: '土9', cost: c => H.elemSum(c, 4, 9),
  inherit: ['風行者', '影行者'], ab: ['土行抗性', '影遁'], forms: ['刃影瞬殺'] });
job({ id: '初行客', mod: 'hero', school: null, prereq: null, costText: '１', cost: c => c.length === 1 && c[0].l === 1,
  ab: ['抉擇', '突破'] });
job({ id: '仙者', mod: 'hero', school: null, legend: true, prereq: T2, costText: '５５５', cost: c => H.levels(c, [5, 5, 5]),
  ab: ['仙術', '冥思'], forms: ['凝華斷空箭', '天弓嘯'] });
job({ id: '聖者', mod: 'hero', school: null, legend: true, prereq: T2, costText: '４４４', cost: c => H.levels(c, [4, 4, 4]),
  ab: ['聖術', '啟示'], forms: ['聖光破', '聖風'] });
// 江湖
const JH = ['初行客', '獨行客'];
job({ id: '獨行客', mod: 'jianghu', school: null, prereq: null, costText: '一張３級牌', cost: c => c.length === 1 && c[0].l === 3, ab: [] });
job({ id: '劍客', mod: 'jianghu', prereq: JH, costText: '金3水3', cost: c => H.twoElemSum(c, 0, 3, 2, 3),
  forms: ['千鋒劍訣', '踏雪劍訣', '流影殘光劍'] });
job({ id: '劍尊', mod: 'jianghu', legend: true, prereq: ['劍客'], costText: '金5水5', cost: c => H.twoElemSum(c, 0, 5, 2, 5),
  inherit: ['劍客'], forms: ['千鋒飛羽', '踏雪映月', '流影崩雲劍'] });
job({ id: '煉氣者', mod: 'jianghu', prereq: JH, costText: '木3火3', cost: c => H.twoElemSum(c, 1, 3, 3, 3),
  ab: ['天陽罡', '烈陽訣', '純陽勁'] });
job({ id: '氣宗', mod: 'jianghu', legend: true, prereq: ['煉氣者'], costText: '木5火5', cost: c => H.twoElemSum(c, 1, 5, 3, 5),
  inherit: ['煉氣者'], ab: ['神陽罡', '舞陽訣', '極陽勁'] });
job({ id: '尋墨客', mod: 'jianghu', prereq: JH, costText: '兩張３級以上同行同級牌',
  cost: c => c.length === 2 && c[0].e === c[1].e && c[0].l === c[1].l && c[0].l >= 3,
  ab: ['青雲步'], forms: ['點水扇', '凌風扇'] });
job({ id: '書仙', mod: 'jianghu', legend: true, prereq: ['尋墨客'], costText: '兩張同行５級牌',
  cost: c => c.length === 2 && c[0].e === c[1].e && c[0].l === 5 && c[1].l === 5,
  inherit: ['尋墨客'], ab: ['浩然正氣', '流星步'], forms: ['天外飛扇'] });
job({ id: '毒師', mod: 'jianghu', prereq: JH, costText: '兩張不同行１級牌', cost: c => c.length === 2 && H.diffE(c) && c.every(x => x.l === 1),
  forms: ['毒鏢', '毒煙', '千毒手'] });
job({ id: '毒聖', mod: 'jianghu', legend: true, prereq: ['毒師'], costText: '三張不同行１級牌', cost: c => c.length === 3 && H.diffE(c) && c.every(x => x.l === 1),
  inherit: ['毒師'], ab: ['毒絕'], forms: ['殘霜手', '閻王令'] });
// 匯流世代
job({ id: '調律師', mod: 'conf', prereq: 'none', costText: '餘行3', cost: (c, X) => X.res && H.elemSum(c, X.res.e, 3),
  ab: ['調律'], forms: ['鏡鳴', '森鳴', '淙鳴', '煌鳴', '垠鳴'] });
job({ id: '易弦師', mod: 'conf', prereq: ['調律師'], costText: '餘行6', cost: (c, X) => X.res && H.elemSum(c, X.res.e, 6),
  inherit: ['調律師'], ab: ['易弦'], forms: ['千鳴'] });
job({ id: '天響師', mod: 'conf', legend: true, prereq: ['易弦師'], costText: '餘行9', cost: (c, X) => X.res && H.elemSum(c, X.res.e, 9),
  inherit: ['調律師', '易弦師'], ab: ['天響'], forms: ['萬鳴'], limited: { '天響': 1 } });
job({ id: '道法師', mod: 'conf', prereq: ['尋道者', '法師'], costText: '尋道者：火6／法師：木6',
  cost: (c, X) => (X.job === '尋道者' && H.elemSum(c, 3, 6)) || (X.job === '法師' && H.elemSum(c, 1, 6)),
  inherit: ['尋道者', '法師'], forms: ['禁錮法陣'], limited: { '禁錮法陣': 1 } });
job({ id: '道法聖', mod: 'conf', legend: true, prereq: ['道法師'], costText: '木5火5', cost: c => H.twoElemSum(c, 1, 5, 3, 5),
  inherit: ['尋道者', '法師', '道法師'], ab: ['道法心生'], forms: ['無盡法陣'] });
job({ id: '晴風士', mod: 'conf', prereq: 'none', costText: '１２、２３、３４或４５',
  cost: c => c.length === 2 && Math.abs(c[0].l - c[1].l) === 1, ab: ['晴風'], forms: ['舞風'] });
job({ id: '晴風使', mod: 'conf', prereq: ['晴風士'], costText: '１２３、２３４或３４５',
  cost: c => H.levels(c, [1, 2, 3]) || H.levels(c, [2, 3, 4]) || H.levels(c, [3, 4, 5]),
  inherit: ['晴風士'], ab: ['順風'], forms: ['晴風萬里'], limited: { '順風': 1 } });
job({ id: '虛空追尋者', mod: 'conf', prereq: 'void', costText: '２２２、３３３、４４４或５５５',
  cost: c => c.length === 3 && H.sameL(c) && c[0].l >= 2, ab: ['虛空追尋'], forms: ['虛空絕壁術'] });
job({ id: '虛空破滅者', mod: 'conf', legend: true, prereq: 'never', costText: '僅能以虛空追尋者之能力轉職', cost: () => false,
  inherit: ['虛空追尋者'], ab: ['虛空破滅', '虛空境界'], forms: ['虛空歸無術'], limited: { '虛空境界': 1 } });
// 黑暗微光
job({ id: '暗行者', mod: 'dark', prereq: 'none', costText: '一張２級以下牌', cost: c => c.length === 1 && c[0].l <= 2,
  ab: ['暗行'], forms: ['暗黑光芒', '暗黑氣壁', '暗黑歸元', '暗黑震暴', '暗黑混沌'] });
job({ id: '暗靈使', mod: 'dark', prereq: 'never', costText: '僅能以暗行者能力轉職', cost: () => false,
  inherit: ['暗行者'], ab: ['暗靈', '暗境'], forms: ['暗行輪迴'] });
job({ id: '影戰士', mod: 'dark', prereq: ['風行者', '戰士'], costText: '風行者：金6／戰士：土6',
  cost: (c, X) => (X.job === '風行者' && H.elemSum(c, 0, 6)) || (X.job === '戰士' && H.elemSum(c, 4, 6)),
  inherit: ['風行者', '戰士'], forms: ['殘影斬'] });
job({ id: '影戰狂', mod: 'dark', legend: true, prereq: ['影戰士'], costText: '土5金5', cost: c => H.twoElemSum(c, 4, 5, 0, 5),
  inherit: ['影戰士', '風行者', '戰士'], ab: ['狂影'], forms: ['殘影狂刃斬'] });
job({ id: '魔靈師', mod: 'dark', prereq: 'spirit', costText: '２２或４４', cost: c => H.levels(c, [2, 2]) || H.levels(c, [4, 4]),
  ab: ['魔靈附體', '魔靈復甦'], forms: ['惡靈召喚陣', '死靈召喚陣'] });

const JMAP = {}; JOBS.forEach(j => { JMAP[j.id] = j; });
// 展開繼承
JOBS.forEach(j => {
  const ab = new Set(j.ab || []), fm = new Set(j.forms || []);
  (j.inherit || []).forEach(n => { const p = JMAP[n]; (p.ab || []).forEach(a => ab.add(a)); (p.forms || []).forEach(x => fm.add(x)); });
  j.allAb = [...ab]; j.allForms = [...fm];
});
// 第二層繼承（例如影戰狂→影戰士→風行者）已列於 inherit；確保 inherit 的 inherit 也包含
JOBS.forEach(j => {
  const ab = new Set(j.allAb), fm = new Set(j.allForms);
  (j.inherit || []).forEach(n => { JMAP[n].allAb.forEach(a => ab.add(a)); JMAP[n].allForms.forEach(x => fm.add(x)); });
  j.allAb = [...ab]; j.allForms = [...fm];
});

/* =====================================================================
 * 發動能力（主動效果時點，每回合一次）
 *   inputs: 需要記錄者輸入的項目
 * ===================================================================== */
const ABILITIES = [
  { id: '幻術', inputs: ['discard2', 'virtual'], text: '捨棄兩張手牌，產生任意牌，本回合施展五行擊術' },
  { id: '幻朧', inputs: ['discard2', 'virtual'], text: '捨棄兩張手牌，產生任意牌，本回合組成基礎規則陣法' },
  { id: '影切', inputs: ['card'], text: '捨棄一張手牌，上家扣除該牌等級×２生命' },
  { id: '冥思', inputs: ['card'], cardRule: 'l4', text: '捨棄一張４級以上牌，本回合抽牌＋１' },
  { id: '啟示', inputs: ['card'], cardRule: 'l4', text: '捨棄一張４級以上牌，抽三張選一張加入手牌' },
  { id: '天陽罡', inputs: ['show'], cardRule: 'woodfire', text: '展示木或火行牌，一輪內木、火行傷害對己減半' },
  { id: '烈陽訣', inputs: ['card'], cardRule: 'woodfire', text: '一張木或火行牌本回合等級＋２（組合基礎陣法）' },
  { id: '舞陽訣', inputs: [], text: '本回合施展三張以上木行或火行攻擊時抽牌＋１' },
  { id: '青雲步', inputs: ['card'], cardRule: 'woodwater', text: '捨棄木或水，抽兩張，一張放回牌堆頂，其餘捨棄' },
  { id: '流星步', inputs: ['card'], cardRule: 'fireStar', text: '捨棄火或星行牌，本回合陣法觸發流星步' },
  { id: '調律', inputs: ['card'], cardRule: 'aboveRes', text: '捨棄高於餘級的牌，上家棄牌加入手牌（本回合僅能用來轉職）' },
  { id: '天響', inputs: [], limited: true, text: '上家棄牌加入手牌（限一次）' },
  { id: '晴風', inputs: ['qingfeng'], text: '展示牌堆頂，選擇捨棄或放回' },
  { id: '順風', inputs: [], limited: true, text: '本回合抽牌＋２（限一次）' },
  { id: '暗靈', inputs: ['card', 'level12'], text: '一張手牌本回合降為１或２級，組成陣法並施展' },
];
const AMAP = {}; ABILITIES.forEach(a => { AMAP[a.id] = a; });

/* ---------- 精靈 ---------- */
const SPIRITS = {
  金: { gain: d => d.e === 0, skills: [{ id: '飛刃', cost: 2 }, { id: '劍雨', cost: 6 }] },
  木: { gain: d => d.e === 1, skills: [{ id: '芬芳', cost: 2 }, { id: '綻放', cost: 6 }] },
  水: { gain: d => d.e === 2, skills: [{ id: '川流', cost: 1, inputs: ['card'] }, { id: '浩瀚', cost: 3 }] },
  火: { gain: d => d.e === 3, skills: [{ id: '螢光', cost: 1, inputs: ['card'] }, { id: '絢爛', cost: 3, inputs: ['card', 'level'] }] },
  土: { gain: d => d.e === 4, skills: [{ id: '石盾', cost: 2 }, { id: '岩壁', cost: 6 }] },
  惡: { gain: d => d.l === 2, dark: true, skills: [{ id: '惡視', cost: 2, inputs: ['view2'] }] },
  死: { gain: d => d.l === 4, dark: true, skills: [{ id: '死兆', cost: 4, inputs: ['cards4'] }] },
};
const SPIRIT_TEXT = {
  飛刃: '上家扣除１０點生命', 劍雨: '上家扣除４０點生命', 芬芳: '回復１０點生命', 綻放: '回復４０點生命',
  川流: '捨棄一張手牌，本回合抽牌＋１', 浩瀚: '本回合抽牌＋１', 螢光: '指定手牌本回合等級視為３級', 絢爛: '指定手牌本回合等級視為指定等級',
  石盾: '下家下回合攻擊之傷害無效', 岩壁: '建構４０點防護罩', 惡視: '隨機檢視下家兩張手牌', 死兆: '捨棄下家牌堆頂四張，扣除最高等級×４生命',
};

/* ---------- 錦囊秘計 ---------- */
const STRATS = [
  { id: '金蟬', by: 'e', v: 0, text: '自身本回合不受無法行動、無法抽牌、反制效果及其他玩家秘計影響' },
  { id: '偷梁', by: 'e', v: 1, text: '自身所有手牌等級＋１直到回合結束' },
  { id: '混水', by: 'e', v: 2, text: '本回合抽牌＋１' },
  { id: '觀火', by: 'e', v: 3, text: '下家下回合攻擊之傷害無效，陣法之扣除、回復生命效果無效' },
  { id: '離山', by: 'e', v: 4, text: '指定玩家職業能力無效、精靈技能無效且靈力無法增加１回合', inputs: ['target'] },
  { id: '還魂', by: 'l', v: 1, text: '召喚錦囊牌屬性精靈，靈力１點，若已有精靈則額外獲得原精靈靈力' },
  { id: '牽羊', by: 'l', v: 2, text: '檢視牌堆捨棄兩張，從棄牌堆選兩張放回牌堆並洗牌' },
  { id: '暗渡', by: 'l', v: 3, text: '依錦囊牌屬性轉職為戰士、尋道者、幻術師、法師或風行者' },
  { id: '瞞天', by: 'l', v: 4, text: '破除指定星辰，或自身本回合獲得指定屬性星辰效果', inputs: ['starOp'] },
  { id: '走為', by: 'l', v: 5, text: '破除目前環境，或捨棄一張牌並轉換為該牌屬性環境', inputs: ['envOp'] },
];
const SMAP = {}; STRATS.forEach(s => { SMAP[s.id] = s; });
function stratsFor(cd) { return STRATS.filter(s => (s.by === 'e' ? cd.e : cd.l) === s.v); }

/* =====================================================================
 * 陣法辨識
 *   printed: 記錄者點選的牌（牌面）
 *   X: { state 取用函式、本回合修正 }
 *     X.enabled(mod) X.ab(name) X.hasForm(id) X.star (隊伍星辰 e|null)
 *     X.tempStar (瞞天) X.levelLayers [{idx, l}] X.allPlus (偷梁)
 *     X.virtual {e,l,kind:'幻術'|'幻朧'} X.res {e,l}
 * ===================================================================== */
function recognize(printed, X) {
  printed = printed.map(card);
  const results = [];
  const seen = new Set();
  const base = applyLevels(printed, X);
  const variants = [{ cards: base, notes: [], basicOnly: false }];
  // 烈陽訣：+2 只限基礎陣法
  if (X.lieyang) {
    const v = base.map(x => ({ ...x }));
    let hit = false;
    for (const x of v) if (!hit && x.e === X.lieyang.e && x.l === X.lieyang.l) { x.l = Math.min(5, x.l + 2); hit = true; }
    if (hit) variants.push({ cards: v, notes: ['烈陽訣＋2'], basicOnly: true, lieyang: true });
  }
  // 幻術/幻朧 虛擬牌
  if (X.virtual) {
    const vs = variants.map(v => ({ cards: v.cards.concat([{ e: X.virtual.e, l: X.virtual.l, virtual: true }]),
      notes: v.notes.concat([X.virtual.kind + '：' + cs(X.virtual)]), basicOnly: true, virtualKind: X.virtual.kind, lieyang: v.lieyang }));
    variants.push(...vs);
  }
  // 星辰屬性替換（一張牌，限基礎陣法）
  const stars = [];
  const extra = [];
  if (X.starSubs && X.starSubs.length) {
    // 已在行動前指定星辰變屬性的牌：只採用指定的替換
    for (const v of variants) {
      let nc = v.cards.map(y => ({ ...y })); const nt = [];
      X.starSubs.forEach(sb => {
        const i = nc.findIndex(x => !x.sub && !x.virtual && x.pe === sb.pe && x.pl === sb.pl);
        if (i < 0) return;
        nt.push(sb.src + '：' + sb.card + '→' + EL[sb.e]); nc[i] = { ...nc[i], e: sb.e, sub: true };
      });
      if (nt.length) extra.push({ ...v, cards: nc, notes: v.notes.concat(nt), basicOnly: true });
    }
  } else if (X.forReplay && X.legacyStar) {
    if (X.star != null) stars.push({ e: X.star, src: '星辰' });
    if (X.tempStar != null && X.tempStar !== X.star) stars.push({ e: X.tempStar, src: '瞞天' });
    // 舊記錄：即使目前沒有星辰也嘗試替換，以便標示「沒有星辰」而非辨識失敗
    if (!stars.length) for (let e = 0; e < 5; e++) stars.push({ e, src: '星辰' });
  }
  for (const v of variants) {
    for (const s of stars) {
      v.cards.forEach((x, i) => {
        if (x.e !== MOTHER[s.e] || x.virtual) return;
        const nc = v.cards.map((y, j) => (j === i ? { ...y, e: s.e, sub: true } : y));
        extra.push({ ...v, cards: nc, notes: v.notes.concat([s.src + '：' + cs(x) + '→' + EL[s.e]]), basicOnly: true });
      });
    }
    // 瞞天與原有星辰各改一張
    if (stars.length === 2) {
      const [a, b] = stars;
      v.cards.forEach((x, i) => v.cards.forEach((y, j) => {
        if (i === j || x.e !== MOTHER[a.e] || y.e !== MOTHER[b.e] || x.virtual || y.virtual) return;
        const nc = v.cards.map((z, k) => (k === i ? { ...z, e: a.e, sub: true } : k === j ? { ...z, e: b.e, sub: true } : z));
        extra.push({ ...v, cards: nc, notes: v.notes.concat(['星辰＋瞞天替換']), basicOnly: true });
      }));
    }
  }
  variants.push(...extra);
  // 聖術：一張４級以上牌視為兩張（基礎四張陣法）
  if (X.ab('聖術')) {
    const sv = [];
    for (const v of variants) {
      if (v.cards.some(x => x.sub)) continue;      // 聖術無法搭配星辰改變屬性
      v.cards.forEach((x, i) => {
        if (x.l < 4) return;
        sv.push({ ...v, cards: v.cards.concat([{ ...x, dup: true }]), notes: v.notes.concat(['聖術：' + cs(x) + '視為兩張']), basicOnly: true, sacred: true });
      });
    }
    variants.push(...sv);
  }

  for (const v of variants) {
    for (const f of F) {
      if (v.basicOnly && !f.basic) continue;
      if (v.sacred && f.size !== 4) continue;
      if (v.virtualKind === '幻術' && !/擊術$/.test(f.id)) continue;
      if (f.mod !== 'basic' && X.enabled && !X.enabled(f.mod)) continue;
      f.pats.forEach((p, pi) => {
        let ok = false;
        try { ok = p.m(v.cards, X); } catch (e) { ok = false; }
        if (!ok) return;
        const reasons = [];
        if (p.need === 'form' && !ownsForm(f, X)) reasons.push(formNeedText(f));
        if (p.need && p.need.startsWith('job:') && !X.ab(p.need.slice(4))) reasons.push('需要' + p.need.slice(4));
        if (!X.starSubs && v.notes.some(n => /^星辰/.test(n)) && X.star == null) reasons.push('沒有星辰');
        const key = f.id + '|' + pi + '|' + v.notes.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ f, pat: p, pi, cards: v.cards, notes: v.notes.concat(p.tag ? [p.tag] : []), legal: reasons.length === 0, reasons,
          mods: v.notes.length + (p.need ? 1 : 0) });
      });
    }
  }
  // 排序：合法優先、修正少者優先；同陣法只保留最佳一筆合法解讀
  results.sort((a, b) => (b.legal - a.legal) || (a.mods - b.mods));
  if (X.all) return results;          // 重播：保留所有解讀，以便對應原本登錄的那一種
  const out = [], seenF = new Set();
  for (const r of results) {          // 已排序：每個陣法取第一筆（合法者優先）
    if (seenF.has(r.f.id)) continue;
    seenF.add(r.f.id);
    out.push(r);
  }
  return out;
}
function ownsForm(f, X) {
  if (f.star != null) return X.star === f.star || X.tempStar === f.star;
  return X.hasForm(f.id);
}
function formNeedText(f) {
  if (f.star != null) return '需要' + STARS[f.star].name;
  const j = JOBS.find(j => (j.forms || []).includes(f.id));
  return j ? '需要職業：' + j.id + (j.legend ? '' : '以上') : '條件不足';
}
function applyLevels(printed, X) {
  // levelLayers: [{card:'金1', l:3}]，依序套用到第一張相符且尚未套用的牌
  const out = printed.map(x => {
    let l = x.l;
    if (X.allPlus) l = Math.min(5, l + X.allPlus);
    return { e: x.e, l, pe: x.e, pl: x.l };
  });
  const used = new Set();
  (X.levelLayers || []).forEach(L => {
    const c0 = card(L.card);
    const i = printed.findIndex((x, k) => !used.has(k) && x.e === c0.e && x.l === c0.l);
    if (i >= 0) { used.add(i); out[i].l = Math.max(1, Math.min(5, L.l)); }
  });
  return out;
}

/* 轉職辨識 */
function recognizeJobs(printed, X) {
  printed = printed.map(card);
  const c = applyLevels(printed, X).map(x => ({ e: x.e, l: x.l }));
  const out = [];
  for (const j of JOBS) {
    if (X.enabled && !X.enabled(j.mod)) continue;
    const reasons = [];
    let ok = false, path = null;
    try { ok = j.cost(c, X); } catch (e) { ok = false; }
    // 初行客：抉擇（１→一階）、突破（１＋原轉職牌→二階）
    if (!ok && X.job === '初行客' && X.ab('抉擇') && T1.includes(j.id) && c.length === 1 && c[0].l === 1) { ok = true; path = '抉擇'; }
    if (!ok && X.job === '初行客' && X.ab('突破') && T2.includes(j.id)) {
      for (let i = 0; i < c.length; i++) {
        if (c[i].l !== 1) continue;
        const rest = c.filter((_, k) => k !== i);
        if (rest.length && j.cost(rest, X)) { ok = true; path = '突破'; break; }
      }
    }
    if (!ok) continue;
    if (!path) {
      if (j.prereq === 'never') continue;
      if (j.prereq === 'none' && X.job) reasons.push('需目前無職業');
      if (j.prereq === 'void' && (X.job || X.star != null || X.spirit)) reasons.push('需目前無職業、星辰、精靈');
      if (j.prereq === 'spirit' && !X.spirit) reasons.push('需擁有精靈');
      if (Array.isArray(j.prereq) && !j.prereq.includes(X.job)) reasons.push('需目前為' + j.prereq.join('、'));
    }
    if (X.ab('暗行') && !X.lishan) reasons.push('暗行：無法轉職');
    if (X.job === j.id) reasons.push('已是' + j.id);
    out.push({ job: j, path, legal: reasons.length === 0, reasons });
  }
  out.sort((a, b) => b.legal - a.legal);
  return out;
}

/* 被動術式辨識（翻開時） */
function recognizePassive(printed, X) {
  return recognize(printed, X).filter(r => r.f.cat === 'passive');
}

const RULE_VERSION = '5.17';
const RULES = { RULE_VERSION, EL, ELI, GEN, KE, MOTHER, MODULES, STARS, ENV_INVALID, TOTEMS, BEASTS, F, FMAP, JOBS, JMAP, T1, T2,
  ABILITIES, AMAP, SPIRITS, SPIRIT_TEXT, STRATS, SMAP, stratsFor, H, card, cs, cardsText,
  recognize, recognizeJobs, recognizePassive, applyLevels };
if (typeof module !== 'undefined' && module.exports) module.exports = RULES; else root.RULES = RULES;
})(this);
