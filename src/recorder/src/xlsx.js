/* =====================================================================
 * 精簡 XLSX 產生器（無外部套件）
 *   XLSX.build([{name, cols:[寬], rows:[[cell]], merges:['A1:C1'], freeze:{row,col}}], styles)
 *   cell: 字串/數字，或 {v, s:'樣式名'}
 *   styles: { 名稱: {bold, size, color:'RRGGBB', fill:'RRGGBB', align:'center'|'left', wrap, border:true} }
 * ===================================================================== */
(function (root) {
'use strict';
const enc = s => new TextEncoder().encode(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

let CRC;
function crc32(u8) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {                 // files: [{name, data:Uint8Array}]，不壓縮
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + sz;
  }
  const csz = central.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csz, true); e.setUint32(16, off, true);
  const all = parts.concat(central, [new Uint8Array(e.buffer)]);
  const out = new Uint8Array(all.reduce((a, x) => a + x.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

function build(sheets, styles) {
  styles = styles || {};
  const names = Object.keys(styles);
  const fonts = ['<font><sz val="11"/><name val="Microsoft JhengHei"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFB7C9DA"/></left><right style="thin"><color rgb="FFB7C9DA"/></right><top style="thin"><color rgb="FFB7C9DA"/></top><bottom style="thin"><color rgb="FFB7C9DA"/></bottom><diagonal/></border>'];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const idx = {};
  names.forEach(n => {
    const s = styles[n];
    fonts.push('<font>' + (s.bold ? '<b/>' : '') + '<sz val="' + (s.size || 11) + '"/>' + (s.color ? '<color rgb="FF' + s.color + '"/>' : '') + '<name val="Microsoft JhengHei"/></font>');
    let fillId = 0;
    if (s.fill) { fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FF' + s.fill + '"/><bgColor indexed="64"/></patternFill></fill>'); fillId = fills.length - 1; }
    const al = '<alignment horizontal="' + (s.align || 'center') + '" vertical="center"' + (s.wrap ? ' wrapText="1"' : '') + '/>';
    xfs.push('<xf numFmtId="0" fontId="' + (fonts.length - 1) + '" fillId="' + fillId + '" borderId="' + (s.border === false ? 0 : 1) + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al + '</xf>');
    idx[n] = xfs.length - 1;
  });
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills>'
    + '<borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const files = [];
  const sheetXml = sheets.map(sh => {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    x += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0">';
    if (sh.freeze) {
      const r = sh.freeze.row || 0, c = sh.freeze.col || 0;
      x += '<pane' + (c ? ' xSplit="' + c + '"' : '') + (r ? ' ySplit="' + r + '"' : '') + ' topLeftCell="' + colName(c) + (r + 1) + '" activePane="bottomRight" state="frozen"/>';
    }
    x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>';
    if (sh.cols) x += '<cols>' + sh.cols.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
    x += '<sheetData>';
    sh.rows.forEach((row, ri) => {
      const ht = sh.heights && sh.heights[ri];
      x += '<row r="' + (ri + 1) + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>';
      row.forEach((cell, ci) => {
        if (cell == null) return;
        const o = typeof cell === 'object' ? cell : { v: cell };
        const ref = colName(ci) + (ri + 1);
        const s = o.s != null && idx[o.s] != null ? ' s="' + idx[o.s] + '"' : '';
        if (o.v === '' || o.v == null) x += '<c r="' + ref + '"' + s + '/>';
        else if (typeof o.v === 'number') x += '<c r="' + ref + '"' + s + '><v>' + o.v + '</v></c>';
        else x += '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(o.v) + '</t></is></c>';
      });
      x += '</row>';
    });
    x += '</sheetData>';
    if (sh.merges && sh.merges.length) x += '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
    x += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>';
    return x;
  });
  const safe = n => String(n).replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'Sheet';
  files.push({ name: '[Content_Types].xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>') });
  files.push({ name: '_rels/.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
  files.push({ name: 'xl/workbook.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + sheets.map((s, i) => '<sheet name="' + esc(safe(s.name)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>') });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
    + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') });
  files.push({ name: 'xl/styles.xml', data: enc(stylesXml) });
  sheetXml.forEach((x, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc(x) }));
  return zip(files);
}
const XLSX = { build, colName };
if (typeof module !== 'undefined' && module.exports) module.exports = XLSX; else root.XLSX = XLSX;
})(this);
