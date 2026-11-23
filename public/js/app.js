(function () {
  'use strict';

  var CC = window.CareerCalc, ST = window.CareerStorage, PC = window.PdfCareer;
  var MAX_PEOPLE = ST.MAX_PEOPLE, MAX_ROWS = ST.MAX_ROWS;
  var START_ROWS = 5;

  function $(s) { return document.querySelector(s); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      if (Array.isArray(c)) { c.forEach(function (d) { if (d != null) el.appendChild(typeof d === 'string' ? document.createTextNode(d) : d); }); continue; }
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  /* ---------- 상태 ---------- */
  var boot = ST.init();
  var store = { mode: boot.mode, people: boot.state.people, selected: boot.state.selected, ref: boot.state.ref || '' };
  var search = '';
  var saveTimer = null, dirty = false;

  function blankRow() { return { memo: '', start: '', end: '' }; }
  function blankRows(n) { var a = []; for (var i = 0; i < n; i++) a.push(blankRow()); return a; }
  function ensureRows(p) { while (p.rows.length < START_ROWS) p.rows.push(blankRow()); }
  store.people.forEach(ensureRows);

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function effRef() { return store.ref || todayIso(); }
  function snapshot() { return { people: store.people, selected: store.selected || 0, ref: store.ref }; }

  function current() {
    for (var i = 0; i < store.people.length; i++) if (store.people[i].id === store.selected) return store.people[i];
    return null;
  }

  /* ---------- 분석 ---------- */
  function analyze(p) {
    var refSer = CC.isoToSer(effRef());
    var info = p.rows.map(function (r) {
      var s = CC.isoToSer(r.start), e = CC.isoToSer(r.end), usedRef = false;
      if (!(r.start || r.end || r.sRaw || r.eRaw)) return { kind: 'empty' };
      if (r.off) return { kind: 'off' };
      if (r.sBad || r.eBad) {
        return { kind: 'bad', msg: [r.sBad && '시작일', r.eBad && '종료일'].filter(Boolean).join('·') + ' 형식을 확인하세요' };
      }
      // 종료일을 비워 둔 경력은 기준일까지 계산
      if (s != null && e == null && !r.end && !r.eRaw && refSer != null) { e = refSer; usedRef = true; }
      if (s == null || e == null) return { kind: 'partial', msg: s == null ? '시작일을 입력하세요' : '종료일을 입력하세요' };
      if (e < s) return { kind: 'reversed', msg: usedRef ? '시작일이 기준일보다 늦습니다 (계산 제외)' : '종료일이 시작일보다 빠릅니다 (계산 제외)' };
      return { kind: 'ok', s: s, e: e, dur: CC.diff(s, e), usedRef: usedRef };
    });
    var overlaps = CC.findOverlaps(info.map(function (x) { return x.kind === 'ok' ? { s: x.s, e: x.e } : null; }));
    overlaps.forEach(function (o) {
      (info[o.i].ov = info[o.i].ov || []).push(o.j);
      (info[o.j].ov = info[o.j].ov || []).push(o.i);
    });
    var oks = info.filter(function (x) { return x.kind === 'ok'; });
    var merged = CC.union(oks);
    return {
      rows: info, overlaps: overlaps, okCount: oks.length,
      total: CC.sum(oks.map(function (x) { return x.dur; })),
      uniqTotal: CC.sum(merged.map(function (m) { return CC.diff(m.s, m.e); })),
      uniqCount: merged.length
    };
  }

  /* ---------- 저장 ---------- */
  function setSaveState(kind) {
    var el = $('#saveState');
    el.className = 'save-state ' + kind;
    el.textContent = { saving: '저장 중…', saved: '✓ 자동 저장됨', failed: '⚠ 저장되지 않음', none: '' }[kind] || '';
  }
  function showBanner(msg) {
    var b = $('#banner');
    if (!msg) { b.hidden = true; b.textContent = ''; return; }
    b.textContent = msg; b.hidden = false;
  }
  function scheduleSave() {
    dirty = true; setSaveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 300);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    var res = ST.save(store.mode, snapshot());
    if (res.ok) { setSaveState('saved'); showBanner(''); }
    else {
      setSaveState('failed');
      showBanner(failMessage(res));
    }
    renderMeter();
  }
  function failMessage(res) {
    if (res.reason === 'budget') return '쿠키 용량 한도(약 12KB)를 넘어 저장하지 못했습니다. 아래 ‘저장 방식’을 ‘브라우저 저장소’로 바꾸거나, 쓰지 않는 사람을 삭제해 주세요. (지금 입력한 내용은 화면에만 남아 있습니다)';
    if (res.reason === 'too-big') return '‘' + res.who + '’ 한 사람의 데이터가 쿠키 1개의 한도(약 4KB)를 넘어 저장하지 못했습니다. 내용 글자 수를 줄이거나 ‘브라우저 저장소’ 방식으로 바꿔 주세요.';
    if (res.reason === 'rejected') return '브라우저가 쿠키 저장을 거부했습니다. 쿠키 차단 설정을 확인하거나 ‘브라우저 저장소’ 방식으로 바꿔 주세요.';
    return '저장할 수 없습니다. 백업(내보내기)으로 내용을 보관해 주세요.';
  }
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(); });

  /* ---------- 사람 목록 ---------- */
  /* ---------- 표창 검정 ---------- */
  var AWARD_KEY = 'careerCalc.award';
  var award = { base: '', from: '', to: '' };
  try { var _a = JSON.parse(root_ls().getItem(AWARD_KEY) || '{}'); if (_a.merit && !_a.from) _a.from = _a.merit; ['base', 'from', 'to'].forEach(function (k) { if (CC.isoToSer(_a[k]) != null) award[k] = _a[k]; }); } catch (e) { /* noop */ }
  function root_ls() { return window.localStorage; }
  function saveAward() { try { root_ls().setItem(AWARD_KEY, JSON.stringify(award)); } catch (e) { /* noop */ } }

  /** 검정 조건이 갖춰졌는지: 표창 기준일 + 유공기간 시작일 필요(종료일은 비우면 기준일) */
  function awardPeriod() {
    var bs = CC.isoToSer(award.base), fs = CC.isoToSer(award.from), ts = award.to ? CC.isoToSer(award.to) : bs;
    if (bs == null || fs == null || ts == null) return null;
    return { base: bs, from: fs, to: ts, bad: ts < fs };
  }
  /** 사람 1명의 표창 가능 여부: null(미입력) | {status:'ok'|'no'|'unknown'|'bad', reasons:[…]} */
  function awardCheck(p) {
    var ap = awardPeriod();
    if (!ap) return null;
    if (ap.bad) return { status: 'bad', reasons: [] };
    var recs = p.doc && p.doc.recs ? p.doc.recs : null;
    if (!recs || !recs.length) return { status: 'unknown', reasons: [] };
    var ref = CC.isoToSer(effRef()), reasons = [];
    recs.forEach(function (r) {
      if (r.x || (r.k !== 'L' && r.k !== 'D')) return;
      var s = CC.isoToSer(r.s), e = r.e ? CC.isoToSer(r.e) : ref;
      if (s == null || e == null) return;
      var lab = r.k === 'L' ? '휴직 등' : '파견';
      var os = Math.max(s, ap.from), oe = Math.min(e, ap.to);
      if (os <= oe) reasons.push({ label: '유공기간 중 ' + lab, s: os, e: oe });
      if (s <= ap.base && ap.base <= e) reasons.push({ label: '기준일 당시 ' + lab, s: ap.base, e: ap.base });
    });
    reasons.sort(function (a, b) { return a.s - b.s; });
    return { status: reasons.length ? 'no' : 'ok', reasons: reasons };
  }
  function awardText(res) {
    return res.reasons.map(function (g) { return g.label + ' ' + CC.fmtSer(g.s) + '~' + CC.fmtSer(g.e); }).join(' / ');
  }
  /** 이름 옆 작은 표시 (small=true: 보관함용) */
  function awardBadge(p, small) {
    var res = awardCheck(p);
    if (!res || res.status === 'bad') return null;
    var map = { ok: ['✓ 표창가능', 'ok'], no: ['✕ 표창불가', 'no'], unknown: ['? 확인불가', 'unk'] };
    var m = map[res.status];
    return h('span', { class: 'badge ' + m[1], text: m[0], title: res.status === 'no' ? awardText(res) : (res.status === 'unknown' ? '인사기록 PDF가 없어 확인할 수 없습니다' : '해당 기간에 휴직·파견 없음') });
  }
  function setTitleBadge(p) {
    var el = $('#personAward'), b = awardBadge(p);
    el.hidden = !b;
    if (b) { el.className = b.className; el.textContent = b.textContent; el.title = b.title; }
  }
  function renderAward() {
    var sum = $('#awardSum'), ul = $('#awardList');
    ul.textContent = '';
    var ap = awardPeriod();
    var chip = $('#awardChip'); chip.textContent = ''; chip.className = 'award-chip';
    sum.className = 'award-sum muted small';
    if (!ap) { sum.textContent = '표창 기준일과 유공기간 시작일을 입력하면 판정합니다.'; return; }
    if (ap.bad) { sum.className = 'award-sum bad small'; sum.textContent = '유공기간 종료일이 시작일보다 빠릅니다. 날짜를 확인하세요.'; return; }
    sum.className = 'award-sum';
    var cnt = { ok: 0, no: 0, unknown: 0 };
    store.people.forEach(function (p) {
      var res = awardCheck(p); cnt[res.status]++;
      var label = { ok: '✓ 표창가능', no: '✕ 표창불가', unknown: '? 확인불가(PDF 없음)' }[res.status];
      ul.appendChild(h('li', null, h('button', { type: 'button', class: 'award-item', 'data-id': p.id },
        h('span', { class: 'p-name', text: p.name }),
        h('span', { class: 'badge ' + ({ ok: 'ok', no: 'no', unknown: 'unk' }[res.status]), text: label }),
        h('span', { class: 'muted small', text: res.status === 'no' ? awardText(res) : '' }))));
    });
    chip.textContent = '불가 ' + cnt.no + ' · 가능 ' + cnt.ok + (cnt.unknown ? ' · 확인불가 ' + cnt.unknown : '');
    chip.className = 'award-chip on' + (cnt.no ? ' has-no' : '');
    sum.textContent = '기준일 ' + CC.fmtIso(award.base) + ' · 유공기간 ' + CC.fmtSer(ap.from) + '~' + CC.fmtSer(ap.to) + ' · 표창가능 ' + cnt.ok + '명 · 표창불가 ' + cnt.no + '명 · 확인불가 ' + cnt.unknown + '명';
  }
  $('#awardToggle').addEventListener('click', function () {
    var box = $('#awardBox'), open = box.hidden;
    box.hidden = !open; this.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.classList.toggle('open', open);
    if (open) $('#awardBase').focus();
  });
  function awardRefresh() { renderPeople(); var p = current(); if (p) setTitleBadge(p); }
  [['#awardBase', 'base'], ['#awardFrom', 'from'], ['#awardTo', 'to']].forEach(function (d) {
    var el = $(d[0]);
    if (award[d[1]]) el.value = CC.fmtIso(award[d[1]]);
    el.addEventListener('input', function () {
      var t = el.value.trim(), iso = CC.parseDate(t);
      if (!t) { award[d[1]] = ''; el.classList.remove('invalid'); saveAward(); awardRefresh(); }
      else if (iso) { award[d[1]] = iso; el.classList.remove('invalid'); saveAward(); awardRefresh(); }
    });
    el.addEventListener('blur', function () {
      var t = el.value.trim(), iso = CC.parseDate(t);
      if (!t) { el.classList.remove('invalid'); return; }
      if (iso) { el.value = CC.fmtIso(iso); el.classList.remove('invalid'); } else { el.classList.add('invalid'); toast('날짜 형식을 확인하세요. 예: 2026-8-31, 26/8/31'); }
    });
  });
  $('#groupChk').addEventListener('change', function (e) {
    var p = current();
    var want = e.target.checked;
    if (!p || !p.doc) { groupRows = want; return; }
    var prev = buildRowsFromRecs(p.doc.recs, groupRows);
    if (!sameRows(prev, p.rows) && !confirm('입력창을 직접 고친 내용이 있습니다.\n' + (want ? '묶어서' : '원본 그대로') + ' 다시 채우면 그 내용이 사라집니다. 계속할까요?')) { e.target.checked = !want; return; }
    groupRows = want;
    try { window.localStorage.setItem(GROUP_KEY, want ? '1' : '0'); } catch (err) { /* noop */ }
    p.rows = buildRowsFromRecs(p.doc.recs, groupRows); ensureRows(p);
    renderRows(); updateResults(); scheduleSave();
    toast(want ? '카테고리별로 묶어 다시 채웠습니다.' : '원본 행 그대로 다시 채웠습니다.');
  });
  $('#rowsFold').addEventListener('toggle', function () { var p = current(); if (p) updateResults(); });
  $('#awardClear').addEventListener('click', function () {
    award.base = ''; award.from = ''; award.to = ''; $('#awardBase').value = ''; $('#awardFrom').value = ''; $('#awardTo').value = ''; saveAward(); awardRefresh();
  });
  $('#awardList').addEventListener('click', function (e) {
    var b = e.target.closest('.award-item'); if (b) selectPerson(+b.dataset.id);
  });

  function renderPeople() {
    var ul = $('#peopleList');
    ul.textContent = '';
    $('#peopleCount').textContent = store.people.length + ' / ' + MAX_PEOPLE;
    $('#peopleSearch').hidden = store.people.length < 8;
    $('#btnPdfNew').hidden = !store.people.length;
    $('#btnBlank').hidden = !store.people.length;
    $('#btnBlank').disabled = !current();
    var q = search.trim().toLowerCase();
    var list = store.people.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; });
    list.forEach(function (p) {
      var a = analyze(p);
      var meta = a.okCount ? '중복 제외 ' + fmtTotal(a.uniqTotal) : '입력 없음';
      var btn = h('button', { type: 'button', class: 'person', 'data-id': p.id, 'aria-current': p.id === store.selected ? 'true' : null },
        h('span', { class: 'p-name' }, p.name, awardBadge(p, true)),
        h('span', { class: 'p-meta' + (a.overlaps.length ? ' warn' : ''), text: (a.overlaps.length ? '⚠ ' : '') + meta }),
        a.okCount ? h('span', { class: 'p-meta p-recog', text: '인정 경력 ' + fmtRecog(CC.recognize(a.uniqTotal)) }) : null);
      ul.appendChild(h('li', null, btn));
    });
    renderAward();
    if (!list.length) ul.appendChild(h('li', { class: 'p-empty', text: store.people.length ? '검색 결과가 없습니다' : '아직 추가한 사람이 없습니다' }));
  }

  function selectPerson(id) {
    store.selected = id;
    setDocMsg('');
    scheduleSave();
    renderAll();
  }

  /* ---------- 행 표 ---------- */
  function buildRow(r, i) {
    var tr = h('tr', { 'data-i': i });
    var startIn = h('input', { type: 'text', class: 'f-start', inputmode: 'numeric', autocomplete: 'off', placeholder: '2026. 3. 1.', 'aria-label': (i + 1) + '번 시작일', value: r.start ? CC.fmtIso(r.start) : (r.sRaw || '') });
    var endIn = h('input', { type: 'text', class: 'f-end', inputmode: 'numeric', autocomplete: 'off', placeholder: '기준일까지', 'aria-label': (i + 1) + '번 종료일 (비우면 기준일까지)', value: r.end ? CC.fmtIso(r.end) : (r.eRaw || '') });
    if (r.sBad) startIn.classList.add('invalid');
    if (r.eBad) endIn.classList.add('invalid');
    function dateCell(input, which) {
      return h('td', { class: 'c-date' },
        h('div', { class: 'date-box' }, input,
          h('button', { type: 'button', class: 'cal', 'data-which': which, 'aria-label': (which === 's' ? '시작일' : '종료일') + ' 달력 열기', tabindex: '-1', text: '📅' }),
          h('input', { type: 'date', class: 'picker', 'data-which': which, tabindex: '-1', 'aria-hidden': 'true', min: '1900-01-01', max: '2200-12-31' })),
        h('div', { class: 'hint', 'data-hint': which }));
    }
    tr.appendChild(h('td', { class: 'c-use' }, h('input', { type: 'checkbox', class: 'f-use', checked: r.off ? null : true, 'aria-label': (i + 1) + '번 경력에 포함', title: '체크 해제하면 이 줄은 경력 계산에서 빠집니다' })));
    tr.appendChild(h('td', { class: 'c-no', text: String(i + 1) }));
    tr.appendChild(h('td', { class: 'c-memo' }, h('input', { type: 'text', class: 'f-memo', maxlength: ST.MEMO_MAX, placeholder: '예: ○○초', 'aria-label': (i + 1) + '번 내용', value: r.memo || '' }),
      r.dept ? h('div', { class: 'dept', title: '부서: ' + r.dept, text: r.dept }) : null));
    tr.appendChild(dateCell(startIn, 's'));
    tr.appendChild(dateCell(endIn, 'e'));
    ['y', 'm', 'd'].forEach(function (k) { tr.appendChild(h('td', { class: 'c-n res-' + k, text: '' })); });
    tr.appendChild(h('td', { class: 'c-st' }));
    tr.appendChild(h('td', { class: 'c-del' }, h('button', { type: 'button', class: 'del', 'aria-label': (i + 1) + '번 행 삭제', text: '×' })));
    return tr;
  }

  function renderRows() {
    var p = current(), body = $('#rowsBody');
    body.textContent = '';
    p.rows.forEach(function (r, i) { body.appendChild(buildRow(r, i)); });
    $('#btnAddRow').disabled = p.rows.length >= MAX_ROWS;
  }

  function updateResults() {
    var p = current();
    if (!p) return;
    var hasDoc = !!(p.doc && p.doc.recs && p.doc.recs.length);
    $('#catBar').hidden = !hasDoc; $('#groupChk').checked = groupRows;
    setTitleBadge(p);
    $('#rowsSummary').textContent = '경력 입력창 · ' + p.rows.filter(function (r) { return r.start || r.end; }).length + '건 입력됨' + (p.rows.some(function (r) { return r.off && (r.start || r.end); }) ? ' (제외 ' + p.rows.filter(function (r) { return r.off && (r.start || r.end); }).length + '건)' : '') + ($('#rowsFold').open ? '' : ' (펼쳐서 보기·수정)');
    var a = analyze(p);
    var trs = $('#rowsBody').children;

    p.rows.forEach(function (r, i) {
      var tr = trs[i], x = a.rows[i];
      if (!tr) return;
      var ok = x.kind === 'ok';
      tr.querySelector('.res-y').textContent = ok ? x.dur.years : '';
      tr.querySelector('.res-m').textContent = ok ? x.dur.months : '';
      tr.querySelector('.res-d').textContent = ok ? x.dur.days : '';
      var st = tr.querySelector('.c-st');
      st.textContent = '';
      tr.setAttribute('data-cat', catOf(r.memo));
      tr.classList.toggle('row-off', !!r.off);
      tr.classList.toggle('row-warn', !!(x.ov && x.ov.length));
      tr.classList.toggle('row-bad', x.kind === 'bad' || x.kind === 'reversed');
      if (x.ov && x.ov.length) {
        var ovTxt = x.ov.map(function (j) { return (j + 1) + '번'; }).join('·') + '과 중복';
        st.appendChild(h('span', { class: 'chip warn', title: ovTxt, text: x.ov.length <= 2 ? '⚠ ' + ovTxt : '⚠ ' + x.ov.length + '건 중복' }));
      } else if (x.kind === 'bad' || x.kind === 'reversed') {
        st.appendChild(h('span', { class: 'chip bad', text: x.msg }));
      } else if (x.kind === 'off') {
        st.appendChild(h('span', { class: 'chip soft', text: '제외됨' }));
      } else if (x.kind === 'partial') {
        st.appendChild(h('span', { class: 'chip soft', text: x.msg }));
      } else if (ok) {
        st.appendChild(h('span', { class: 'chip ok', text: x.usedRef ? '✓ 기준일까지' : '✓' }));
      }
      ['s', 'e'].forEach(function (w) {
        var iso = w === 's' ? r.start : r.end, hint = tr.querySelector('[data-hint="' + w + '"]');
        var txt = '';
        if (iso) {
          var ser = CC.isoToSer(iso), y = +iso.slice(0, 4), m = +iso.slice(5, 7);
          if (ser != null && m === 2) txt = '2월 말일: ' + CC.lastDayOfMonth(y, 2) + '일' + (CC.lastDayOfMonth(y, 2) === 29 ? ' (윤년)' : '');
        }
        if (w === 'e' && x.usedRef) txt = '→ ' + CC.fmtSer(x.e) + ' (기준일)까지 계산';
        hint.textContent = txt;
      });
    });

    renderWarnings(p, a);
    renderTotal(p, a);
    renderDoc(p, a);
    renderPeople();
  }

  function renderWarnings(p, a) {
    var box = $('#warnBody');
    box.textContent = '';
    if (!a.okCount) {
      box.appendChild(h('p', { class: 'muted', text: '시작일과 종료일을 입력하면 겹치는 기간을 자동으로 찾아 알려 드립니다.' }));
      return;
    }
    if (!a.overlaps.length) {
      box.appendChild(h('p', { class: 'ok-line', text: '✓ 중복된 기간이 없습니다.' }));
      return;
    }
    var SHOW = 6;
    function item(o) {
      return h('li', null,
        h('span', { class: 'tag', text: (o.i + 1) + '번 ↔ ' + (o.j + 1) + '번' }),
        h('span', { class: 'warn-text', text: '경고) ' + CC.fmtSer(o.s) + '~' + CC.fmtSer(o.e) + ' (' + CC.fmtDur(o.dur) + ' 중복)' }));
    }
    var ul = h('ul', { class: 'warn-list' });
    a.overlaps.slice(0, SHOW).forEach(function (o) { ul.appendChild(item(o)); });
    box.appendChild(ul);
    if (a.overlaps.length > SHOW) {
      var more = h('ul', { class: 'warn-list' });
      a.overlaps.slice(SHOW).forEach(function (o) { more.appendChild(item(o)); });
      box.appendChild(h('details', { class: 'warn-more' }, h('summary', { text: '나머지 ' + (a.overlaps.length - SHOW) + '건 더 보기' }), more));
    }
    box.appendChild(h('p', { class: 'muted small', text: '‘중복 경력 포함’ 합산에는 겹친 기간이 그대로 들어가고, ‘중복 경력 제외’ 합산에서는 겹친 기간을 한 번만 셉니다. 종료일과 다음 시작일이 같은 날이면 그 하루가 중복으로 표시됩니다.' }));
  }

  function fmtTotal(t) { return t.years + '년 ' + t.months + '개월 ' + t.days + '일'; }
  /** 학교폭력 경력(한시적): 1년 2개월 → 1년, 연 단위로 버림 */
  function violenceRecog(t) { return t.years + '년'; }
  function fmtRecog(r) { return r.years + '년 ' + r.months + '개월'; }

  function renderActual(p, a) {
    var box = $('#actualBox'), z = actualFrom(p, a);
    box.hidden = !(z.hasEx && a.okCount);
    if (box.hidden) return;
    $('#actualValue').textContent = fmtTotal(z.actual.sum);
    $('#actualRecog').textContent = fmtRecog(z.actual.rec);
  }
  function renderTotal(p, a) {
    renderActual(p, a);
    var ex = $('#totalExplain');
    var hasDoc = !!(p.doc && p.doc.recs && p.doc.recs.length);
    $('#totalHelp').hidden = !hasDoc;
    ex.textContent = hasDoc ? '합계는 입력창 기준입니다. PDF로 채운 입력창은 휴직 기간을 뺀 구간이라 위 PDF 카드의 총경력과 같은 값이며, 군 경력은 ‘군 경력 추가’ 체크와 별개로 아래 보라색 칸에 따로 표시됩니다.' : '';
    var v = $('#totalValue'), note = $('#totalNote'), u = $('#totalUniq'), un = $('#totalUniqNote');
    var rv = $('#totalRecog'), rn = $('#totalRecogNote');
    if (!a.okCount) {
      v.textContent = '—'; u.textContent = '—'; rv.textContent = '—';
      note.textContent = '계산할 기간이 없습니다'; un.textContent = ''; rn.textContent = '';
      return;
    }
    v.textContent = fmtTotal(a.total);
    u.textContent = fmtTotal(a.uniqTotal);
    var excluded = a.rows.filter(function (x) { return x.kind === 'bad' || x.kind === 'reversed'; }).length;
    var parts = [a.okCount + '건을 그대로 합산'];
    if (a.overlaps.length) parts.push('중복 ' + a.overlaps.length + '건 포함');
    if (excluded) parts.push('오류 ' + excluded + '건 제외');
    note.textContent = parts.join(' · ');
    var rec = CC.recognize(a.uniqTotal);
    rv.textContent = fmtRecog(rec);
    rn.textContent = '중복 제외 ' + fmtTotal(a.uniqTotal) + ' → ' + (a.uniqTotal.days >= 15 ? '일수 15일 이상이라 1개월 올림' : '일수 15일 미만이라 버림');
    un.textContent = a.overlaps.length
      ? '겹친 기간을 한 번만 계산 (' + a.uniqCount + '개 기간으로 정리)'
      : '중복이 없어 위 합산과 같습니다';
  }

  function renderEditor() {
    var p = current();
    $('#empty').hidden = !!p;
    $('#editor').hidden = !p;
    if (!p) return;
    $('#personTitle').textContent = p.name;
    setTitleBadge(p);
    $('#personSub').textContent = '경력 입력 · 최대 ' + MAX_ROWS + '행';
    renderRows();
    $('#rowsFold').open = !(p.doc && p.rows.length > 10);
    updateResults();
  }

  function renderAll() { renderPeople(); renderEditor(); renderMeter(); }

  /* ---------- 입력 처리 ---------- */
  function afterEdit() { updateResults(); scheduleSave(); }

  function setDate(r, which, iso, raw, bad) {
    if (which === 's') { r.start = iso; r.sRaw = raw; r.sBad = bad; }
    else { r.end = iso; r.eRaw = raw; r.eBad = bad; }
  }

  var body = $('#rowsBody');

  body.addEventListener('input', function (e) {
    var t = e.target, tr = t.closest('tr'), p = current();
    if (!tr || !p) return;
    var r = p.rows[+tr.dataset.i];
    if (t.classList.contains('f-memo')) { r.memo = t.value; }
    else if (t.classList.contains('f-start') || t.classList.contains('f-end')) {
      var w = t.classList.contains('f-start') ? 's' : 'e';
      var txt = t.value.trim(), iso = CC.parseDate(txt);
      setDate(r, w, iso || '', iso ? '' : txt, false);
      t.classList.remove('invalid');
    } else if (t.classList.contains('picker')) {
      var w2 = t.dataset.which;
      if (!t.value) return;
      setDate(r, w2, t.value, '', false);
      var ti = tr.querySelector(w2 === 's' ? '.f-start' : '.f-end');
      ti.value = CC.fmtIso(t.value); ti.classList.remove('invalid');
    } else return;
    afterEdit();
  });

  // 날짜 입력칸을 벗어날 때 형식 정리·검사
  body.addEventListener('focusout', function (e) {
    var t = e.target, tr = t.closest('tr'), p = current();
    if (!tr || !p) return;
    if (!(t.classList.contains('f-start') || t.classList.contains('f-end'))) return;
    var r = p.rows[+tr.dataset.i], w = t.classList.contains('f-start') ? 's' : 'e';
    var txt = t.value.trim(), iso = CC.parseDate(txt);
    if (!txt) { setDate(r, w, '', '', false); t.classList.remove('invalid'); }
    else if (iso) { setDate(r, w, iso, '', false); t.value = CC.fmtIso(iso); t.classList.remove('invalid'); }
    else { setDate(r, w, '', txt, true); t.classList.add('invalid'); }
    updateResults();
  });

  body.addEventListener('click', function (e) {
    var t = e.target, tr = t.closest('tr'), p = current();
    if (!tr || !p) return;
    var i = +tr.dataset.i;
    if (t.classList.contains('del')) {
      p.rows.splice(i, 1);
      if (!p.rows.length) p.rows.push(blankRow());
      renderRows(); updateResults(); scheduleSave();
    } else if (t.classList.contains('cal')) {
      var pk = tr.querySelector('.picker[data-which="' + t.dataset.which + '"]');
      var iso = p.rows[i][t.dataset.which === 's' ? 'start' : 'end'];
      pk.value = iso || '';
      try { if (pk.showPicker) pk.showPicker(); else pk.focus(); } catch (err) { pk.focus(); }
    }
  });

  body.addEventListener('change', function (e) {
    var t = e.target, tr = t.closest('tr'), p = current();
    if (!tr || !p || !t.classList.contains('f-use')) return;
    var r = p.rows[+tr.dataset.i];
    r.off = t.checked ? 0 : 1;
    updateResults(); scheduleSave();
  });

  // Enter: 같은 열의 다음 줄로 (마지막 줄이면 행 추가)
  body.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    var t = e.target, tr = t.closest('tr'), p = current();
    if (!tr || !p) return;
    var cls = ['f-memo', 'f-start', 'f-end'].filter(function (c) { return t.classList.contains(c); })[0];
    if (!cls) return;
    e.preventDefault();
    var i = +tr.dataset.i;
    t.blur();
    if (i + 1 >= p.rows.length) {
      if (p.rows.length >= MAX_ROWS) return;
      addRow(false);
    }
    var next = $('#rowsBody').children[i + 1];
    if (next) next.querySelector('.' + cls).focus();
  });

  function addRow(focus) {
    var p = current();
    if (!p || p.rows.length >= MAX_ROWS) return;
    p.rows.push(blankRow());
    $('#rowsBody').appendChild(buildRow(p.rows[p.rows.length - 1], p.rows.length - 1));
    $('#btnAddRow').disabled = p.rows.length >= MAX_ROWS;
    if (focus) $('#rowsBody').lastChild.querySelector('.f-memo').focus();
    updateResults();
  }
  $('#btnAddRow').addEventListener('click', function () { addRow(true); });

  $('#btnClearRows').addEventListener('click', function () {
    var p = current();
    if (!p || !confirm('‘' + p.name + '’의 입력 내용을 모두 지울까요?')) return;
    p.rows = blankRows(START_ROWS);
    renderRows(); updateResults(); scheduleSave();
  });

  /* ---------- 사람 추가·이름변경·삭제 ---------- */
  $('#addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('#newName'), name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) {                                   // 이름 없이 추가 → 미지정1, 미지정2 …
      var used = {}; store.people.forEach(function (q) { used[q.name] = 1; });
      for (var k = 1; k < 1000 && !name; k++) if (!used['미지정' + k]) name = '미지정' + k;
    }
    if (store.people.length >= MAX_PEOPLE) { toast('최대 ' + MAX_PEOPLE + '명까지 저장할 수 있습니다.'); return; }
    var id = ST.nextId(store.people);
    store.people.push({ id: id, name: name.slice(0, ST.NAME_MAX), rows: blankRows(START_ROWS) });
    setFold(id, true);      // 이름으로 시작한 사람은 인사기록 카드를 접어서 시작
    input.value = '';
    search = ''; $('#peopleSearch').value = '';
    selectPerson(id);
    var first = $('#rowsBody').querySelector('.f-memo');
    if (first) first.focus();
  });

  $('#peopleList').addEventListener('click', function (e) {
    var b = e.target.closest('.person');
    if (b) selectPerson(+b.dataset.id);
  });
  $('#peopleSearch').addEventListener('input', function (e) { search = e.target.value; renderPeople(); });

  $('#btnRename').addEventListener('click', function () {
    var p = current();
    if (!p) return;
    var n = prompt('새 이름을 입력하세요', p.name);
    if (n == null) return;
    n = n.trim().replace(/\s+/g, ' ');
    if (!n) return;
    p.name = n.slice(0, ST.NAME_MAX);
    $('#personTitle').textContent = p.name;
    renderPeople(); scheduleSave();
  });

  $('#btnDelete').addEventListener('click', function () {
    var p = current();
    if (!p || !confirm('‘' + p.name + '’의 경력 기록을 삭제할까요?\n삭제하면 되돌릴 수 없습니다.')) return;
    var idx = store.people.indexOf(p);
    store.people.splice(idx, 1);
    var nxt = store.people[idx] || store.people[idx - 1];
    store.selected = nxt ? nxt.id : 0;
    scheduleSave(); renderAll();
    toast('삭제했습니다.');
  });

  /* ---------- 결과 복사·인쇄 ---------- */
  function summaryText() {
    var p = current(), a = analyze(p), lines = [];
    var t = a.total;
    lines.push('[' + p.name + '] 경력 산정 기준일: ' + CC.fmtIso(effRef()));
    lines.push('중복 경력 포함 합산: ' + (a.okCount ? fmtTotal(t) : '—'));
    lines.push('중복 경력 제외 합산: ' + (a.okCount ? fmtTotal(a.uniqTotal) : '—'));
    lines.push('인정 경력: ' + (a.okCount ? fmtRecog(CC.recognize(a.uniqTotal)) + ' (중복 제외 합산 기준, 15일 이상 1개월 올림)' : '—'));
    p.rows.forEach(function (r, i) {
      var x = a.rows[i];
      if (x.kind !== 'ok') return;
      lines.push((i + 1) + '. ' + (r.memo ? r.memo + ' ' : '') + CC.fmtSer(x.s) + '~' + CC.fmtSer(x.e) + (x.usedRef ? '(기준일)' : '') + ' (' + CC.fmtDur(x.dur) + ')');
    });
    a.overlaps.forEach(function (o) {
      lines.push('경고) ' + (o.i + 1) + '번↔' + (o.j + 1) + '번 ' + CC.fmtSer(o.s) + '~' + CC.fmtSer(o.e) + ' (' + CC.fmtDur(o.dur) + ' 중복)');
    });
    if (p.doc && p.doc.recs && p.doc.recs.length) {
      var c = docCompute(p, a, p.doc.recs), hasMil = p.doc.recs.some(function (r) { return r.k === 'M'; });
      lines.push('인사기록 PDF 기준 (기준일 ' + CC.fmtIso(effRef()) + ')');
      var who = [p.doc.name, p.doc.org, p.doc.pos].filter(Boolean).join(' · ');
      if (who) lines.push(who);
      [['total', '총경력(체크한 줄 모두 포함)'], ['actual', '실재직 경력(휴직·군 경력 제외)'], ['buzang', '부장 경력'], ['research', '연구학교 경력'], ['violence', '학교폭력 예방기여 경력'], ['mil', '군 경력'], ['dispatch', '파견 경력'], ['leave', '휴직 경력'], ['pro', '전문직 경력']].filter(function (d) { return (d[0] !== 'pro' || c.pro.segs.length) && (d[0] !== 'mil' || hasMil); }).sort(function (x, y) { var o = getOrder(), cl = { total: 't', actual: 'a', buzang: 'b', research: 'r', violence: 'v', dispatch: 'd', pro: 'j', leave: 'l', mil: 'm' }; return o.indexOf(cl[x[0]]) - o.indexOf(cl[y[0]]); }).forEach(function (d) {
        lines.push(d[1] + ': ' + fmtTotal(c[d[0]].sum) + ' (인정 ' + (d[0] === 'violence' ? violenceRecog(c[d[0]].sum) + ', 한시적 연 단위' : fmtRecog(c[d[0]].rec)) + ')');
      });
    }
    return lines.join('\n');
  }
  $('#btnCopy').addEventListener('click', function () {
    var text = summaryText();
    function fallback() {
      var ta = h('textarea', { class: 'sr' }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('복사했습니다.'); } catch (e) { toast('복사하지 못했습니다.'); }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast('복사했습니다.'); }, fallback);
    else fallback();
  });
  /* ---------- 한 장 인쇄용 결과서 ---------- */
  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function buildPrintSheet() {
    var box = $('#printSheet'), p = current();
    box.textContent = '';
    if (!p) return;
    var a = analyze(p), now = new Date();
    var rec = a.okCount ? CC.recognize(a.uniqTotal) : null;
    var doc = p.doc && p.doc.recs && p.doc.recs.length ? p.doc : null;
    var who = [doc && doc.org, doc && doc.pos].filter(Boolean).join(' · ');
    box.appendChild(h('div', { class: 'ps-head' },
      h('div', null, h('div', { class: 'ps-kicker', text: '경력 산정 결과서' }), h('div', { class: 'ps-name', text: (doc && doc.name) || p.name }), who ? h('div', { class: 'ps-org', text: who }) : null),
      h('div', { class: 'ps-meta' },
        h('div', null, h('span', { text: '경력 산정 기준일' }), h('b', { text: CC.fmtIso(effRef()) })),
        h('div', null, h('span', { text: '출력 일시' }), h('b', { text: now.getFullYear() + '. ' + (now.getMonth() + 1) + '. ' + now.getDate() + '. ' + two(now.getHours()) + ':' + two(now.getMinutes()) })))));
    function sec(t) { return h('div', { class: 'ps-sec' }, h('span', { text: t })); }
    box.appendChild(sec('경력 합계'));

    function stat(label, val, sub, cls) {
      return h('div', { class: 'ps-stat ' + (cls || '') }, h('div', { class: 'l', text: label }), h('div', { class: 'v', text: val }), sub ? h('div', { class: 's', text: sub }) : null);
    }
    var stats = h('div', { class: 'ps-stats' },
      stat('인정 경력', rec ? fmtRecog(rec) : '—', rec ? '중복 제외 ' + fmtTotal(a.uniqTotal) + (a.uniqTotal.days >= 15 ? ' → 15일 이상 1개월 올림' : ' → 15일 미만 버림') : '', 'main'),
      stat('중복 제외 합산', a.okCount ? fmtTotal(a.uniqTotal) : '—', a.overlaps.length ? '겹친 기간 한 번만 계산' : '중복 없음'),
      stat('중복 포함 합산', a.okCount ? fmtTotal(a.total) : '—', a.okCount + '건 그대로 합산'));
    box.appendChild(stats);
    if (doc) {
      var c = docCompute(p, a, doc.recs);
      var items = [['총경력', c.total, 0, 't', ''], ['실재직', c.actual, 0, 'a', ''], ['부장', c.buzang, 0, 'b', 'buzang'], ['연구학교', c.research, 0, 'r', ''], ['학교폭력 예방기여', c.violence, 1, 'v', ''], ['파견', c.dispatch, 0, 'd', 'dispatch'], ['휴직', c.leave, 0, 'l', 'leave']];
      if (doc.recs.some(function (r) { return r.k === 'M'; })) items.push(['군 경력', c.mil, 0, 'm', 'mil']);
      if (c.pro.segs.length) items.push(['전문직', c.pro, 0, 'j', 'pro']);
      items = sortBy(items, function (it) { return it[3]; });
      var ped = editedFromRows(p, a, doc.recs);
      var ss = sec('인사기록 PDF 요약' + (ped ? ' · 입력창 수정 내용 함께 표시' : '')); ss.classList.add('sumsec'); box.appendChild(ss);
      var tb = h('table', { class: 'ps-sum' }, h('thead', null, h('tr', null, h('th', { text: '인사기록 PDF' }), items.map(function (it) { return h('th', { class: it[3], text: it[0] }); }))),
        h('tbody', null,
          h('tr', null, h('th', { text: '경력' }), items.map(function (it) { return h('td', { class: it[3], text: fmtTotal(it[1].sum) }); })),
          h('tr', null, h('th', { text: ped ? 'PDF 인정' : '인정' }), items.map(function (it) { return h('td', { class: it[3], text: it[2] ? violenceRecog(it[1].sum) + ' (한시적)' : fmtRecog(it[1].rec) }); })),
          ped ? h('tr', { class: 'ed' }, h('th', { text: '입력창 경력' }), items.map(function (it) {
            var e = it[4] && ped[it[4]];
            if (!e) return h('td', { class: it[3] + ' na', text: '—' });
            var same = fmtTotal(e.sum) === fmtTotal(it[1].sum);
            return h('td', { class: it[3] + (same ? ' same' : ' diff'), text: fmtTotal(e.sum) + (same ? '' : ' ▲') });
          })) : null,
          ped ? h('tr', { class: 'ed' }, h('th', { text: '입력창 인정' }), items.map(function (it) {
            var e = it[4] && ped[it[4]];
            if (!e) return h('td', { class: it[3] + ' na', text: '—' });
            return h('td', { class: it[3] + (fmtTotal(e.sum) === fmtTotal(it[1].sum) ? ' same' : ' diff'), text: fmtRecog(e.rec) });
          })) : null));
      box.appendChild(tb);
    }

    var list = [];
    p.rows.forEach(function (r, i) { if (r.memo || r.start || r.end || r.sRaw || r.eRaw) list.push(i); });
    var dense = ' ' + (list.length <= 8 ? 'sp' : list.length <= 11 ? 'md' : list.length <= 15 ? 'lg' : list.length <= 24 ? 'dense' : 'xd');
    box.className = 'print-sheet' + (list.length > 11 || (doc && editedFromRows(p, a, doc.recs)) ? ' cmp' : '') + (list.length > 24 ? ' tiny' : '');
    box.appendChild(sec('경력 내역 · ' + list.length + '건'));
    var body = h('tbody');
    list.forEach(function (i, n) {
      var r = p.rows[i], x = a.rows[i];
      var note = x.kind === 'off' ? '제외(미산입)' : x.ov && x.ov.length ? (x.ov.length <= 2 ? x.ov.map(function (j) { return (j + 1) + '번'; }).join('·') + '과 중복' : x.ov.length + '건 중복') : x.kind === 'ok' ? (x.usedRef ? '기준일까지' : '') : (x.msg || '확인 필요');
      var ok = x.kind === 'ok';
      body.appendChild(h('tr', { class: (x.kind === 'off' ? 'off ' : '') + (x.ov && x.ov.length ? 'ov' : '') },
        h('td', { class: 'c', text: String(i + 1) }),
        h('td', null, h('b', { text: r.memo || '' }), r.dept ? h('span', { class: 'dp', text: '  ' + r.dept }) : null),
        h('td', { class: 'c', text: r.start ? CC.fmtIso(r.start) : (r.sRaw || '') }),
        h('td', { class: 'c', text: r.end ? CC.fmtIso(r.end) : (ok && x.usedRef ? CC.fmtSer(x.e) : (r.eRaw || '')) }),
        h('td', { class: 'c', text: ok ? fmtTotal(x.dur) : '' }),
        h('td', { class: 'nt', text: note })));
    });
    box.appendChild(h('table', { class: 'ps-rows' + dense }, h('thead', null, h('tr', null, h('th', { class: 'c', text: '순' }), h('th', { text: '구분 · 부서' }), h('th', { class: 'c', text: '시작일' }), h('th', { class: 'c', text: '종료일' }), h('th', { class: 'c', text: '기간' }), h('th', { text: '비고' }))), body));
    if (!list.length) box.appendChild(h('p', { class: 'ps-empty', text: '입력된 경력이 없습니다.' }));
    if (a.overlaps.length) {
      var lim = list.length > 15 ? 3 : 6;
      var shown = a.overlaps.slice(0, lim).map(function (o) { return (o.i + 1) + '↔' + (o.j + 1) + '번 ' + CC.fmtSer(o.s) + '~' + CC.fmtSer(o.e) + ' (' + CC.fmtDur(o.dur) + ')'; }).join('  /  ');
      box.appendChild(h('p', { class: 'ps-warn' }, h('b', { text: '중복 ' + a.overlaps.length + '건' }), shown + (a.overlaps.length > lim ? ' 외 ' + (a.overlaps.length - lim) + '건' : '')));
    }
    box.appendChild(h('div', { class: 'ps-spacer' }));
    box.appendChild(h('p', { class: 'ps-foot', text: '민법 역법(초일 산입·말일 만료)으로 계산 · 인정 경력은 일수 15일 이상이면 1개월 올림 · 경력 계산기 v' + (window.APP_INFO ? window.APP_INFO.version : '') }));
  }
  window.addEventListener('beforeprint', buildPrintSheet);
  $('#btnPrint').addEventListener('click', function () { buildPrintSheet(); window.print(); });

  /* ---------- 저장 방식·백업 ---------- */
  function renderMeter() {
    var sel = $('#modeSelect'); sel.value = store.mode;
    var meter = $('#meter'), note = $('#modeNote');
    if (store.mode === 'cookie') {
      var m = ST.measure({ people: store.people, selected: store.selected || 0 });
      var pct = Math.min(100, Math.round(m.used / m.budget * 100));
      meter.hidden = false;
      $('#meterFill').style.width = pct + '%';
      $('#meterFill').className = pct >= 90 ? 'hot' : pct >= 70 ? 'warm' : '';
      $('#meterText').textContent = '쿠키 사용량 ' + (m.used / 1000).toFixed(1) + ' / ' + (m.budget / 1000).toFixed(0) + ' KB · ' + store.people.length + '명';
      note.textContent = '쿠키는 서버 요청마다 함께 전송되어 용량 한도를 두었습니다. 사람이 많거나 기록이 길면 ‘브라우저 저장소’를 쓰세요.';
    } else {
      meter.hidden = true;
      note.textContent = '이 브라우저의 저장소에 보관합니다. 1000명까지 쓸 수 있습니다.';
    }
  }

  $('#modeSelect').addEventListener('change', function (e) {
    var to = e.target.value;
    flushSave();
    var res = ST.switchMode(store.mode, to, snapshot());
    if (res.ok) { store.mode = to; showBanner(''); setSaveState('saved'); toast('저장 방식을 바꾸고 기존 데이터를 옮겼습니다.'); }
    else { e.target.value = store.mode; showBanner(failMessage(res)); }
    renderMeter();
  });

  $('#btnExport').addEventListener('click', function () {
    var data = {
      app: 'career-calc', version: 1, exportedAt: new Date().toISOString(), ref: store.ref || '',
      people: store.people.map(function (p) {
        var o = { name: p.name, rows: p.rows.filter(function (r) { return r.memo || r.start || r.end; }).map(function (r) { return { memo: r.memo || '', start: r.start || '', end: r.end || '', dept: r.dept || '', off: r.off ? 1 : 0 }; }) };
        if (p.doc && p.doc.recs && p.doc.recs.length) o.doc = { name: p.doc.name || '', org: p.doc.org || '', pos: p.doc.pos || '', recs: p.doc.recs.map(function (r) { return { k: r.k, s: r.s, e: r.e || '', x: r.x ? 1 : 0, d: r.d || '', t: r.t || '' }; }) };
        return o;
      })
    };
    var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var name = '경력계산기_백업_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    var a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('#btnImport').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (!d || d.app !== 'career-calc' || !Array.isArray(d.people)) throw new Error('형식');
        var added = 0, skipped = 0;
        d.people.forEach(function (p) {
          if (!p || typeof p.name !== 'string') return;
          if (store.people.length >= MAX_PEOPLE) { skipped++; return; }
          var rows = (Array.isArray(p.rows) ? p.rows : []).slice(0, MAX_ROWS).map(function (r) {
            return {
              memo: String((r && r.memo) || '').slice(0, ST.MEMO_MAX),
              start: CC.parseDate(r && r.start) || '', end: CC.parseDate(r && r.end) || '',
              dept: String((r && r.dept) || '').slice(0, 30), off: r && r.off ? 1 : 0
            };
          });
          var np = { id: ST.nextId(store.people), name: p.name.trim().slice(0, ST.NAME_MAX) || '(이름 없음)', rows: rows };
          var dc = ST.cleanDoc(p.doc); if (dc) np.doc = dc;
          ensureRows(np);
          store.people.push(np); added++;
        });
        if (!store.selected && store.people.length) store.selected = store.people[0].id;
        if (!store.ref && CC.isoToSer(d.ref) != null) { store.ref = d.ref; refIn.value = CC.fmtIso(d.ref); }
        flushSaveNow();
        renderAll();
        toast(added + '명을 불러왔습니다.' + (skipped ? ' (' + MAX_PEOPLE + '명 초과로 ' + skipped + '명 제외)' : ''));
      } catch (err) { toast('백업 파일을 읽을 수 없습니다.'); }
    };
    rd.readAsText(f);
  });
  function flushSaveNow() { dirty = true; flushSave(); }

  $('#btnWipe').addEventListener('click', function () {
    if (!confirm('이 브라우저에 저장된 모든 사람과 경력 기록을 삭제할까요?\n되돌릴 수 없으니 필요하면 먼저 백업하세요.')) return;
    ST.wipeAll();
    store.people = []; store.selected = 0; store.ref = ''; refIn.value = CC.fmtIso(todayIso()); dirty = false;
    setSaveState('none'); showBanner('');
    renderAll();
    toast('모두 삭제했습니다.');
  });

  /* ---------- 인사기록 PDF ---------- */
  var KIND = { S: '재직', B: '재직·부장', D: '재직·파견', J: '재직·전문직', L: '휴직 등(차감)', V: '학교폭력', R: '연구학교', M: '군 복무', H: '첫 채용(중복·제외)' };
  var pdfMode = 'auto', pdfLib = null;

  function setDocMsg(t) { $('#docMsg').textContent = t || ''; }

  function loadPdfLib() {
    if (pdfLib) return Promise.resolve(pdfLib);
    return import('./vendor/pdf.min.mjs').then(function (m) {
      m.GlobalWorkerOptions.workerSrc = new URL('js/vendor/pdf.worker.min.mjs', document.baseURI).href;
      pdfLib = m; return m;
    });
  }

  function recLen(r) {
    var ref = CC.isoToSer(effRef()), s = CC.isoToSer(r.s), e = r.e ? CC.isoToSer(r.e) : ref, note = '';
    if (s == null || e == null) return '';
    if (!r.e) note = ' (기준일까지)';
    if (ref != null && e > ref) { e = ref; note = ' (기준일까지)'; }
    if (e < s) return '기준일 이후 — 제외';
    return CC.fmtDur(CC.diff(s, e)) + note;
  }

  /* ---- 출력 순서 설정 (카드·요약표·결과 복사·한 장 인쇄 공통) ---- */
  var SORT_KEY = 'careerCalc.order';
  var SORT_DEF = [['t', '총경력'], ['a', '실재직 경력'], ['b', '부장 경력'], ['r', '연구학교 경력'], ['v', '학교폭력 예방기여 경력'], ['d', '파견 경력'], ['j', '전문직 경력'], ['l', '휴직 경력'], ['m', '군 경력']];
  function sortLabel(id) { for (var i = 0; i < SORT_DEF.length; i++) if (SORT_DEF[i][0] === id) return SORT_DEF[i][1]; return id; }
  function getOrder() {
    var ids = SORT_DEF.map(function (d) { return d[0]; }), out = [];
    try { (JSON.parse(localStorage.getItem(SORT_KEY) || '[]') || []).forEach(function (k) { if (ids.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k); }); } catch (e) { /* noop */ }
    ids.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  function setOrder(list) { try { localStorage.setItem(SORT_KEY, JSON.stringify(list)); } catch (e) { /* noop */ } }
  function sortBy(list, idOf) { var o = getOrder(); return list.slice().sort(function (a, b) { return o.indexOf(idOf(a)) - o.indexOf(idOf(b)); }); }


  /* 설정 창: 출력 순서(끌어서 변경) */
  (function () {
    var back = $('#setBack'), list = $('#ordList'), dragId = null;
    var colors = { t: '#0f5c5c', a: '#2f4fb8', b: '#6a4fb0', r: '#c0508a', v: '#1f6fa8', d: '#c07a2a', j: '#3f7a2e', l: '#a64444', m: '#5a6b7d' };
    function applyOrder(o) { setOrder(o); draw(); updateResults(); var pp = $('#printSheet'); if (pp && pp.children.length) { try { buildPrintSheet(); } catch (e) { /* noop */ } } }
    function move(id, to) { var o = getOrder(), i = o.indexOf(id); if (to < 0 || to >= o.length) return; o.splice(i, 1); o.splice(to, 0, id); applyOrder(o); }
    function draw() {
      list.textContent = '';
      getOrder().forEach(function (id, i, arr) {
        var li = h('li', { class: 'ord-item', draggable: 'true', 'data-id': id },
          h('span', { class: 'grip', text: '⋮⋮', 'aria-hidden': 'true' }),
          h('span', { class: 'nm', text: sortLabel(id) }),
          h('button', { type: 'button', 'data-up': id, text: '▲', 'aria-label': sortLabel(id) + ' 위로' }),
          h('button', { type: 'button', 'data-dn': id, text: '▼', 'aria-label': sortLabel(id) + ' 아래로' }));
        li.style.setProperty('--c', colors[id] || '#0f5c5c');
        list.appendChild(li);
      });
    }
    list.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var id = b.getAttribute('data-up') || b.getAttribute('data-dn'), i = getOrder().indexOf(id);
      move(id, b.hasAttribute('data-up') ? i - 1 : i + 1);
    });
    list.addEventListener('dragstart', function (e) { var li = e.target.closest('.ord-item'); if (!li) return; dragId = li.dataset.id; li.classList.add('drag'); try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* noop */ } });
    list.addEventListener('dragover', function (e) { var li = e.target.closest('.ord-item'); if (!li || !dragId) return; e.preventDefault(); [].forEach.call(list.children, function (c) { c.classList.toggle('over', c === li && c.dataset.id !== dragId); }); });
    list.addEventListener('drop', function (e) { var li = e.target.closest('.ord-item'); if (!li || !dragId) return; e.preventDefault(); var to = getOrder().indexOf(li.dataset.id), id = dragId; dragId = null; move(id, to); });
    list.addEventListener('dragend', function () { dragId = null; draw(); });
    $('#ordReset').addEventListener('click', function () { applyOrder(SORT_DEF.map(function (d) { return d[0]; })); });
    function open() { draw(); back.hidden = false; $('#setClose').focus(); }
    function close() { back.hidden = true; $('#btnSettings').focus(); }
    $('#btnSettings').addEventListener('click', open);
    $('#setClose').addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !back.hidden) close(); });
  })();
  var FOLD_KEY = 'careerCalc.docFold';
  function loadFold() { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setFold(id, collapsed) {
    var m = loadFold();
    if (collapsed) m[id] = 1; else delete m[id];
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(m)); } catch (e) { /* noop */ }
  }
  function applyFold(p) {
    var c = loadFold()[p.id] === 1;
    $('#docCard').classList.toggle('collapsed', c);
    $('#docInner').hidden = c;
    var b = $('#btnDocFold'); b.textContent = c ? '펼치기' : '접기'; b.setAttribute('aria-expanded', c ? 'false' : 'true');
  }
  /** 입력창을 PDF 기록에서 만든 기본 상태와 비교해, 수정됐으면 항목별 입력창 기준 값을 계산 */
  /** 입력창 줄을 ‘총경력에 들어갈 기간’(체크된 줄)과 ‘빼야 할 기간’(휴직·군 줄, 체크 여부와 무관)으로 나눔 */
  function splitFromRows(p, a) {
    var ref = CC.isoToSer(effRef()), all = [], excl = [], hasEx = false;
    p.rows.forEach(function (r, i) {
      var x = a.rows[i], c = catOf(r.memo);
      if (x.kind === 'ok') all.push({ s: x.s, e: x.e });
      if (c === 'l' || c === 'm') {
        var s = x.kind === 'ok' ? x.s : CC.isoToSer(r.start), e = x.kind === 'ok' ? x.e : (r.end ? CC.isoToSer(r.end) : ref);
        if (s != null && e != null && e >= s) { excl.push({ s: s, e: e }); hasEx = true; }
      }
    });
    return { all: all, excl: excl, hasEx: hasEx };
  }
  function packSegs(segs) {
    var durs = segs.map(function (g) { return CC.diff(g.s, g.e); }), sum = CC.sum(durs);
    return { segs: segs, durs: durs, sum: sum, rec: CC.recognize(sum) };
  }
  /** 총경력 = 체크한 줄 모두(중복은 한 번), 실재직 = 총경력에서 휴직·군 경력 기간을 뺀 실제 근무 기간 */
  function actualFrom(p, a) {
    var sp = splitFromRows(p, a), tot = CC.union(sp.all, false);
    return { total: packSegs(tot), actual: packSegs(CC.subtract(tot, CC.union(sp.excl, true))), hasEx: sp.hasEx };
  }
  function docCompute(p, a, recs) {
    var c = PC.compute(recs, effRef(), CC), z = actualFrom(p, a);
    c.total = z.total; c.actual = z.actual;
    return c;
  }
  function editedFromRows(p, a, recs) {
    var base = buildRowsFromRecs(recs, groupRows);
    var rowsNow = p.rows.filter(function (r) { return r.memo || r.start || r.end; });
    if (sameRows(rowsNow, base)) return null;
    var ref = CC.isoToSer(effRef()), cat = { b: [], d: [], j: [], l: [], m: [] }, all = [];
    p.rows.forEach(function (r, i) {
      var x = a.rows[i], c = catOf(r.memo);
      if (x.kind === 'ok') { all.push({ s: x.s, e: x.e }); if (cat[c]) cat[c].push({ s: x.s, e: x.e }); }
      else if (x.kind === 'off' && (c === 'l' || c === 'm')) {                     // 휴직 줄은 산입 안 해도 휴직 기간으로는 센다
        var s = CC.isoToSer(r.start), e = r.end ? CC.isoToSer(r.end) : ref;
        if (s != null && e != null && e >= s) cat[c].push({ s: s, e: e });
      }
    });
    function pack(segs, touch) {
      var u = CC.union(segs, touch), sum = CC.sum(u.map(function (g) { return CC.diff(g.s, g.e); }));
      return { sum: sum, rec: CC.recognize(sum) };
    }
    return { buzang: pack(cat.b, true), dispatch: pack(cat.d, true), pro: pack(cat.j, true), leave: pack(cat.l, true), mil: pack(cat.m, true) };
  }
  function renderDoc(p, a) {
    applyFold(p);
    var recs = p.doc && p.doc.recs && p.doc.recs.length ? p.doc.recs : null;
    $('#docDrop').hidden = !!recs;
    $('#docBody').hidden = !recs;
    $('#btnDocClear').hidden = !recs;
    $('#btnPdf').textContent = 'PDF 불러오기 (새 사람 추가)';
    if (!recs) return;

    var c = docCompute(p, a || analyze(p), recs);
    var grid = $('#sumGrid'); grid.textContent = '';
    var who = [p.doc.name, p.doc.org, p.doc.pos].filter(Boolean);
    var wb = $('#docWho'); wb.textContent = '';
    wb.hidden = !who.length;
    if (who.length) {
      wb.appendChild(h('b', { class: 'who-name', text: p.doc.name || p.name }));
      if (p.doc.org) wb.appendChild(h('span', { class: 'who-org', text: p.doc.org }));
      if (p.doc.pos) wb.appendChild(h('span', { class: 'who-pos', text: p.doc.pos }));
    }
    var mil = recs.filter(function (r) { return r.k === 'M'; });
    var ed = a ? editedFromRows(p, a, recs) : null;
    var tbody = h('tbody');
    [['total', '총경력', 't', '입력창에서 체크한 줄을 모두 포함 (중복은 한 번만)'],
     ['actual', '실재직 경력', 'a', '총경력에서 휴직·군 경력을 뺀 실제 근무 기간'],
     ['buzang', '부장 경력', 'b', '부장교사·부장담임 보직 기간'],
     ['research', '연구학교 경력', 'r', '12.가산점 ‘연구·시범학교’ 기간'],
     ['violence', '학교폭력 예방기여 경력', 'v', '학교폭력예방및기여 가산점 기간'],
     ['mil', '군 경력', 'm', '병역사항 복무 기간 (총경력에 미포함 · 입력창에서 체크하면 합계에 반영)'],
     ['dispatch', '파견 경력', 'd', '파견·파견연장 기간 (총경력에 포함)'],
     ['leave', '휴직 경력', 'l', '휴직·정직·직위해제 기간 (총경력에서 차감)'],
     ['pro', '전문직 경력', 'j', '장학사·교육연구사 등 전문직 기간 (총경력에 포함)']].filter(function (d) { return (d[0] !== 'pro' || c.pro.segs.length) && (d[0] !== 'mil' || mil.length); }).sort(function (x, y) { var o = getOrder(); return o.indexOf(x[2]) - o.indexOf(y[2]); }).forEach(function (d) {
      var r = c[d[0]];
      var ul = h('ul');
      r.segs.forEach(function (g, i) { ul.appendChild(h('li', { text: CC.fmtSer(g.s) + '~' + CC.fmtSer(g.e) + ' (' + CC.fmtDur(r.durs[i]) + ')' })); });
      var e2 = ed && ed[d[0]] ? ed[d[0]] : null, same = e2 && fmtTotal(e2.sum) === fmtTotal(r.sum);
      tbody.appendChild(h('tr', { class: 'sum-card ' + d[2] + (e2 && !same ? ' edited' : '') },
        h('td', { class: 'sum-name' }, h('span', { class: 'sum-chip', text: d[1] })),
        h('td', { class: 'sum-vcell' },
          e2 ? h('div', { class: 'sum-pdf muted small', text: 'PDF 기록' }) : null,
          h('div', { class: 'sum-value', text: fmtTotal(r.sum) }),
          e2 ? h('div', { class: 'sum-edit' + (same ? ' same' : '') }, h('span', { class: 'muted small', text: same ? '입력창 기준(PDF와 같음)' : '입력창 수정 기준' }), h('b', { text: fmtTotal(e2.sum) }), h('span', { class: 'muted small', text: ' 인정 ' + fmtRecog(e2.rec) })) : null),
        h('td', { class: 'sum-rcell' },
          d[0] === 'violence'
            ? h('div', { class: 'sum-rec' }, h('b', { text: violenceRecog(r.sum) }), h('span', { class: 'muted small', text: ' 한시적 · 1년 미만 버림' }))
            : h('div', { class: 'sum-rec' }, h('b', { text: fmtRecog(r.rec) }))),
        h('td', { class: 'sum-note' }, h('div', { text: d[3] }),
          r.segs.length ? h('details', { class: 'sum-seg' }, h('summary', { text: '기간 ' + r.segs.length + '구간 보기' }), ul) : h('div', { class: 'sum-seg', text: '해당 기록 없음' }))));
    });
    grid.appendChild(h('table', { class: 'sum-table' },
      h('thead', null, h('tr', null, h('th', { text: '항목' }), h('th', { text: '경력' }), h('th', { text: '인정 경력' }), h('th', { text: '기준 · 기간' }))), tbody));
    $('#docNote').textContent = '기준일 ' + CC.fmtIso(effRef()) + '까지 계산 · 기준일을 바꾸면 자동으로 다시 계산됩니다 · 인정 경력은 15일 이상이면 1개월 올림' + (ed ? ' · 입력창을 수정해서 PDF 기록과 입력창 기준 값을 함께 표시합니다 (연구학교·학교폭력은 입력창에 없어 PDF 값만)' : '');

    var order = { S: 0, H: 0, B: 0, D: 0, J: 0, M: 0, L: 1, R: 2, V: 2 };
    var idx = recs.map(function (r, i) { return i; }).sort(function (a, b) {
      var A = recs[a], B = recs[b];
      return order[A.k] - order[B.k] || (A.s < B.s ? 1 : A.s > B.s ? -1 : 0);
    });
    var body = $('#recBody'); body.textContent = '';
    idx.forEach(function (i) {
      var r = recs[i];
      if (r.k === 'M') return;
      body.appendChild(h('tr', { class: r.x ? 'off' : null, 'data-i': i },
        h('td', null, h('input', { type: 'checkbox', checked: r.x ? null : true, 'aria-label': (KIND[r.k] || r.k) + ' ' + r.s + ' 반영' })),
        h('td', null, h('span', { class: 'kind ' + r.k, text: KIND[r.k] || r.k })),
        h('td', { text: CC.fmtIso(r.s) + ' ~ ' + (r.e ? CC.fmtIso(r.e) : '(현재)') }),
        h('td', { text: recLen(r) }),
        h('td', { class: 'lab', text: r.lab || '' })));
    });
  }

  $('#recBody').addEventListener('change', function (e) {
    var tr = e.target.closest('tr'), p = current();
    if (!tr || !p || !p.doc) return;
    p.doc.recs[+tr.dataset.i].x = e.target.checked ? 0 : 1;
    updateResults(); scheduleSave();
  });

  /* ---------- PDF 기록 → 입력창 행 ---------- */
  var GROUP_KEY = 'careerCalc.group';
  var groupRows = true;
  try { groupRows = window.localStorage.getItem(GROUP_KEY) !== '0'; } catch (e) { /* noop */ }
  var CAT_MEMO = { S: '재직', H: '재직', B: '부장', D: '파견', J: '전문직' };
  function catOf(memo) {
    var m = String(memo || '').trim();
    return /^부장/.test(m) ? 'b' : /^파견/.test(m) ? 'd' : /^전문직/.test(m) ? 'j' : /휴직|정직|직위해제/.test(m) ? 'l' : /^군/.test(m) ? 'm' : /^재직/.test(m) ? 's' : '';
  }
  /**
   * 기록(recs) → 입력창 행.
   * grouped=true : 종류(재직·부장·파견·전문직)별로 맞닿은 기간을 하나로 합침(재직은 이어서 한 줄, 부장·파견·전문직은 종류별로 따로)
   * grouped=false: PDF 행을 그대로(휴직 기간만 빼고) 시간순으로
   * 휴직·정직·직위해제 기간은 어느 쪽이든 뺀다. 군 복무·가산점은 넣지 않는다.
   */
  function buildRowsFromRecs(recs, grouped) {
    var ref = CC.isoToSer(effRef());
    function toSeg(r) {
      var s = CC.isoToSer(r.s), e = r.e ? CC.isoToSer(r.e) : ref;
      if (s == null || e == null) return null;
      var open = !r.e || (ref != null && e > ref);
      if (ref != null && e > ref) e = ref;
      return e < s ? null : { s: s, e: e, open: open };
    }
    var use = recs.filter(function (r) { return !r.x; });
    function segsOf(kinds) {
      var out = [];
      use.forEach(function (r) { if (kinds.indexOf(r.k) >= 0) { var g = toSeg(r); if (g) out.push(g); } });
      return out;
    }
    function plain(list) { return list.map(function (g) { return { s: g.s, e: g.e }; }); }
    function openAtRef(list) { return list.some(function (g) { return g.open && g.e === ref; }); }
    var leaves = CC.union(plain(segsOf(['L'])));
    var rows = [];
    function deptFor(kinds, g) {
      var seen = [];
      use.filter(function (r) { return kinds.indexOf(r.k) >= 0 && r.d; })
        .filter(function (r) { var q = toSeg(r); return q && q.s <= g.e && q.e >= g.s; })
        .sort(function (a, b) { return a.s < b.s ? 1 : a.s > b.s ? -1 : 0; })
        .forEach(function (r) { if (seen.indexOf(r.d) < 0) seen.push(r.d); });
      return !seen.length ? '' : seen.length === 1 ? seen[0] : seen[0] + ' 외 ' + (seen.length - 1) + '곳';
    }
    function leaveName(g) {
      var seen = [];
      use.filter(function (r) { return r.k === 'L'; })
        .filter(function (r) { var q = toSeg(r); return q && q.s <= g.e && q.e >= g.s; })
        .sort(function (a, b) { return a.s < b.s ? -1 : a.s > b.s ? 1 : 0; })
        .forEach(function (r) { var t = (r.t || '').trim(); if (t && seen.indexOf(t) < 0) seen.push(t); });
      return seen.length ? seen.join('·') : '휴직';
    }
    function push(memo, g, open, ord, kinds, off) {
      rows.push({ memo: memo.slice(0, ST.MEMO_MAX), off: off ? 1 : 0, dept: deptFor(kinds, g), start: CC.serToIso(g.s), end: (open && g.e === ref) ? '' : CC.serToIso(g.e), _s: g.s, _o: ord });
    }
    var ORDER = ['S', 'B', 'D', 'J'];
    function milRowsInto(list) {
      var ms = [];
      recs.forEach(function (r) { if (r.k === 'M') { var g = toSeg(r); if (g) ms.push({ s: g.s, e: g.e }); } });
      CC.union(ms, true).forEach(function (g) { list.push({ memo: '군 경력', off: 1, dept: '', start: CC.serToIso(g.s), end: CC.serToIso(g.e), _s: g.s, _o: 5 }); });
    }
    if (grouped) {
      var all = segsOf(['S', 'H', 'B', 'D', 'J']);
      var base = CC.subtract(CC.union(plain(all), true), leaves);
      var parts = {};
      ['B', 'D', 'J'].forEach(function (k) {
        var l = segsOf([k]);
        parts[k] = { segs: CC.subtract(CC.union(plain(l), true), leaves), open: openAtRef(l) };
      });
      // 재직은 부장·파견·전문직 기간까지 이어서 한 줄로 둔다(잘라 나누면 월·일 환산이 달라져 PDF 카드와 합계가 어긋남)
      base.forEach(function (g) { push(CAT_MEMO.S, g, openAtRef(all), 0, ['S', 'H']); });
      ['B', 'D', 'J'].forEach(function (k, i) { parts[k].segs.forEach(function (g) { push(CAT_MEMO[k], g, parts[k].open, i + 1, [k]); }); });
      // 군 경력: 한 줄(맞닿은 기간 합침), 기본은 산입 안 함
      milRowsInto(rows);
      // 휴직·정직·직위해제: 기본은 산입 안 함(체크 해제) — 체크하면 그 기간이 경력에 더해짐
      CC.union(plain(segsOf(['L'])), true).forEach(function (g) { push(leaveName(g), g, openAtRef(segsOf(['L'])), 4, ['L'], true); });
      rows.sort(function (a, b) { return a._o - b._o || a._s - b._s; });
    } else {
      use.forEach(function (r) {
        if (['S', 'H', 'B', 'D', 'J'].indexOf(r.k) < 0) return;
        var g = toSeg(r); if (!g) return;
        var k = r.k === 'H' ? 'S' : r.k;
        CC.subtract([{ s: g.s, e: g.e }], leaves).forEach(function (x) { push(CAT_MEMO[k], x, g.open, ORDER.indexOf(k), r.k === 'H' ? ['H'] : [r.k]); });
      });
      milRowsInto(rows);
      use.forEach(function (r) {
        if (r.k !== 'L') return;
        var g = toSeg(r); if (g) push(leaveName(g), g, g.open, 4, ['L'], true);
      });
      rows.sort(function (a, b) { return a._s - b._s || a._o - b._o; });
    }
    return rows.slice(0, MAX_ROWS).map(function (x) { return { memo: x.memo, dept: x.dept, start: x.start, end: x.end, off: x.off }; });
  }
  function sameRows(a, b) {
    var f = function (list) { return list.filter(function (r) { return r.memo || r.start || r.end; }).map(function (r) { return r.memo + '|' + r.start + '|' + r.end + (r.off ? '|off' : ''); }).join(';'); };
    return f(a) === f(b);
  }
  /** PDF의 재직 기록을 아래 입력창에 채움 */
  function fillRowsFromDoc(res, target, force) {
    var out = buildRowsFromRecs(res.records, groupRows);
    if (!out.length) return 0;
    var has = target.rows.some(function (r) { return r.memo || r.start || r.end; });
    if (has && !force && !confirm('아래 입력창에 이미 입력한 경력이 있습니다.\nPDF의 재직 경력 ' + out.length + '줄로 바꿀까요?\n(취소하면 입력창은 그대로 두고 PDF 분석만 반영합니다)')) return 0;
    target.rows = out;
    ensureRows(target);
    return out.length;
  }

  function applyDoc(res, target, force) {
    var filled = fillRowsFromDoc(res, target, force);
    setFold(target.id, false);   // PDF 결과가 생기면 펼쳐서 보여 줌
    target.doc = { name: res.name || '', org: res.org || '', pos: res.pos || '', recs: res.records };
    selectPerson(target.id);
    var msg = 'PDF에서 경력 ' + res.records.length + '건을 읽었습니다.' + (res.records.some(function (r) { return r.k === 'H'; }) ? ' 첫 채용 기간은 이후 경력과 겹쳐 자동 제외했습니다.' : '') + (filled ? ' 아래 입력창에 재직 경력 ' + filled + '줄을 채웠습니다.' : '');
    if (res.warnings.length) msg += ' ' + res.warnings.join(' ');
    setDocMsg(msg);
    toast('인사기록을 불러왔습니다.');
  }

  function personHasData(p) {
    return p.rows.some(function (r) { return r.memo || r.start || r.end || r.sRaw || r.eRaw; }) || !!(p.doc && p.doc.recs && p.doc.recs.length);
  }
  /** 같은 이름이 이미 있으면 ‘이름 (2)’처럼 붙여 새 사람으로 만듦(기존 사람의 내용을 덮어쓰지 않음) */
  function uniqueName(nm) {
    var names = {}; store.people.forEach(function (p) { names[p.name] = 1; });
    if (!names[nm]) return nm;
    for (var k = 2; k < 1000; k++) {
      var cand = nm.slice(0, Math.max(1, ST.NAME_MAX - (' (' + k + ')').length)) + ' (' + k + ')';
      if (!names[cand]) return cand;
    }
    return nm;
  }
  /** 한 파일 처리 → Promise<'ok'|'cancel'|'fail'> */
  function importPdf(file, asNew, quiet) {
    if (!file) return Promise.resolve('fail');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { if (!quiet) toast('PDF 파일을 선택해 주세요.'); return Promise.resolve('fail'); }
    if (file.size > 25 * 1024 * 1024) { if (!quiet) toast('파일이 너무 큽니다. (25MB 이하)'); return Promise.resolve('fail'); }
    // PDF의 이름으로 사람을 정한다: 같은 이름이 있으면 그 사람, 없으면 새 사람(다른 사람의 데이터는 건드리지 않음)
    var target = null, force = false;
    setDocMsg('PDF를 읽는 중…');
    return Promise.all([loadPdfLib(), file.arrayBuffer()]).then(function (a) {
      return a[0].getDocument({ data: new Uint8Array(a[1]) }).promise;
    }).then(function (pdf) {
      if (pdf.numPages > 100) throw new Error('pages');
      return PC.readPages(pdf);
    }).then(function (pages) {
      var res = PC.parsePages(pages);
      if (!res.records.length) throw new Error('empty');
      var pn = (res.name || '').slice(0, ST.NAME_MAX);
      var same = pn ? store.people.filter(function (p) { return p.name === pn || (p.doc && p.doc.name === pn); })[0] : null;
      if (same && same.doc && same.doc.recs && same.doc.recs.length) {
        if (!confirm('이미 ‘' + same.name + '’의 인사기록이 입력되어 있습니다.\n다시 불러오겠습니까?\n(‘확인’을 누르면 이 사람의 기존 PDF 결과와 입력창을 새 PDF로 바꿉니다)')) { setDocMsg(''); return 'cancel'; }
        target = same; force = true;
      } else if (same) {
        target = same;
      }
      if (!target) {
        if (store.people.length >= MAX_PEOPLE) { toast('최대 ' + MAX_PEOPLE + '명까지 저장할 수 있습니다.'); setDocMsg(''); return 'fail'; }
        var nm = (pn || 'PDF 인사기록');
        target = { id: ST.nextId(store.people), name: uniqueName(nm), rows: blankRows(START_ROWS) };
        store.people.push(target);
        setFold(target.id, false);
        toast('새 사람 ‘' + target.name + '’(으)로 추가했습니다.');
      }
      applyDoc(res, target, force);
      return 'ok';
    }).catch(function (err) {
      var n = err && err.name;
      setDocMsg(n === 'PasswordException' ? '암호가 걸린 PDF는 읽을 수 없습니다.'
        : (err && err.message === 'empty') ? '경력 표를 찾지 못했습니다. 인사카드(개인인사기록) PDF가 맞는지, 스캔 이미지가 아닌 PDF인지 확인해 주세요.'
        : (err && err.message === 'pages') ? '쪽수가 너무 많습니다. 인사카드 PDF만 올려 주세요.'
        : 'PDF를 읽지 못했습니다. 다른 파일이거나 손상된 파일일 수 있습니다.');
      return 'fail';
    });
  }

  /** 여러 파일: 한 파일씩 차례로 각각 사람으로 분리해 입력 */
  var importing = false;
  function importPdfs(files, asNew) {
    var list = Array.prototype.slice.call(files || []).filter(Boolean);
    if (!list.length) return;
    if (importing) { toast('PDF를 읽는 중입니다. 잠시 후 다시 시도해 주세요.'); return; }
    if (list.length === 1) { importing = true; importPdf(list[0], asNew).then(function () { importing = false; }); return; }
    importing = true;
    var ok = 0, cancel = 0, bad = [], i = 0;
    function next() {
      if (i >= list.length) {
        importing = false;
        var m = 'PDF ' + list.length + '개 중 ' + ok + '명을 각각 입력했습니다.' + (cancel ? ' (건너뜀 ' + cancel + '개)' : '') + (bad.length ? ' 읽지 못한 파일: ' + bad.join(', ') : '');
        setDocMsg(m); toast(m);
        return;
      }
      var f = list[i++];
      setDocMsg('PDF ' + i + '/' + list.length + ' 읽는 중… (' + f.name + ')');
      importPdf(f, asNew, true).then(function (r) {
        if (r === 'ok') ok++; else if (r === 'cancel') cancel++; else bad.push(f.name);
        next();
      });
    }
    next();
  }

  $('#btnPdf').addEventListener('click', function () { pdfMode = 'auto'; $('#pdfFile').click(); });
  $('#btnPdfEmpty').addEventListener('click', function () { pdfMode = 'new'; $('#pdfFile').click(); });
  $('#btnDocFold').addEventListener('click', function () {
    var p = current(); if (!p) return;
    setFold(p.id, loadFold()[p.id] !== 1); applyFold(p);
  });
  $('#btnBlank').addEventListener('click', function () {
    store.selected = 0; setDocMsg(''); scheduleSave(); renderAll();
    $('#newName').focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#btnPdfNew').addEventListener('click', function () { pdfMode = 'new'; $('#pdfFile').click(); });
  $('#pdfFile').addEventListener('change', function (e) {
    var fs = e.target.files; var arr = Array.prototype.slice.call(fs); e.target.value = '';
    importPdfs(arr, pdfMode === 'new' ? true : pdfMode);
    pdfMode = 'auto';
  });
  $('#btnDocClear').addEventListener('click', function () {
    var p = current();
    if (!p || !confirm('‘' + p.name + '’의 PDF 분석 결과를 지울까요?')) return;
    p.doc = null; setDocMsg('');
    updateResults(); scheduleSave();
  });

  function dropTarget(el, asNew) {
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', function () { el.classList.remove('over'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault(); el.classList.remove('over');
      importPdfs(e.dataTransfer && e.dataTransfer.files, asNew);
    });
  }
  dropTarget($('#docCard'), 'auto');
  dropTarget($('#emptyDrop'), true);
  dropTarget($('.people'), true);
  // 파일을 카드 밖에 놓았을 때 브라우저가 PDF를 열어 버리지 않도록
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  /* ---------- 경력 산정 기준일 ---------- */
  var refIn = $('#refDate'), refPicker = $('#refPicker');
  refIn.value = CC.fmtIso(effRef());
  refIn.placeholder = '오늘 (' + CC.fmtIso(todayIso()) + ')';

  function afterRef() {
    if (current()) updateResults(); else renderPeople();
    scheduleSave();
  }
  refIn.addEventListener('input', function () {
    var t = refIn.value.trim(), iso = CC.parseDate(t);
    if (!t) { store.ref = ''; refIn.classList.remove('invalid'); afterRef(); }
    else if (iso) { store.ref = iso; refIn.classList.remove('invalid'); afterRef(); }
  });
  refIn.addEventListener('blur', function () {
    var t = refIn.value.trim(), iso = CC.parseDate(t);
    if (!t) { refIn.classList.remove('invalid'); return; }
    if (iso) { refIn.value = CC.fmtIso(iso); refIn.classList.remove('invalid'); }
    else { refIn.classList.add('invalid'); toast('기준일 형식을 확인하세요. 예: 2026-8-31, 26/8/31'); }
  });
  $('#refCal').addEventListener('click', function () {
    refPicker.value = effRef();
    try { if (refPicker.showPicker) refPicker.showPicker(); else refPicker.focus(); } catch (err) { refPicker.focus(); }
  });
  refPicker.addEventListener('input', function () {
    if (!refPicker.value) return;
    store.ref = refPicker.value; refIn.value = CC.fmtIso(store.ref); refIn.classList.remove('invalid'); afterRef();
  });
  /** 올해 학년도말(다음 해 2월 말일). 1~2월이면 아직 전 학년도이므로 올해 2월 말일 */
  function schoolYearEnd() {
    var d = new Date(), y = d.getFullYear(), sy = d.getMonth() + 1 >= 3 ? y : y - 1, ey = sy + 1;
    return { label: sy + '학년도말', iso: ey + '-02-' + p2(CC.lastDayOfMonth(ey, 2)) };
  }
  var sye = schoolYearEnd();
  $('#btnRefYearEnd').textContent = sye.label + '까지';
  $('#btnRefYearEnd').title = '기준일을 ' + CC.fmtIso(sye.iso) + '(' + sye.label + ')로 설정';
  $('#btnRefYearEnd').addEventListener('click', function () {
    store.ref = sye.iso; refIn.value = CC.fmtIso(store.ref); refIn.classList.remove('invalid');
    afterRef(); toast('기준일을 ' + sye.label + '(' + CC.fmtIso(sye.iso) + ')로 바꿨습니다.');
  });

  $('#btnRefToday').addEventListener('click', function () {
    store.ref = todayIso(); refIn.value = CC.fmtIso(store.ref); refIn.classList.remove('invalid');
    afterRef(); toast('기준일을 오늘 날짜로 바꿨습니다.');
  });

  /* ---------- 버전 표시 ---------- */
  (function () {
    var info = window.APP_INFO; if (!info) return;
    $('#verLine').textContent = '경력 계산기 v' + info.version + ' (' + info.date + ')';
    var ul = $('#changeList');
    info.changes.forEach(function (c) { ul.appendChild(h('li', { text: 'v' + c[0] + ' (' + c[1] + ') ' + c[2] })); });
  })();

  /* ---------- 알림 ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ---------- 시작 ---------- */
  if (boot.notice) showBanner(boot.notice);
  renderAll();
  setSaveState(store.people.length ? 'saved' : 'none');
  if (!store.people.length) $('#newName').focus();
})();
