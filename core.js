/*
 * core.js - semua aturan server aplikasi Visit Report.
 * Dipakai di 2 tempat:
 *   1. Google Apps Script (digabung dengan apps-script/gas-adapter.js oleh build.ps1 -> dist/Code.gs)
 *   2. Mode DEMO di browser (demo-adapter.js, data contoh di localStorage)
 * Semua akses data lewat ctx (adapter), jadi aturan cukup ditulis sekali di sini.
 */
var CORE = (function () {
  'use strict';

  var VERSION = '1.0.0';

  var TABLES = {
    Visits: ['id', 'tanggal', 'jam', 'minggu', 'store_id', 'store_name', 'kategori', 'city', 'folder_url', 'foto',
      'lat', 'lng', 'catatan', 'detail', 'dibuat', 'diubah'],
    Photos: ['id', 'visit_id', 'tanggal', 'store_id', 'url', 'nama', 'dibuat'],
    Prices: ['id', 'visit_id', 'tanggal', 'store_id', 'store_name', 'segment', 'brand', 'tipe', 'spec', 'hrp', 'srp'],
    Settings: ['key', 'value']
  };

  // Input di form: Axioo & Advan terpisah (untuk Channel Map). Di Report Visit digabung ke "Other".
  var INPUT_BRANDS = ['Asus', 'Lenovo', 'Acer', 'HP', 'MSI', 'Axioo', 'Advan', 'Other'];
  var REPORT_BRANDS = ['Asus', 'Lenovo', 'Acer', 'HP', 'MSI', 'Other'];
  var STOCK_CATS = ['Zenbook', 'Vivobook S', 'ROG'];
  var SURVEY_BRANDS = ['Asus', 'Acer', 'Lenovo', 'HP', 'MSI', 'Axioo', 'Advan', 'Infinix', 'Zyrex', 'Other'];
  var SEGMENTS = ['NB Celeron', 'NB Athlon', 'NB i3', 'NB i5', 'NB i7', 'NB i9', 'NB R3', 'NB R5', 'NB R7', 'NB R9',
    'NB Core Ultra 5', 'NB Core Ultra 7', 'NB Core Ultra 9', 'NB Snapdragon',
    'Gaming RTX3050', 'Gaming RTX4050', 'Gaming RTX5050', 'Gaming RTX5060', 'Gaming RTX5070', 'Gaming RTX5070Ti',
    'Gaming RTX5080', 'Gaming RTX5090', 'Gaming Radeon', 'Lainnya'];
  var SIGNBOARD_IMG = ['Asus Blue', 'ASUS Logo', 'ROG', 'Zenbook', 'Vivobook', 'Lainnya'];
  var FREQS = ['Weekly', 'Biweekly', 'Monthly'];
  // Daftar Star Reseller & homebase disimpan di tab Settings (diisi setup() di Apps Script), bukan di kode publik.
  var DEFAULT_STAR = [];
  var DEFAULT_HOMEBASE = '';
  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var TOKEN_DAYS = 60;
  var MAX_FAILS = 8;

  /* Kolom Channel Map dikenali dari judul kolomnya (bukan posisi), jadi aman bila kolom bergeser. */
  var CM = {
    id: /^store id$/, name: /^store name$/, am: /area manager$/, mds: /^merchandiser name$/, mds_id: /^merchandiser id$/,
    channel: /^channel type/, type: /^unmanaged/, branch: /^branch$/, city: /^city$/, mall: /^shopping mall/,
    exclusive: /^brand exclusive/, location: /^store location/, grade: /^store grading$/,
    fl_count: /^no\. of frontliner/, promoter_count: /^# of asus promoter/, signboard: /^# of asus signboard/,
    signboard_img: /^asus signboard image/, island_nb: /^# of asus nb island table/, wall_cab: /^# of asus nb wall cabinet/,
    wall_bay: /^# of asus nb wall bay$/, photo: /^photo link$/, fl_reg: /^no of frontliner registered/,
    fl_upload: /^total frontliner upload/, display_prog: /^display program/,
    sh_asus: /^asus share/, sh_hp: /^hp share/, sh_lenovo: /^lenovo share/, sh_acer: /^acer share/, sh_msi: /^msi share/,
    sh_axioo: /^axioo share/, sh_advan: /^advan share/, sh_others: /^others share/,
    p1_name: /^promoter#1 name/, p1_id: /^promoter#1 id/, p2_name: /^promoter#2 name/, p2_id: /^promoter#2 id/
  };
  for (var fi = 1; fi <= 5; fi++) {
    CM['fl' + fi + '_name'] = new RegExp('^fl#' + fi + ' name');
    CM['fl' + fi + '_ich'] = new RegExp('^fl#' + fi + ' ichannel');
    CM['fl' + fi + '_mob'] = new RegExp('^fl#' + fi + ' mobile');
  }
  var SHARE_KEYS = { Asus: 'sh_asus', HP: 'sh_hp', Lenovo: 'sh_lenovo', Acer: 'sh_acer', MSI: 'sh_msi', Axioo: 'sh_axioo', Advan: 'sh_advan', Other: 'sh_others' };
  // field Channel Map yang boleh di-update dari form visit
  var CM_EDITABLE = ['fl_count', 'promoter_count', 'signboard', 'signboard_img', 'island_nb', 'wall_cab', 'wall_bay',
    'p1_name', 'p1_id', 'p2_name', 'p2_id', 'fl_reg', 'fl_upload',
    'fl1_name', 'fl1_ich', 'fl1_mob', 'fl2_name', 'fl2_ich', 'fl2_mob', 'fl3_name', 'fl3_ich', 'fl3_mob',
    'fl4_name', 'fl4_ich', 'fl4_mob', 'fl5_name', 'fl5_ich', 'fl5_mob'];
  var CM_NUMERIC = { fl_count: 1, promoter_count: 1, signboard: 1, island_nb: 1, wall_cab: 1, wall_bay: 1, fl_reg: 1, fl_upload: 1 };

  function UserError(msg, code) { var e = new Error(msg); e.userError = true; e.code = code || ''; return e; }
  function fail(msg, code) { throw UserError(msg, code); }

  /* ---------- util ---------- */
  function str(v) { return v == null ? '' : String(v).trim(); }
  function lim(v, max, label) {
    var s = str(v);
    if (s.length > max) fail(label + ' terlalu panjang (maksimal ' + max + ' karakter).');
    return s;
  }
  // Angka gaya Indonesia: "8.500.000" = 8500000, "0,5" = 0.5, "Rp 9.999.000" = 9999000
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[^\d.,\-]/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function normHead(h) { return String(h == null ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function phone(v) {
    var s = str(v);
    if (!s || s === '0') return s === '0' ? 0 : '';
    var d = s.replace(/\D/g, '');
    if (!d) return s;
    if (d.indexOf('62') === 0) d = '0' + d.slice(2); else if (d.charAt(0) !== '0') d = '0' + d;
    return d;
  }

  /* ---------- tanggal & minggu ISO (semua di UTC supaya sama di Apps Script & browser) ---------- */
  var DAY = 86400000;
  function ms(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function ymd(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function dow(s) { return new Date(ms(s)).getUTCDay(); }
  function addDays(s, n) { return ymd(ms(s) + n * DAY); }
  function isoWeek(s) {
    var t = ms(s), wd = (new Date(t).getUTCDay() + 6) % 7, thu = t + (3 - wd) * DAY;
    var y = new Date(thu).getUTCFullYear(), jan4 = Date.UTC(y, 0, 4), j4 = (new Date(jan4).getUTCDay() + 6) % 7;
    var w1 = jan4 - j4 * DAY, week = Math.floor((thu - w1) / (7 * DAY)) + 1;
    var tm = new Date(thu).getUTCMonth();
    return { year: y, week: week, key: y + '-W' + pad(week), monday: ymd(t - wd * DAY), friday: ymd(t + (4 - wd) * DAY),
      sunday: ymd(t + (6 - wd) * DAY), month: tm, quarter: Math.floor(tm / 3) + 1 };
  }
  function weekFromKey(key) {
    var m = /^(\d{4})-W(\d{2})$/.exec(key || '');
    if (!m) fail('Format minggu tidak valid.');
    var y = +m[1], jan4 = Date.UTC(y, 0, 4), j4 = (new Date(jan4).getUTCDay() + 6) % 7;
    return isoWeek(ymd(jan4 - j4 * DAY + (+m[2] - 1) * 7 * DAY));
  }
  // Minggu milik bulan/kuartal tempat hari Kamisnya berada (aturan ISO).
  function weeksOfQuarter(year, q) {
    var out = [], t = Date.UTC(year, (q - 1) * 3, 1) - 7 * DAY;
    var end = Date.UTC(year, q * 3, 1) + 7 * DAY;
    for (; t < end; t += DAY) {
      if (new Date(t).getUTCDay() !== 1) continue;
      var w = isoWeek(ymd(t)), thu = new Date(t + 3 * DAY);
      if (thu.getUTCFullYear() === year && Math.floor(thu.getUTCMonth() / 3) + 1 === q) out.push(w);
    }
    return out;
  }
  function quarterOf(s) { var w = isoWeek(s); return { year: new Date(ms(w.monday) + 3 * DAY).getUTCFullYear(), q: w.quarter }; }
  function shortDate(s) { return (+s.slice(8, 10)) + ' ' + MON3[+s.slice(5, 7) - 1]; }
  function longDate(s) { return DAYS[dow(s)] + ', ' + (+s.slice(8, 10)) + ' ' + MONTHS[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4); }

  /* ---------- Channel Map ---------- */
  function readCM(ctx) {
    var raw = ctx.channelMap();          // { rows: [[...], ...] } isi sheet apa adanya
    var rows = raw.rows || [], hr = -1, i, j;
    for (i = 0; i < Math.min(rows.length, 30) && hr < 0; i++) {
      for (j = 0; j < rows[i].length; j++) if (normHead(rows[i][j]) === 'store id') { hr = i; break; }
    }
    if (hr < 0) fail('Sheet Channel Map tidak ditemukan atau kolom "Store ID" tidak ada.', 'nocm');
    var heads = rows[hr].map(normHead), col = {};
    Object.keys(CM).forEach(function (k) {
      for (var c = 0; c < heads.length; c++) if (CM[k].test(heads[c])) { col[k] = c; return; }
    });
    var stores = [];
    for (i = hr + 1; i < rows.length; i++) {
      var r = rows[i], id = str(r[col.id]);
      if (!id || id === '0') continue;
      var s = { _row: i + 1 };
      Object.keys(col).forEach(function (k) { var v = r[col[k]]; s[k] = v == null ? '' : v; });
      s.id = id; s.name = str(s.name);
      stores.push(s);
    }
    return { stores: stores, col: col, headerRow: hr + 1 };
  }

  function settings(ctx) {
    var o = {};
    ctx.db.all('Settings').forEach(function (r) { o[r.key] = r.value; });
    return o;
  }
  function starIds(set) {
    var s = str(set.star_ids);
    return s ? s.split(/[\s,;]+/).filter(Boolean) : DEFAULT_STAR.slice();
  }
  function freqOf(store, set) {
    var ov = str(set['freq_' + store.id]);
    if (FREQS.indexOf(ov) >= 0) return ov;
    return normHead(store.city) === normHead(set.homebase || DEFAULT_HOMEBASE) ? 'Weekly' : 'Monthly';
  }

  function storeLite(s, star, set) {
    var o = { id: s.id, name: s.name, city: str(s.city), branch: str(s.branch), am: str(s.am), mds: str(s.mds),
      type: str(s.type), channel: str(s.channel), exclusive: str(s.exclusive), grade: str(s.grade), mall: str(s.mall),
      star: star, freq: star ? freqOf(s, set) : '', cm: {} };
    CM_EDITABLE.forEach(function (k) { o.cm[k] = s[k] == null ? '' : s[k]; });
    return o;
  }

  /* ---------- auth ---------- */
  function makeToken(ctx) { var t = String(ctx.nowMs()); return t + '.' + ctx.hmac('tok:' + t); }
  function checkToken(ctx, tok) {
    var p = String(tok || '').split('.');
    if (p.length !== 2 || ctx.hmac('tok:' + p[0]) !== p[1]) fail('Sesi berakhir, masukkan PIN lagi.', 'auth');
    if (ctx.nowMs() - (+p[0]) > TOKEN_DAYS * DAY) fail('Sesi berakhir, masukkan PIN lagi.', 'auth');
  }
  function login(ctx, d) {
    var fails = +(ctx.cacheGet('pinfail') || 0);
    if (fails >= MAX_FAILS) fail('Terlalu banyak PIN salah. Coba lagi 15 menit lagi.');
    var pin = ctx.pin();
    if (!pin) fail('PIN belum diatur di server. Jalankan setup() di Apps Script.');
    if (str(d.pin) !== pin) { ctx.cachePut('pinfail', String(fails + 1), 900); fail('PIN salah.'); }
    ctx.cachePut('pinfail', '0', 1);
    return { token: makeToken(ctx) };
  }

  /* ---------- visits ---------- */
  function parseVisit(v) {
    var o = {}, k;
    for (k in v) if (k !== '_row') o[k] = v[k];
    try { o.detail = v.detail ? JSON.parse(v.detail) : {}; } catch (e) { o.detail = {}; }
    o.foto = +v.foto || 0;
    return o;
  }
  function visitsIn(ctx, from, to) {
    return ctx.db.all('Visits').filter(function (v) { return v.tanggal >= from && v.tanggal <= to; })
      .map(parseVisit).sort(function (a, b) { return (a.tanggal + a.jam) < (b.tanggal + b.jam) ? -1 : 1; });
  }
  function pricesIn(ctx, from, to) {
    return ctx.db.all('Prices').filter(function (p) { return p.tanggal >= from && p.tanggal <= to; });
  }

  function cleanDetail(d, star) {
    d = d || {};
    var o = { pic: lim(d.pic, 100, 'PIC'), target: num(d.target), achievement: num(d.achievement),
      display: {}, sellout: {}, sku: [], stock: [], program: [], fl: [],
      activities: lim(d.activities, 3000, 'Activities'), support: lim(d.support, 3000, 'Support needed'),
      feedback: lim(d.feedback, 3000, 'Feedback'), competitor: lim(d.competitor, 3000, "Competitor's activity"), cm: {} };
    INPUT_BRANDS.forEach(function (b) {
      o.display[b] = num(d.display && d.display[b]);
      o.sellout[b] = num(d.sellout && d.sellout[b]);
    });
    if (star) {
      REPORT_BRANDS.forEach(function (b, i) {
        var r = (d.sku || [])[i] || {};
        o.sku.push({ brand: b, sku: lim(r.sku, 120, 'SKU'), cpu: lim(r.cpu, 60, 'CPU'), ram: lim(r.ram, 30, 'RAM'), hdd: lim(r.hdd, 30, 'HDD'), price: num(r.price) });
      });
      STOCK_CATS.forEach(function (c, i) {
        var r = (d.stock || [])[i] || {};
        o.stock.push({ cat: c, sku: lim(r.sku, 120, 'SKU stok'), qty: num(r.qty) });
      });
      (d.program || []).slice(0, 10).forEach(function (r) {
        if (str(r.sku) || str(r.status)) o.program.push({ sku: lim(r.sku, 120, 'SKU display'), status: lim(r.status, 120, 'Status display') });
      });
      (d.fl || []).slice(0, 7).forEach(function (r) {
        if (str(r.id)) o.fl.push({ id: lim(r.id, 40, 'FL ID'), univ: str(r.univ) === 'Y' ? 'Y' : 'N', upload: num(r.upload) });
      });
    }
    if (d.cm) CM_EDITABLE.forEach(function (k) {
      if (d.cm[k] === undefined) return;
      var v = d.cm[k];
      if (CM_NUMERIC[k]) v = num(v);
      else if (/_mob$/.test(k)) v = phone(v);
      else v = lim(v, 120, k);
      o.cm[k] = (v === '' ? 0 : v);   // permintaan: sel kosong di Channel Map diisi 0
    });
    return o;
  }

  function saveVisit(ctx, d) {
    var v = d.visit || {};
    var id = str(v.id);
    if (!/^[a-z0-9-]{8,40}$/i.test(id)) fail('ID visit tidak valid.');
    var tgl = str(v.tanggal);
    if (!isDate(tgl)) fail('Tanggal visit tidak valid.');
    var wd = dow(tgl);
    if (wd === 0 || wd === 6) fail('Visit hanya di hari kerja (Senin - Jumat). ' + longDate(tgl) + ' adalah hari libur.');
    if (tgl > ctx.now().date) fail('Tanggal visit tidak boleh di masa depan.');
    var jam = /^\d{2}:\d{2}$/.test(str(v.jam)) ? str(v.jam) : ctx.now().time.slice(0, 5);
    var cm = readCM(ctx), set = settings(ctx), stars = starIds(set);
    var store = cm.stores.filter(function (s) { return s.id === str(v.store_id); })[0];
    if (!store) fail('Toko ' + v.store_id + ' tidak ada di Channel Map.');
    var star = stars.indexOf(store.id) >= 0;
    var detail = cleanDetail(v.detail, star);
    var now = ctx.now().iso;

    return ctx.lock(function () {
      var old = ctx.db.all('Visits').filter(function (x) { return x.id === id; })[0];
      var folder = ctx.folderFor(photoPath(tgl, store.name));
      var row = {
        id: id, tanggal: tgl, jam: jam, minggu: isoWeek(tgl).key, store_id: store.id, store_name: store.name,
        kategori: star ? 'Star' : 'Dealer', city: str(store.city), folder_url: folder,
        foto: old ? old.foto : '0', lat: str(v.lat).slice(0, 15), lng: str(v.lng).slice(0, 15),
        catatan: lim(v.catatan, 3000, 'Catatan'), detail: JSON.stringify(detail),
        dibuat: old ? old.dibuat : now, diubah: now
      };
      if (old) ctx.db.update('Visits', id, row); else ctx.db.insert('Visits', row);

      // price survey: hanya Star Reseller; diganti utuh tiap simpan
      ctx.db.all('Prices').filter(function (p) { return p.visit_id === id; }).forEach(function (p) { ctx.db.remove('Prices', p.id); });
      if (star) (v.prices || []).slice(0, 80).forEach(function (p, i) {
        if (!str(p.tipe) && !str(p.spec)) return;
        ctx.db.insert('Prices', { id: id + '-' + i, visit_id: id, tanggal: tgl, store_id: store.id, store_name: store.name,
          segment: lim(p.segment, 40, 'Segment'), brand: lim(p.brand, 30, 'Brand'), tipe: lim(p.tipe, 120, 'Tipe'),
          spec: lim(p.spec, 400, 'Spec'), hrp: num(p.hrp), srp: num(p.srp) });
      });

      writeChannelMap(ctx, cm, store, detail, folder);
      var changed = { weeks: [row.minggu], quarters: [quarterOf(tgl)] };
      if (old && old.minggu !== row.minggu) { changed.weeks.push(old.minggu); changed.quarters.push(quarterOf(old.tanggal)); }
      ctx.afterChange(changed);
      return { visit: parseVisit(row) };
    });
  }

  function writeChannelMap(ctx, cm, store, detail, folder) {
    var cells = [];
    function put(key, val) {
      if (cm.col[key] == null) return;
      var cur = store[key];
      if (String(cur) === String(val)) return;
      cells.push({ r: store._row, c: cm.col[key] + 1, v: val });
    }
    Object.keys(detail.cm).forEach(function (k) { put(k, detail.cm[k]); });
    var total = 0;
    INPUT_BRANDS.forEach(function (b) { total += detail.sellout[b]; });
    if (total > 0) INPUT_BRANDS.forEach(function (b) { put(SHARE_KEYS[b], Math.round(detail.sellout[b] / total * 10000) / 10000); });
    if (folder) put('photo', folder);
    if (cells.length) ctx.cmWrite(cells);
  }

  function photoPath(tgl, storeName) {
    var m = +tgl.slice(5, 7);
    return [tgl.slice(0, 4), pad(m) + ' - ' + MONTHS[m - 1], tgl, String(storeName).replace(/[\\\/:*?"<>|]/g, '-').slice(0, 90)];
  }

  function uploadPhoto(ctx, d) {
    var vid = str(d.visit_id), pid = str(d.id);
    if (!/^[a-z0-9-]{8,60}$/i.test(pid)) fail('ID foto tidak valid.');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(d.dataUrl || ''))) fail('Format foto tidak didukung.');
    if (String(d.dataUrl).length > 8000000) fail('Foto terlalu besar.');
    return ctx.lock(function () {
      var v = ctx.db.all('Visits').filter(function (x) { return x.id === vid; })[0];
      if (!v) fail('Visit untuk foto ini belum ada di server.', 'novisit');
      var ex = ctx.db.all('Photos').filter(function (p) { return p.id === pid; })[0];
      if (ex) return { url: ex.url, dup: true };
      var nama = (str(d.nama) || pid + '.jpg').replace(/[\\\/:*?"<>|]/g, '-').slice(0, 120);
      var url = ctx.saveFile(String(d.dataUrl), nama, photoPath(v.tanggal, v.store_name));
      ctx.db.insert('Photos', { id: pid, visit_id: vid, tanggal: v.tanggal, store_id: v.store_id, url: url, nama: nama, dibuat: ctx.now().iso });
      var n = ctx.db.all('Photos').filter(function (p) { return p.visit_id === vid; }).length;
      ctx.db.update('Visits', vid, { foto: String(n) });
      return { url: url };
    });
  }

  function deleteVisit(ctx, d) {
    var id = str(d.id);
    return ctx.lock(function () {
      var v = ctx.db.all('Visits').filter(function (x) { return x.id === id; })[0];
      if (!v) return { deleted: false };
      ctx.db.remove('Visits', id);
      ctx.db.all('Prices').filter(function (p) { return p.visit_id === id; }).forEach(function (p) { ctx.db.remove('Prices', p.id); });
      ctx.db.all('Photos').filter(function (p) { return p.visit_id === id; }).forEach(function (p) { ctx.db.remove('Photos', p.id); });
      ctx.afterChange({ weeks: [v.minggu], quarters: [quarterOf(v.tanggal)] });
      return { deleted: true };
    });
  }

  function range(d, ctx) {
    var from = str(d.from), to = str(d.to);
    if (!isDate(from) || !isDate(to)) fail('Rentang tanggal tidak valid.');
    if (from > to) { var t = from; from = to; to = t; }
    if ((ms(to) - ms(from)) / DAY > 400) fail('Rentang maksimal 400 hari.');
    return { from: from, to: to };
  }

  function lastSurvey(ctx, d) {
    var sid = str(d.store_id), rows = ctx.db.all('Prices').filter(function (p) { return p.store_id === sid; });
    if (!rows.length) return { prices: [], tanggal: '' };
    var last = rows.reduce(function (a, p) { return p.tanggal > a ? p.tanggal : a; }, '');
    var vid = rows.filter(function (p) { return p.tanggal === last; })[0].visit_id;
    return { tanggal: last, prices: rows.filter(function (p) { return p.visit_id === vid; }) };
  }

  /* =====================================================================
   * GRID = susunan sheet (dipakai untuk menulis tab Google Sheet, tampilan
   * di laptop, dan file Excel yang di-download). Sel: nilai, atau
   * { v, s: 'title'|'h'|'b'|'p'|'w'|'ok'|'miss'|'sub', link }.
   * ===================================================================== */
  function Grid(name) { return { name: name, rows: [], merges: [], widths: [], freeze: 0 }; }
  function put(g, r, c, v) { while (g.rows.length <= r) g.rows.push([]); g.rows[r][c] = v; }
  function merge(g, r1, c1, r2, c2) { if (r2 > r1 || c2 > c1) g.merges.push([r1, c1, r2, c2]); }
  function H(v) { return { v: v, s: 'h' }; }
  function B(v) { return { v: v, s: 'b' }; }
  function L(url, label) { return url ? { v: label || 'Foto', link: url, s: 'link' } : ''; }

  function weekLabel(w) { return 'Wk ' + w.week + '\n' + shortDate(w.monday) + ' - ' + shortDate(w.friday); }

  function periodsOf(freq, weeks) {
    if (freq === 'Weekly') return weeks.map(function (w) { return [w]; });
    if (freq === 'Biweekly') {
      var p = [];
      for (var i = 0; i < weeks.length; i += 2) p.push(weeks.slice(i, i + 2));
      if (p.length > 1 && p[p.length - 1].length === 1) p[p.length - 2] = p[p.length - 2].concat(p.pop());
      return p;
    }
    var by = {};
    weeks.forEach(function (w) { (by[w.month] = by[w.month] || []).push(w); });
    return Object.keys(by).sort(function (a, b) { return a - b; }).map(function (k) { return by[k]; });
  }

  function visitMap(visits) {
    var m = {};
    visits.forEach(function (v) {
      var k = v.store_id + '|' + v.minggu;
      if (!m[k] || (v.tanggal + v.jam) > (m[k].tanggal + m[k].jam)) m[k] = v;
    });
    return m;
  }

  function quarterVisits(ctx, year, q) {
    var ws = weeksOfQuarter(year, q);
    return { weeks: ws, visits: visitsIn(ctx, ws[0].monday, ws[ws.length - 1].sunday) };
  }

  function gridStarVisit(ctx, cmr, set, year, q, today) {
    var qv = quarterVisits(ctx, year, q), weeks = qv.weeks, vm = visitMap(qv.visits);
    var stars = starIds(set), g = Grid('Star - Visit Q' + q + '-' + year);
    var W0 = 6, S0 = W0 + weeks.length * 2;
    put(g, 0, 0, { v: 'AM Weekly Visit Log - Q' + q + ' ' + year + ' (Wk ' + weeks[0].week + ' - ' + weeks[weeks.length - 1].week + ')', s: 'title' });
    put(g, 1, 0, 'Visit hari kerja Senin - Jumat. ✓ = sudah visit minggu itu, link = folder foto visit di Google Drive. Merah = periode wajib yang sudah lewat tanpa visit.');
    // baris bulan
    var mStart = 0;
    weeks.forEach(function (w, i) {
      if (i === weeks.length - 1 || weeks[i + 1].month !== w.month) {
        put(g, 2, W0 + mStart * 2, { v: MONTHS[w.month] + ' ' + year, s: 'h' });
        merge(g, 2, W0 + mStart * 2, 2, W0 + i * 2 + 1);
        mStart = i + 1;
      }
    });
    weeks.forEach(function (w, i) { put(g, 3, W0 + i * 2, { v: weekLabel(w), s: 'h' }); merge(g, 3, W0 + i * 2, 3, W0 + i * 2 + 1); });
    ['Branch', 'AM Name', 'City', 'Store Code', 'Store Name', 'Visit Frequency'].forEach(function (h, c) { put(g, 4, c, H(h)); });
    weeks.forEach(function (w, i) { put(g, 4, W0 + i * 2, H('Visit ✓')); put(g, 4, W0 + i * 2 + 1, H('Photo Link')); });
    ['Wajib s/d hari ini', 'Terpenuhi', 'Missed', 'Compliance %', 'Visit tanpa foto', 'Last Visited Week'].forEach(function (h, i) { put(g, 4, S0 + i, H(h)); });
    put(g, 3, S0, { v: 'Q' + q + ' Compliance', s: 'h' }); merge(g, 3, S0, 3, S0 + 5);
    var r = 5;
    cmr.stores.filter(function (s) { return stars.indexOf(s.id) >= 0; }).forEach(function (s) {
      var freq = freqOf(s, set), done = {}, noPhoto = 0, last = '';
      [str(s.branch), str(s.am), str(s.city), s.id, s.name, freq].forEach(function (v, c) { put(g, r, c, v); });
      weeks.forEach(function (w, i) {
        var v = vm[s.id + '|' + w.key];
        if (v) {
          done[w.key] = 1; last = 'Wk ' + w.week;
          put(g, r, W0 + i * 2, { v: '✓', s: 'ok' });
          put(g, r, W0 + i * 2 + 1, L(v.folder_url, 'Foto'));
          if (!(+v.foto)) noPhoto++;
        } else put(g, r, W0 + i * 2, '');
      });
      var req = 0, met = 0, miss = 0;
      periodsOf(freq, weeks).forEach(function (p) {
        if (p[0].monday > today) return;          // periode belum mulai
        var ok = p.some(function (w) { return done[w.key]; });
        var ended = p[p.length - 1].friday < today;
        if (ok) { req++; met++; } else if (ended) {
          req++; miss++;
          p.forEach(function (w) { var c = W0 + weeks.indexOf(w) * 2; put(g, r, c, { v: '', s: 'miss' }); });
        }
      });
      put(g, r, S0, req); put(g, r, S0 + 1, met); put(g, r, S0 + 2, miss);
      put(g, r, S0 + 3, req ? { v: met / req, s: 'p' } : '');
      put(g, r, S0 + 4, noPhoto); put(g, r, S0 + 5, last);
      r++;
    });
    g.widths = [12, 16, 12, 13, 34, 11];
    weeks.forEach(function () { g.widths.push(7, 9); });
    g.widths.push(10, 9, 8, 11, 10, 11);
    g.freeze = 5; g.freezeCols = 6;
    return g;
  }

  function gridDealerVisit(ctx, cmr, set, year, q, today) {
    var qv = quarterVisits(ctx, year, q), weeks = qv.weeks, vm = visitMap(qv.visits);
    var stars = starIds(set), g = Grid('Dealer - Visit Q' + q + '-' + year);
    var cur = isoWeek(today), nextKey = isoWeek(addDays(today, 7)).key;
    var plans = {};
    str(set['plan_' + cur.key]).split(',').forEach(function (x) { if (x) plans[x + '|this'] = 1; });
    str(set['plan_' + nextKey]).split(',').forEach(function (x) { if (x) plans[x + '|next'] = 1; });
    var W0 = 12;
    put(g, 0, 0, { v: 'Dealer Visit - Q' + q + ' ' + year, s: 'title' });
    put(g, 0, W0, { v: 'Actual Visit (✓ = visit, link = folder foto)', s: 'h' }); merge(g, 0, W0, 0, W0 + weeks.length * 2 - 1);
    ['ASUS Area Manager', 'Dealer/Store Type', 'Store ID', 'Branch', 'City', 'Store Name', 'Brand Exclusive Store /Corner',
      'Store Grading', 'No. of Frontliner In this shop', 'Count Visitation Q' + q, 'This Week Visit Plan', 'Next Week Visit Plan']
      .forEach(function (h, c) { put(g, 1, c, H(h)); });
    weeks.forEach(function (w, i) { put(g, 1, W0 + i * 2, H('Week ' + w.week + '\n' + shortDate(w.monday) + ' - ' + shortDate(w.friday))); put(g, 1, W0 + i * 2 + 1, H('Photo Proof')); });
    var r = 2;
    cmr.stores.filter(function (s) { return stars.indexOf(s.id) < 0; }).forEach(function (s) {
      var cnt = 0;
      weeks.forEach(function (w, i) {
        var v = vm[s.id + '|' + w.key];
        if (v) { cnt++; put(g, r, W0 + i * 2, { v: '✓', s: 'ok' }); put(g, r, W0 + i * 2 + 1, L(v.folder_url, 'Foto')); }
      });
      [str(s.am), str(s.type), s.id, str(s.branch), str(s.city), s.name, str(s.exclusive), str(s.grade), num(s.fl_count), cnt,
        plans[s.id + '|this'] ? 'TRUE' : 'FALSE', plans[s.id + '|next'] ? 'TRUE' : 'FALSE'].forEach(function (v, c) { put(g, r, c, v); });
      r++;
    });
    g.widths = [15, 12, 13, 11, 12, 34, 12, 9, 11, 10, 10, 10];
    weeks.forEach(function () { g.widths.push(10, 9); });
    g.freeze = 2; g.freezeCols = 6;
    return g;
  }

  // Satu blok Report Visit per kunjungan Star Reseller (kolom B..S seperti template).
  function reportBlock(g, r, v, s, extraPrices) {
    var d = v.detail || {}, C = 2, Lc = 11;
    function brandVals(src) {
      var o = {};
      REPORT_BRANDS.forEach(function (b) { o[b] = num(src && src[b]); });
      o.Other += num(src && src.Axioo) + num(src && src.Advan);
      return o;
    }
    function shareRow(row, vals) {
      var t = 0; REPORT_BRANDS.forEach(function (b) { t += vals[b]; });
      REPORT_BRANDS.forEach(function (b, i) { put(g, row, Lc + i, t ? { v: vals[b] / t, s: 'p' } : 0); });
    }
    put(g, r, 1, { v: 'Visit: ' + longDate(v.tanggal) + ' ' + v.jam, s: 'sub' }); merge(g, r, 1, r, 18);
    put(g, r + 1, C, B('Store Code')); put(g, r + 1, C + 1, s ? s.id : v.store_id); merge(g, r + 1, C + 1, r + 1, C + 7);
    put(g, r + 1, Lc, H('Store Challenge')); merge(g, r + 1, Lc, r + 1, Lc + 2);
    put(g, r + 2, C, B('Store name')); put(g, r + 2, C + 1, v.store_name); merge(g, r + 2, C + 1, r + 2, C + 7);
    put(g, r + 2, Lc, H('Target')); put(g, r + 2, Lc + 1, H('Achievement')); put(g, r + 2, Lc + 2, H('Hitrate'));
    put(g, r + 3, C, B('Grade')); put(g, r + 3, C + 1, s ? str(s.grade) : ''); merge(g, r + 3, C + 1, r + 3, C + 7);
    put(g, r + 3, Lc, num(d.target)); put(g, r + 3, Lc + 1, num(d.achievement));
    put(g, r + 3, Lc + 2, num(d.target) ? { v: num(d.achievement) / num(d.target), s: 'p' } : '');
    put(g, r + 4, C, B('PIC Name')); put(g, r + 4, C + 1, str(d.pic)); merge(g, r + 4, C + 1, r + 4, C + 7);

    var dv = brandVals(d.display), sv = brandVals(d.sellout);
    put(g, r + 6, C, H('Display Qty')); merge(g, r + 6, C, r + 6, C + 5);
    put(g, r + 6, Lc, H('Display Share')); merge(g, r + 6, Lc, r + 6, Lc + 5);
    REPORT_BRANDS.forEach(function (b, i) { put(g, r + 7, C + i, B(b)); put(g, r + 7, Lc + i, B(b)); put(g, r + 8, C + i, dv[b]); });
    shareRow(r + 8, dv);
    put(g, r + 10, C, H('SellOut Qty (last week)')); merge(g, r + 10, C, r + 10, C + 5);
    put(g, r + 10, Lc, H('Sellout Share')); merge(g, r + 10, Lc, r + 10, Lc + 5);
    REPORT_BRANDS.forEach(function (b, i) { put(g, r + 11, C + i, B(b)); put(g, r + 11, Lc + i, B(b)); put(g, r + 12, C + i, sv[b]); });
    shareRow(r + 12, sv);

    put(g, r + 14, C, H('SKU Best Sellout')); merge(g, r + 14, C, r + 14, C + 7);
    put(g, r + 14, Lc, H('Stock Management')); merge(g, r + 14, Lc, r + 14, Lc + 2);
    put(g, r + 14, Lc + 4, H('Display Program')); merge(g, r + 14, Lc + 4, r + 14, Lc + 5);
    ['Brand', 'SKU', '', '', 'CPU', 'RAM', 'HDD', 'Price'].forEach(function (h, i) { if (h) put(g, r + 15, C + i, B(h)); });
    merge(g, r + 15, C + 1, r + 15, C + 3);
    put(g, r + 15, Lc, B('Category')); put(g, r + 15, Lc + 1, B('SKU')); put(g, r + 15, Lc + 2, B('Qty'));
    put(g, r + 15, Lc + 4, B('SKU')); put(g, r + 15, Lc + 5, B('Status'));
    REPORT_BRANDS.forEach(function (b, i) {
      var x = (d.sku || [])[i] || {}, rr = r + 16 + i;
      put(g, rr, C, b); put(g, rr, C + 1, str(x.sku)); merge(g, rr, C + 1, rr, C + 3);
      put(g, rr, C + 4, str(x.cpu)); put(g, rr, C + 5, str(x.ram)); put(g, rr, C + 6, str(x.hdd)); put(g, rr, C + 7, num(x.price) || '');
    });
    STOCK_CATS.forEach(function (c, i) {
      var x = (d.stock || [])[i] || {};
      put(g, r + 16 + i, Lc, c); put(g, r + 16 + i, Lc + 1, str(x.sku)); put(g, r + 16 + i, Lc + 2, num(x.qty));
    });
    (d.program || []).slice(0, 6).forEach(function (x, i) { put(g, r + 16 + i, Lc + 4, str(x.sku)); put(g, r + 16 + i, Lc + 5, str(x.status)); });

    var f = r + 23;
    put(g, f, C, H('Frontliner Upload')); merge(g, f, C, f, C + 13);
    (d.fl || []).slice(0, 7).forEach(function (x, i) {
      var c = C + i * 2;
      put(g, f + 1, c, B(x.id)); merge(g, f + 1, c, f + 1, c + 1);
      put(g, f + 2, c, B('University')); put(g, f + 2, c + 1, B('Upload'));
      put(g, f + 3, c, x.univ); put(g, f + 3, c + 1, num(x.upload));
    });
    if (!(d.fl || []).length) put(g, f + 1, C, '(belum ada data FL)');
    var t = f + 5;
    [['Activities (dealer update)', d.activities], ['Support needed', d.support], ['Feedback', d.feedback],
      ["Competitor's activity", d.competitor], ['Catatan', v.catatan]].forEach(function (p, i) {
      put(g, t + i, C, B(p[0])); merge(g, t + i, C, t + i, C + 3);
      put(g, t + i, C + 4, { v: str(p[1]), s: 'w' }); merge(g, t + i, C + 4, t + i, 18);
    });
    put(g, t + 5, C, B('Photo Visit')); merge(g, t + 5, C, t + 5, C + 3);
    put(g, t + 5, C + 4, L(v.folder_url, v.folder_url ? 'Buka folder foto (' + v.foto + ' foto)' : '')); merge(g, t + 5, C + 4, t + 5, 18);
    var pr = extraPrices || [];
    if (pr.length) {
      var p0 = t + 7;
      put(g, p0, C, H('Price Survey')); merge(g, p0, C, p0, 18);
      ['Segment', 'Brand', 'Type', '', '', 'Spec', '', '', '', '', '', '', 'HRP', 'SRP'].forEach(function (h, i) { if (h) put(g, p0 + 1, C + i, B(h)); });
      merge(g, p0 + 1, C + 2, p0 + 1, C + 4); merge(g, p0 + 1, C + 5, p0 + 1, C + 11);
      pr.forEach(function (p, i) {
        var rr = p0 + 2 + i;
        put(g, rr, C, p.segment); put(g, rr, C + 1, p.brand); put(g, rr, C + 2, p.tipe); merge(g, rr, C + 2, rr, C + 4);
        put(g, rr, C + 5, { v: p.spec, s: 'w' }); merge(g, rr, C + 5, rr, C + 11);
        put(g, rr, C + 12, num(p.hrp) || ''); put(g, rr, C + 13, num(p.srp) || '');
      });
      return p0 + 2 + pr.length + 2;
    }
    return t + 8;
  }

  function gridReportVisit(name, visits, cmr, prices) {
    var g = Grid(name), byId = {}, r = 0;
    cmr.stores.forEach(function (s) { byId[s.id] = s; });
    put(g, r++, 1, { v: name, s: 'title' });
    var star = visits.filter(function (v) { return v.kategori === 'Star'; });
    if (!star.length) put(g, r++, 1, 'Belum ada visit Star Reseller di periode ini.');
    star.forEach(function (v) {
      r = reportBlock(g, r + 1, v, byId[v.store_id], prices.filter(function (p) { return p.visit_id === v.id; }));
    });
    g.widths = [2, 2, 14, 11, 11, 11, 11, 11, 11, 13, 3, 12, 12, 11, 11, 11, 11, 11, 11];
    return g;
  }

  function gridPriceSurvey(name, prices, cmr, set) {
    var g = Grid(name), stars = starIds(set);
    var stores = cmr.stores.filter(function (s) { return stars.indexOf(s.id) >= 0; });
    // nilai terbaru per toko + tipe
    var latest = {}, items = {};
    prices.forEach(function (p) {
      var k = (p.segment + '|' + p.brand + '|' + p.tipe).toLowerCase();
      if (!items[k] || p.tanggal >= items[k].tanggal) items[k] = { segment: p.segment, brand: p.brand, tipe: p.tipe, spec: p.spec, tanggal: p.tanggal };
      var sk = k + '|' + p.store_id;
      if (!latest[sk] || p.tanggal >= latest[sk].tanggal) latest[sk] = p;
    });
    var keys = Object.keys(items).sort(function (a, b) {
      var A = items[a], Bv = items[b];
      var sa = SEGMENTS.indexOf(A.segment), sb = SEGMENTS.indexOf(Bv.segment);
      if (sa < 0) sa = 99; if (sb < 0) sb = 99;
      if (sa !== sb) return sa - sb;
      if (A.brand !== Bv.brand) return A.brand < Bv.brand ? -1 : 1;
      return A.tipe < Bv.tipe ? -1 : 1;
    });
    put(g, 0, 0, { v: name + ' - harga terbaru per tipe (HRP / SRP)', s: 'title' });
    ['Segment', 'Brand', 'Type', 'Spec'].forEach(function (h, c) { put(g, 2, c, H(h)); merge(g, 1, c, 2, c); put(g, 1, c, H(h)); });
    stores.forEach(function (s, i) {
      put(g, 1, 4 + i * 2, H(s.name)); merge(g, 1, 4 + i * 2, 1, 5 + i * 2);
      put(g, 2, 4 + i * 2, H('HRP')); put(g, 2, 5 + i * 2, H('SRP'));
    });
    keys.forEach(function (k, i) {
      var it = items[k], r = 3 + i;
      put(g, r, 0, it.segment); put(g, r, 1, it.brand); put(g, r, 2, it.tipe); put(g, r, 3, { v: it.spec, s: 'w' });
      stores.forEach(function (s, j) {
        var p = latest[k + '|' + s.id];
        put(g, r, 4 + j * 2, p ? (num(p.hrp) || '') : ''); put(g, r, 5 + j * 2, p ? (num(p.srp) || '') : '');
      });
    });
    if (!keys.length) put(g, 3, 0, 'Belum ada data price survey.');
    g.widths = [15, 9, 30, 50];
    stores.forEach(function () { g.widths.push(12, 12); });
    g.freeze = 3; g.freezeCols = 4;
    return g;
  }

  function gridVisitLog(name, visits) {
    var g = Grid(name);
    put(g, 0, 0, { v: name, s: 'title' });
    ['Tanggal', 'Hari', 'Jam', 'Minggu', 'Kategori', 'Store ID', 'Store Name', 'City', 'Jumlah Foto', 'Folder Foto', 'Catatan', 'GPS']
      .forEach(function (h, c) { put(g, 1, c, H(h)); });
    var day = '';
    visits.forEach(function (v, i) {
      var r = 2 + i;
      [v.tanggal, DAYS[dow(v.tanggal)], v.jam, v.minggu.replace(/^\d{4}-W/, 'Wk '), v.kategori, v.store_id, v.store_name, v.city, +v.foto || 0]
        .forEach(function (x, c) { put(g, r, c, x); });
      put(g, r, 9, L(v.folder_url, 'Buka folder'));
      put(g, r, 10, { v: v.catatan, s: 'w' });
      put(g, r, 11, v.lat ? v.lat + ',' + v.lng : '');
      day = v.tanggal;
    });
    if (!visits.length) put(g, 2, 0, 'Tidak ada visit di periode ini.');
    g.widths = [11, 8, 6, 8, 8, 13, 36, 12, 7, 12, 40, 20];
    g.freeze = 2;
    return g;
  }

  function reportName(from, to) {
    var wf = isoWeek(from), wt = isoWeek(to);
    if (from === to) return 'Report Visit ' + from;
    if (wf.key === wt.key) return 'Report Visit Week ' + wf.week + ' - ' + wf.year;
    return 'Report Visit ' + from + ' sd ' + to;
  }

  function report(ctx, d) {
    var rg = range(d, ctx), cmr = readCM(ctx), set = settings(ctx), today = ctx.now().date;
    var visits = visitsIn(ctx, rg.from, rg.to), prices = pricesIn(ctx, rg.from, rg.to);
    var qo = quarterOf(rg.to);
    var sheets = [
      gridVisitLog('Visit Log', visits),
      gridReportVisit(reportName(rg.from, rg.to), visits, cmr, prices),
      gridPriceSurvey('Price Survey - Star', prices, cmr, set),
      gridStarVisit(ctx, cmr, set, qo.year, qo.q, today),
      gridDealerVisit(ctx, cmr, set, qo.year, qo.q, today)
    ];
    return { from: rg.from, to: rg.to, title: reportName(rg.from, rg.to), sheets: sheets };
  }

  // Dipanggil adapter GAS setelah data berubah: susun ulang tab tampilan di Google Sheet.
  function buildViews(ctx, changed) {
    var cmr = readCM(ctx), set = settings(ctx), today = ctx.now().date, out = [], seenQ = {}, seenW = {};
    (changed.quarters || []).forEach(function (q) {
      var k = q.year + 'Q' + q.q;
      if (seenQ[k]) return; seenQ[k] = 1;
      out.push(gridStarVisit(ctx, cmr, set, q.year, q.q, today));
      out.push(gridDealerVisit(ctx, cmr, set, q.year, q.q, today));
    });
    (changed.weeks || []).forEach(function (wk) {
      if (!wk || seenW[wk]) return; seenW[wk] = 1;
      var w = weekFromKey(wk);
      out.push(gridReportVisit('Report Visit Week ' + w.week + ' - ' + w.year, visitsIn(ctx, w.monday, w.sunday), cmr, pricesIn(ctx, w.monday, w.sunday)));
    });
    out.push(gridPriceSurvey('Price Survey - Star', ctx.db.all('Prices'), cmr, set));
    return out;
  }

  function sheetsPreview(ctx, d) {
    var cmr = readCM(ctx), set = settings(ctx), today = ctx.now().date;
    var qo = d.year && d.q ? { year: +d.year, q: +d.q } : quarterOf(today);
    if (d.which === 'dealer') return { sheet: gridDealerVisit(ctx, cmr, set, qo.year, qo.q, today) };
    if (d.which === 'price') return { sheet: gridPriceSurvey('Price Survey - Star', ctx.db.all('Prices'), cmr, set) };
    return { sheet: gridStarVisit(ctx, cmr, set, qo.year, qo.q, today) };
  }

  function savePlan(ctx, d) {
    var wk = str(d.week);
    weekFromKey(wk);
    var ids = (d.ids || []).map(str).filter(function (x) { return /^[A-Z0-9-]{4,20}$/i.test(x); }).slice(0, 300);
    return ctx.lock(function () {
      var key = 'plan_' + wk, ex = ctx.db.all('Settings').some(function (r) { return r.key === key; });
      if (ex) ctx.db.update('Settings', key, { value: ids.join(',') }); else ctx.db.insert('Settings', { key: key, value: ids.join(',') });
      ctx.afterChange({ weeks: [], quarters: [quarterOf(weekFromKey(wk).monday)] });
      return { week: wk, ids: ids };
    });
  }

  function bootstrap(ctx) {
    var cmr = readCM(ctx), set = settings(ctx), stars = starIds(set), today = ctx.now().date;
    var lastVisit = {};
    ctx.db.all('Visits').forEach(function (v) { if (!lastVisit[v.store_id] || v.tanggal > lastVisit[v.store_id]) lastVisit[v.store_id] = v.tanggal; });
    var w = isoWeek(today), nw = isoWeek(addDays(today, 7));
    return {
      version: VERSION, today: today, week: w, sheetUrl: ctx.sheetUrl(), folderUrl: ctx.rootUrl ? ctx.rootUrl() : '',
      stores: cmr.stores.map(function (s) { var o = storeLite(s, stars.indexOf(s.id) >= 0, set); o.last = lastVisit[s.id] || ''; return o; }),
      lists: { inputBrands: INPUT_BRANDS, reportBrands: REPORT_BRANDS, stockCats: STOCK_CATS, surveyBrands: SURVEY_BRANDS,
        segments: SEGMENTS, signboardImg: SIGNBOARD_IMG },
      plans: { thisWeek: w.key, nextWeek: nw.key, this: str(set['plan_' + w.key]).split(',').filter(Boolean), next: str(set['plan_' + nw.key]).split(',').filter(Boolean) }
    };
  }

  /* ---------- router ---------- */
  function handle(ctx, body) {
    try {
      var a = str(body && body.action), d = (body && body.data) || {};
      if (a === 'ping') return { ok: true, data: { version: VERSION } };
      if (a === 'login') return { ok: true, data: login(ctx, d) };
      checkToken(ctx, body && body.token);
      var fn = {
        bootstrap: function () { return bootstrap(ctx); },
        listVisits: function () { var rg = range(d, ctx); return { visits: visitsIn(ctx, rg.from, rg.to), prices: pricesIn(ctx, rg.from, rg.to) }; },
        saveVisit: function () { return saveVisit(ctx, d); },
        uploadPhoto: function () { return uploadPhoto(ctx, d); },
        deleteVisit: function () { return deleteVisit(ctx, d); },
        lastSurvey: function () { return lastSurvey(ctx, d); },
        report: function () { return report(ctx, d); },
        preview: function () { return sheetsPreview(ctx, d); },
        savePlan: function () { return savePlan(ctx, d); }
      }[a];
      if (!fn) fail('Aksi tidak dikenal: ' + a);
      return { ok: true, data: fn() };
    } catch (e) {
      if (e && e.userError) return { ok: false, error: e.message, code: e.code };
      if (ctx.log) ctx.log(e);
      return { ok: false, error: 'Terjadi kesalahan di server: ' + (e && e.message || e) };
    }
  }

  return {
    VERSION: VERSION, TABLES: TABLES, CM: CM, DEFAULT_STAR: DEFAULT_STAR, DEFAULT_HOMEBASE: DEFAULT_HOMEBASE,
    handle: handle, buildViews: buildViews, readCM: readCM,
    util: { isoWeek: isoWeek, weekFromKey: weekFromKey, weeksOfQuarter: weeksOfQuarter, quarterOf: quarterOf, addDays: addDays,
      dow: dow, longDate: longDate, shortDate: shortDate, phone: phone, MONTHS: MONTHS, DAYS: DAYS }
  };
})();
if (typeof module !== 'undefined') module.exports = CORE;
