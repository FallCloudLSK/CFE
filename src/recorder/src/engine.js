/* =====================================================================
 * 戰局記錄器 重播引擎
 * replay(match) 由第 1 回合開始逐動作套用規則，產生每回合快照、
 * 記錄文字與問題清單（error=紅、warn=黃）。
 * ===================================================================== */
(function (root) {
'use strict';
const R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.RULES;
const { EL, GEN, KE, MOTHER, STARS, ENV_INVALID, TOTEMS, F, FMAP, JMAP, T1, AMAP, SPIRITS, SMAP, H, card, cs, cardsText } = R;

const ALL_MODS = R.MODULES.map(m => m.id);
const STATUS_NAME = {
  stun: '無法行動', nodraw: '無法抽牌', poison: '中毒', qianfeng: '千鋒', taxue: '踏雪', tianyang: '天陽罡',
  lishan: '離山', nullAtk: '攻擊無效', nullSpell: '術式無效', split: '傷害平分', nullAtk40: '40點以下攻擊無效',
  reveal: '蓋牌須正面', guanhuo: '觀火', shidun: '石盾',
};
const ACTION_PHASE = ['formation', 'cover', 'job', 'pass'];

function newMatch(names, first, opts) {
  opts = opts || {};
  return {
    v: 1, created: Date.now(), ruleVer: R.RULE_VERSION,
    players: [names[0] || '左方選手', names[1] || '右方選手'],
    first: first || 0,
    settings: { hp: opts.hp || 200, mods: opts.mods || ALL_MODS.slice() },
    turns: [{ actions: [], ended: false }],
    result: null, note: '', pouch0: [null, null],
  };
}

function initState(m) {
  const hp = m.settings.hp;
  const pouch = m.settings.mods.includes('pouch');
  return {
    hp: [hp, hp], maxHp: hp, shield: [0, 0], job: [null, null], spirit: [null, null], pouch: [pouch, pouch], pouchFrom: [null, null],
    hand: m.first === 0 ? [4, 5] : [5, 4], star: [null, null], starHist: [[], []], env: null, totem: [null, null],
    statuses: [], lastForm: [null, null], lastDiscard: [null, null], covered: [null, null],
    uses: [{}, {}], delayed: [], over: null, spiritSeq: 0,
  };
}
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------------------------------------------------------- */
function replay(m) {
  const S = initState(m);
  const mods = new Set(m.settings.mods);
  const out = { turns: [], issues: [], initial: clone(S) };
  m.turns.forEach((turn, i) => {
    const p = (m.first + i) % 2, q = 1 - p;
    const rec = { i, p, before: clone(S), acts: [], issues: [], drawN: null };
    out.turns.push(rec);
    const T = startTurn(S, m, i, p);
    rec.ctx = T;
    if (S.over) rec.issues.push(iss('error', '遊戲已結束，本回合不應存在'));
    turn.actions.forEach((a, ai) => {
      const ar = { a, text: '', notes: [], issues: [] };
      rec.acts.push(ar);
      if (S.over && a.kind !== 'note' && a.kind !== 'adjust') ar.issues.push(iss('error', '遊戲已結束後仍有動作'));
      try { applyAction(S, m, mods, T, a, ar, i); } catch (e) { ar.issues.push(iss('error', '計算錯誤：' + e.message)); console.error(e); }
      checkOver(S, T, ar, i);
      ar.hand = S.hand.slice();
    });
    if (turn.ended) {
      endTurn(S, m, mods, T, rec, turn, i);
      rec.after = clone(S);
    } else {
      rec.live = true;
      rec.after = clone(S);
    }
    // 彙整問題
    rec.acts.forEach((ar, ai) => ar.issues.forEach(x => rec.issues.push({ ...x, ai })));
    rec.level = rec.issues.some(x => x.level === 'error') ? 'error' : rec.issues.some(x => x.level === 'warn') ? 'warn' : '';
  });
  out.final = S;
  return out;
}
function iss(level, msg) { return { level, msg }; }

/* ---------------- 回合開始 ---------------- */
function startTurn(S, m, i, p) {
  const q = 1 - p;
  // 以「輪」計算的狀態在回合開始時扣除
  S.statuses.forEach(s => { if (s.who === p && s.unit === 'round') s.left--; });
  S.statuses = S.statuses.filter(s => s.left > 0);
  const ld = S.lastDiscard[q];
  return {
    i, p, q, abilityUsed: null, spiritUsed: [], drawBonus: 0, noDraw: false, cicada: false, allPlus: 0,
    levelLayers: [], starSubs: [], virtual: null, lieyang: null, tempStar: null, meteor: false, wuyang: false,
    actionDone: false, revealed: false, res: ld && ld.turn === i - 1 ? card(ld.card) : null,
    retrieved: false, pouchUsed: false,
  };
}

/* ---------------- 狀態查詢 ---------------- */
function has(S, who, k) { return S.statuses.some(s => s.who === who && s.k === k); }
function lishan(S, T, who) { return has(S, who, 'lishan') && !(T && T.cicada && who === T.p); }
function abOf(S, T, who, name) {
  const j = S.job[who] && JMAP[S.job[who]];
  if (!j) return false;
  if (lishan(S, T, who)) return false;
  return j.allAb.includes(name);
}
function formsOf(S, T, who, id) {
  const j = S.job[who] && JMAP[S.job[who]];
  if (!j || lishan(S, T, who)) return false;
  return j.allForms.includes(id);
}
function stunned(S, T, who) { return has(S, who, 'stun') && !(T.cicada && who === T.p); }
function noDraw(S, T, who) { return (has(S, who, 'nodraw') && !(T.cicada && who === T.p)) || T.noDraw; }

/* 給辨識器用的情境 */
function ctxX(S, m, T, who, extra) {
  const mods = new Set(m.settings.mods);
  return Object.assign({
    enabled: mod => mods.has(mod),
    ab: n => abOf(S, T, who, n),
    hasForm: id => formsOf(S, T, who, id),
    star: S.star[who], tempStar: who === T.p ? T.tempStar : null,
    allPlus: who === T.p ? T.allPlus : 0,
    levelLayers: who === T.p ? T.levelLayers : [],
    virtual: who === T.p ? T.virtual : null,
    lieyang: who === T.p ? T.lieyang : null,
    res: who === T.p ? T.res : null,
    starSubs: who === T.p && T.starSubs.length ? T.starSubs : null,
    job: S.job[who], spirit: S.spirit[who], lishan: lishan(S, T, who),
    oppHand: S.hand[1 - who],
  }, extra || {});
}

/* ---------------- 動作 ---------------- */
function applyAction(S, m, mods, T, a, ar, i) {
  const p = T.p, q = T.q;
  const A = handlers[a.kind];
  if (!A) { ar.issues.push(iss('error', '未知動作：' + a.kind)); return; }
  if (ACTION_PHASE.includes(a.kind)) {
    if (T.actionDone) ar.issues.push(iss('error', '本回合已經有行動（每回合僅能行動一次）'));
    T.actionDone = true;
  }
  A(S, m, mods, T, a, ar, i);
  if (ACTION_PHASE.includes(a.kind)) afterAction(S, T, ar);
}

function afterAction(S, T, ar) {
  // 天外飛扇：上家下回合行動結束時扣除生命
  const p = T.p;
  S.delayed = S.delayed.filter(d => {
    if (d.who !== p) return true;
    loseHp(S, T, ar, p, d.n, d.src, false);
    return false;
  });
}

const handlers = {
  note(S, m, mods, T, a, ar) { ar.text = '備註：' + (a.text || ''); },

  adjust(S, m, mods, T, a, ar) {
    const who = a.who, v = a.value;
    const nm = m.players[who];
    const f = a.field;
    const num = (cur) => (a.mode === 'add' ? cur + (+v) : +v);
    if (f === 'hp') S.hp[who] = clamp(num(S.hp[who]), 0, S.maxHp);
    else if (f === 'shield') S.shield[who] = Math.max(0, num(S.shield[who]));
    else if (f === 'hand') S.hand[who] = Math.max(0, num(S.hand[who]));
    else if (f === 'power') { if (S.spirit[who]) { S.spirit[who].p = clamp(num(S.spirit[who].p), 0, 6); if (!S.spirit[who].p) S.spirit[who] = null; } }
    else if (f === 'job') S.job[who] = v || null;
    else if (f === 'spirit') S.spirit[who] = v ? { k: v, p: a.power || 2, id: ++S.spiritSeq } : null;
    else if (f === 'star') S.star[who] = v === '' || v == null ? null : +v;
    else if (f === 'env') S.env = v === '' || v == null ? null : +v;
    else if (f === 'pouch') { S.pouch[who] = !!v; S.pouchFrom[who] = null; }
    else if (f === 'totem') S.totem[who] = v === '' || v == null ? null : +v;
    else if (f === 'status') {
      if (a.mode === 'remove') S.statuses = S.statuses.filter(s => !(s.who === who && s.k === v));
      else S.statuses.push({ who, k: v, left: a.left || 1, unit: 'turn', src: '手動' });
    }
    const label = { hp: '生命', shield: '防護罩', hand: '手牌', power: '靈力', job: '職業', spirit: '精靈', star: '星辰', env: '環境', pouch: '錦囊', totem: '圖騰', status: '狀態' }[f] || f;
    ar.text = '手動調整：' + (f === 'env' ? '' : nm + ' ') + label + (a.mode === 'add' ? (v >= 0 ? '＋' : '') + v : a.mode === 'remove' ? '移除' + (STATUS_NAME[v] || v) : '→' + fmtVal(f, v)) + (a.note ? '（' + a.note + '）' : '');
    ar.issues.push(iss('warn', '有手動調整'));
  },

  starsub(S, m, mods, T, a, ar) {
    const p = T.p;
    const c = card(a.card);
    const src = a.src === '瞞天' ? '瞞天' : '星辰';
    const e = src === '瞞天' ? T.tempStar : S.star[p];
    ar.text = src + '變屬性：' + cs(c) + (e != null ? '視為' + EL[e] + '行' : '');
    if (!mods.has('star')) ar.issues.push(iss('error', '未啟用星辰圖記'));
    if (T.actionDone) ar.issues.push(iss('error', '星辰變屬性須於行動前指定'));
    if (e == null) { ar.issues.push(iss('error', src === '瞞天' ? '本回合沒有瞞天獲得的星辰' : '沒有星辰')); return; }
    if (c.e !== MOTHER[e]) ar.issues.push(iss('error', STARS[e].name + '只能將' + EL[MOTHER[e]] + '行牌視為' + EL[e] + '行'));
    if (T.starSubs.some(x => x.src === src)) ar.issues.push(iss('error', '本回合已使用過' + src + '變屬性'));
    T.starSubs.push({ src, card: cs(c), pe: c.e, pl: c.l, e });
    ar.notes.push('限基礎規則陣法');
  },

  retrieve(S, m, mods, T, a, ar) {
    const p = T.p, q = T.q;
    const ld = S.lastDiscard[q];
    if (!mods.has('retrieve')) ar.issues.push(iss('error', '未啟用棄牌回收'));
    if (T.retrieved) ar.issues.push(iss('error', '本回合已回收過棄牌'));
    T.retrieved = true;
    if (!ld || ld.turn !== T.i - 1) { ar.text = '棄牌回收'; ar.issues.push(iss('error', '上家上回合沒有棄牌，無法回收')); return; }
    const c = card(ld.card);
    let cost = c.l * 2;
    if (abOf(S, T, p, '尋道術')) cost = Math.ceil(cost / 2);
    ar.text = '棄牌回收（' + cs(c) + '）';
    loseHp(S, T, ar, p, cost, '棄牌回收', false, true);
  },

  pouch(S, m, mods, T, a, ar) {
    const p = T.p;
    if (!S.pouch[p]) ar.issues.push(iss('error', '沒有錦囊可觸發'));
    if (T.pouchUsed) ar.issues.push(iss('error', '本回合已觸發過錦囊'));
    T.pouchUsed = true;
    ar.fromInit = S.pouchFrom[p] == null;   // 開局覆蓋的錦囊（非連環）
    if (T.actionDone) ar.issues.push(iss('error', '錦囊須於行動前觸發'));
    S.pouch[p] = false; S.pouchFrom[p] = null;
    resolveStrategy(S, m, T, ar, a, '');
  },

  ability(S, m, mods, T, a, ar) {
    const p = T.p, q = T.q;
    const def = AMAP[a.id];
    ar.text = a.id;
    if (!def) { ar.issues.push(iss('error', '未知能力')); return; }
    if (!abOf(S, T, p, a.id)) ar.issues.push(iss('error', lishan(S, T, p) ? '受離山影響，職業能力無效' : '目前職業沒有「' + a.id + '」'));
    if (T.abilityUsed) ar.issues.push(iss('error', '每回合只能發動一次發動能力（已發動' + T.abilityUsed + '）'));
    if (stunned(S, T, p)) ar.issues.push(iss('error', '無法行動時不能使用發動能力'));
    if (T.actionDone) ar.issues.push(iss('error', '發動能力須於行動前'));
    T.abilityUsed = a.id;
    if (def.limited) useLimited(S, T, ar, p, a.id);
    const c = a.card ? card(a.card) : null;
    const needCard = () => { if (!c) ar.issues.push(iss('warn', '未登錄' + a.id + '所捨棄的牌')); };
    switch (a.id) {
      case '幻術': case '幻朧': {
        S.hand[p] -= 2;
        const v = a.virtual ? card(a.virtual) : null;
        if (!v) { ar.issues.push(iss('warn', '未指定產生的牌')); break; }
        T.virtual = { e: v.e, l: v.l, kind: a.id };
        ar.text += '（產生' + cs(v) + (a.cards && a.cards.length ? '，捨棄' + cardsText(a.cards.map(card)) : '') + '）';
        if (a.id === '幻術' && v.l <= 3 && abOf(S, T, p, '幻術精研')) addDraw(T, ar, 1, '幻術精研');
        break;
      }
      case '影切':
        S.hand[p] -= 1; needCard();
        if (c) { ar.text += '（' + cs(c) + '）'; loseHp(S, T, ar, q, c.l * 2, '影切', false); }
        break;
      case '冥思':
        S.hand[p] -= 1; needCard();
        if (c) { ar.text += '（' + cs(c) + '）'; if (c.l < 4) ar.issues.push(iss('error', '冥思須捨棄４級以上的牌')); }
        addDraw(T, ar, 1, '冥思');
        break;
      case '啟示':
        needCard();
        if (c) { ar.text += '（' + cs(c) + '）'; if (c.l < 4) ar.issues.push(iss('error', '啟示須捨棄４級以上的牌')); }
        break;
      case '天陽罡':
        if (a.card) { ar.text += '（展示' + cs(c) + '）'; if (c.e !== 1 && c.e !== 3) ar.issues.push(iss('error', '天陽罡須展示木或火行牌')); }
        else if (S.job[p] !== '氣宗') ar.issues.push(iss('warn', '天陽罡未記錄展示的牌'));
        S.statuses.push({ who: p, k: 'tianyang', left: 1, unit: 'round', src: '天陽罡' });
        break;
      case '烈陽訣':
        needCard();
        if (c) { if (c.e !== 1 && c.e !== 3) ar.issues.push(iss('error', '烈陽訣須指定木或火行牌')); T.lieyang = c; ar.text += '（' + cs(c) + '→' + EL[c.e] + Math.min(5, c.l + 2) + '）'; }
        break;
      case '舞陽訣': T.wuyang = true; break;
      case '青雲步':
        S.hand[p] -= 1; needCard();
        if (c) { ar.text += '（' + cs(c) + '）'; if (c.e !== 1 && c.e !== 2) ar.issues.push(iss('error', '青雲步須捨棄木或水行牌')); }
        break;
      case '流星步':
        S.hand[p] -= 1; needCard(); T.meteor = true;
        if (c) { ar.text += '（' + cs(c) + '）'; if (c.e !== 3 && c.e !== S.star[p]) ar.issues.push(iss('error', '流星步須捨棄火行或星行牌（星行＝我方星辰屬性）')); }
        break;
      case '調律':
        needCard();
        if (!T.res) ar.issues.push(iss('error', '上家上回合沒有棄牌，無法調律'));
        if (c) { ar.text += '（' + cs(c) + '）'; if (T.res && c.l <= T.res.l) ar.issues.push(iss('error', '調律須捨棄等級大於餘級的牌')); }
        break;
      case '天響':
        if (!T.res) ar.issues.push(iss('error', '上家上回合沒有棄牌'));
        if (S.hand[p] > 4) ar.issues.push(iss('error', '天響須在手牌四張以下時使用'));
        S.hand[p] += 1;
        break;
      case '晴風':
        if (a.card) ar.text += '（展示' + cs(card(a.card)) + '，' + (a.fate === 'discard' ? '捨棄' : '放回') + '）';
        break;
      case '順風': addDraw(T, ar, 2, '順風'); break;
      case '暗靈':
        needCard();
        if (c) { const lv = a.level === 2 ? 2 : 1; if (lv > c.l) ar.issues.push(iss('error', '暗靈只能降低等級')); T.levelLayers.push({ card: cs(c), l: Math.min(lv, c.l) }); ar.text += '（' + cs(c) + '→' + EL[c.e] + Math.min(lv, c.l) + '）'; }
        break;
    }
  },

  spirit(S, m, mods, T, a, ar) {
    const p = T.p, q = T.q;
    const sp = S.spirit[p];
    ar.text = a.id;
    if (!sp) { ar.issues.push(iss('error', '沒有精靈')); return; }
    const def = SPIRITS[sp.k];
    const sk = def && def.skills.find(s => s.id === a.id);
    ar.text = sp.k + '精靈' + a.id;
    if (!sk) { ar.issues.push(iss('error', sp.k + '精靈沒有「' + a.id + '」技能')); return; }
    if (has(S, p, 'lishan')) ar.issues.push(iss('error', '受離山影響，精靈技能無效'));
    if (T.spiritUsed.includes(sp.id)) ar.issues.push(iss('error', '這隻精靈本回合已使用過技能'));
    if (sp.p < sk.cost) ar.issues.push(iss('error', '靈力不足（' + sp.p + '／需要' + sk.cost + '）'));
    if (T.actionDone) ar.issues.push(iss('warn', '精靈技能通常於行動前使用'));
    T.spiritUsed.push(sp.id);
    sp.p = Math.max(0, sp.p - sk.cost);
    const c = a.card ? card(a.card) : null;
    switch (a.id) {
      case '飛刃': loseHp(S, T, ar, q, 10, '飛刃', false); break;
      case '劍雨': loseHp(S, T, ar, q, 40, '劍雨', false); break;
      case '芬芳': healHp(S, T, ar, p, 10, '芬芳', false); break;
      case '綻放': healHp(S, T, ar, p, 40, '綻放', false); break;
      case '川流': S.hand[p] -= 1; if (c) ar.text += '（' + cs(c) + '）'; addDraw(T, ar, 1, '川流'); break;
      case '浩瀚': addDraw(T, ar, 1, '浩瀚'); break;
      case '螢光': if (c) { T.levelLayers.push({ card: cs(c), l: 3 }); ar.text += '（' + cs(c) + '→' + EL[c.e] + '3）'; } else ar.issues.push(iss('warn', '未指定螢光的牌')); break;
      case '絢爛': if (c) { const lv = a.level || 5; T.levelLayers.push({ card: cs(c), l: lv }); ar.text += '（' + cs(c) + '→' + EL[c.e] + lv + '）'; } else ar.issues.push(iss('warn', '未指定絢爛的牌')); break;
      case '石盾': S.statuses.push({ who: q, k: 'shidun', left: 1, unit: 'turn', src: '石盾' }); break;
      case '岩壁': buildShield(S, ar, p, 40); break;
      case '惡視':
        if (a.viewed && a.viewed.length) ar.text += '（看到' + cardsText(a.viewed.map(card)) + '）';
        { const mx = a.viewed && a.viewed.length ? Math.max(...a.viewed.map(k => card(k).l)) : a.maxLv;
          if (mx) loseHp(S, T, ar, q, mx * 2, '戲鬧', false); else ar.issues.push(iss('warn', '戲鬧：未輸入檢視到的牌')); }
        break;
      case '死兆': {
        const cards4 = (a.cards || []).map(card);
        if (!cards4.length) { ar.issues.push(iss('warn', '未登錄死兆捨棄的牌')); break; }
        ar.text += '（' + cardsText(cards4) + '）';
        loseHp(S, T, ar, q, H.maxL(cards4) * 4, '死兆', false);
        if (cards4.some(x => x.l === 4)) { sp.p = Math.min(6, sp.p + 1); ar.notes.push('靈力＋1'); }
        break;
      }
    }
    if (S.spirit[p] && S.spirit[p].p <= 0) { S.spirit[p] = null; ar.notes.push('精靈靈力歸０消失'); }
  },

  formation(S, m, mods, T, a, ar) { doFormation(S, m, mods, T, a, ar); },

  cover(S, m, mods, T, a, ar) {
    const p = T.p;
    const n = a.cards && a.cards.length ? a.cards.length : (a.n || 2);
    ar.text = '覆蓋被動術式（' + (a.cards && a.cards.length ? cardsText(a.cards.map(card)) : n + '張') + (a.form ? '，' + a.form : '') + '）';
    if (stunned(S, T, p)) ar.issues.push(iss('error', '無法行動中卻覆蓋被動術式'));
    S.hand[p] -= n;
    const fx = revealOpp(S, m, T, ar, { cat: 'passive' });
    let form = a.form || null;
    if (a.cards && a.cards.length && form) {
      const r = R.recognizePassive(a.cards, ctxX(S, m, T, p, { forReplay: true })).find(x => x.f.id === form);
      if (!r) ar.issues.push(iss('error', '這些牌無法構成' + form));
      else if (!r.legal) ar.issues.push(iss('error', form + '：' + r.reasons.join('、')));
    }
    S.covered[p] = { ti: T.i, form, n, sealed: !!fx.sealed, revealCard: has(S, p, 'reveal') };
    S.lastForm[p] = { id: form || '被動術式', cat: 'passive', size: n, turn: T.i, basic: !!(form && FMAP[form] && FMAP[form].basic) };
    if (fx.sealed) ar.notes.push('被封印，翻開時無效果');
    if (S.covered[p].revealCard) ar.notes.push('聖光破：須正面展示');
  },

  job(S, m, mods, T, a, ar) {
    const p = T.p, q = T.q;
    const cards = (a.cards || []).map(card);
    ar.text = '轉職' + a.job + (cards.length ? '（' + cardsText(cards) + '）' : '');
    if (stunned(S, T, p)) ar.issues.push(iss('error', '無法行動中卻轉職'));
    const r = R.recognizeJobs(cards, ctxX(S, m, T, p)).find(x => x.job.id === a.job);
    if (!r) ar.issues.push(iss('error', '這些牌不符合' + a.job + '的轉職條件（' + (JMAP[a.job] ? JMAP[a.job].costText : '') + '）'));
    else {
      if (!r.legal) ar.issues.push(iss('error', r.reasons.join('、')));
      if (r.path) ar.text = '轉職' + a.job + '（' + r.path + '：' + cardsText(cards) + '）';
    }
    S.hand[p] -= cards.length;
    revealOpp(S, m, T, ar, { cat: 'job' });
    changeJob(S, T, ar, p, a.job, cards);
    S.lastForm[p] = null;
  },

  pass(S, m, mods, T, a, ar) {
    const p = T.p;
    const st = stunned(S, T, p);
    ar.text = st ? '無法行動' : (S.hand[p] <= 0 ? '沒有手牌，無法行動' : '跳過行動');
    if (!st && S.hand[p] > 0) ar.issues.push(iss('error', '可以行動卻沒有行動（未處於無法行動狀態且有手牌）'));
    revealOpp(S, m, T, ar, { cat: 'pass' });
    S.lastForm[p] = null;
  },

  discard(S, m, mods, T, a, ar) {
    const p = T.p;
    if (a.none) { ar.text = '沒有棄牌'; T.discardNone = true; return; }
    const c = card(a.card);
    ar.text = '棄牌' + cs(c);
    if (T.discarded) ar.issues.push(iss('error', '本回合已登錄過棄牌'));
    T.discarded = c;
    S.lastDiscard[p] = { card: cs(c), turn: T.i };
    const sp = S.spirit[p];
    if (sp && SPIRITS[sp.k] && SPIRITS[sp.k].gain(c)) {
      if (has(S, p, 'lishan')) ar.notes.push('離山：靈力無法增加');
      else if (sp.p < 6) { sp.p++; ar.notes.push(sp.k + '精靈靈力＋1'); }
    }
  },
};

/* ---------------- 施展陣法 ---------------- */
function doFormation(S, m, mods, T, a, ar) {
  const p = T.p, q = T.q;
  const f = FMAP[a.form];
  const printed = (a.cards || []).map(card);
  ar.text = a.form + '（' + cardsText(printed) + '）';
  if (!f) { ar.issues.push(iss('error', '未知陣法')); return; }
  if (stunned(S, T, p)) ar.issues.push(iss('error', '無法行動中卻施展陣法'));
  // 江湖狀態於本回合立即生效
  if (f.preStatus) addStatus(S, T, ar, p, f.preStatus, 2, f.id, true);
  const X = ctxX(S, m, T, p, { forReplay: true, choice: a.choice || {}, legacyStar: (a.via == null || /星辰|瞞天/.test(a.via)) && !T.starSubs.length });
  X.all = true;
  const cands = R.recognize(printed, X).filter(r => r.f.id === f.id);
  const piOk = x => a.pi == null || x.pi === a.pi;
  let r = (a.via != null && cands.find(x => piOk(x) && x.notes.join(',') === a.via))
    || cands.find(x => piOk(x) && x.legal) || cands.find(piOk) || cands[0];
  if (!r) {
    ar.issues.push(iss('error', '這些牌無法構成' + f.id));
    r = { f, pat: f.pats[0] || {}, cards: printed.map(x => ({ ...x })), notes: [], legal: false, reasons: [] };
  } else if (!r.legal) ar.issues.push(iss('error', f.id + '：' + r.reasons.join('、')));
  if (r.notes.length) ar.text = a.form + '（' + cardsText(printed) + '，' + r.notes.join('，') + '）';
  if (T.virtual && !r.cards.some(x => x.virtual)) ar.issues.push(iss('error', T.virtual.kind + '產生的牌必須於本回合使用'));
  if (T.virtual && T.virtual.kind === '幻術' && !/擊術$/.test(f.id)) ar.issues.push(iss('error', '幻術產生的牌只能施展五行擊術'));
  if (f.limited) useLimited(S, T, ar, p, f.limited);
  if (f.mod !== 'basic' && !mods.has(f.mod)) ar.issues.push(iss('error', '未啟用此規則模組'));
  // 手牌
  S.hand[p] -= printed.length;

  // 虛空追尋者以５５５施展虛空術 → 先轉職虛空破滅者
  if (f.voidArt && abOf(S, T, p, '虛空追尋') && H.levels(printed, [5, 5, 5])) {
    ar.notes.push('虛空追尋：轉職虛空破滅者');
    changeJob(S, T, ar, p, '虛空破滅者', []);
  }

  // 點數
  let pts;
  const atkType = f.atk === 'choice' ? (a.choice && a.choice.el != null ? +a.choice.el : null) : f.atk;
  if (f.pts) {
    let pc = r.cards.filter(x => !x.dup).map(x => ({ e: x.e, l: x.l }));
    if (f.cat === 'attack' && has(S, p, 'qianfeng')) pc = pc.map(x => ({ e: x.e, l: Math.min(5, x.l + 1) }));
    pts = f.pts(pc, { ab: n => abOf(S, T, p, n), oppHand: S.hand[q], printed: r.cards.map(x => ({ e: x.e, l: x.l })), choice: a.choice || {} });
    pts += (r.pat && r.pat.adj) || 0;
    pts = Math.max(0, Math.ceil(pts));
  }
  if (f.atk === 'choice' && atkType == null) ar.issues.push(iss('warn', '南靈陣未選擇屬性'));
  const isAtk = f.cat === 'attack';
  if (pts != null) ar.text += pts + '點';

  // 翻開上家被動術式 + 本回合受到的反制
  const fx = revealOpp(S, m, T, ar, { cat: f.cat, f, pts, atkType });
  const o = { pts, pat: r.pat, choice: a.choice || {}, f };
  const E = makeE(S, m, T, ar, o, fx, f, atkType);

  // 環境使陣法無效
  let envNull = false;
  if (S.env != null && ENV_INVALID[S.env].includes(f.id)) {
    const tot = S.totem[p] != null && TOTEMS[S.totem[p]].protect.includes(f.id) && TOTEMS[S.totem[p]].e === S.totem[p];
    const dark = f.dark && abOf(S, T, p, '暗境');
    if (!tot && !dark) { envNull = true; ar.notes.push(EL[S.env] + '行環境：' + f.id + '無效'); }
  }
  // 術式被封印
  const spellNull = (f.cat === 'active') && fx.nullSpell;
  if (spellNull) ar.notes.push('術式被無效');

  if (!envNull && !spellNull && f.run) f.run(E, r.cards.filter(x => !x.dup), o);

  // 暗行：施展暗黑陣法時轉職暗靈使
  if (f.dark && f.id.startsWith('暗黑') && S.job[p] === '暗行者' && !lishan(S, T, p)) { ar.notes.push('暗行：轉職暗靈使'); changeJob(S, T, ar, p, '暗靈使', []); }
  // 舞陽訣
  if (T.wuyang && isAtk && printed.length >= 3 && (atkType === 1 || atkType === 3)) addDraw(T, ar, 1, '舞陽訣');

  S.lastForm[p] = { id: f.id, cat: f.cat, atk: isAtk ? atkType : null, size: f.size === 0 ? 0 : (r.cards.filter(x => !x.virtual).length + r.cards.filter(x => x.dup).length * 0) || printed.length, ruleSize: f.size, cards: printed.map(cs), turn: T.i, basic: !!f.basic };
  S.lastForm[p].size = printed.length + (r.cards.some(x => x.virtual) ? 1 : 0);
}

/* 翻開上家的被動術式，並彙整本回合行動受到的反制效果 */
function revealOpp(S, m, T, ar, info) {
  const p = T.p, q = T.q;
  const fx = { nullAtk: false, nullSpell: false, split: false, nullAtk40: false, sealed: false, src: [] };
  const isAtk = info.cat === 'attack';
  const f = info.f;
  const ignoreFormFx = isAtk && (has(S, p, 'taxue') || (f && f.beast));
  const windwalk = isAtk && info.pts != null && info.pts <= 15 && abOf(S, T, p, '風行術');
  const immuneCounter = T.cicada || ignoreFormFx || windwalk;
  const daoyuan = abOf(S, T, p, '道源');
  if (!T.revealed) {
    T.revealed = true;
    const cv = S.covered[q];
    if (cv) {
      S.covered[q] = null;
      const pf = cv.form ? FMAP[cv.form] : null;
      if (!cv.form) ar.issues.push(iss('warn', '上家覆蓋的被動術式尚未補登內容'));
      let msg = '翻開上家' + (cv.form || '被動術式');
      if (cv.sealed) msg += '（已被封印，無效果）';
      else if (pf && pf.counter) {
        const k = pf.counter;
        if (k === 'poison') {
          if (T.cicada) msg += '（金蟬：不受影響）';
          else { addPoison(S, T, ar, p, 1, q); msg += '，中毒1回合'; }
        } else if (immuneCounter) {
          msg += T.cicada ? '（金蟬：不受影響）' : windwalk ? '（風行術：不受影響）' : '（不受其他陣法效果影響）';
        } else {
          applyCounter(fx, k, info, daoyuan, pf.id);
        }
      }
      ar.notes.unshift(msg);
    }
  }
  // 上家先前施展的攻擊附帶反制（道禦、幻印、法震、流影殘光劍）與石盾、觀火
  S.statuses.filter(s => s.who === p).forEach(s => {
    if (['nullAtk', 'nullSpell', 'split', 'nullAtk40'].includes(s.k)) {
      if (immuneCounter && s.src !== '幻化') { /* 金蟬/踏雪/聖獸/風行術 */ } else applyCounter(fx, s.k, info, daoyuan, s.src);
    }
  });
  fx.shidun = isAtk && has(S, p, 'shidun');
  fx.guanhuo = has(S, p, 'guanhuo') && !T.cicada;
  return fx;
}
function applyCounter(fx, k, info, daoyuan, src) {
  const isAtk = info.cat === 'attack';
  if (k === 'nullAtk' && isAtk) { fx.nullAtk = true; fx.src.push(src); }
  if (k === 'split' && isAtk) { fx.split = true; fx.src.push(src); }
  if (k === 'nullAtk40' && isAtk && info.pts <= 40) { fx.nullAtk = true; fx.src.push(src); }
  if (k === 'nullSpell' && !daoyuan) {
    if (info.cat === 'active') { fx.nullSpell = true; fx.src.push(src); }
    if (info.cat === 'passive') { fx.sealed = true; fx.src.push(src); }
  }
}

/* 陣法效果操作 */
function makeE(S, m, T, ar, o, fx, f, atkType) {
  const p = T.p, q = T.q;
  const E = {
    me: p, opp: q,
    ab: n => abOf(S, T, p, n),
    hp: who => S.hp[who],
    hasStatus: (who, k) => has(S, who, k),
    meteor: () => T.meteor,
    res: () => T.res,
    oppLastFormSize: () => { const lf = S.lastForm[q]; return lf && lf.turn === T.i - 1 ? (lf.ruleSize === 0 ? 0 : lf.size) : 0; },
    note: s => ar.notes.push(s),
    issue: (lv, s) => ar.issues.push(iss(lv, s)),
    attack: pts => doAttack(S, T, ar, o, fx, f, atkType, pts),
    heal: (who, n, opt) => healHp(S, T, ar, who, n, f.id, true, fx),
    lose: (who, n, opt) => loseHp(S, T, ar, who, n, f.id, true, false, fx),
    buildShield: (who, n) => buildShield(S, ar, who, n),
    shieldDown: (who, n) => { const b = S.shield[who]; S.shield[who] = Math.max(0, b - n); ar.notes.push(b ? '扣除防護罩' + Math.min(b, n) + '點' : '對方沒有防護罩'); },
    breakShield: (who, src) => { if (S.shield[who]) { S.shield[who] = 0; ar.notes.push(src + '：破除防護罩'); } },
    status: (who, k, n, src) => addStatus(S, T, ar, who, k, n, src || f.id),
    counter: (k, src) => { S.statuses.push({ who: q, k, left: 1, unit: 'turn', src }); },
    draw: (n, src) => addDraw(T, ar, n, src),
    noDraw: src => { T.noDraw = true; ar.notes.push(src + '：本回合無法抽牌'); },
    handDelta: (who, d, src) => { S.hand[who] = Math.max(0, S.hand[who] + d); },
    swapHp: () => { if (fx.guanhuo) return ar.notes.push('觀火：生命交換無效'); const t = S.hp[0]; S.hp[0] = S.hp[1]; S.hp[1] = t; ar.notes.push('雙方生命交換'); },
    halveHp: who => { const n = S.hp[who] - Math.floor(S.hp[who] / 2); loseHp(S, T, ar, who, n, f.id, true, false, fx, '生命減半'); },
    summonStar: e => summonStar(S, T, ar, p, e, o.copy),
    breakOwnStar: e => { if (S.star[p] === e) { S.star[p] = null; ar.notes.push('破除' + STARS[e].name); } },
    voidStar: () => {
      let any = false;
      [0, 1].forEach(w => { if (S.star[w] != null) { ar.notes.push('破除' + STARS[S.star[w]].name); S.star[w] = null; any = true; loseHp(S, T, ar, w, 20, f.id, true, false, fx); } });
      if (!any) ar.notes.push('場上沒有星辰');
    },
    setEnv: e => { S.env = e; ar.notes.push('轉移為' + EL[e] + '行環境'); },
    voidEnv: () => {
      if (S.env == null) return ar.notes.push('目前沒有環境');
      ar.notes.push('破除' + EL[S.env] + '行環境'); S.env = null;
      if (S.totem[0] != null || S.totem[1] != null) { S.totem = [null, null]; ar.notes.push('破除所有圖騰'); }
      loseHp(S, T, ar, p, 20, f.id, true, false, fx); loseHp(S, T, ar, q, 20, f.id, true, false, fx);
    },
    voidJob: low => {
      [0, 1].forEach(w => {
        const j = S.job[w] && JMAP[S.job[w]];
        if (!j) return;
        if (low && j.legend) return ar.notes.push(S.job[w] + '為傳說職業，不受影響');
        if (j.allAb.includes('虛空境界') && limitedLeft(S, w, '虛空境界') > 0) { S.uses[w]['虛空境界'] = (S.uses[w]['虛空境界'] || 0) + 1; return ar.notes.push('虛空境界：' + S.job[w] + '不會被破除'); }
        ar.notes.push('破除' + m.players[w] + '的' + S.job[w]); S.job[w] = null;
      });
      loseHp(S, T, ar, p, 20, f.id, true, false, fx);
    },
    breakOwnJob: () => { if (S.job[p]) { ar.notes.push('破除' + S.job[p]); S.job[p] = null; } },
    summonSpirit: (k, darkArray) => {
      const sp = S.spirit[p];
      if (darkArray && sp && sp.k === k) { sp.p = Math.min(6, sp.p + 2); ar.notes.push(k + '精靈靈力＋2'); return; }
      S.spirit[p] = { k, p: 2, id: ++S.spiritSeq }; ar.notes.push('召喚' + k + '精靈');
    },
    voidSpirit: () => {
      [0, 1].forEach(w => {
        const sp = S.spirit[w];
        if (!sp) return;
        sp.p -= 2;
        if (sp.p <= 0) {
          S.spirit[w] = null; ar.notes.push(m.players[w] + '的' + sp.k + '精靈消失');
          if ((sp.k === '惡' || sp.k === '死') && S.job[w] === '魔靈師' && !lishan(S, T, w)) {
            S.job[w] = null; S.spirit[w] = { k: sp.k, p: 2, id: ++S.spiritSeq }; ar.notes.push('魔靈復甦：破除魔靈師並召喚' + sp.k + '精靈');
          }
        } else ar.notes.push(m.players[w] + '的' + sp.k + '精靈靈力－2');
        loseHp(S, T, ar, w, 20, f.id, true, false, fx);
      });
    },
    voidWall: () => {
      [0, 1].forEach(w => { if (S.shield[w] > 0) { S.shield[w] = Math.max(0, S.shield[w] - 20); ar.notes.push(m.players[w] + '防護罩－20'); loseHp(S, T, ar, w, 20, f.id, true, false, fx); } });
    },
    view: () => {
      const vw = o.choice && o.choice.viewed;
      if (vw && vw.length) ar.notes.push('看到' + cardsText(vw.map(card)));
      const tk = o.choice && o.choice.taken;
      if (tk && tk.length) {
        const verb = { '混沌': '放回牌堆', '暗黑混沌': '放回牌堆', '中靈陣‧黃鱗': '拿走', '聖風': '拿走', '鏡鳴': '捨棄', '萬鳴': '捨棄' }[f.id] || '選了';
        ar.notes.push(verb + cardsText(tk.map(card)));
        if (vw && vw.length) { const pool = vw.slice(); if (!tk.every(k => { const i = pool.indexOf(k); if (i < 0) return false; pool.splice(i, 1); return true; })) ar.issues.push(iss('warn', '選的牌不在看到的牌之中')); }
      }
      if (S.spirit[p] && S.spirit[p].k === '惡' && !lishan(S, T, p)) {
        const mx = vw && vw.length ? Math.max(...vw.map(k => card(k).l)) : o.choice && o.choice.viewMax;
        if (mx) loseHp(S, T, ar, q, mx * 2, '戲鬧', false); else ar.issues.push(iss('warn', '戲鬧：未輸入檢視到的最高等級'));
      }
    },
    immuneShadow: () => abOf(S, null, q, '影遁'),
    xianshu: () => { if (abOf(S, T, p, '仙術')) addDraw(T, ar, 1, '仙術'); },
    poison: (who, n) => addPoison(S, T, ar, who, n, p),
    win: (who, why) => { S.over = { winner: who, reason: why, turn: T.i }; ar.notes.push(why + '：' + m.players[who] + '獲勝'); },
    delayedLose: (who, n, src) => { S.delayed.push({ who, n, src }); ar.notes.push(src + '：上家下回合行動結束時扣除' + n + '點生命'); },
    resetUses: name => { S.uses[p][name] = 0; ar.notes.push('回復' + name + '使用次數'); },
    setTotem: e => { S.totem[p] = e; ar.notes.push('獲得' + TOTEMS.find(t => t.e === e).name); },
    metamorph: c => metamorph(S, m, T, ar, o, fx, c),
    chain: ch => {
      ar.notes.push(ch.pouchCard ? '覆蓋錦囊（' + ch.pouchCard + '）' : '覆蓋錦囊');
      S.pouch[p] = true; S.pouchFrom[p] = T.i;
      if (ch.trigCard && ch.strat) {
        const pc = card(ch.pouchCard || ch.trigCard), tc = card(ch.trigCard);
        if (ch.pouchCard && (pc.e === tc.e || pc.l === tc.l)) ar.issues.push(iss('error', '連環選擇的兩張牌須不同行、不同級'));
        resolveStrategy(S, m, T, ar, Object.assign({ card: ch.trigCard }, ch), '連環觸發');
      }
    },
  };
  return E;
}

/* 幻化 */
function metamorph(S, m, T, ar, o, fx, c) {
  const q = T.q;
  const lf = S.lastForm[q];
  if (!lf || lf.turn !== T.i - 1 || !lf.basic) { ar.notes.push('上家上回合沒有施展基礎規則陣法，無可複製'); return; }
  const f2 = FMAP[lf.id];
  if (!f2) { ar.notes.push('無可複製（上家陣法未知）'); return; }
  ar.notes.push('複製' + f2.id);
  if (f2.cat === 'passive') {
    if (f2.counter) S.statuses.push({ who: q, k: f2.counter, left: 1, unit: 'turn', src: '幻化' });
    return;
  }
  let pts;
  if (f2.pts) {
    let pc = c.map(x => ({ e: x.e, l: x.l }));
    if (f2.cat === 'attack' && has(S, T.p, 'qianfeng')) pc = pc.map(x => ({ e: x.e, l: Math.min(5, x.l + 1) }));
    pts = Math.ceil(f2.pts(pc, { ab: n => abOf(S, T, T.p, n), oppHand: S.hand[q], printed: pc, choice: {} }));
    ar.notes.push(f2.id + pts + '點');
  }
  const o2 = { pts, pat: {}, choice: {}, f: f2, copy: true };
  // 幻化本身是主動術式；複製攻擊時改以攻擊處理
  const fx2 = f2.cat === 'attack' ? revealOpp(S, m, T, ar, { cat: 'attack', f: f2, pts, atkType: f2.atk }) : fx;
  const E2 = makeE(S, m, T, ar, o2, fx2, f2, f2.atk);
  f2.run(E2, c, o2);
}

/* 攻擊傷害計算 */
function doAttack(S, T, ar, o, fx, f, type, pts) {
  const p = T.p, q = T.q;
  const beast = !!f.beast;
  const parts = [];
  if (fx.guanhuo) { ar.notes.push('觀火：攻擊之傷害無效'); return; }
  if (fx.nullAtk) { ar.notes.push((fx.src.join('、') || '反制') + '：攻擊之傷害無效'); return; }
  if (fx.shidun) { ar.notes.push('石盾：攻擊之傷害無效'); return; }
  let d = pts, healMode = false;
  const elemental = typeof type === 'number';
  const shielded = S.shield[q] > 0;
  if (elemental && S.env != null) {
    if (S.env === type) {
      if (!beast && S.totem[q] === type) parts.push(TOTEMS.find(t => t.e === type).name + '：不因環境加倍');
      else { d *= 2; parts.push('環境雙倍'); }
    }
    if (MOTHER[S.env] === type) {
      if (!beast && S.totem[p] === type) { parts.push(TOTEMS.find(t => t.e === type).name + '：不改為回復（圖騰捨棄）'); S.totem[p] = null; }
      else if (!shielded) { healMode = true; parts.push('環境改為回復'); }
    }
  }
  if (elemental && !shielded) {
    const lf = S.lastForm[q];
    if (lf && lf.turn === T.i - 1 && lf.cat === 'attack' && typeof lf.atk === 'number') {
      const pe = lf.atk;
      if (GEN[type] === pe) { if (!healMode) parts.push('五行相生改為回復'); healMode = true; }
      else if (KE[type] === pe) { d *= 2; parts.push('五行相剋雙倍'); }
      else if (type === pe) { d = Math.ceil(d / 2); parts.push('五行相抵減半'); }
    }
  }
  if (fx.split) {
    const half = Math.ceil(d / 2);
    parts.push('反震平分各' + half);
    applyDamage(S, T, ar, q, half, type, healMode, parts);
    applyDamage(S, T, ar, p, half, type, false, parts, true);
  } else applyDamage(S, T, ar, q, d, type, healMode, parts);
  if (parts.length) ar.notes.push(parts.join('，'));
}
function applyDamage(S, T, ar, who, d, type, healMode, parts, self) {
  if (S.shield[who] > 0) {
    const d2 = type === 'P' ? d * 2 : d;
    const b = S.shield[who];
    S.shield[who] = Math.max(0, b - d2);
    parts.push((self ? '自身' : '') + '防護罩承受' + Math.min(b, d2) + (type === 'P' ? '（物理雙倍）' : '') + (S.shield[who] ? '' : '，防護罩消滅'));
    return;
  }
  if (typeof type === 'number' && abOf(S, T, who, EL[type] + '行抗性')) { parts.push(EL[type] + '行抗性：傷害無效'); return; }
  if (type === 'P' && abOf(S, T, who, '卸勁')) { d = Math.ceil(d / 2); parts.push('卸勁減半'); }
  if ((type === 1 || type === 3) && has(S, who, 'tianyang')) { d = Math.ceil(d / 2); parts.push('天陽罡減半'); }
  if (healMode) {
    if (has(S, who, 'poison')) { parts.push('中毒：無法回復'); return; }
    const b = S.hp[who]; S.hp[who] = Math.min(S.maxHp, b + d);
    parts.push('回復' + (S.hp[who] - b) + '點');
  } else {
    S.hp[who] = Math.max(0, S.hp[who] - d);
    if (!parts.length || self) parts.push((self ? '自身' : '') + '造成' + d + '點');
    else parts.push(d + '點');
  }
}

function loseHp(S, T, ar, who, n, src, formation, isCost, fx, label) {
  if (formation && fx && fx.guanhuo) { ar.notes.push('觀火：扣除生命無效'); return; }
  const b = S.hp[who];
  S.hp[who] = Math.max(0, b - n);
  ar.notes.push((who === T.p ? '自身' : '對方') + (label ? label + '，' : '') + '扣除' + n + '點生命');
  // 死精靈 同命
  if (formation && !isCost && S.spirit[who] && S.spirit[who].k === '死' && !has(S, who, 'lishan') && n > 0) {
    const o = 1 - who; S.hp[o] = Math.max(0, S.hp[o] - 10); ar.notes.push('同命：' + (o === T.p ? '自身' : '對方') + '扣除10點生命');
  }
}
function healHp(S, T, ar, who, n, src, formation, fx) {
  if (formation) {
    if (fx && fx.guanhuo) { ar.notes.push('觀火：回復生命無效'); return; }
    if (has(S, T.p, 'poison')) { ar.notes.push('中毒：回復效果無效'); return; }
    if (has(S, who, 'poison')) { ar.notes.push('中毒：無法回復'); return; }
  }
  const b = S.hp[who];
  S.hp[who] = Math.min(S.maxHp, b + n);
  ar.notes.push((who === T.p ? '' : '對方') + '回復' + (S.hp[who] - b) + '點生命');
}
function buildShield(S, ar, who, n) { S.shield[who] = n; ar.notes.push('建構' + n + '點防護罩'); }
function addDraw(T, ar, n, src) { T.drawBonus += n; ar.notes.push(src + '：本回合抽牌＋' + n); }
function addStatus(S, T, ar, who, k, n, src, silent) {
  // 浩然正氣：敵方造成之２回合以上持續效果縮短為１回合
  if (who !== T.p && n >= 2 && abOf(S, T, who, '浩然正氣')) { n = 1; ar.notes.push('浩然正氣：縮短為1回合'); }
  if (who === T.p && T.cicada && (k === 'stun' || k === 'nodraw') && src !== '自身') { /* 金蟬只影響本回合；之後的回合仍生效 */ }
  const ex = S.statuses.find(s => s.who === who && s.k === k && s.src === src && (k === 'qianfeng' || k === 'taxue'));
  if (ex) { ex.left = Math.max(ex.left, n); return; }
  S.statuses.push({ who, k, left: n, unit: 'turn', src });
  if (!silent && (k === 'stun')) ar.notes.push((who === T.p ? '自身' : '對方') + STATUS_NAME[k] + n + '回合');
  if (!silent && k === 'nodraw' && !S.statuses.some(s => s.who === who && s.k === 'stun' && s.src === src)) ar.notes.push((who === T.p ? '自身' : '對方') + '無法抽牌' + n + '回合');
}
function addPoison(S, T, ar, who, n, src) {
  let ps = S.statuses.find(s => s.who === who && s.k === 'poison');
  if (ps) { ps.left += n; ps.by = src; } else { ps = { who, k: 'poison', left: n, unit: 'turn', src: '中毒', by: src }; S.statuses.push(ps); }
  if (who !== src && ps.left >= 2 && abOf(S, T, who, '浩然正氣')) { ps.left = 1; ar.notes.push('浩然正氣：中毒縮短為1回合'); }
  ar.notes.push((who === T.p ? '自身' : '對方') + '中毒' + n + '回合');
}
function summonStar(S, T, ar, p, e, copy) {
  if (copy) return;
  const st = STARS[e];
  if (S.star[p] === e) return;
  if (S.star[1 - p] === e) { ar.notes.push(st.name + '已屬於對方，召喚無效'); return; }
  S.star[p] = e;
  ar.notes.push('召喚' + st.name);
  const victim = KE[e];
  [0, 1].forEach(w => { if (S.star[w] === victim) { S.star[w] = null; ar.notes.push('破除' + STARS[victim].name); } });
  if (!S.starHist[p].includes(e)) S.starHist[p].push(e);
  if (S.starHist[p].length >= 5) { S.over = { winner: p, reason: '五星連珠', turn: T.i }; ar.notes.push('五星連珠！'); }
}
function limitedMax(S, who, name) {
  if (name === '禁錮法陣') return abOf(S, null, who, '道法心生') ? 2 : 1;
  return 1;
}
function limitedLeft(S, who, name) { return limitedMax(S, who, name) - (S.uses[who][name] || 0); }
function useLimited(S, T, ar, who, name) {
  if (limitedLeft(S, who, name) <= 0) ar.issues.push(iss('error', name + '使用次數已用完'));
  S.uses[who][name] = (S.uses[who][name] || 0) + 1;
}
function changeJob(S, T, ar, who, id, cards) {
  const prev = S.job[who];
  S.job[who] = id;
  const j = JMAP[id];
  if (!j) return;
  Object.keys(j.limited || {}).forEach(k => { S.uses[who][k] = 0; });
  if (id === '虛空破滅者') loseHp(S, T, ar, 1 - who, 20, '虛空破滅', false);
  if (id === '魔靈師' && S.spirit[who]) {
    const k = cards.length && cards[0].l === 4 ? '死' : '惡';
    S.spirit[who].k = k; ar.notes.push('魔靈附體：精靈變為' + k + '精靈');
  }
  if (id === '書仙') {
    S.statuses.forEach(s => { if (s.who === who && s.left >= 2 && s.src !== '中毒自身' && ['stun', 'nodraw', 'poison'].includes(s.k)) { s.left = 1; ar.notes.push('浩然正氣：持續效果縮短為1回合'); } });
  }
}

/* 秘計 */
function resolveStrategy(S, m, T, ar, a, prefix) {
  const p = T.p, q = T.q;
  const cd = a.card ? card(a.card) : null;
  const st = SMAP[a.strat];
  ar.text = (prefix ? prefix + '' : '') + (st ? st.id : '錦囊') + (cd ? '（' + cs(cd) + '）' : '');
  if (prefix) ar.text = ar.text; // 連環時文字附加在陣法後
  if (!cd) { ar.issues.push(iss('warn', '未登錄錦囊牌')); }
  if (!st) { ar.issues.push(iss('warn', '未選擇秘計')); return; }
  if (cd && (st.by === 'e' ? cd.e : cd.l) !== st.v) ar.issues.push(iss('error', '錦囊牌' + cs(cd) + '不能觸發' + st.id));
  const txt = [];
  switch (st.id) {
    case '金蟬': T.cicada = true; txt.push('本回合不受無法行動、無法抽牌、反制效果及其他玩家秘計影響'); break;
    case '偷梁': T.allPlus = 1; txt.push('手牌等級＋1'); break;
    case '混水': addDraw(T, ar, 1, '混水'); break;
    case '觀火': S.statuses.push({ who: q, k: 'guanhuo', left: 1, unit: 'turn', src: '觀火' }); txt.push('下家下回合攻擊傷害、陣法扣除/回復生命無效'); break;
    case '離山': {
      const tg = a.target == null ? q : a.target;
      if (tg !== p && has(S, tg, 'cicada')) { /* 不會發生：金蟬僅本回合 */ }
      S.statuses.push({ who: tg, k: 'lishan', left: 1, unit: 'turn', src: '離山' });
      txt.push('指定' + m.players[tg]);
      break;
    }
    case '還魂': {
      if (!cd) break;
      const old = S.spirit[p];
      const inherit = old && !has(S, p, 'lishan') ? old.p : 0;
      S.spirit[p] = { k: EL[cd.e], p: Math.min(6, 1 + inherit), id: ++S.spiritSeq };
      txt.push((old ? '' : '') + EL[cd.e] + '精靈（' + S.spirit[p].p + '）');
      break;
    }
    case '牽羊': if (a.cards && a.cards.length) txt.push(cardsText(a.cards.map(card))); break;
    case '暗渡': {
      if (!cd) break;
      const jid = T1[cd.e];
      if (abOf(S, T, p, '暗行')) { txt.push('暗行：無法轉職'); break; }
      changeJob(S, T, ar, p, jid, []); txt.push('轉職' + jid);
      break;
    }
    case '瞞天': {
      const op = a.starOp || {};
      if (op.op === 'break') {
        const w = S.star[0] === op.e ? 0 : S.star[1] === op.e ? 1 : -1;
        if (w < 0) ar.issues.push(iss('error', '指定的星辰不存在'));
        else { S.star[w] = null; txt.push('破除' + STARS[op.e].name); }
      } else if (op.op === 'gain') { T.tempStar = op.e; txt.push('本回合獲得' + STARS[op.e].name + '效果'); }
      else ar.issues.push(iss('warn', '瞞天未選擇破除或獲得星辰'));
      break;
    }
    case '走為': {
      const op = a.envOp || {};
      if (op.op === 'clear') { if (S.env != null) { txt.push('破除' + EL[S.env] + '行環境'); S.env = null; } else txt.push('目前沒有環境'); }
      else if (op.op === 'transfer') {
        const c2 = op.card ? card(op.card) : null;
        S.hand[p] -= 1;
        if (c2) { S.env = c2.e; txt.push('捨棄' + cs(c2) + '轉換為' + EL[c2.e] + '行環境'); } else ar.issues.push(iss('warn', '走為未登錄捨棄的牌'));
      } else ar.issues.push(iss('warn', '走為未選擇效果'));
      break;
    }
  }
  if (txt.length) ar.notes.push(st.id + '：' + txt.join('，'));
}

/* ---------------- 回合結束 ---------------- */
function endTurn(S, m, mods, T, rec, turn, i) {
  const p = T.p;
  const ar = { a: { kind: 'end' }, text: '', notes: [], issues: [] };
  if (!T.actionDone && !S.over) {
    ar.issues.push(iss('warn', '本回合沒有登錄行動'));
    revealOpp(S, m, T, ar, { cat: 'pass' });
    afterAction(S, T, ar);
  }
  // 回合抽牌
  let N = 0;
  if (!S.over) {
    if (noDraw(S, T, p)) N = 0;
    else N = Math.max(0, Math.min(2 + T.drawBonus, 5 - S.hand[p]));
    if (S.hand[p] < 0) ar.issues.push(iss('error', '使用的牌超過手牌數（手牌推算為' + S.hand[p] + '）'));
    S.hand[p] = Math.max(0, S.hand[p]) + N;
    if (S.hand[p] > 5) ar.issues.push(iss('error', '手牌超過５張'));
    rec.drawN = N;
    if (N === 0 && T.discarded) ar.issues.push(iss('error', noDraw(S, T, p) ? '本回合無法抽牌，不應有棄牌' : '手牌已滿未抽牌，不應有棄牌'));
    if (N > 0 && !T.discarded && !T.discardNone) ar.issues.push(iss('warn', '未登錄本回合棄牌'));
  }
  rec.handEnd = S.hand[p];
  // 中毒
  if (!S.over) {
    const ps = S.statuses.find(s => s.who === p && s.k === 'poison');
    if (ps) {
      const bonus = abOf(S, null, ps.by, '毒絕') && ps.by !== p ? 5 : 0;
      loseHp(S, T, ar, p, 10 + bonus, '中毒', false);
      ar.notes[ar.notes.length - 1] = '中毒扣除' + (10 + bonus) + '點生命';
    }
  }
  // 以「回合」計算的狀態
  S.statuses.forEach(s => { if (s.who === p && s.unit === 'turn') s.left--; });
  S.statuses = S.statuses.filter(s => s.left > 0);
  checkOver(S, T, ar, i);
  rec.endAct = ar;
  ar.issues.forEach(x => rec.acts.length ? rec.issues.push({ ...x, ai: -1 }) : rec.issues.push({ ...x, ai: -1 }));
}

function checkOver(S, T, ar, i) {
  if (S.over) return;
  const zero = [0, 1].filter(w => S.hp[w] <= 0);
  zero.forEach(w => {
    const sp = S.spirit[w];
    if (sp && sp.k === '木' && sp.p >= 6 && !has(S, w, 'lishan')) {
      S.spirit[w] = null; S.hp[w] = Math.min(S.maxHp, 40); ar.notes.push('綻放自動發動：回復40點生命');
    }
  });
  const z = [0, 1].filter(w => S.hp[w] <= 0);
  if (z.length === 2) S.over = { winner: -1, reason: '雙方生命歸０，平局', turn: i };
  else if (z.length === 1) S.over = { winner: 1 - z[0], reason: '生命歸０', turn: i };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtVal(f, v) {
  if (f === 'star') return v === '' || v == null ? '無' : STARS[+v].name;
  if (f === 'env') return v === '' || v == null ? '無環境' : EL[+v] + '行環境';
  if (f === 'totem') return v === '' || v == null ? '無' : TOTEMS.find(t => t.e === +v).name;
  if (f === 'pouch') return v ? '有' : '無';
  if (v === '' || v == null) return '無';
  return String(v);
}

/* 目前回合的可用選項（給介面用） */
function options(S, m, T) {
  const p = T.p, q = T.q;
  const mods = new Set(m.settings.mods);
  const o = { pouch: false, retrieve: false, abilities: [], spirit: [], stunned: stunned(S, T, p) };
  o.pouch = S.pouch[p] && !T.pouchUsed && !T.actionDone;
  const ld = S.lastDiscard[q];
  o.retrieve = mods.has('retrieve') && !T.retrieved && ld && ld.turn === T.i - 1 ? ld.card : null;
  const j = S.job[p] && JMAP[S.job[p]];
  o.starsub = [];
  if (m.settings.mods.includes('star')) {
    if (S.star[p] != null) o.starsub.push({ src: '星辰', e: S.star[p], ok: !T.actionDone && !T.starSubs.some(x => x.src === '星辰') });
    if (T.tempStar != null) o.starsub.push({ src: '瞞天', e: T.tempStar, ok: !T.actionDone && !T.starSubs.some(x => x.src === '瞞天') });
  }
  if (j) j.allAb.filter(a => AMAP[a]).forEach(a => o.abilities.push({ id: a, ok: abOf(S, T, p, a) && !T.abilityUsed && !stunned(S, T, p) && (!AMAP[a].limited || limitedLeft(S, p, a) > 0) }));
  const sp = S.spirit[p];
  if (sp && SPIRITS[sp.k]) SPIRITS[sp.k].skills.forEach(s => o.spirit.push({ id: s.id, cost: s.cost, ok: sp.p >= s.cost && !T.spiritUsed.includes(sp.id) && !has(S, p, 'lishan') }));
  return o;
}

const ENGINE = { newMatch, replay, initState, ctxX, options, STATUS_NAME, ALL_MODS, has, abOf, stunned, limitedLeft };
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE; else root.ENGINE = ENGINE;
})(this);
