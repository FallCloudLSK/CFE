/* =====================================================================
 * 對局記錄整理：時間軸列、匯出網頁、匯出 xlsx
 * ===================================================================== */
(function (root) {
'use strict';
const node = typeof module !== 'undefined' && module.exports;
const R = node ? require('./rules.js') : root.RULES;
const EN = node ? require('./engine.js') : root.ENGINE;
const XL = node ? require('./xlsx.js') : root.XLSX;
const { EL, STARS, TOTEMS } = R;

const ACTIVE = ['pouch', 'starsub', 'ability', 'spirit', 'retrieve'];
const ACTION = ['formation', 'cover', 'job', 'pass'];

function sideInfo(S, w) {
  const sp = S.spirit[w];
  return {
    hp: S.hp[w], shield: S.shield[w] || 0, job: S.job[w] || '', star: S.star[w] != null ? STARS[S.star[w]].short : '',
    spirit: sp ? sp.k + '(' + sp.p + ')' : '', pouch: S.pouch[w] ? '有' : '', hand: S.hand[w],
    totem: S.totem[w] != null ? TOTEMS.find(t => t.e === S.totem[w]).name.replace('圖騰', '') : '',
    status: S.statuses.filter(s => s.who === w).map(s => (EN.STATUS_NAME[s.k] || s.k) + s.left).join(' '),
  };
}
function actText(ar) { return ar.text + (ar.notes.length ? '（' + ar.notes.join('；') + '）' : ''); }

function rows(m, rep) {
  return rep.turns.map(t => {
    const r = { i: t.i, p: t.p, player: m.players[t.p], active: [], action: '', result: '', discard: '', other: [], live: !!t.live, level: t.level, issues: t.issues };
    t.acts.forEach(ar => {
      const k = ar.a.kind;
      if (ACTIVE.includes(k)) r.active.push(actText(ar));
      else if (ACTION.includes(k)) { r.action = ar.text; r.result = ar.notes.join('；'); }
      else if (k === 'discard') r.discard = ar.a.none ? '—' : ar.text.replace('棄牌', '') + (ar.notes.length ? '（' + ar.notes.join('；') + '）' : '');
      else r.other.push(actText(ar));
    });
    if (t.endAct && t.endAct.notes.length) r.other.push(t.endAct.notes.join('；'));
    const S = t.after;
    r.hand = t.live ? '' : t.handEnd;
    r.L = sideInfo(S, 0); r.R = sideInfo(S, 1);
    r.env = S.env != null ? EL[S.env] + '行' : '';
    return r;
  });
}

// 開局各自覆蓋的錦囊：card＝已記錄（含由觸發自動回填）、trig＝是否已觸發、miss＝對局結束仍未補登
function initPouch(m, rep) {
  const on = m.settings.mods.includes('pouch');
  const over = !!rep.final.over;
  return [0, 1].map(w => {
    let card = (m.pouch0 && m.pouch0[w]) || null, trig = false;
    rep.turns.forEach(t => t.acts.forEach(ar => {
      if (ar.a.kind === 'pouch' && ar.fromInit && t.p === w && !trig) { trig = true; if (!card) card = ar.a.card || null; }
    }));
    return { on, card, trig, miss: on && over && !card };
  });
}
function initPouchText(m, rep) {
  const ip = initPouch(m, rep);
  if (!ip[0].on) return '';
  return '開局覆蓋錦囊：' + [0, 1].map(w => m.players[w] + '：' + (ip[w].card || (ip[w].miss ? '⚠ 未補登' : '未記錄')) + (ip[w].trig ? '（已觸發）' : '')).join('　');
}

function resultText(m, rep) {
  const o = rep.final.over;
  if (!o) return '進行中';
  if (o.winner < 0) return '平局（' + o.reason + '）';
  return m.players[o.winner] + ' 獲勝（' + o.reason + '，第' + (o.turn + 1) + '回合）';
}

/* ---------- 網頁匯出 ---------- */
const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function exportHTML(session, opts) {
  opts = opts || {};
  const games = session.games;
  const title = session.players[0] + ' vs ' + session.players[1] + ' 戰局記錄';
  let body = '';
  games.forEach((m, gi) => {
    const rep = EN.replay(m);
    const rs = rows(m, rep).filter(r => !r.live || r.action || r.active.length);
    body += '<section><h2>第' + (gi + 1) + '局 <span class="res">' + escH(resultText(m, rep)) + '</span></h2>';
    body += '<div class="meta">規則版本：' + escH(m.ruleVer || R.RULE_VERSION) + '　先攻：' + escH(m.players[m.first]) + '　初始生命：' + m.settings.hp + (m.note ? '　備註：' + escH(m.note) : '') + (REPORT.initPouchText(m, rep) ? '<br>' + escH(REPORT.initPouchText(m, rep)) : '') + '</div>';
    body += '<div class="tw"><table><thead><tr><th rowspan="2">回合</th><th rowspan="2">玩家</th><th rowspan="2">主動效果</th><th rowspan="2">行動</th><th rowspan="2">結果</th><th rowspan="2">棄牌</th><th rowspan="2">手牌</th>'
      + '<th colspan="6" class="l">' + escH(m.players[0]) + '</th><th colspan="6" class="r">' + escH(m.players[1]) + '</th><th rowspan="2">環境</th></tr><tr>'
      + ['生命', '護罩', '職業', '星辰', '精靈', '錦囊'].map(h => '<th class="l">' + h + '</th>').join('')
      + ['生命', '護罩', '職業', '星辰', '精靈', '錦囊'].map(h => '<th class="r">' + h + '</th>').join('') + '</tr></thead><tbody>';
    rs.forEach(r => {
      const cls = (r.p === 0 ? 'pl' : 'pr') + (r.level ? ' ' + r.level : '');
      const iss = r.issues.length ? '<div class="iss">' + r.issues.map(x => '⚠ ' + escH(x.msg)).join('<br>') + '</div>' : '';
      const side = s => '<td class="hp">' + s.hp + '</td><td>' + (s.shield || '') + '</td><td>' + escH(s.job) + '</td><td>' + escH(s.star) + '</td><td>' + escH(s.spirit) + '</td><td>' + (s.pouch ? '有' : '') + '</td>';
      body += '<tr class="' + cls + '"><td class="n">' + (r.i + 1) + '</td><td class="who">' + escH(r.player) + '</td><td class="tx">' + r.active.map(escH).join('<br>') + '</td>'
        + '<td class="tx act">' + escH(r.action) + iss + '</td><td class="tx">' + escH([r.result].concat(r.other).filter(Boolean).join('；')) + '</td><td>' + escH(r.discard) + '</td><td>' + (r.hand === '' ? '' : r.hand) + '</td>'
        + side(r.L) + side(r.R) + '<td>' + escH(r.env) + '</td></tr>';
    });
    body += '</tbody></table></div></section>';
  });
  const css = `body{font-family:'Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif;background:#eef5fb;color:#1f2d3d;margin:0;padding:16px}
.wrap{max-width:1400px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(31,79,138,.1);overflow:hidden}
header{background:linear-gradient(135deg,#2f6db5,#4c9bd8 55%,#7cc6ea);color:#fff;padding:16px 22px}
header h1{margin:0;font-size:24px}header .s{opacity:.9;font-size:14px}
section{padding:14px 18px}h2{color:#1d4f8a;font-size:20px;margin:6px 0}h2 .res{font-size:16px;background:#e3f0fb;border-radius:999px;padding:2px 12px;margin-left:8px}
.meta{color:#6b7f95;font-size:14px;margin-bottom:8px}.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #c9d9e8;padding:4px 5px;text-align:center;vertical-align:middle}
th{background:#f1f7fc;color:#1d4f8a}th.l{background:#e6f1fc}th.r{background:#fdf0e6}
td.tx{text-align:left;min-width:120px}td.act{min-width:180px;font-weight:600}td.n{font-weight:700;color:#6b7f95}td.who{font-weight:700;white-space:nowrap}td.hp{font-weight:800;font-size:14px}
tr.pl td.who{color:#2f74c0}tr.pr td.who{color:#c0702f}tr.pl{background:#fafcff}tr.pr{background:#fffcf8}
tr.error td{background:#fde2e4!important}tr.warn td{background:#fff6d9!important}.iss{color:#c0392b;font-weight:500;font-size:12px;margin-top:2px}
footer{text-align:center;color:#8aa0b6;font-size:12px;padding:10px}
@media print{body{background:#fff;padding:0}.wrap{box-shadow:none}table{font-size:10px}section{page-break-inside:auto}tr{page-break-inside:avoid}}`;
  const data = JSON.stringify(session).replace(/</g, '\\u003c');
  return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escH(title) + '</title><style>' + css + '</style></head><body><div class="wrap"><header><h1>' + escH(title) + '</h1><div class="s">五行戰鬥牌《戰局記錄器》匯出　規則版本：' + escH(R.RULE_VERSION) + '　' + new Date().toLocaleString('zh-TW') + '</div></header>'
    + body + '<footer>《CFE 2026 戰局記錄器》by FallCloud &amp; Claude｜此檔案可再匯入記錄器繼續編輯</footer></div><script type="application/json" id="cfe-recorder-data">' + data + '</script></body></html>';
}

/* ---------- xlsx 匯出 ---------- */
const XSTYLE = {
  title: { bold: true, size: 14, color: '1D4F8A', align: 'left', border: false },
  meta: { size: 10, color: '6B7F95', align: 'left', border: false },
  h: { bold: true, fill: 'F1F7FC', color: '1D4F8A', wrap: true },
  hl: { bold: true, fill: 'DCEBFA', color: '1D4F8A' },
  hr: { bold: true, fill: 'FBE5D3', color: '8A4B1D' },
  c: {}, cl: { fill: 'F7FBFF' }, cr: { fill: 'FFFAF5' },
  t: { align: 'left', wrap: true }, tl: { align: 'left', wrap: true, fill: 'F7FBFF' }, tr: { align: 'left', wrap: true, fill: 'FFFAF5' },
  whoL: { bold: true, color: '2F74C0', fill: 'F7FBFF' }, whoR: { bold: true, color: 'C0702F', fill: 'FFFAF5' },
  hp: { bold: true, size: 12 },
  err: { fill: 'FDE2E4', align: 'left', wrap: true }, errc: { fill: 'FDE2E4' }, warn: { fill: 'FFF6D9', align: 'left', wrap: true }, warnc: { fill: 'FFF6D9' },
  iss: { color: 'C0392B', align: 'left', wrap: true, size: 10 },
};
function exportXLSX(session) {
  const sheets = session.games.map((m, gi) => {
    const rep = EN.replay(m);
    const rs = rows(m, rep).filter(r => !r.live || r.action || r.active.length);
    const head1 = ['回合', '玩家', '主動效果', '行動', '結果', '棄牌', '手牌', m.players[0], '', '', '', '', '', m.players[1], '', '', '', '', '', '環境', '問題'];
    const sub = ['生命', '護罩', '職業', '星辰', '精靈', '錦囊'];
    const rowsX = [
      [{ v: session.players[0] + ' vs ' + session.players[1] + '　第' + (gi + 1) + '局', s: 'title' }],
      [{ v: '規則版本：' + (m.ruleVer || R.RULE_VERSION) + '　先攻：' + m.players[m.first] + '　結果：' + resultText(m, rep) + '　初始生命：' + m.settings.hp + (REPORT.initPouchText(m, rep) ? '　' + REPORT.initPouchText(m, rep) : ''), s: 'meta' }],
      head1.map((v, i) => ({ v, s: i >= 7 && i < 13 ? 'hl' : i >= 13 && i < 19 ? 'hr' : 'h' })),
      head1.map((v, i) => ({ v: i >= 7 && i < 19 ? sub[(i - 7) % 6] : '', s: i >= 7 && i < 13 ? 'hl' : i >= 13 && i < 19 ? 'hr' : 'h' })),
    ];
    rs.forEach(r => {
      const side = r.p === 0 ? 'l' : 'r';
      const bad = r.level === 'error' ? 'err' : r.level === 'warn' ? 'warn' : null;
      const c = bad ? bad + 'c' : 'c' + side, t = bad || 't' + side;
      const sv = (s) => [{ v: s.hp, s: bad ? bad + 'c' : 'hp' }, { v: s.shield || '', s: c }, { v: s.job, s: c }, { v: s.star, s: c }, { v: s.spirit, s: c }, { v: s.pouch ? '有' : '', s: c }];
      rowsX.push([{ v: r.i + 1, s: c }, { v: r.player, s: bad ? c : 'who' + side.toUpperCase() }, { v: r.active.join('\n'), s: t }, { v: r.action, s: t },
        { v: [r.result].concat(r.other).filter(Boolean).join('；'), s: t }, { v: r.discard, s: c }, { v: r.hand === '' ? '' : r.hand, s: c }]
        .concat(sv(r.L), sv(r.R), [{ v: r.env, s: c }, { v: r.issues.map(x => x.msg).join('；'), s: bad ? bad : 'iss' }]));
    });
    const merges = ['A1:U1', 'A2:U2', 'H3:M3', 'N3:S3'];
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'T', 'U'].forEach(cn => merges.push(cn + '3:' + cn + '4'));
    return { name: '第' + (gi + 1) + '局', cols: [6, 10, 26, 30, 34, 8, 6, 7, 6, 9, 7, 8, 6, 7, 6, 9, 7, 8, 6, 7, 30], rows: rowsX, merges, freeze: { row: 4, col: 2 }, heights: { 0: 24 } };
  });
  return XL.build(sheets, XSTYLE);
}

const REPORT = { rows, sideInfo, initPouch, initPouchText, resultText, exportHTML, exportXLSX, actText };
if (node) module.exports = REPORT; else root.REPORT = REPORT;
})(this);
