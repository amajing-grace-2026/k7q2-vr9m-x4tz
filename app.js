/* Visit Report - aplikasi (PWA). Server = Google Apps Script (lihat core.js + apps-script/). */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var U = CORE.util;
  var LS = 'vr:';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function lsGet(k, d) { try { var v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* penuh */ } }
  function lsDel(k) { localStorage.removeItem(LS + k); }

  var S = {
    api: lsGet('api', CFG.API_URL || ''), demo: lsGet('demo', false), token: lsGet('token', ''),
    boot: lsGet('boot', null), visits: lsGet('visits', {}), pending: [], form: null, report: lsGet('reportRange', 'week')
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowTime() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function uid(p) { var a = new Uint8Array(8); crypto.getRandomValues(a); return (p || '') + Date.now().toString(36) + '-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function rp(n) { n = +n || 0; return n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''; }
  function numv(v) { var s = String(v == null ? '' : v).replace(/[^\d.,]/g, ''); if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return parseFloat(s.replace(',', '.')) || 0; }
  function isWeekend(d) { var w = U.dow(d); return w === 0 || w === 6; }
  function daysAgo(d) {
    if (!d) return 'belum pernah';
    var n = Math.round((Date.parse(today()) - Date.parse(d)) / 86400000);
    return n <= 0 ? 'hari ini' : n === 1 ? 'kemarin' : n + ' hari lalu';
  }

  var toastT;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }
  function modal(html) { $('#modal-card').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; }
  $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
  function confirmBox(msg, okLabel) {
    return new Promise(function (res) {
      modal('<p style="margin-top:0">' + esc(msg) + '</p><div class="row"><button class="btn grow" id="cf-no">Batal</button><button class="btn pri grow" id="cf-yes">' + esc(okLabel || 'Ya') + '</button></div>');
      $('#cf-no').onclick = function () { closeModal(); res(false); };
      $('#cf-yes').onclick = function () { closeModal(); res(true); };
    });
  }

  /* ---------------- API ---------------- */
  function isNet(e) { return e && (e.net || e.name === 'TypeError'); }
  function api(action, data) {
    var p;
    if (S.demo) p = DEMO.call(action, data || {}, S.token);
    else {
      if (!S.api) return Promise.reject(new Error('URL server belum diisi.'));
      p = fetch(S.api, { method: 'POST', body: JSON.stringify({ action: action, data: data || {}, token: S.token }), redirect: 'follow' })
        .then(function (r) { if (!r.ok) { var e = new Error('Server tidak merespons (' + r.status + ')'); e.net = true; throw e; } return r.json(); },
          function () { var e = new Error('Tidak ada koneksi internet'); e.net = true; throw e; });
    }
    return p.then(function (res) {
      if (!res || !res.ok) {
        var e = new Error(res && res.error || 'Gagal'); e.code = res && res.code;
        if (e.code === 'auth') { S.token = ''; lsDel('token'); location.hash = '#login'; }
        throw e;
      }
      return res.data;
    });
  }

  /* ---------------- IndexedDB: antrean kirim + foto draf ---------------- */
  var IDB = (function () {
    var dbp;
    function open() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        var r = indexedDB.open('visit-report', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('outbox', { keyPath: 'key' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return dbp;
    }
    function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('outbox', mode), req = fn(t.objectStore('outbox'));
          t.oncomplete = function () { res(req && 'result' in req ? req.result : undefined); };
          t.onerror = function () { rej(t.error); };
        });
      });
    }
    return {
      put: function (o) { return run('readwrite', function (s) { return s.put(o); }); },
      del: function (k) { return run('readwrite', function (s) { return s.delete(k); }); },
      all: function () { return run('readonly', function (s) { return s.getAll(); }); }
    };
  })();

  function refreshPending() {
    return IDB.all().then(function (items) {
      S.pending = items;
      var n = items.filter(function (i) { return i.type !== 'draftphoto'; });
      var err = n.filter(function (i) { return i.error; }).length;
      var b = $('#sync');
      b.hidden = !n.length && !flushing;
      b.classList.toggle('bad', !!err);
      b.innerHTML = flushing ? '<span class="spin"></span> Mengirim...' : (err ? '⚠ ' : '⟳ ') + n.length + ' belum terkirim';
      return items;
    });
  }

  var flushing = false;
  function flush(quiet) {
    if (flushing || !S.token) return Promise.resolve(0);
    flushing = true; refreshPending();
    var sent = 0, stop = null;
    return IDB.all().then(function (items) {
      var order = { visit: 0, delete: 1, photo: 2 };
      items = items.filter(function (i) { return i.type in order; })
        .sort(function (a, b) { return order[a.type] - order[b.type] || a.ts - b.ts; });
      var chain = Promise.resolve();
      items.forEach(function (it) {
        chain = chain.then(function () {
          if (stop) return;
          var call = it.type === 'visit' ? api('saveVisit', { visit: it.visit })
            : it.type === 'delete' ? api('deleteVisit', { id: it.id })
              : api('uploadPhoto', { visit_id: it.visit_id, id: it.id, dataUrl: it.dataUrl, nama: it.nama });
          return call.then(function (res) {
            sent++;
            if (it.type === 'visit' && res && res.visit) S.visits[res.visit.id] = res.visit;
            if (it.type === 'delete') delete S.visits[it.id];
            return IDB.del(it.key);
          }, function (e) {
            if (isNet(e) || e.code === 'auth') { stop = e; return; }
            it.error = e.message; it.tries = (it.tries || 0) + 1;
            return IDB.put(it);
          });
        });
      });
      return chain;
    }).then(function () {
      flushing = false; lsSet('visits', S.visits);
      return refreshPending().then(function (left) {
        var errs = left.filter(function (i) { return i.error && i.type !== 'draftphoto'; });
        if (!quiet) {
          if (stop && isNet(stop)) toast('Offline - data aman di HP, dikirim otomatis saat ada sinyal.');
          else if (errs.length) toast('Ada ' + errs.length + ' data gagal dikirim. Buka Laporan untuk cek.');
          else if (sent) toast('✓ Tersimpan ke Google Sheet');
        }
        if (sent && route().name !== 'visit') render();   // jangan ganggu form yang sedang diisi
        return sent;
      });
    }, function (e) { flushing = false; refreshPending(); throw e; });
  }
  window.addEventListener('online', function () { flush(); });
  setInterval(function () { if (navigator.onLine) flush(true); }, 120000);

  /* ---------------- data ---------------- */
  function stores() { return (S.boot && S.boot.stores) || []; }
  function storeById(id) { return stores().filter(function (s) { return s.id === id; })[0]; }
  function bootstrap(force) {
    if (S.boot && !force) { api('bootstrap').then(setBoot).catch(function () { }); return Promise.resolve(S.boot); }
    return api('bootstrap').then(setBoot);
  }
  function setBoot(b) { S.boot = b; lsSet('boot', b); return b; }

  function loadVisits(from, to) {
    return api('listVisits', { from: from, to: to }).then(function (d) {
      Object.keys(S.visits).forEach(function (k) { var v = S.visits[k]; if (v.tanggal >= from && v.tanggal <= to) delete S.visits[k]; });
      var pr = {};
      d.prices.forEach(function (p) { (pr[p.visit_id] = pr[p.visit_id] || []).push(p); });
      d.visits.forEach(function (v) { v.prices = pr[v.id] || []; S.visits[v.id] = v; });
      lsSet('visits', S.visits);
      return true;
    }).catch(function (e) { if (!isNet(e)) toast(e.message); return false; });
  }
  // gabungan visit dari server + yang masih di antrean
  function visitsBetween(from, to) {
    var m = {};
    Object.keys(S.visits).forEach(function (k) { var v = S.visits[k]; if (v.tanggal >= from && v.tanggal <= to) m[k] = Object.assign({}, v); });
    var dels = {};
    S.pending.forEach(function (i) { if (i.type === 'delete') dels[i.id] = 1; });
    S.pending.forEach(function (i) {
      if (i.type !== 'visit' || i.visit.tanggal < from || i.visit.tanggal > to) return;
      var st = storeById(i.visit.store_id) || {};
      var old = m[i.visit.id] || {};
      m[i.visit.id] = Object.assign({}, old, i.visit, { store_name: st.name || i.visit.store_id, kategori: st.star ? 'Star' : 'Dealer',
        city: st.city || '', foto: old.foto || 0, _pending: true, _error: i.error || '' });
    });
    S.pending.forEach(function (i) { if (i.type === 'photo' && m[i.visit_id]) { m[i.visit_id]._pfoto = (m[i.visit_id]._pfoto || 0) + 1; if (i.error) m[i.visit_id]._error = i.error; } });
    return Object.keys(m).filter(function (k) { return !dels[k]; }).map(function (k) { return m[k]; })
      .sort(function (a, b) { return (b.tanggal + b.jam) < (a.tanggal + a.jam) ? -1 : 1; });
  }

  /* ---------------- router ---------------- */
  function route() {
    var h = location.hash.replace(/^#/, '') || 'home', q = {};
    var i = h.indexOf('?');
    if (i >= 0) { h.slice(i + 1).split('&').forEach(function (p) { var kv = p.split('='); q[kv[0]] = decodeURIComponent(kv[1] || ''); }); h = h.slice(0, i); }
    return { name: h, q: q };
  }
  function render() {
    var r = route();
    if (!S.token && r.name !== 'login') { location.hash = '#login'; return; }
    $('#tabs').hidden = r.name === 'login';
    document.body.classList.toggle('nonav', r.name === 'login');
    $$('#tabs a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === (r.name === 'visit' ? '' : r.name)); });
    var v = $('#view');
    v.classList.toggle('wide', r.name === 'report');
    if (S.form && r.name !== 'visit') S.form = null;
    ({ login: viewLogin, home: viewHome, stores: viewStores, visit: viewVisit, report: viewReport, more: viewMore }[r.name] || viewHome)(v, r.q);
  }
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  /* ---------------- login ---------------- */
  function viewLogin(v) {
    v.innerHTML = '<div class="login"><img class="logo" src="brand/ikon.svg" alt=""><h1 class="center">Visit Report</h1>' +
      '<p class="sub center">Laporan visit toko harian</p><div class="card">' +
      '<label class="field"><span>URL server (Apps Script /exec)</span><input type="url" id="lg-url" placeholder="https://script.google.com/macros/s/.../exec" value="' + esc(S.demo ? '' : S.api) + '"></label>' +
      '<label class="field"><span>PIN</span><input type="password" id="lg-pin" autocomplete="current-password"></label>' +
      '<div id="lg-msg"></div><button class="btn pri block big" id="lg-go">Masuk</button></div>' +
      '<p class="center small muted">Belum punya server? <a href="#" id="lg-demo">Coba mode demo</a> (PIN: demo, data fiktif).</p></div>';
    function go(demo) {
      var url = $('#lg-url').value.trim(), pin = $('#lg-pin').value;
      if (!demo && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { $('#lg-msg').innerHTML = '<p class="note bad">Isi URL Web App Apps Script (berakhiran /exec).</p>'; return; }
      S.demo = !!demo; S.api = demo ? '' : url;
      $('#lg-go').disabled = true; $('#lg-go').innerHTML = '<span class="spin"></span>';
      api('login', { pin: demo ? 'demo' : pin }).then(function (d) {
        S.token = d.token; lsSet('token', d.token); lsSet('api', S.api); lsSet('demo', S.demo);
        S.boot = null; S.visits = {}; lsSet('visits', {});
        return bootstrap(true);
      }).then(function () { location.hash = '#home'; flush(true); })
        .catch(function (e) { $('#lg-msg').innerHTML = '<p class="note bad">' + esc(e.message) + '</p>'; $('#lg-go').disabled = false; $('#lg-go').textContent = 'Masuk'; });
    }
    $('#lg-go').onclick = function () { go(false); };
    $('#lg-pin').onkeydown = function (e) { if (e.key === 'Enter') go(false); };
    $('#lg-demo').onclick = function (e) { e.preventDefault(); go(true); };
  }

  /* ---------------- home ---------------- */
  function weekInfo(d) { return U.isoWeek(d || today()); }
  function viewHome(v) {
    var t = today(), w = weekInfo(t);
    function draw() {
      var all = visitsBetween(w.monday, w.sunday), todays = all.filter(function (x) { return x.tanggal === t; });
      var starDone = {}; all.forEach(function (x) { if (x.kategori === 'Star') starDone[x.store_id] = 1; });
      var stars = stores().filter(function (s) { return s.star; });
      var weeklyStars = stars.filter(function (s) { return s.freq === 'Weekly'; });
      var plan = (S.boot && S.boot.plans && S.boot.plans.this) || [];
      var planLeft = plan.filter(function (id) { return !all.some(function (x) { return x.store_id === id; }); });
      v.innerHTML = '<h1>' + esc(U.longDate(t)) + '</h1><p class="sub">Minggu ' + w.week + ' · ' + esc(U.shortDate(w.monday)) + ' - ' + esc(U.shortDate(w.friday)) +
        (isWeekend(t) ? ' · <b>hari libur, visit hanya Senin - Jumat</b>' : '') + '</p>' +
        '<div class="stats"><div class="stat"><b>' + todays.length + '</b><span>Visit hari ini</span></div>' +
        '<div class="stat"><b>' + all.length + '</b><span>Visit minggu ini</span></div>' +
        '<div class="stat"><b>' + Object.keys(starDone).length + '/' + stars.length + '</b><span>Star Reseller</span></div></div>' +
        '<a class="btn pri block big" href="#stores">+ Mulai visit</a>' +
        (weeklyStars.filter(function (s) { return !starDone[s.id]; }).length ? '<h2>Star Reseller weekly belum dikunjungi minggu ini</h2><div class="list">' +
          weeklyStars.filter(function (s) { return !starDone[s.id]; }).map(storeItem).join('') + '</div>' : '') +
        (planLeft.length ? '<h2>Rencana minggu ini belum dikunjungi</h2><div class="list">' + planLeft.map(storeById).filter(Boolean).map(storeItem).join('') + '</div>' : '') +
        '<h2>Visit hari ini</h2>' + (todays.length ? '<div class="list">' + todays.map(visitItem).join('') + '</div>' : '<div class="empty">Belum ada visit hari ini.</div>');
      bindStoreItems(v); bindVisitItems(v);
    }
    draw();
    loadVisits(w.monday, w.sunday).then(function (ok) { if (ok && route().name === 'home') draw(); });
  }

  function storeItem(s) {
    var plans = (S.boot && S.boot.plans) || {};
    return '<button class="item" data-store="' + esc(s.id) + '"><div class="grow"><div class="t">' + esc(s.name) + '</div>' +
      '<div class="m">' + esc(s.id) + ' · ' + esc(s.city) + (s.grade ? ' · Grade ' + esc(s.grade) : '') + ' · visit ' + esc(daysAgo(s.last)) + '</div></div>' +
      (s.star ? '<span class="badge star">★ Star</span>' : '') +
      ((plans.this || []).indexOf(s.id) >= 0 ? '<span class="badge plan">Rencana</span>' : '') + '</button>';
  }
  function visitItem(x) {
    var foto = (+x.foto || 0) + (x._pfoto || 0);
    return '<button class="item" data-visit="' + esc(x.id) + '"><div class="grow"><div class="t">' + esc(x.store_name) + '</div>' +
      '<div class="m">' + esc(x.jam || '') + ' · ' + esc(x.city || '') + ' · ' + foto + ' foto' + (x.catatan ? ' · ' + esc(String(x.catatan).slice(0, 60)) : '') + '</div></div>' +
      '<span class="badge ' + (x.kategori === 'Star' ? 'star">★ Star' : 'dealer">Dealer') + '</span>' +
      (x._error ? '<span class="badge err">Gagal</span>' : x._pending || x._pfoto ? '<span class="badge wait">Antre</span>' : '') + '</button>';
  }
  function bindStoreItems(v) { $$('[data-store]', v).forEach(function (b) { b.onclick = function () { storeSheet(b.getAttribute('data-store')); }; }); }
  function bindVisitItems(v) { $$('[data-visit]', v).forEach(function (b) { b.onclick = function () { location.hash = '#visit?id=' + encodeURIComponent(b.getAttribute('data-visit')); }; }); }

  /* ---------------- toko ---------------- */
  var storeFilter = lsGet('storeFilter', 'all'), storeQuery = '';
  function viewStores(v) {
    var list = stores();
    if (!list.length) { v.innerHTML = '<div class="empty">Daftar toko belum dimuat.<br><br><button class="btn" id="st-re">Muat ulang</button></div>'; $('#st-re').onclick = function () { bootstrap(true).then(render).catch(function (e) { toast(e.message); }); }; return; }
    var cities = {}; list.forEach(function (s) { cities[s.city] = (cities[s.city] || 0) + 1; });
    var plans = (S.boot && S.boot.plans) || {};
    var chips = [['all', 'Semua (' + list.length + ')'], ['star', '★ Star'], ['dealer', 'Dealer'], ['plan', 'Rencana minggu ini']]
      .concat(Object.keys(cities).sort(function (a, b) { return cities[b] - cities[a]; }).map(function (c) { return ['city:' + c, c]; }));
    v.innerHTML = '<h1>Pilih toko</h1><p class="sub">Ketuk toko untuk mulai visit. Star Reseller = form Report Visit lengkap.</p>' +
      '<input class="search" id="st-q" type="search" placeholder="Cari nama / kode toko..." value="' + esc(storeQuery) + '">' +
      '<div class="chips">' + chips.map(function (c) { return '<button class="chip' + (storeFilter === c[0] ? ' on' : '') + '" data-f="' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="list" id="st-list"></div>';
    function draw() {
      var q = storeQuery.toLowerCase();
      var rows = list.filter(function (s) {
        if (storeFilter === 'star' && !s.star) return false;
        if (storeFilter === 'dealer' && s.star) return false;
        if (storeFilter === 'plan' && (plans.this || []).indexOf(s.id) < 0) return false;
        if (storeFilter.indexOf('city:') === 0 && s.city !== storeFilter.slice(5)) return false;
        return !q || (s.name + ' ' + s.id + ' ' + s.city).toLowerCase().indexOf(q) >= 0;
      }).sort(function (a, b) { return (b.star - a.star) || (a.name < b.name ? -1 : 1); });
      $('#st-list').innerHTML = rows.length ? rows.slice(0, 250).map(storeItem).join('') : '<div class="empty">Tidak ada toko yang cocok.</div>';
      bindStoreItems($('#st-list'));
    }
    $('#st-q').oninput = function () { storeQuery = this.value; draw(); };
    $$('.chip', v).forEach(function (c) { c.onclick = function () { storeFilter = c.getAttribute('data-f'); lsSet('storeFilter', storeFilter); viewStores(v); }; });
    draw();
  }

  function storeSheet(id) {
    var s = storeById(id); if (!s) return;
    var plans = S.boot.plans || {};
    var inThis = (plans.this || []).indexOf(id) >= 0, inNext = (plans.next || []).indexOf(id) >= 0;
    modal('<div class="row"><div class="grow"><b style="font-size:17px">' + esc(s.name) + '</b><div class="muted small">' + esc(s.id) + '</div></div>' +
      (s.star ? '<span class="badge star">★ Star · ' + esc(s.freq) + '</span>' : '<span class="badge dealer">Dealer</span>') + '</div>' +
      '<div class="kv" style="margin:12px 0"><b>Kota</b><span>' + esc(s.city) + (s.mall && s.mall !== 'N/A' && s.mall !== '0' ? ' · ' + esc(s.mall) : '') + '</span>' +
      '<b>Tipe</b><span>' + esc(s.type) + ' · ' + esc(s.channel) + '</span><b>Grade</b><span>' + esc(s.grade) + '</span>' +
      '<b>Frontliner</b><span>' + esc(s.cm.fl_count) + '</span><b>Visit terakhir</b><span>' + esc(s.last ? U.longDate(s.last) : 'belum pernah') + '</span></div>' +
      '<button class="btn pri block big" id="ss-go">Mulai visit</button>' +
      '<div class="row" style="margin-top:10px"><button class="btn grow sm" id="ss-p1">' + (inThis ? '✓ ' : '+ ') + 'Rencana minggu ini</button>' +
      '<button class="btn grow sm" id="ss-p2">' + (inNext ? '✓ ' : '+ ') + 'Rencana minggu depan</button></div>' +
      '<button class="btn block" style="margin-top:10px" id="ss-x">Tutup</button>');
    $('#ss-go').onclick = function () { closeModal(); location.hash = '#visit?store=' + encodeURIComponent(id); };
    $('#ss-x').onclick = closeModal;
    function toggle(which) {
      var key = which === 'this' ? plans.thisWeek : plans.nextWeek, ids = (plans[which] || []).slice(), i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1); else ids.push(id);
      api('savePlan', { week: key, ids: ids }).then(function () {
        plans[which] = ids; setBoot(S.boot); toast('Rencana visit disimpan'); closeModal(); render();
      }).catch(function (e) { toast(e.message); });
    }
    $('#ss-p1').onclick = function () { toggle('this'); };
    $('#ss-p2').onclick = function () { toggle('next'); };
  }

  /* ---------------- form visit ---------------- */
  var BR = function () { return S.boot.lists; };

  function viewVisit(v, q) {
    var existing = q.id ? visitsBetween('0000-00-00', '9999-12-31').filter(function (x) { return x.id === q.id; })[0] : null;
    if (q.id && !existing) { v.innerHTML = '<div class="empty">Visit tidak ditemukan (mungkin di luar data yang dimuat).<br><br><a class="btn" href="#report">Kembali</a></div>'; return; }
    var store = storeById(existing ? existing.store_id : q.store);
    if (!store) { v.innerHTML = '<div class="empty">Toko tidak ditemukan.<br><br><a class="btn" href="#stores">Pilih toko</a></div>'; return; }
    if (!S.form || S.form.store.id !== store.id || (existing && S.form.id !== existing.id)) {
      var draft = existing ? null : lsGet('draft:' + store.id, null);
      var base = existing || (draft && draft.visit) || {};
      S.form = {
        id: base.id || uid('v'), isNew: !existing, store: store, star: store.star,
        visit: {
          tanggal: base.tanggal || (isWeekend(today()) ? '' : today()), jam: base.jam || nowTime(), catatan: base.catatan || '',
          lat: base.lat || '', lng: base.lng || '', detail: base.detail || {}, prices: base.prices || []
        },
        existingFoto: existing ? (+existing.foto || 0) : 0, folder: existing ? existing.folder_url : '',
        photos: [], restored: !!draft
      };
      var d = S.form.visit.detail;
      if (!d.fl || !d.fl.length) {
        d.fl = [];
        for (var i = 1; i <= 5; i++) { var fid = store.cm['fl' + i + '_ich']; if (fid && fid !== '0' && fid !== 0) d.fl.push({ id: fid, univ: 'N', upload: 0 }); }
        if (store.cm.p1_id && store.cm.p1_id !== '0' && store.cm.p1_id !== 'TBD') d.fl.push({ id: store.cm.p1_id, univ: 'N', upload: 0 });
      }
      if (!d.program || !d.program.length) d.program = [{ sku: '', status: '' }];
      d.cm = Object.assign({}, store.cm, d.cm || {});
      // foto draf yang belum disimpan
      S.pending.forEach(function (it) { if (it.type === 'draftphoto' && it.visit_id === S.form.id) S.form.photos.push(it); });
      if (!S.form.visit.lat) getGps();
    }
    drawForm(v);
  }

  function getGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (p) {
      if (!S.form) return;
      S.form.visit.lat = p.coords.latitude.toFixed(6); S.form.visit.lng = p.coords.longitude.toFixed(6); S.form.acc = Math.round(p.coords.accuracy);
      var g = $('#f-gps'); if (g) g.textContent = 'Lokasi tercatat (±' + S.form.acc + ' m)';
    }, function () { var g = $('#f-gps'); if (g) g.textContent = 'Lokasi tidak tersedia (izin GPS ditolak / mati)'; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  function inp(name, val, opt) {
    opt = opt || {};
    var t = opt.type || 'text', extra = opt.num ? ' inputmode="numeric"' : '';
    if (opt.money) { extra = ' inputmode="numeric" data-money="1"'; val = rp(val); }
    return '<label class="field' + (opt.mini ? ' mini' : '') + '"><span>' + esc(opt.label || '') + '</span>' +
      (t === 'textarea' ? '<textarea name="' + name + '" rows="' + (opt.rows || 2) + '" placeholder="' + esc(opt.ph || '') + '">' + esc(val) + '</textarea>'
        : '<input type="' + t + '" name="' + name + '" value="' + esc(val == null ? '' : val) + '"' + extra + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : '') + '>') + '</label>';
  }
  function sel(name, val, options, opt) {
    opt = opt || {};
    var has = options.indexOf(val) >= 0 || val === '' || val == null;
    return '<label class="field' + (opt.mini ? ' mini' : '') + '"><span>' + esc(opt.label || '') + '</span><select name="' + name + '">' +
      (opt.blank ? '<option value="">-</option>' : '') + (has ? '' : '<option selected>' + esc(val) + '</option>') +
      options.map(function (o) { return '<option' + (String(o) === String(val) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
  }
  function zero(v) { return v === 0 || v === '0' || v == null ? '' : v; }
  function sec(title, hint, body, open) {
    return '<details class="sec"' + (open ? ' open' : '') + '><summary>' + esc(title) + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</summary><div class="body">' + body + '</div></details>';
  }
  function brandGrid(prefix, src) {
    return '<div class="grid4">' + BR().inputBrands.map(function (b) {
      return inp(prefix + '.' + b, zero(src && src[b]), { label: b === 'Other' ? 'Other*' : b, num: 1, mini: 1, type: 'text' });
    }).join('') + '</div><div class="small muted">*Other = Infinix, Zyrex & brand lain.</div>';
  }

  function drawForm(v) {
    var F = S.form, s = F.store, d = F.visit.detail, L = BR();
    var openSecs = $$('details.sec', v).map(function (x) { return x.open; });
    var weekendWarn = F.visit.tanggal && isWeekend(F.visit.tanggal);
    var h = '<div class="storehead"><div class="row"><div class="grow"><div class="n">' + esc(s.name) + '</div>' +
      '<div class="m">' + esc(s.id) + ' · ' + esc(s.city) + ' · Grade ' + esc(s.grade) + ' · ' + esc(s.type) + '</div></div>' +
      '<span class="badge">' + (s.star ? '★ Star · ' + esc(s.freq) : 'Dealer') + '</span></div></div>' +
      (F.restored ? '<p class="note">Draf visit sebelumnya dipulihkan. <a href="#" id="f-discard">Buang draf</a></p>' : '') +
      '<form id="vf" autocomplete="off">' +
      '<div class="card"><div class="grid2">' + inp('tanggal', F.visit.tanggal, { type: 'date', label: 'Tanggal visit' }) + inp('jam', F.visit.jam, { type: 'time', label: 'Jam' }) + '</div>' +
      '<p class="note bad" id="f-wk"' + (weekendWarn ? '' : ' hidden') + '>Visit hanya di hari kerja (Senin - Jumat).</p>' +
      '<div class="small muted" id="f-gps">' + (F.visit.lat ? 'Lokasi tercatat' : 'Mencari lokasi GPS...') + '</div></div>' +
      '<div class="card"><b>Foto visit</b><div class="small muted">Disimpan ke Google Drive: Tahun / Bulan / Tanggal / Nama toko.</div>' +
      (F.existingFoto ? '<p class="note" style="margin-top:8px">' + F.existingFoto + ' foto sudah tersimpan' + (F.folder ? ' · <a href="' + esc(F.folder) + '" target="_blank" rel="noopener">buka folder</a>' : '') + '</p>' : '') +
      '<div class="photos" id="f-photos">' + F.photos.map(function (p) { return '<div class="ph"><img src="' + p.dataUrl + '" alt=""><button type="button" data-rmph="' + esc(p.id) + '">×</button></div>'; }).join('') + '</div>' +
      '<div class="row"><span class="btn grow filebtn">📷 Kamera<input type="file" accept="image/*" capture="environment" id="f-cam"></span>' +
      '<span class="btn grow filebtn">🖼 Galeri<input type="file" accept="image/*" multiple id="f-gal"></span></div></div>';

    if (F.star) {
      h += sec('Store Challenge & PIC', '', '<div class="grid3">' + inp('detail.pic', d.pic, { label: 'PIC Name', mini: 1 }) +
        inp('detail.target', zero(d.target), { label: 'Target', num: 1, mini: 1 }) + inp('detail.achievement', zero(d.achievement), { label: 'Achievement', num: 1, mini: 1 }) + '</div>', true);
      h += sec('Display Qty', 'unit di display', '<p class="note">Axioo & Advan diisi terpisah (untuk Channel Map); di Report Visit otomatis digabung ke "Other".</p>' + brandGrid('detail.display', d.display));
      h += sec('SellOut Qty (minggu lalu)', 'unit', '<p class="note">Share brand di Channel Map dihitung otomatis dari angka ini.</p>' + brandGrid('detail.sellout', d.sellout));
      h += sec('SKU Best Sellout', '', L.reportBrands.map(function (b, i) {
        var x = (d.sku || [])[i] || {};
        return '<div class="subrow"><h4>' + esc(b) + '</h4>' + inp('detail.sku.' + i + '.sku', x.sku, { label: 'SKU / Model', mini: 1 }) +
          '<div class="grid4">' + inp('detail.sku.' + i + '.cpu', x.cpu, { label: 'CPU', mini: 1 }) + inp('detail.sku.' + i + '.ram', x.ram, { label: 'RAM', mini: 1 }) +
          inp('detail.sku.' + i + '.hdd', x.hdd, { label: 'HDD/SSD', mini: 1 }) + inp('detail.sku.' + i + '.price', x.price, { label: 'Price', money: 1, mini: 1 }) + '</div></div>';
      }).join(''));
      h += sec('Stock Management', 'Zenbook / Vivobook S / ROG', L.stockCats.map(function (c, i) {
        var x = (d.stock || [])[i] || {};
        return '<div class="grid2" style="grid-template-columns:2fr 1fr">' + inp('detail.stock.' + i + '.sku', x.sku, { label: c + ' - SKU', mini: 1 }) + inp('detail.stock.' + i + '.qty', zero(x.qty), { label: 'Qty', num: 1, mini: 1 }) + '</div>';
      }).join(''));
      h += sec('Display Program', (d.program || []).filter(function (x) { return x.sku; }).length + ' SKU', (d.program || []).map(function (x, i) {
        return '<div class="subrow"><button type="button" class="btn sm x" data-rm="program.' + i + '">Hapus</button><div class="grid2" style="margin-top:22px">' +
          inp('detail.program.' + i + '.sku', x.sku, { label: 'SKU', mini: 1 }) + inp('detail.program.' + i + '.status', x.status, { label: 'Status', mini: 1 }) + '</div></div>';
      }).join('') + '<button type="button" class="btn sm" data-add="program">+ Tambah SKU</button>');
      h += sec('Frontliner Upload', (d.fl || []).length + ' FL', '<p class="note">FL ID diambil dari Channel Map; tambah bila ada FL baru.</p>' + (d.fl || []).map(function (x, i) {
        return '<div class="subrow"><button type="button" class="btn sm x" data-rm="fl.' + i + '">Hapus</button><div class="grid3" style="margin-top:22px">' +
          inp('detail.fl.' + i + '.id', x.id, { label: 'FL ID', mini: 1 }) + sel('detail.fl.' + i + '.univ', x.univ || 'N', ['Y', 'N'], { label: 'University', mini: 1 }) +
          inp('detail.fl.' + i + '.upload', zero(x.upload), { label: 'Upload', num: 1, mini: 1 }) + '</div></div>';
      }).join('') + '<button type="button" class="btn sm" data-add="fl">+ Tambah FL</button>');
      h += sec('Activities, Support, Feedback, Competitor', '', inp('detail.activities', d.activities, { type: 'textarea', label: 'Activities (dealer update)', ph: '- Remind PP\n- Follow up ichannel university', rows: 3 }) +
        inp('detail.support', d.support, { type: 'textarea', label: 'Support needed', ph: '- Kiosk?\n- Signboard?' }) +
        inp('detail.feedback', d.feedback, { type: 'textarea', label: 'Feedback' }) + inp('detail.competitor', d.competitor, { type: 'textarea', label: "Competitor's activity" }));
      h += sec('Price Survey', (F.visit.prices || []).length + ' tipe', '<p class="note">Per tipe: spec + harga HRP & SRP. Hanya untuk Star Reseller.</p>' +
        (F.visit.prices || []).map(function (p, i) {
          return '<div class="subrow"><button type="button" class="btn sm x" data-rm="prices.' + i + '">Hapus</button><div class="grid2" style="margin-top:22px">' +
            sel('prices.' + i + '.segment', p.segment || '', L.segments, { label: 'Segment', mini: 1, blank: 1 }) + sel('prices.' + i + '.brand', p.brand || '', L.surveyBrands, { label: 'Brand', mini: 1, blank: 1 }) + '</div>' +
            inp('prices.' + i + '.tipe', p.tipe, { label: 'Type / Model', mini: 1 }) + inp('prices.' + i + '.spec', p.spec, { type: 'textarea', label: 'Spec', mini: 1 }) +
            '<div class="grid2">' + inp('prices.' + i + '.hrp', p.hrp, { label: 'HRP', money: 1, mini: 1 }) + inp('prices.' + i + '.srp', p.srp, { label: 'SRP', money: 1, mini: 1 }) + '</div></div>';
        }).join('') + '<div class="row wrap"><button type="button" class="btn sm" data-add="prices">+ Tambah tipe</button><button type="button" class="btn sm" id="f-lastps">Salin dari survey terakhir toko ini</button></div>');
    } else {
      h += sec('SellOut Qty minggu lalu (opsional)', 'untuk share brand', '<p class="note">Kalau diisi, share brand di Channel Map ikut diperbarui.</p>' + brandGrid('detail.sellout', d.sellout));
    }
    var c = d.cm || {};
    h += sec('Update Channel Map', 'hanya yang diubah', '<p class="note">Isian ini sudah berisi data Channel Map sekarang. Ubah yang berbeda saja; yang tidak diubah tidak dikirim.</p>' +
      '<div class="grid3">' + inp('cm.fl_count', c.fl_count, { label: 'No. of Frontliner', num: 1, mini: 1 }) + inp('cm.promoter_count', c.promoter_count, { label: '# Promoter', num: 1, mini: 1 }) +
      inp('cm.signboard', c.signboard, { label: '# Signboard', num: 1, mini: 1 }) + '</div>' +
      '<div class="grid2">' + sel('cm.signboard_img', c.signboard_img === 0 || c.signboard_img === '0' ? '0' : c.signboard_img, ['0'].concat(L.signboardImg), { label: 'Signboard Image', mini: 1 }) +
      inp('cm.island_nb', c.island_nb, { label: '# NB Island Table', num: 1, mini: 1 }) + inp('cm.wall_cab', c.wall_cab, { label: '# NB Wall Cabinet', num: 1, mini: 1 }) +
      inp('cm.wall_bay', c.wall_bay, { label: '# NB Wall Bay', num: 1, mini: 1 }) + inp('cm.fl_reg', c.fl_reg, { label: 'FL Registered iChannel', num: 1, mini: 1 }) +
      inp('cm.fl_upload', c.fl_upload, { label: 'Total FL Upload iChannel', num: 1, mini: 1 }) + '</div>' +
      [1, 2].map(function (n) { return '<div class="subrow"><h4>Promoter #' + n + '</h4><div class="grid2">' + inp('cm.p' + n + '_name', c['p' + n + '_name'], { label: 'Nama', mini: 1 }) + inp('cm.p' + n + '_id', c['p' + n + '_id'], { label: 'ID', mini: 1 }) + '</div></div>'; }).join('') +
      [1, 2, 3, 4, 5].map(function (n) {
        return '<div class="subrow"><h4>Frontliner #' + n + '</h4>' + inp('cm.fl' + n + '_name', c['fl' + n + '_name'], { label: 'Nama', mini: 1 }) +
          '<div class="grid2">' + inp('cm.fl' + n + '_ich', c['fl' + n + '_ich'], { label: 'iChannel ID', mini: 1 }) + inp('cm.fl' + n + '_mob', c['fl' + n + '_mob'], { label: 'HP (08xx)', type: 'tel', mini: 1 }) + '</div></div>';
      }).join(''));
    h += '<div class="card">' + inp('catatan', F.visit.catatan, { type: 'textarea', label: 'Catatan visit', rows: 3 }) + '</div>' +
      '<div class="savebar"><button type="submit" class="btn pri block big" id="f-save"' + (weekendWarn ? ' disabled' : '') + '>Simpan visit</button></div>' +
      (F.isNew ? '' : '<button type="button" class="btn bad block" id="f-del">Hapus visit ini</button>') + '</form>';
    v.innerHTML = h;
    $$('details.sec', v).forEach(function (x, i) { if (openSecs[i]) x.open = true; });
    bindForm(v);
  }

  function setPath(o, path, val) {
    var p = path.split('.'), cur = o;
    for (var i = 0; i < p.length - 1; i++) {
      var k = p[i], nextIsIdx = /^\d+$/.test(p[i + 1]);
      if (cur[k] == null) cur[k] = nextIsIdx ? [] : {};
      cur = cur[k];
    }
    cur[p[p.length - 1]] = val;
  }
  function readForm() {
    var F = S.form, f = $('#vf'); if (!F || !f) return;
    var o = { detail: { program: [], fl: [], sku: [], stock: [] }, prices: [], cm: {} };
    $$('[name]', f).forEach(function (el) { setPath(o, el.name, el.getAttribute('data-money') ? numv(el.value) : el.value); });
    F.visit.tanggal = o.tanggal; F.visit.jam = o.jam; F.visit.catatan = o.catatan;
    var keep = { cm: Object.assign({}, F.visit.detail.cm, o.cm) };
    F.visit.detail = Object.assign({}, F.visit.detail, o.detail, keep);
    if (F.star) F.visit.prices = (o.prices || []).filter(Boolean);
  }
  var draftT;
  function saveDraft() {
    clearTimeout(draftT);
    draftT = setTimeout(function () {
      var F = S.form; if (!F || !F.isNew) return;
      readForm();
      lsSet('draft:' + F.store.id, { visit: Object.assign({ id: F.id }, F.visit), ts: Date.now() });
    }, 500);
  }

  function compress(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.76));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Foto tidak bisa dibaca')); };
      img.src = url;
    });
  }
  function addFiles(files) {
    var F = S.form; if (!F) return;
    var arr = Array.prototype.slice.call(files || []);
    if (F.photos.length + arr.length > 15) { toast('Maksimal 15 foto per simpan.'); arr = arr.slice(0, Math.max(0, 15 - F.photos.length)); }
    var chain = Promise.resolve();
    arr.forEach(function (file) {
      chain = chain.then(function () { return compress(file); }).then(function (dataUrl) {
        var n = F.existingFoto + F.photos.length + 1, t = (F.visit.tanggal || today()).replace(/-/g, '');
        var safe = F.store.name.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').slice(0, 40);
        var p = { key: 'dp:' + uid(''), type: 'draftphoto', visit_id: F.id, id: uid('p'), dataUrl: dataUrl, nama: t + '_' + safe + '_' + nowTime().replace(':', '') + '_' + n + '.jpg', ts: Date.now() };
        p.key = 'dp:' + p.id;
        F.photos.push(p);
        return IDB.put(p);
      }).catch(function (e) { toast(e.message); });
    });
    chain.then(function () { readForm(); drawForm($('#view')); });
  }

  function bindForm(v) {
    var F = S.form, f = $('#vf');
    f.addEventListener('input', saveDraft);
    f.addEventListener('change', saveDraft);
    $$('[data-money]', f).forEach(function (el) { el.addEventListener('blur', function () { el.value = rp(numv(el.value)); }); });
    $('[name=tanggal]', f).addEventListener('change', function () {
      var wk = this.value && isWeekend(this.value);
      $('#f-wk').hidden = !wk; $('#f-save').disabled = !!wk;
    });
    $('#f-cam').onchange = function () { addFiles(this.files); this.value = ''; };
    $('#f-gal').onchange = function () { addFiles(this.files); this.value = ''; };
    $$('[data-rmph]', v).forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-rmph');
        F.photos = F.photos.filter(function (p) { if (p.id === id) IDB.del(p.key); return p.id !== id; });
        readForm(); drawForm(v);
      };
    });
    $$('[data-add]', v).forEach(function (b) {
      b.onclick = function () {
        readForm();
        var k = b.getAttribute('data-add');
        if (k === 'prices') F.visit.prices.push({ segment: '', brand: '', tipe: '', spec: '', hrp: '', srp: '' });
        else if (k === 'fl') F.visit.detail.fl.push({ id: '', univ: 'N', upload: 0 });
        else F.visit.detail.program.push({ sku: '', status: '' });
        drawForm(v); saveDraft();
      };
    });
    $$('[data-rm]', v).forEach(function (b) {
      b.onclick = function () {
        readForm();
        var p = b.getAttribute('data-rm').split('.'), arr = p[0] === 'prices' ? F.visit.prices : F.visit.detail[p[0]];
        arr.splice(+p[1], 1); drawForm(v); saveDraft();
      };
    });
    var lp = $('#f-lastps');
    if (lp) lp.onclick = function () {
      lp.disabled = true;
      api('lastSurvey', { store_id: F.store.id }).then(function (d) {
        if (!d.prices.length) { toast('Belum ada survey sebelumnya untuk toko ini.'); lp.disabled = false; return; }
        readForm();
        d.prices.forEach(function (p) { F.visit.prices.push({ segment: p.segment, brand: p.brand, tipe: p.tipe, spec: p.spec, hrp: +p.hrp || '', srp: +p.srp || '' }); });
        toast(d.prices.length + ' tipe disalin dari survey ' + U.longDate(d.tanggal) + '. Perbarui harganya.');
        drawForm(v); saveDraft();
      }).catch(function (e) { toast(e.message); lp.disabled = false; });
    };
    var disc = $('#f-discard');
    if (disc) disc.onclick = function (e) {
      e.preventDefault();
      lsDel('draft:' + F.store.id);
      F.photos.forEach(function (p) { IDB.del(p.key); });
      S.form = null; render();
    };
    var del = $('#f-del');
    if (del) del.onclick = function () {
      confirmBox('Hapus visit ini? Data di Google Sheet ikut dihapus (foto di Drive tetap ada).', 'Hapus').then(function (ok) {
        if (!ok) return;
        var id = F.id;
        var jobs = S.pending.filter(function (i) { return (i.type === 'visit' && i.visit.id === id) || ((i.type === 'photo' || i.type === 'draftphoto') && i.visit_id === id); })
          .map(function (i) { return IDB.del(i.key); });
        Promise.all(jobs).then(function () {
          return S.visits[id] ? IDB.put({ key: 'd:' + id, type: 'delete', id: id, ts: Date.now() }) : null;
        }).then(function () { delete S.visits[id]; lsSet('visits', S.visits); S.form = null; location.hash = '#report'; refreshPending().then(function () { flush(); }); });
      });
    };
    f.onsubmit = function (e) {
      e.preventDefault();
      readForm();
      var vv = F.visit;
      if (!vv.tanggal) { toast('Isi tanggal visit.'); return; }
      if (isWeekend(vv.tanggal)) { toast('Visit hanya di hari kerja (Senin - Jumat).'); return; }
      if (vv.tanggal > today()) { toast('Tanggal visit tidak boleh di masa depan.'); return; }
      if (!F.photos.length && !F.existingFoto && !confirm('Belum ada foto visit. Tetap simpan?')) return;
      // Channel Map: kirim hanya yang berubah
      var cmChanged = {}, orig = F.store.cm;
      Object.keys(vv.detail.cm || {}).forEach(function (k) { if (String(vv.detail.cm[k]) !== String(orig[k] == null ? '' : orig[k])) cmChanged[k] = vv.detail.cm[k]; });
      var detail = Object.assign({}, vv.detail, { cm: cmChanged });
      var visit = { id: F.id, tanggal: vv.tanggal, jam: vv.jam, store_id: F.store.id, lat: vv.lat, lng: vv.lng, catatan: vv.catatan, detail: detail, prices: F.star ? vv.prices : [] };
      var jobs = [IDB.put({ key: 'v:' + F.id, type: 'visit', visit: visit, ts: Date.now() })];
      F.photos.forEach(function (p, i) {
        jobs.push(IDB.del(p.key));
        jobs.push(IDB.put({ key: 'p:' + p.id, type: 'photo', visit_id: F.id, id: p.id, dataUrl: p.dataUrl, nama: p.nama, ts: Date.now() + i + 1 }));
      });
      // perbarui salinan lokal Channel Map supaya form berikutnya berisi nilai baru
      Object.keys(cmChanged).forEach(function (k) { F.store.cm[k] = cmChanged[k]; });
      F.store.last = vv.tanggal > (F.store.last || '') ? vv.tanggal : F.store.last;
      setBoot(S.boot);
      Promise.all(jobs).then(function () {
        lsDel('draft:' + F.store.id);
        S.form = null;
        toast('Visit disimpan. Mengirim ke Google Sheet...');
        location.hash = '#home';
        return refreshPending().then(function () { return flush(); });
      }).catch(function (e2) { toast('Gagal menyimpan di HP: ' + e2.message); });
    };
  }

  /* ---------------- laporan ---------------- */
  function rangeOf(key) {
    var t = today(), w = U.isoWeek(t);
    if (key === 'today') return { from: t, to: t, label: 'Hari ini' };
    if (key === 'yesterday') { var y = U.addDays(t, -1); return { from: y, to: y, label: 'Kemarin' }; }
    if (key === 'lastweek') { var lw = U.isoWeek(U.addDays(w.monday, -7)); return { from: lw.monday, to: lw.sunday, label: 'Minggu lalu (Wk ' + lw.week + ')' }; }
    if (key === 'month') return { from: t.slice(0, 8) + '01', to: t, label: 'Bulan ini' };
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return { from: key, to: key, label: U.longDate(key) };
    return { from: w.monday, to: w.sunday, label: 'Minggu ini (Wk ' + w.week + ')' };
  }
  var previewWhich = 'star';
  function viewReport(v) {
    var rg = rangeOf(S.report);
    var chips = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['week', 'Minggu ini'], ['lastweek', 'Minggu lalu'], ['month', 'Bulan ini']];
    function draw() {
      var list = visitsBetween(rg.from, rg.to), days = {};
      list.forEach(function (x) { (days[x.tanggal] = days[x.tanggal] || []).push(x); });
      var errs = S.pending.filter(function (i) { return i.error && i.type !== 'draftphoto'; });
      v.innerHTML = '<h1>Laporan</h1><p class="sub">Dikelompokkan per hari. Download Excel per hari atau per minggu.</p>' +
        '<div class="chips">' + chips.map(function (c) { return '<button class="chip' + (S.report === c[0] ? ' on' : '') + '" data-r="' + c[0] + '">' + c[1] + '</button>'; }).join('') +
        '<input type="date" id="rp-date" class="chip" value="' + (/^\d{4}/.test(S.report) ? S.report : '') + '" style="padding:4px 10px"></div>' +
        (errs.length ? '<div class="note bad">' + errs.length + ' data gagal dikirim: ' + esc(errs[0].error) + '<br><button class="btn sm" id="rp-retry" style="margin-top:6px">Coba kirim lagi</button> <button class="btn sm bad" id="rp-drop" style="margin-top:6px">Buang yang gagal</button></div>' : '') +
        '<div class="card"><div class="row wrap"><div class="grow"><b>' + esc(rg.label) + '</b><div class="small muted">' + esc(rg.from === rg.to ? U.longDate(rg.from) : U.shortDate(rg.from) + ' - ' + U.shortDate(rg.to) + ' ' + rg.to.slice(0, 4)) + ' · ' + list.length + ' visit</div></div>' +
        '<button class="btn pri" id="rp-dl">⬇ Download Excel</button></div>' +
        '<div class="row wrap" style="margin-top:8px"><button class="btn sm" id="rp-dl-day">Excel hari ini</button><button class="btn sm" id="rp-dl-week">Excel minggu ini</button>' +
        (S.boot && S.boot.sheetUrl ? '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(S.boot.sheetUrl) + '">Buka Google Sheet</a>' : '') + '</div></div>' +
        (list.length ? Object.keys(days).sort().reverse().map(function (dd) {
          var st = days[dd].filter(function (x) { return x.kategori === 'Star'; }).length;
          return '<div class="day"><span>' + esc(U.longDate(dd)) + '</span><span class="small muted">' + days[dd].length + ' visit · ' + st + ' Star</span></div><div class="list">' + days[dd].map(visitItem).join('') + '</div>';
        }).join('') : '<div class="empty">Tidak ada visit di periode ini.</div>') +
        '<h2>Tampilan sheet</h2><div class="chips">' + [['star', 'Star - Visit'], ['dealer', 'Dealer - Visit'], ['price', 'Price Survey - Star']].map(function (c) {
          return '<button class="chip' + (previewWhich === c[0] ? ' on' : '') + '" data-pv="' + c[0] + '">' + c[1] + '</button>';
        }).join('') + '</div><div id="rp-prev" class="gridwrap"><div class="empty"><span class="spin"></span></div></div>';
      $$('[data-r]', v).forEach(function (b) { b.onclick = function () { S.report = b.getAttribute('data-r'); lsSet('reportRange', S.report); viewReport(v); }; });
      $('#rp-date').onchange = function () { if (this.value) { S.report = this.value; lsSet('reportRange', S.report); viewReport(v); } };
      $('#rp-dl').onclick = function () { download(rg.from, rg.to, this); };
      $('#rp-dl-day').onclick = function () { var t = today(); download(t, t, this); };
      $('#rp-dl-week').onclick = function () { var w = U.isoWeek(today()); download(w.monday, w.sunday, this); };
      var rt = $('#rp-retry');
      if (rt) rt.onclick = function () { Promise.all(errs.map(function (i) { delete i.error; return IDB.put(i); })).then(function () { return flush(); }); };
      var dr = $('#rp-drop');
      if (dr) dr.onclick = function () {
        confirmBox('Buang ' + errs.length + ' data yang gagal dikirim? Data ini hilang dari HP.', 'Buang').then(function (ok) {
          if (ok) Promise.all(errs.map(function (i) { return IDB.del(i.key); })).then(refreshPending).then(render);
        });
      };
      $$('[data-pv]', v).forEach(function (b) { b.onclick = function () { previewWhich = b.getAttribute('data-pv'); $$('[data-pv]', v).forEach(function (x) { x.classList.toggle('on', x === b); }); loadPreview(); }; });
      bindVisitItems(v);
      loadPreview();
    }
    function loadPreview() {
      var box = $('#rp-prev'); if (!box) return;
      box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
      api('preview', { which: previewWhich }).then(function (d) { box.innerHTML = gridHtml(d.sheet); })
        .catch(function (e) { box.innerHTML = '<div class="empty">' + esc(isNet(e) ? 'Perlu koneksi internet untuk melihat tampilan sheet.' : e.message) + '</div>'; });
    }
    draw();
    loadVisits(rg.from, rg.to).then(function (ok) { if (ok && route().name === 'report') draw(); });
  }

  function gridHtml(g) {
    var cover = {}, span = {};
    g.merges.forEach(function (m) {
      span[m[0] + ',' + m[1]] = [m[2] - m[0] + 1, m[3] - m[1] + 1];
      for (var r = m[0]; r <= m[2]; r++) for (var c = m[1]; c <= m[3]; c++) if (r !== m[0] || c !== m[1]) cover[r + ',' + c] = 1;
    });
    var width = 0; g.rows.forEach(function (r) { if (r && r.length > width) width = r.length; });
    var h = '<table class="g"><colgroup>';
    for (var wi = 0; wi < width; wi++) h += '<col style="min-width:' + Math.round(((g.widths || [])[wi] || 8) * 7) + 'px">';
    h += '</colgroup>';
    g.rows.forEach(function (row, r) {
      h += '<tr>';
      // baris dengan 1 sel saja (judul/keterangan): bentangkan ke sisa lebar tabel
      var filled = [];
      (row || []).forEach(function (x, c) { if (x !== '' && x != null) filled.push(c); });
      var solo = filled.length === 1 && !span[r + ',' + filled[0]] ? filled[0] : -1;
      for (var c = 0; c < width; c++) {
        if (cover[r + ',' + c]) continue;
        if (solo >= 0 && c > solo) break;
        var x = row ? row[c] : '', cls = '', val = x, sp = span[r + ',' + c];
        if (c === solo) sp = [1, width - c];
        if (x && typeof x === 'object') { cls = x.s || ''; val = x.v; }
        var txt, isObj = x && typeof x === 'object';
        if (isObj && x.link) txt = '<a href="' + esc(x.link) + '" target="_blank" rel="noopener">' + esc(val) + '</a>';
        else if (cls === 'p' && typeof val === 'number') txt = Math.round(val * 100) + '%';
        else if (typeof val === 'number') { txt = val >= 10000 ? rp(val) : String(val); cls += ' n'; }
        else txt = esc(val == null ? '' : val);
        h += '<td' + (cls ? ' class="' + cls + '"' : '') + (sp ? ' rowspan="' + sp[0] + '" colspan="' + sp[1] + '"' : '') + '>' + txt + '</td>';
      }
      h += '</tr>';
    });
    return h + '</table>';
  }

  function download(from, to, btn) {
    var old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    flush(true).catch(function () { }).then(function () { return api('report', { from: from, to: to }); }).then(function (d) {
      var blob = XLSXW.build(d.sheets);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = d.title.replace(/[\\\/:*?"<>|]/g, '-') + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('File Excel di-download: ' + a.download);
    }).catch(function (e) { toast(isNet(e) ? 'Perlu koneksi internet untuk membuat Excel.' : e.message); })
      .then(function () { btn.disabled = false; btn.innerHTML = old; });
  }

  /* ---------------- lainnya ---------------- */
  function viewMore(v) {
    var b = S.boot || {};
    v.innerHTML = '<h1>Lainnya</h1>' +
      (S.demo ? '<p class="note warn"><b>Mode demo</b> - data fiktif, hanya di perangkat ini. Masuk dengan URL server untuk data asli.</p>' : '') +
      '<div class="card"><div class="kv"><b>Server</b><span style="word-break:break-all">' + esc(S.demo ? 'Demo (lokal)' : S.api) + '</span>' +
      '<b>Versi</b><span>App ' + esc(CORE.VERSION) + ' · server ' + esc(b.version || '-') + '</span>' +
      '<b>Toko</b><span>' + stores().length + ' (' + stores().filter(function (s) { return s.star; }).length + ' Star Reseller)</span></div></div>' +
      '<div class="list">' +
      (b.sheetUrl ? '<a class="item" target="_blank" rel="noopener" href="' + esc(b.sheetUrl) + '"><div class="grow"><div class="t">Buka Google Sheet</div><div class="m">Semua data & tab Star - Visit, Dealer - Visit, Report Visit Week, Price Survey</div></div></a>' : '') +
      (b.folderUrl ? '<a class="item" target="_blank" rel="noopener" href="' + esc(b.folderUrl) + '"><div class="grow"><div class="t">Folder foto di Google Drive</div><div class="m">Tahun / Bulan / Tanggal / Nama toko</div></div></a>' : '') +
      '<button class="item" id="mo-sync"><div class="grow"><div class="t">Muat ulang data toko</div><div class="m">Ambil lagi Channel Map dari Google Sheet</div></div></button>' +
      '<button class="item" id="mo-flush"><div class="grow"><div class="t">Kirim data yang tertunda</div><div class="m">' + S.pending.filter(function (i) { return i.type !== 'draftphoto'; }).length + ' data di antrean</div></div></button>' +
      (S.demo ? '<button class="item" id="mo-reset"><div class="grow"><div class="t">Hapus data demo</div></div></button>' : '') +
      '<button class="item" id="mo-out"><div class="grow"><div class="t" style="color:var(--bad)">Keluar</div><div class="m">PIN diminta lagi saat masuk</div></div></button></div>' +
      '<p class="small muted center" style="margin-top:20px">Visit Report · Amajing Labs</p>';
    $('#mo-sync').onclick = function () { bootstrap(true).then(function () { toast('Data toko diperbarui (' + stores().length + ' toko)'); render(); }).catch(function (e) { toast(e.message); }); };
    $('#mo-flush').onclick = function () { flush(); };
    var rs = $('#mo-reset');
    if (rs) rs.onclick = function () { DEMO.reset(); toast('Data demo dihapus'); logout(); };
    $('#mo-out').onclick = function () {
      var n = S.pending.filter(function (i) { return i.type !== 'draftphoto'; }).length;
      confirmBox(n ? 'Masih ada ' + n + ' data belum terkirim. Tetap keluar? (Data tetap tersimpan di HP ini.)' : 'Keluar dari aplikasi?', 'Keluar').then(function (ok) { if (ok) logout(); });
    };
  }
  function logout() { S.token = ''; lsDel('token'); S.boot = null; lsDel('boot'); S.visits = {}; lsDel('visits'); location.hash = '#login'; render(); }

  /* ---------------- start ---------------- */
  $('#sync').onclick = function () { flush(); };
  refreshPending().then(function () {
    render();
    if (S.token) { bootstrap(false).catch(function () { }); flush(true); }
  });
})();
