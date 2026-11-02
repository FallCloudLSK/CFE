/*
 * CFE 2026 春季盃 牌組承諾碼（Deck Commitment）核心程式  v1
 *
 * 設計原則：演算法完全公開，安全性只來自「瀏覽器隨機產生的解鎖金鑰」。
 *
 *   ID    = 正規化後的參賽 ID
 *   K     = 20 碼 Crockford Base32 隨機金鑰（約 100 bits）
 *   idx   = 牌組 25 格張數的混合進位索引（與牌組編輯器 encodeDeck 相同），7 bytes
 *   pad   = HMAC-SHA256(K, "CFE2026S|pad|" + ID)[0..7)
 *   ct    = idx XOR pad                                  （隱藏牌組）
 *   tag   = HMAC-SHA256(K, "CFE2026S|tag|" + ID + "|" + 牌組碼)[0..16)   （綁定牌組，防事後換牌）
 *   chk   = SHA-256("CFE2026S|chk|" + ID + "|" + base32(ct||tag)) 前 2 碼   （僅防打錯字）
 *   提交碼 = "S26-" + base32(ct||tag) + chk
 */
(function (root) {
  'use strict';

  const VERSION_PREFIX = 'S26';
  const DOMAIN = 'CFE2026S';
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32
  const DECK_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const BASES = [5,5,5,4,4, 5,5,5,4,4, 5,5,5,4,4, 5,5,5,4,4, 5,5,5,4,4];
  const MAX_INDEX = BASES.reduce((p, b) => p * BigInt(b), 1n); // 5^15 * 4^10
  const IDX_BYTES = 7, TAG_BYTES = 16, KEY_CHARS = 20, CHK_CHARS = 2;
  const BODY_CHARS = Math.ceil((IDX_BYTES + TAG_BYTES) * 8 / 5); // 37
  const enc = new TextEncoder();
  const subtle = root.crypto.subtle;

  // ---------- 正規化 ----------
  function normalizeId(id) {
    return String(id || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  }
  function normalizeB32(s) {
    return String(s || '').toUpperCase().replace(/[\s\-_]/g, '')
      .replace(/O/g, '0').replace(/[IL]/g, '1');
  }
  function group(s, n = 5) { return s.match(new RegExp('.{1,' + n + '}', 'g')).join('-'); }

  // ---------- Base32 ----------
  function b32encode(bytes) {
    let bits = 0, val = 0, out = '';
    for (const b of bytes) {
      val = (val << 8) | b; bits += 8;
      while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
      val &= (1 << bits) - 1;
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function b32decode(str, nBytes) {
    let bits = 0, val = 0; const out = [];
    for (const ch of str) {
      const v = B32.indexOf(ch);
      if (v < 0) throw new Error('含有非法字元：' + ch);
      val = (val << 5) | v; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; val &= (1 << bits) - 1; }
    }
    return new Uint8Array(out.slice(0, nBytes));
  }

  // ---------- 牌組 ----------
  function countsToIndex(counts) {
    let idx = 0n, pos = 0;
    for (let a = 0; a < 5; a++) for (let l = 0; l < 5; l++) {
      const n = counts[a][l];
      if (!Number.isInteger(n) || n < 0 || n >= BASES[pos]) throw new Error('張數超出範圍');
      idx = idx * BigInt(BASES[pos]) + BigInt(n); pos++;
    }
    return idx;
  }
  function indexToCounts(idx) {
    if (idx < 0n || idx >= MAX_INDEX) return null;
    const c = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (let i = 24; i >= 0; i--) {
      const b = BigInt(BASES[i]);
      c[Math.floor(i / 5)][i % 5] = Number(idx % b); idx /= b;
    }
    return c;
  }
  function indexToCode(idx) {
    let s = '';
    while (idx > 0n) { s = DECK_ALPHABET[Number(idx % 62n)] + s; idx /= 62n; }
    return s.padStart(10, '0');
  }
  function codeToIndex(code) {
    if (typeof code !== 'string' || code.length !== 10) return null;
    let idx = 0n;
    for (const ch of code) {
      const v = DECK_ALPHABET.indexOf(ch);
      if (v < 0) return null;
      idx = idx * 62n + BigInt(v);
    }
    return idx < MAX_INDEX ? idx : null;
  }
  function deckStats(counts) {
    let cards = 0, level = 0;
    for (let a = 0; a < 5; a++) for (let l = 0; l < 5; l++) { cards += counts[a][l]; level += (l + 1) * counts[a][l]; }
    return { cards, level, legal: cards === 60 && level <= 170 };
  }
  function parseDeckInput(input) {
    const s = String(input || '').trim();
    if (s.length === 10) {
      const idx = codeToIndex(s);
      if (idx !== null) return indexToCounts(idx);
    }
    const d = s.replace(/\D/g, '');
    if (d.length === 25) {
      const c = Array.from({ length: 5 }, () => Array(5).fill(0));
      for (let i = 0; i < 25; i++) {
        const v = +d[i];
        if (v >= BASES[i]) return null;
        c[Math.floor(i / 5)][i % 5] = v;
      }
      return c;
    }
    return null;
  }

  // ---------- 密碼學 ----------
  async function hmac(keyStr, msg) {
    const k = await subtle.importKey('raw', enc.encode(keyStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await subtle.sign('HMAC', k, enc.encode(msg)));
  }
  async function sha256(msg) { return new Uint8Array(await subtle.digest('SHA-256', enc.encode(msg))); }
  function idxToBytes(idx) {
    const b = new Uint8Array(IDX_BYTES);
    for (let i = IDX_BYTES - 1; i >= 0; i--) { b[i] = Number(idx & 255n); idx >>= 8n; }
    return b;
  }
  function bytesToIdx(b) { let v = 0n; for (const x of b) v = (v << 8n) | BigInt(x); return v; }
  function ctEqual(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }

  function generateKey() {
    const r = new Uint8Array(KEY_CHARS);
    root.crypto.getRandomValues(r);
    let s = ''; for (const x of r) s += B32[x & 31]; // 256 可被 32 整除，無偏差
    return s;
  }
  async function checksum(id, body) {
    return b32encode(await sha256(DOMAIN + '|chk|' + id + '|' + body)).slice(0, CHK_CHARS);
  }

  /** 產生提交碼。回傳 { id, key, keyDisplay, deckCode, submission, submissionDisplay } */
  async function createSubmission(rawId, counts, presetKey) {
    const id = normalizeId(rawId);
    if (!id) throw new Error('請輸入參賽 ID');
    const st = deckStats(counts);
    if (!st.legal) throw new Error('牌組不合法（需剛好 60 張且總等級 ≤ 170）');
    const key = presetKey ? normalizeB32(presetKey) : generateKey();
    if (key.length !== KEY_CHARS) throw new Error('金鑰長度錯誤');
    const idx = countsToIndex(counts);
    const deckCode = indexToCode(idx);
    const pad = (await hmac(key, DOMAIN + '|pad|' + id)).slice(0, IDX_BYTES);
    const ct = idxToBytes(idx).map((x, i) => x ^ pad[i]);
    const tag = (await hmac(key, DOMAIN + '|tag|' + id + '|' + deckCode)).slice(0, TAG_BYTES);
    const payload = new Uint8Array(IDX_BYTES + TAG_BYTES); payload.set(ct); payload.set(tag, IDX_BYTES);
    const body = b32encode(payload);
    const submission = VERSION_PREFIX + '-' + body + await checksum(id, body);
    return {
      id, key, keyDisplay: group(key), deckCode, submission,
      submissionDisplay: VERSION_PREFIX + '-' + group(submission.slice(VERSION_PREFIX.length + 1)),
    };
  }

  function splitSubmission(raw) {
    let s = String(raw || '').toUpperCase().replace(/[\s_]/g, '');
    if (!s.startsWith(VERSION_PREFIX + '-')) return { error: '提交碼必須以「' + VERSION_PREFIX + '-」開頭' };
    s = normalizeB32(s.slice(VERSION_PREFIX.length + 1));
    if (s.length !== BODY_CHARS + CHK_CHARS) return { error: '提交碼長度錯誤（應為 ' + (BODY_CHARS + CHK_CHARS) + ' 碼，目前 ' + s.length + ' 碼）' };
    if (/[^0-9A-HJKMNP-TV-Z]/.test(s)) return { error: '提交碼含有非法字元' };
    return { body: s.slice(0, BODY_CHARS), chk: s.slice(BODY_CHARS) };
  }

  /** 登錄時的格式檢查（不需金鑰，只能防打錯字，無法得知牌組內容） */
  async function checkFormat(rawId, rawSubmission) {
    const id = normalizeId(rawId);
    if (!id) return { ok: false, error: '請輸入參賽 ID' };
    const p = splitSubmission(rawSubmission);
    if (p.error) return { ok: false, error: p.error };
    if (await checksum(id, p.body) !== p.chk) return { ok: false, error: '檢查碼不符：提交碼抄錯，或參賽 ID 不一致' };
    return { ok: true, id, canonical: VERSION_PREFIX + '-' + p.body + p.chk };
  }

  /** 四強解鎖：還原牌組並驗證承諾 */
  async function reveal(rawId, rawSubmission, rawKey) {
    const f = await checkFormat(rawId, rawSubmission);
    if (!f.ok) return f;
    const id = f.id, key = normalizeB32(rawKey);
    if (key.length !== KEY_CHARS) return { ok: false, error: '解鎖金鑰應為 ' + KEY_CHARS + ' 碼（目前 ' + key.length + ' 碼）' };
    if (/[^0-9A-HJKMNP-TV-Z]/.test(key)) return { ok: false, error: '解鎖金鑰含有非法字元' };
    const payload = b32decode(splitSubmission(rawSubmission).body, IDX_BYTES + TAG_BYTES);
    const ct = payload.slice(0, IDX_BYTES), tag = payload.slice(IDX_BYTES);
    const pad = (await hmac(key, DOMAIN + '|pad|' + id)).slice(0, IDX_BYTES);
    const idx = bytesToIdx(ct.map((x, i) => x ^ pad[i]));
    const counts = indexToCounts(idx);
    if (!counts) return { ok: false, error: '驗證失敗：金鑰錯誤，或提交碼／ID 不符' };
    const deckCode = indexToCode(idx);
    const expect = (await hmac(key, DOMAIN + '|tag|' + id + '|' + deckCode)).slice(0, TAG_BYTES);
    if (!ctEqual(expect, tag)) return { ok: false, error: '驗證失敗：金鑰錯誤，或提交碼／ID 不符' };
    const st = deckStats(counts);
    return { ok: true, id, deckCode, counts, ...st };
  }

  root.CFECommit = {
    VERSION_PREFIX, KEY_CHARS, BASES,
    normalizeId, normalizeB32, group, parseDeckInput, deckStats, countsToIndex, indexToCode, indexToCounts,
    generateKey, createSubmission, checkFormat, reveal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
