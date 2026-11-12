(function () {
  'use strict';

  var CC = window.CareerCalc, ST = window.CareerStorage;
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
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  /* ---------- 상태 ---------- */
  var boot = ST.init();
  var store = { mode: boot.mode, people: boot.state.people, selected: boot.state.selected };
  var search = '';
  var saveTimer = null, dirty = false;

  function blankRow() { return { memo: '', start: '', end: '' }; }
  function blankRows(n) { var a = []; for (var i = 0; i < n; i++) a.push(blankRow()); return a; }
  function ensureRows(p) { while (p.rows.length < START_ROWS) p.rows.push(blankRow()); }
  store.people.forEach(ensureRows);

  function current() {
    for (var i = 0; i < store.people.length; i++) if (store.people[i].id === store.selected) return store.people[i];
    return null;
  }

  /* ---------- 분석 ---------- */
  function analyze(p) {
    var info = p.rows.map(function (r) {
      var s = CC.isoToSer(r.start), e = CC.isoToSer(r.end);
      if (!(r.start || r.end || r.sRaw || r.eRaw)) return { kind: 'empty' };
      if (r.sBad || r.eBad) {
        return { kind: 'bad', msg: [r.sBad && '시작일', r.eBad && '종료일'].filter(Boolean).join('·') + ' 형식을 확인하세요' };
      }
      if (s == null || e == null) return { kind: 'partial', msg: s == null ? '시작일을 입력하세요' : '종료일을 입력하세요' };
      if (e < s) return { kind: 'reversed', msg: '종료일이 시작일보다 빠릅니다 (계산 제외)' };
      return { kind: 'ok', s: s, e: e, dur: CC.diff(s, e) };
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
    var res = ST.save(store.mode, { people: store.people, selected: store.selected || 0 });
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
  function renderPeople() {
    var ul = $('#peopleList');
    ul.textContent = '';
    $('#peopleCount').textContent = store.people.length + ' / ' + MAX_PEOPLE;
    $('#peopleSearch').hidden = store.people.length < 8;
    var q = search.trim().toLowerCase();
    var list = store.people.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; });
    list.forEach(function (p) {
      var a = analyze(p);
      var meta = a.okCount ? CC.fmtDur(a.total) : '입력 없음';
      var btn = h('button', { type: 'button', class: 'person', 'data-id': p.id, 'aria-current': p.id === store.selected ? 'true' : null },
        h('span', { class: 'p-name', text: p.name }),
        h('span', { class: 'p-meta' + (a.overlaps.length ? ' warn' : ''), text: (a.overlaps.length ? '⚠ ' : '') + meta }));
      ul.appendChild(h('li', null, btn));
    });
    if (!list.length) ul.appendChild(h('li', { class: 'p-empty', text: store.people.length ? '검색 결과가 없습니다' : '아직 추가한 사람이 없습니다' }));
  }

  function selectPerson(id) {
    store.selected = id;
    scheduleSave();
    renderAll();
  }

  /* ---------- 행 표 ---------- */
  function buildRow(r, i) {
    var tr = h('tr', { 'data-i': i });
    var startIn = h('input', { type: 'text', class: 'f-start', inputmode: 'numeric', autocomplete: 'off', placeholder: '2026. 3. 1.', 'aria-label': (i + 1) + '번 시작일', value: r.start ? CC.fmtIso(r.start) : (r.sRaw || '') });
    var endIn = h('input', { type: 'text', class: 'f-end', inputmode: 'numeric', autocomplete: 'off', placeholder: '2026. 3. 31.', 'aria-label': (i + 1) + '번 종료일', value: r.end ? CC.fmtIso(r.end) : (r.eRaw || '') });
    if (r.sBad) startIn.classList.add('invalid');
    if (r.eBad) endIn.classList.add('invalid');
    function dateCell(input, which) {
      return h('td', { class: 'c-date' },
        h('div', { class: 'date-box' }, input,
          h('button', { type: 'button', class: 'cal', 'data-which': which, 'aria-label': (which === 's' ? '시작일' : '종료일') + ' 달력 열기', tabindex: '-1', text: '📅' }),
          h('input', { type: 'date', class: 'picker', 'data-which': which, tabindex: '-1', 'aria-hidden': 'true', min: '1900-01-01', max: '2200-12-31' })),
        h('div', { class: 'hint', 'data-hint': which }));
    }
    tr.appendChild(h('td', { class: 'c-no', text: String(i + 1) }));
    tr.appendChild(h('td', { class: 'c-memo' }, h('input', { type: 'text', class: 'f-memo', maxlength: ST.MEMO_MAX, placeholder: '예: ○○초', 'aria-label': (i + 1) + '번 내용', value: r.memo || '' })));
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
      tr.classList.toggle('row-warn', !!(x.ov && x.ov.length));
      tr.classList.toggle('row-bad', x.kind === 'bad' || x.kind === 'reversed');
      if (x.ov && x.ov.length) {
        st.appendChild(h('span', { class: 'chip warn', text: '⚠ ' + x.ov.map(function (j) { return (j + 1) + '번'; }).join('·') + '과 중복' }));
      } else if (x.kind === 'bad' || x.kind === 'reversed') {
        st.appendChild(h('span', { class: 'chip bad', text: x.msg }));
      } else if (x.kind === 'partial') {
        st.appendChild(h('span', { class: 'chip soft', text: x.msg }));
      } else if (ok) {
        st.appendChild(h('span', { class: 'chip ok', text: '✓' }));
      }
      ['s', 'e'].forEach(function (w) {
        var iso = w === 's' ? r.start : r.end, hint = tr.querySelector('[data-hint="' + w + '"]');
        var txt = '';
        if (iso) {
          var ser = CC.isoToSer(iso), y = +iso.slice(0, 4), m = +iso.slice(5, 7);
          if (ser != null && m === 2) txt = '2월 말일: ' + CC.lastDayOfMonth(y, 2) + '일' + (CC.lastDayOfMonth(y, 2) === 29 ? ' (윤년)' : '');
        }
        hint.textContent = txt;
      });
    });

    renderWarnings(p, a);
    renderTotal(p, a);
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
    var ul = h('ul', { class: 'warn-list' });
    a.overlaps.forEach(function (o) {
      ul.appendChild(h('li', null,
        h('span', { class: 'tag', text: (o.i + 1) + '번 ↔ ' + (o.j + 1) + '번' }),
        h('span', { class: 'warn-text', text: '경고) ' + CC.fmtSer(o.s) + '~' + CC.fmtSer(o.e) + ' (' + CC.fmtDur(o.dur) + ' 중복)' })));
    });
    box.appendChild(ul);
    box.appendChild(h('p', { class: 'muted small', text: '‘중복 경력 포함’ 합산에는 겹친 기간이 그대로 들어가고, ‘중복 경력 제외’ 합산에서는 겹친 기간을 한 번만 셉니다. 종료일과 다음 시작일이 같은 날이면 그 하루가 중복으로 표시됩니다.' }));
  }

  function fmtTotal(t) { return t.years + '년 ' + t.months + '개월 ' + t.days + '일'; }
  function fmtRecog(r) { return r.years + '년 ' + r.months + '개월'; }

  function renderTotal(p, a) {
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
    $('#personSub').textContent = '경력 입력 · 최대 ' + MAX_ROWS + '행';
    renderRows();
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
    if (!name) { input.focus(); return; }
    if (store.people.length >= MAX_PEOPLE) { toast('최대 ' + MAX_PEOPLE + '명까지 저장할 수 있습니다.'); return; }
    var id = ST.nextId(store.people);
    store.people.push({ id: id, name: name.slice(0, ST.NAME_MAX), rows: blankRows(START_ROWS) });
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
    lines.push('[' + p.name + ']');
    lines.push('중복 경력 포함 합산: ' + (a.okCount ? fmtTotal(t) : '—'));
    lines.push('중복 경력 제외 합산: ' + (a.okCount ? fmtTotal(a.uniqTotal) : '—'));
    lines.push('인정 경력: ' + (a.okCount ? fmtRecog(CC.recognize(a.uniqTotal)) + ' (중복 제외 합산 기준, 15일 이상 1개월 올림)' : '—'));
    p.rows.forEach(function (r, i) {
      var x = a.rows[i];
      if (x.kind !== 'ok') return;
      lines.push((i + 1) + '. ' + (r.memo ? r.memo + ' ' : '') + CC.fmtSer(x.s) + '~' + CC.fmtSer(x.e) + ' (' + CC.fmtDur(x.dur) + ')');
    });
    a.overlaps.forEach(function (o) {
      lines.push('경고) ' + (o.i + 1) + '번↔' + (o.j + 1) + '번 ' + CC.fmtSer(o.s) + '~' + CC.fmtSer(o.e) + ' (' + CC.fmtDur(o.dur) + ' 중복)');
    });
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
  $('#btnPrint').addEventListener('click', function () { window.print(); });

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
      note.textContent = '이 브라우저의 저장소에 보관합니다. 100명까지 용량 걱정 없이 쓸 수 있습니다.';
    }
  }

  $('#modeSelect').addEventListener('change', function (e) {
    var to = e.target.value;
    flushSave();
    var res = ST.switchMode(store.mode, to, { people: store.people, selected: store.selected || 0 });
    if (res.ok) { store.mode = to; showBanner(''); setSaveState('saved'); toast('저장 방식을 바꾸고 기존 데이터를 옮겼습니다.'); }
    else { e.target.value = store.mode; showBanner(failMessage(res)); }
    renderMeter();
  });

  $('#btnExport').addEventListener('click', function () {
    var data = {
      app: 'career-calc', version: 1, exportedAt: new Date().toISOString(),
      people: store.people.map(function (p) {
        return { name: p.name, rows: p.rows.filter(function (r) { return r.memo || r.start || r.end; }).map(function (r) { return { memo: r.memo || '', start: r.start || '', end: r.end || '' }; }) };
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
              start: CC.parseDate(r && r.start) || '', end: CC.parseDate(r && r.end) || ''
            };
          });
          var np = { id: ST.nextId(store.people), name: p.name.trim().slice(0, ST.NAME_MAX) || '(이름 없음)', rows: rows };
          ensureRows(np);
          store.people.push(np); added++;
        });
        if (!store.selected && store.people.length) store.selected = store.people[0].id;
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
    store.people = []; store.selected = 0; dirty = false;
    setSaveState('none'); showBanner('');
    renderAll();
    toast('모두 삭제했습니다.');
  });

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
