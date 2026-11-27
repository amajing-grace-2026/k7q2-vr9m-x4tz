/*
 * xlsx.js - penulis file Excel (.xlsx) kecil tanpa library luar.
 * Masukan: daftar "grid" dari core.js -> Blob .xlsx (beberapa sheet, merge, lebar kolom,
 * freeze, style sederhana, link foto lewat rumus HYPERLINK).
 */
(function (global) {
  'use strict';

  var STYLE_ID = { title: 1, h: 2, b: 3, p: 4, w: 5, ok: 6, miss: 7, sub: 8, link: 9 };

  function esc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function col(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function ref(r, c) { return col(c) + (r + 1); }

  function sheetXml(g) {
    var width = 1, out = [];
    g.rows.forEach(function (r) { if (r && r.length > width) width = r.length; });
    out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
    if (g.freeze || g.freezeCols) {
      var fr = g.freeze || 0, fc = g.freezeCols || 0;
      out.push('<sheetViews><sheetView workbookViewId="0"><pane ' + (fc ? 'xSplit="' + fc + '" ' : '') + (fr ? 'ySplit="' + fr + '" ' : '') +
        'topLeftCell="' + ref(fr, fc) + '" activePane="' + (fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight') + '" state="frozen"/></sheetView></sheetViews>');
    }
    if (g.widths && g.widths.length) {
      out.push('<cols>');
      g.widths.forEach(function (w, i) { if (w) out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'); });
      out.push('</cols>');
    }
    out.push('<sheetData>');
    g.rows.forEach(function (row, r) {
      if (!row || !row.length) return;
      var cells = [];
      for (var c = 0; c < row.length; c++) {
        var x = row[c];
        if (x === undefined || x === null || x === '') continue;
        var v = x, s = 0, link = '';
        if (typeof x === 'object') { v = x.v; s = STYLE_ID[x.s] || 0; link = x.link || ''; }
        var a = ' r="' + ref(r, c) + '"' + (s ? ' s="' + s + '"' : '');
        if (link) {
          cells.push('<c' + a + ' t="str"><f>' + esc('HYPERLINK("' + String(link).replace(/"/g, '%22') + '","' + String(v).replace(/"/g, "'") + '")') + '</f><v>' + esc(v) + '</v></c>');
        } else if (typeof v === 'number' && isFinite(v)) {
          cells.push('<c' + a + '><v>' + v + '</v></c>');
        } else if (v === '' || v == null) {
          if (s) cells.push('<c' + a + '/>');
        } else {
          cells.push('<c' + a + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
        }
      }
      if (cells.length) out.push('<row r="' + (r + 1) + '">' + cells.join('') + '</row>');
    });
    out.push('</sheetData>');
    if (g.merges && g.merges.length) {
      out.push('<mergeCells count="' + g.merges.length + '">');
      g.merges.forEach(function (m) { out.push('<mergeCell ref="' + ref(m[0], m[1]) + ':' + ref(m[2], m[3]) + '"/>'); });
      out.push('</mergeCells>');
    }
    out.push('</worksheet>');
    return out.join('');
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font>' +
    '<font><b/><sz val="13"/><name val="Arial"/></font><font><u/><sz val="10"/><color rgb="FF1155CC"/><name val="Arial"/></font></fonts>' +
    '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFDBE8FB"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC8E6C9"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8C9C4"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFB7C4D6"/></left><right style="thin"><color rgb="FFB7C4D6"/></right><top style="thin"><color rgb="FFB7C4D6"/></top><bottom style="thin"><color rgb="FFB7C4D6"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function safeName(n, used) {
    var s = String(n).replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31) || 'Sheet';
    var base = s, i = 2;
    while (used[s.toLowerCase()]) { s = base.slice(0, 28) + ' ' + i++; }
    used[s.toLowerCase()] = 1;
    return s;
  }

  /* ---------- ZIP (tanpa kompresi) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), d = new Date();
    var tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var chunks = [], central = [], off = 0, n = 0;
    Object.keys(files).forEach(function (name) {
      var nb = enc.encode(name), data = enc.encode(files[name]), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nb, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + data.length; n++;
    });
    var size = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true);
    end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function build(grids) {
    var used = {}, files = {}, names = grids.map(function (g) { return safeName(g.name, used); });
    files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      grids.map(function (g, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '</Types>';
    files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    files['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      grids.map(function (g, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (grids.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    files['xl/styles.xml'] = STYLES;
    grids.forEach(function (g, i) { files['xl/worksheets/sheet' + (i + 1) + '.xml'] = sheetXml(g); });
    return zip(files);
  }

  global.XLSXW = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
