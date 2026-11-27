/*
 * demo-adapter.js - menjalankan CORE di browser (data di localStorage) untuk MODE DEMO.
 * Toko di sini FIKTIF. Data asli hanya ada di Google Sheet milik pengguna.
 */
var DEMO = (function () {
  'use strict';
  var P = 'vr-demo2:';
  var HEAD = ['ASUS Area Manager', 'Merchandiser Name', 'Merchandiser ID', 'Channel Type', 'Unmanaged/Store Type', 'Store ID',
    'Branch', 'City', 'Shopping Mall', 'Store Name', 'Brand Exclusive Store/Corner', 'Store Location', 'Store Grading',
    'No. of Frontliner (in this store)', '# of ASUS Promoter Deployed', '# of ASUS Signboard Deployed', 'ASUS Signboard Image',
    '# of ASUS NB Island Table Deployed', '# of ASUS NB Wall Cabinet / KV Cabinet', '# of ASUS NB Wall Bay',
    'Asus Share %', 'HP Share %', 'Lenovo Share %', 'Acer Share %', 'MSI Share %', 'Axioo Share %', 'Advan Share %', 'Others Share %',
    'Promoter#1 Name', 'Promoter#1 ID', 'Promoter#2 Name', 'Promoter#2 ID',
    'FL#1 Name', 'FL#1 iChannel ID', 'FL#1 Mobile', 'FL#2 Name', 'FL#2 iChannel ID', 'FL#2 Mobile',
    'FL#3 Name', 'FL#3 iChannel ID', 'FL#3 Mobile', 'FL#4 Name', 'FL#4 iChannel ID', 'FL#4 Mobile',
    'FL#5 Name', 'FL#5 iChannel ID', 'FL#5 Mobile', 'Photo Link', 'No of Frontliner Registered in iChannel',
    'Total Frontliner Upload in iChannel', 'Display Program'];
  var SAMPLE = [
    ['DM-0001', 'Toko Demo Satu - Jl. Contoh 1 - Kota A', 'Kota A', 'C', 2, 'Demo FL Satu', 'ID0000A0001'],
    ['DM-0002', 'Toko Demo Dua - Plaza Contoh - Kota A', 'Kota A', 'B', 1, 'Demo FL Dua', 'ID0000A0002'],
    ['DM-0003', 'Toko Demo Tiga - Jl. Contoh 3 - Kota B', 'Kota B', 'C', 1, '', ''],
    ['DM-0004', 'Toko Demo Empat - Jl. Contoh 4 - Kota A', 'Kota A', 'D', 0, '', ''],
    ['DM-0005', 'Toko Demo Lima - Jl. Contoh 5 - Kota C', 'Kota C', 'D', 1, '', ''],
    ['DM-0006', 'Toko Demo Enam - Jl. Contoh 6 - Kota A', 'Kota A', 'D', 0, '', ''],
    ['DM-0007', 'Toko Demo Tujuh - Jl. Contoh 7 - Kota A', 'Kota A', 'C', 1, '', '']
  ];

  function load(t) { try { return JSON.parse(localStorage.getItem(P + t) || '[]'); } catch (e) { return []; } }
  function save(t, rows) {
    try { localStorage.setItem(P + t, JSON.stringify(rows)); }
    catch (e) { throw new Error('Penyimpanan demo penuh. Hapus data demo dari menu Lainnya.'); }
  }
  function cmData() {
    var raw = localStorage.getItem(P + 'cm');
    if (raw) return JSON.parse(raw);
    var rows = [['Channel Map DEMO (data fiktif)'], [], HEAD.slice()];
    SAMPLE.forEach(function (s) {
      var r = HEAD.map(function () { return 0; });
      var set = function (h, v) { r[HEAD.indexOf(h)] = v; };
      set('ASUS Area Manager', 'AM Demo'); set('Merchandiser Name', 'MD Demo'); set('Channel Type', 'Traditional');
      set('Unmanaged/Store Type', s[0] === 'DM-0004' ? 'Unmanaged' : 'AP'); set('Store ID', s[0]); set('Branch', 'East Java');
      set('City', s[2]); set('Shopping Mall', 'N/A'); set('Store Name', s[1]); set('Brand Exclusive Store/Corner', 4);
      set('Store Grading', s[3]); set('No. of Frontliner (in this store)', s[4]); set('ASUS Signboard Image', s[4] ? 'Asus Blue' : 0);
      set('FL#1 Name', s[5] || 0); set('FL#1 iChannel ID', s[6] || 0);
      rows.push(r);
    });
    var o = { rows: rows };
    localStorage.setItem(P + 'cm', JSON.stringify(o));
    return o;
  }

  var db = {
    all: function (t) { return load(t); },
    insert: function (t, o) { var r = load(t), c = {}; CORE.TABLES[t].forEach(function (k) { c[k] = o[k] == null ? '' : String(o[k]); }); r.push(c); save(t, r); },
    update: function (t, id, patch) {
      var key = CORE.TABLES[t][0], r = load(t);
      r.forEach(function (o) { if (o[key] === String(id)) for (var k in patch) o[k] = String(patch[k]); });
      save(t, r);
    },
    remove: function (t, id) { var key = CORE.TABLES[t][0]; save(t, load(t).filter(function (o) { return o[key] !== String(id); })); }
  };

  function hash(s) { // bukan kriptografi; cukup untuk demo
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() {
    var d = new Date();
    var date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    return { date: date, time: time, iso: date + ' ' + time };
  }

  var ctx = {
    db: db,
    channelMap: cmData,
    cmWrite: function (cells) {
      var o = cmData();
      cells.forEach(function (c) { var row = o.rows[c.r - 1]; if (row) row[c.c - 1] = c.v; });
      localStorage.setItem(P + 'cm', JSON.stringify(o));
    },
    pin: function () { return 'demo'; },
    hmac: function (s) { return hash('demo-secret|' + s); },
    nowMs: function () { return Date.now(); },
    now: now,
    lock: function (fn) { return fn(); },
    folderFor: function () { return ''; },
    saveFile: function () { return ''; },
    afterChange: function () { },
    sheetUrl: function () { return ''; },
    rootUrl: function () { return ''; },
    cacheGet: function (k) { return sessionStorage.getItem(P + k); },
    cachePut: function (k, v) { sessionStorage.setItem(P + k, v); },
    log: function (e) { console.error(e); }
  };

  if (!load('Settings').length) {
    db.insert('Settings', { key: 'star_ids', value: 'DM-0001,DM-0002,DM-0003' });
    db.insert('Settings', { key: 'homebase', value: 'Kota A' });
  }

  return {
    call: function (action, data, token) {
      return new Promise(function (res) {
        setTimeout(function () { res(CORE.handle(ctx, { action: action, data: data, token: token })); }, 150);
      });
    },
    reset: function () {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf(P) === 0) localStorage.removeItem(k); });
    }
  };
})();
