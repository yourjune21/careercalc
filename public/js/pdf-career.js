/*
 * 인사기록(인사카드) PDF에서 경력 기간을 읽어 총경력·부장 경력·학교폭력 경력을 계산합니다.
 *
 *  - 읽는 곳: '16. 경력' 표(재직·휴직·보직), '12. 가산점' 표(학교폭력예방및기여)
 *  - 그 밖의 내용(주민등록번호·주소 등)은 읽거나 저장하지 않습니다. 이름만 새 사람 추가용으로 읽습니다.
 *  - 모든 처리는 브라우저 안에서만 이루어집니다.
 *
 * 기록(record) 형태: { k:'S'|'B'|'L'|'V', s:'YYYY-MM-DD', e:'YYYY-MM-DD'|'' , x:0|1, lab? }
 *   S 재직(일반)  B 재직 중 부장  L 휴직 등(총경력에서 차감)  V 학교폭력예방및기여
 *   e가 비어 있으면 ‘현재까지(기준일까지)’, x=1 이면 계산에서 제외
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfCareer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATE = /^\s*(\d{4})\.(\d{2})\.(\d{2})\s*(~)?\s*$/;
  var LEAVE = /휴직|정직|직위해제/;

  function iso(m) { return m[1] + '-' + m[2] + '-' + m[3]; }
  function norm(t) { return String(t).replace(/\s+/g, ''); }

  /** items를 y(위→아래) 기준 줄로 묶음 */
  function toLines(items) {
    var sorted = items.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    sorted.forEach(function (it) {
      var last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= 3) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    });
    lines.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      l.text = l.items.map(function (i) { return i.str; }).join(' ');
      l.norm = norm(l.text);
    });
    return lines;
  }

  function sectionOf(norm, nItems) {
    var m = /^(\d{1,2})\.([가-힣・·\(\)]{2,})$/.exec(norm);
    if (!m || nItems > 4) return null;
    if (m[2] === '경력' || m[2] === '경력사항') return 'career';
    if (m[2] === '가산점') return 'bonus';
    return 'other';
  }

  /** pages: [{ items:[{str,x,y,w}] }] → { name, records, warnings } */
  function parsePages(pages) {
    var warnings = [], name = '';
    var secItems = { career: [], bonus: [] };
    var cur = 'none';

    pages.forEach(function (pg, pi) {
      var items = pg.items.filter(function (i) {
        var t = String(i.str).trim();
        if (!t) return false;
        if (/^\d+\s*\/\s*\d+$/.test(t)) return false;              // 쪽번호
        if (/\d{2}:\d{2}\s*\//.test(t)) return false;             // 출력 일시 바닥글
        return true;
      }).map(function (i) { return { str: i.str, x: i.x, y: i.y, w: i.w || 0, page: pi }; });

      toLines(items).forEach(function (line) {
        if (pi === 0 && !name) {
          var nm = /^([가-힣A-Za-z]{2,10})\s*\(\s*\d+\s*세/.exec(line.text);
          if (nm) name = nm[1];
        }
        var sec = sectionOf(line.norm, line.items.length);
        if (sec) { cur = sec; return; }
        if (cur === 'career' || cur === 'bonus') line.items.forEach(function (i) { secItems[cur].push(i); });
      });
    });

    // 표에서 기간(시작~종료) 행을 만들고, 같은 행의 다른 칸 글자를 붙임
    function buildRows(items) {
      var ord = items.slice().sort(function (a, b) { return a.page - b.page || b.y - a.y || a.x - b.x; });
      var dates = [];
      ord.forEach(function (it) {
        var m = DATE.exec(it.str);
        if (!m) return;
        var tilde = !!m[4] || ord.some(function (o) {
          return o.page === it.page && Math.abs(o.y - it.y) <= 2 && o.x > it.x && o.str.trim() === '~';
        });
        dates.push({ it: it, d: iso(m), tilde: tilde });
      });
      var rows = [];
      dates.forEach(function (d) {
        if (d.tilde) rows.push({ s: d.d, sIt: d.it, e: '', eIt: null, texts: [] });
        else {
          var r = rows[rows.length - 1];
          if (r && !r.e) { r.e = d.d; r.eIt = d.it; }
        }
      });
      rows.forEach(function (r) {
        r.page = r.sIt.page;
        r.cy = (r.eIt && r.eIt.page === r.page) ? (r.sIt.y + r.eIt.y) / 2 : r.sIt.y - 7;
      });
      var dateX = rows.length ? Math.min.apply(null, rows.map(function (r) { return r.sIt.x; })) : 0;
      var firstY = {};
      rows.forEach(function (r) { if (firstY[r.page] == null || r.sIt.y > firstY[r.page]) firstY[r.page] = r.sIt.y; });
      ord.forEach(function (it) {
        if (DATE.test(it.str) || it.str.trim() === '~') return;
        if (firstY[it.page] != null && it.y > firstY[it.page] + 10) return;   // 표 머리글
        var best = null, bd = 1e9;
        rows.forEach(function (r) {
          if (r.page !== it.page) return;
          var dd = Math.abs(it.y - r.cy);
          if (dd < bd) { bd = dd; best = r; }
        });
        if (best && bd <= 30) best.texts.push(it);
      });
      return { rows: rows, dateX: dateX };
    }

    var records = [];

    var c = buildRows(secItems.career);
    if (!c.rows.length) warnings.push('‘16. 경력’ 표에서 기간을 찾지 못했습니다.');
    c.rows.forEach(function (r) {
      var txt = r.texts.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; })
        .map(function (i) { return i.str; }).join(' ');
      var t = norm(txt);
      var k = (LEAVE.test(t) && !/복직/.test(t)) ? 'L' : (/부장/.test(t) ? 'B' : 'S');
      records.push({ k: k, s: r.s, e: r.e, x: 0, lab: txt.replace(/\s+/g, ' ').slice(0, 60) });
    });

    var b = buildRows(secItems.bonus);
    b.rows.forEach(function (r) {
      // '영역' 칸(기간 칸보다 왼쪽)만 보고 판단
      var area = r.texts.filter(function (i) { return i.x + i.w <= b.dateX - 2; })
        .sort(function (p, q) { return q.y - p.y || p.x - q.x; })
        .map(function (i) { return i.str; }).join(' ');
      if (/학교폭력/.test(norm(area))) {
        records.push({ k: 'V', s: r.s, e: r.e, x: 0, lab: area.replace(/\s+/g, ' ').slice(0, 60) });
      }
    });
    if (!records.some(function (r) { return r.k === 'V'; })) warnings.push('‘12. 가산점’에서 학교폭력예방및기여 기록을 찾지 못했습니다.');

    return { name: name, records: records, warnings: warnings };
  }

  /** pdf.js 문서 → pages */
  function readPages(pdf) {
    var out = [], n = pdf.numPages, p = Promise.resolve();
    for (var i = 1; i <= n; i++) (function (no) {
      p = p.then(function () { return pdf.getPage(no); }).then(function (page) { return page.getTextContent(); })
        .then(function (tc) {
          out.push({
            items: tc.items.filter(function (it) { return typeof it.str === 'string'; }).map(function (it) {
              return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width };
            })
          });
        });
    })(i);
    return p.then(function () { return out; });
  }

  /**
   * 기록 → 총경력 / 부장 / 학교폭력 계산.
   * CC = CareerCalc, refIso = 경력 산정 기준일('YYYY-MM-DD')
   */
  function compute(records, refIso, CC) {
    var ref = CC.isoToSer(refIso);
    var use = records.filter(function (r) { return !r.x; });
    function iv(list) {
      var out = [];
      list.forEach(function (r) {
        var s = CC.isoToSer(r.s), e = r.e ? CC.isoToSer(r.e) : ref;
        if (s == null || e == null) return;
        if (ref != null && e > ref) e = ref;
        if (e < s) return;
        out.push({ s: s, e: e });
      });
      return out;
    }
    function kinds(ks) { return use.filter(function (r) { return ks.indexOf(r.k) >= 0; }); }
    function pack(segs) {
      var durs = segs.map(function (g) { return CC.diff(g.s, g.e); });
      var sum = CC.sum(durs);
      return { segs: segs, durs: durs, sum: sum, rec: CC.recognize(sum) };
    }
    var leaves = CC.union(iv(kinds(['L'])));
    return {
      total: pack(CC.subtract(CC.union(iv(kinds(['S', 'B'])), true), leaves)),
      buzang: pack(CC.subtract(CC.union(iv(kinds(['B'])), true), leaves)),
      violence: pack(CC.union(iv(kinds(['V']))))
    };
  }

  return { parsePages: parsePages, readPages: readPages, compute: compute };
});
