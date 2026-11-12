/*
 * 사람별 데이터 저장 (최대 100명)
 *
 * 저장 방식 두 가지:
 *   - 'cookie' (기본) : 사람마다 쿠키 1개(cc_p1 ~ cc_p100) + 목록 쿠키(cc_i)
 *   - 'local'         : localStorage (용량 제한이 사실상 없음)
 *
 * 쿠키는 요청마다 서버로 함께 전송되고 쿠키 1개당 약 4KB 제한이 있으므로,
 * 전체 용량 한도(COOKIE_BUDGET)를 두어 한도를 넘으면 저장을 거부합니다.
 * (한도를 넘겨 헤더가 너무 커지면 사이트 접속 자체가 막힐 수 있습니다.)
 *
 * 데이터 형태: { people:[{id, name, rows:[{memo, start:'YYYY-MM-DD'|'', end}]}], selected:id|0, ref:'YYYY-MM-DD'|'' }
 * (ref = 경력 산정 기준일, 비어 있으면 오늘)
 */
(function (root) {
  'use strict';

  var CC = root.CareerCalc;
  var MAX_PEOPLE = 100, MAX_ROWS = 50;
  var COOKIE_BUDGET = 12000;        // 쿠키 전체 한도(이름+값, 바이트 근사)
  var VALUE_MAX = 3800;             // 쿠키 1개 값 한도
  var MAX_AGE = 34560000;           // 400일 (브라우저 최대 허용치), 저장할 때마다 갱신
  var IDX = 'cc_i', PFX = 'cc_p', REF = 'cc_r';
  var MODE_KEY = 'careerCalc.mode', LS_KEY = 'careerCalc.data.v1';
  var NAME_MAX = 20, MEMO_MAX = 30;

  var written = {};                 // 마지막으로 쓰거나 읽은 쿠키 값

  /* ---------- 인코딩 ---------- */
  function enc(s) {
    return encodeURIComponent(s).replace(/[~*!'()]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  function isoFrom8(s) {
    if (!/^\d{8}$/.test(s || '')) return '';
    var iso = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return CC.isoToSer(iso) == null ? '' : iso;
  }

  function packPerson(p) {
    var rows = p.rows.slice();
    while (rows.length && !rows[rows.length - 1].memo && !rows[rows.length - 1].start && !rows[rows.length - 1].end) rows.pop();
    var out = [enc(p.name)];
    rows.forEach(function (r) {
      out.push(enc(r.memo || '') + '*' + (r.start || '').replace(/-/g, '') + '*' + (r.end || '').replace(/-/g, ''));
    });
    return out.join('~');
  }

  function unpackPerson(id, val) {
    var parts = String(val).split('~');
    var rows = [];
    for (var k = 1; k < parts.length && rows.length < MAX_ROWS; k++) {
      var f = parts[k].split('*');
      rows.push({ memo: dec(f[0] || '').slice(0, MEMO_MAX), start: isoFrom8(f[1]), end: isoFrom8(f[2]) });
    }
    return { id: id, name: dec(parts[0] || '').slice(0, NAME_MAX) || '(이름 없음)', rows: rows };
  }

  /* ---------- 쿠키 입출력 ---------- */
  function readCookies() {
    var m = {};
    (document.cookie || '').split(';').forEach(function (s) {
      var i = s.indexOf('=');
      if (i < 0) return;
      var k = s.slice(0, i).trim();
      if (k.indexOf('cc_') === 0) m[k] = s.slice(i + 1).trim();
    });
    return m;
  }
  function attrs() {
    return '; path=/; SameSite=Lax' + (root.location && root.location.protocol === 'https:' ? '; Secure' : '');
  }
  function setCookie(name, val) { document.cookie = name + '=' + val + attrs() + '; max-age=' + MAX_AGE; }
  function delCookie(name) { document.cookie = name + '=' + attrs() + '; max-age=0'; }

  function cookiesWork() {
    try {
      if (root.navigator && root.navigator.cookieEnabled === false) return false;
      setCookie('cc_t', '1');
      var ok = readCookies().cc_t === '1';
      delCookie('cc_t');
      return ok;
    } catch (e) { return false; }
  }
  function lsWork() {
    try { var k = '__cc_t'; root.localStorage.setItem(k, '1'); root.localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  }

  function cookieMap(state) {
    var map = {};
    map[IDX] = (state.selected || 0) + '~' + state.people.map(function (p) { return p.id; }).join('.');
    if (state.ref) map[REF] = state.ref.replace(/-/g, '');
    state.people.forEach(function (p) { map[PFX + p.id] = packPerson(p); });
    return map;
  }
  function mapSize(map) {
    var t = 0;
    Object.keys(map).forEach(function (k) { t += k.length + 1 + map[k].length; });
    return t;
  }

  /* ---------- 백엔드 ---------- */
  var cookieBackend = {
    load: function () {
      var c = readCookies();
      written = {};
      Object.keys(c).forEach(function (k) { written[k] = c[k]; });
      var idx = c[IDX];
      var state = { people: [], selected: 0, ref: isoFrom8(c[REF]) };
      if (!idx) return state;
      var sp = idx.split('~');
      var sel = parseInt(sp[0], 10) || 0;
      var ids = (sp[1] || '').split('.');
      var seen = {};
      ids.forEach(function (s) {
        var id = parseInt(s, 10);
        if (!id || id < 1 || id > MAX_PEOPLE || seen[id] || c[PFX + id] == null) return;
        if (state.people.length >= MAX_PEOPLE) return;
        seen[id] = true;
        state.people.push(unpackPerson(id, c[PFX + id]));
      });
      state.selected = seen[sel] ? sel : 0;
      return state;
    },
    save: function (state) {
      var map = cookieMap(state);
      var big = null;
      Object.keys(map).forEach(function (k) { if (!big && map[k].length > VALUE_MAX) big = k; });
      if (big) {
        var pid = parseInt(big.replace(PFX, ''), 10);
        var who = state.people.filter(function (p) { return p.id === pid; })[0];
        return { ok: false, reason: 'too-big', who: who ? who.name : '' };
      }
      var total = mapSize(map);
      if (total > COOKIE_BUDGET) return { ok: false, reason: 'budget', total: total };
      Object.keys(map).forEach(function (k) {
        if (written[k] !== map[k]) { setCookie(k, map[k]); written[k] = map[k]; }
      });
      Object.keys(written).forEach(function (k) {
        if (!(k in map)) { delCookie(k); delete written[k]; }
      });
      var back = readCookies();
      for (var k in map) {
        if (back[k] !== map[k]) return { ok: false, reason: 'rejected' };
      }
      return { ok: true, total: total };
    },
    clear: function () {
      var c = readCookies();
      Object.keys(c).forEach(function (k) { delCookie(k); });
      written = {};
    }
  };

  var localBackend = {
    load: function () {
      try {
        var d = JSON.parse(root.localStorage.getItem(LS_KEY) || 'null');
        if (!d || !Array.isArray(d.people)) return { people: [], selected: 0, ref: '' };
        var seen = {}, people = [];
        d.people.forEach(function (p) {
          if (!p || !p.id || seen[p.id] || people.length >= MAX_PEOPLE) return;
          seen[p.id] = true;
          people.push({
            id: p.id,
            name: String(p.name || '(이름 없음)').slice(0, NAME_MAX),
            rows: (Array.isArray(p.rows) ? p.rows : []).slice(0, MAX_ROWS).map(function (r) {
              return {
                memo: String((r && r.memo) || '').slice(0, MEMO_MAX),
                start: CC.isoToSer(r && r.start) == null ? '' : r.start,
                end: CC.isoToSer(r && r.end) == null ? '' : r.end
              };
            })
          });
        });
        return { people: people, selected: seen[d.selected] ? d.selected : 0, ref: CC.isoToSer(d.ref) == null ? '' : d.ref };
      } catch (e) { return { people: [], selected: 0, ref: '' }; }
    },
    save: function (state) {
      try {
        var slim = {
          selected: state.selected || 0,
          ref: state.ref || '',
          people: state.people.map(function (p) {
            return { id: p.id, name: p.name, rows: p.rows.map(function (r) { return { memo: r.memo || '', start: r.start || '', end: r.end || '' }; }) };
          })
        };
        root.localStorage.setItem(LS_KEY, JSON.stringify(slim));
        return { ok: true };
      } catch (e) { return { ok: false, reason: 'unavailable' }; }
    },
    clear: function () { try { root.localStorage.removeItem(LS_KEY); } catch (e) { /* noop */ } }
  };

  var backends = { cookie: cookieBackend, local: localBackend };

  /* ---------- 공개 API ---------- */
  function getMode() {
    try { var m = root.localStorage.getItem(MODE_KEY); if (m === 'cookie' || m === 'local') return m; } catch (e) { /* noop */ }
    return null;
  }
  function setMode(m) { try { root.localStorage.setItem(MODE_KEY, m); } catch (e) { /* noop */ } }

  function init() {
    var mode = getMode(), notice = '';
    var cookieOk = cookiesWork(), lsOk = lsWork();
    if (!mode) mode = 'cookie';
    if (mode === 'cookie' && !cookieOk) {
      if (lsOk) { mode = 'local'; notice = '이 환경에서는 쿠키를 사용할 수 없어 브라우저 저장소로 저장합니다. (파일을 직접 열었거나 쿠키를 차단한 경우입니다)'; }
      else notice = '쿠키와 브라우저 저장소를 모두 사용할 수 없어 저장되지 않습니다. 백업 내보내기를 이용하세요.';
    }
    if (mode === 'local' && !lsOk) {
      if (cookieOk) { mode = 'cookie'; notice = '브라우저 저장소를 사용할 수 없어 쿠키로 저장합니다.'; }
    }
    return { mode: mode, state: backends[mode].load(), notice: notice };
  }

  function save(mode, state) { return backends[mode].save(state); }

  function switchMode(from, to, state) {
    if (from === to) return { ok: true };
    var res = backends[to].save(state);
    if (!res.ok) return res;
    backends[from].clear();
    setMode(to);
    return { ok: true };
  }

  function wipeAll() { cookieBackend.clear(); localBackend.clear(); try { root.localStorage.removeItem(MODE_KEY); } catch (e) { /* noop */ } }

  function measure(state) { return { used: mapSize(cookieMap(state)), budget: COOKIE_BUDGET }; }

  function nextId(people) {
    var used = {};
    people.forEach(function (p) { used[p.id] = true; });
    for (var i = 1; i <= MAX_PEOPLE; i++) if (!used[i]) return i;
    return 0;
  }

  root.CareerStorage = {
    MAX_PEOPLE: MAX_PEOPLE, MAX_ROWS: MAX_ROWS, NAME_MAX: NAME_MAX, MEMO_MAX: MEMO_MAX,
    init: init, save: save, switchMode: switchMode, wipeAll: wipeAll, measure: measure, nextId: nextId,
    _pack: packPerson, _unpack: unpackPerson
  };
})(typeof self !== 'undefined' ? self : this);
