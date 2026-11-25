/*
 * 인사기록(인사카드) PDF에서 경력 기간을 읽어 총경력·부장 경력·학교폭력 경력을 계산합니다.
 *
 *  - 읽는 곳: '16. 경력' 표(재직·휴직·보직), '12. 가산점' 표(학교폭력예방및기여)
 *  - 그 밖의 내용(주민등록번호·주소 등)은 읽거나 저장하지 않습니다. 이름만 새 사람 추가용으로 읽습니다.
 *  - 모든 처리는 브라우저 안에서만 이루어집니다.
 *
 * 기록(record) 형태: { k:'S'|'B'|'D'|'J'|'L'|'V'|'R'|'M'|'H', s:'YYYY-MM-DD', e:'YYYY-MM-DD'|'' , x:0|1, lab? }
 *   S 재직(일반)  B 재직 중 부장  D 재직 중 파견  J 재직 중 전문직(장학사·교육연구사 등)
 *   L 휴직 등(총경력에서 차감)  V 학교폭력예방및기여  R 연구·시범학교(가산점)  M 군 복무(기본은 제외 x=1, 체크하면 총경력에 합산)
 *   e가 비어 있으면 ‘현재까지(기준일까지)’, x=1 이면 계산에서 제외
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfCareer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATE = /^\s*(\d{4})\.(\d{2})\.(\d{2})\s*(~)?\s*$/;
  var LEAVE = /휴직|정직|직위해제/;
  var HIRE = /공채|신규채용|신규임용|특별채용|특채|경력채용/;
  var DISPATCH = /파견/, BACK = /복귀|복직/, PRO = /장학관|장학사|교육연구관|교육연구사|전문직/;

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
    if (m[2] === '병역사항') return 'military';
    return 'other';
  }

  /** pages: [{ items:[{str,x,y,w}] }] → { name, records, warnings } */
  function parsePages(pages) {
    var warnings = [], name = '', org = '', pos = '';
    var secItems = { career: [], bonus: [] }, milLines = [];
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
        if (pi === 0 && cur === 'none') {
          line.items.forEach(function (it, ix) {
            var t = it.str.trim(), nx = line.items[ix + 1];
            if (!nx) return;
            if (t === '소속' && !org) org = nx.str.trim();
            if (t === '직위' && !pos) pos = nx.str.trim();
          });
        }
        var sec = sectionOf(line.norm, line.items.length);
        if (sec) { cur = sec; return; }
        if (cur === 'military') milLines.push(line.text);
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
    // '부서' 칸 위치: 머리글의 '부'(서)와 '발'(령청) 글자 사이
    var bx = 344, fx = 471;
    secItems.career.forEach(function (it) {
      var t = it.str.trim();
      if (t === '부' && it.x > 250 && it.x < 460) bx = it.x;
      if (t === '발' && it.x > 400) fx = it.x;
    });
    // '임용구분' 칸: 날짜 칸과 '직급' 칸 사이
    var gx = 232;
    secItems.career.forEach(function (it) { if (/^직\s*급/.test(it.str.trim()) && it.x > 180 && it.x < 300) gx = it.x; });
    c.rows.forEach(function (r) {
      var kind = r.texts.filter(function (i) { return i.x >= c.dateX + 60 && i.x < gx - 20; })
        .sort(function (a, b) { return b.y - a.y || a.x - b.x; })
        .map(function (i) { return i.str.trim(); }).join('').replace(/\s+/g, ' ').replace(/^\d+호\s*[:：]?\s*/, '');
      var dept = r.texts.filter(function (i) { return i.x >= bx - 45 && i.x < (bx + fx) / 2 + 20; })
        .sort(function (a, b) { return b.y - a.y || a.x - b.x; })
        .map(function (i) { return i.str.trim(); }).join('').replace(/\s+/g, ' ');
      var sp = dept.indexOf(' ');
      if (sp > 0 && sp < dept.length - 1) dept = dept.slice(sp + 1);     // '○○지원청 ○○초등학교' → '○○초등학교'
      var txt = r.texts.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; })
        .map(function (i) { return i.str; }).join(' ');
      var t = norm(txt);
      var k = (LEAVE.test(t) && !/복직/.test(t)) ? 'L'
        : (DISPATCH.test(t) && !BACK.test(t)) ? 'D'
        : PRO.test(t) ? 'J'
        : (/부장/.test(t) ? 'B' : 'S');
      records.push({ k: k, s: r.s, e: r.e, x: 0, lab: txt.replace(/\s+/g, ' ').slice(0, 60), hire: HIRE.test(t), d: dept.slice(0, 30), t: kind.slice(0, 20) });
    });

    markFirstHire(records);

    var b = buildRows(secItems.bonus);
    b.rows.forEach(function (r) {
      // '영역' 칸(기간 칸보다 왼쪽)만 보고 판단
      var area = r.texts.filter(function (i) { return i.x + i.w <= b.dateX - 2; })
        .sort(function (p, q) { return q.y - p.y || p.x - q.x; })
        .map(function (i) { return i.str; }).join(' ');
      var an = norm(area);
      if (/학교폭력/.test(an)) {
        records.push({ k: 'V', s: r.s, e: r.e, x: 0, lab: area.replace(/\s+/g, ' ').slice(0, 60) });
      } else if (/연구.?시범학교|연구학교/.test(an)) {
        records.push({ k: 'R', s: r.s, e: r.e, x: 0, lab: area.replace(/\s+/g, ' ').slice(0, 60) });
      }
    });
    if (!records.some(function (r) { return r.k === 'V'; })) warnings.push('‘12. 가산점’에서 학교폭력예방및기여 기록을 찾지 못했습니다.');

    milLines.forEach(function (t) {
      var re = /(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/g, m;
      while ((m = re.exec(t))) {
        var ms = m[1] + '-' + m[2] + '-' + m[3], me = m[4] + '-' + m[5] + '-' + m[6];
        if (ms <= me) records.push({ k: 'M', s: ms, e: me, x: 0, lab: '병역 ' + (/(현역|공익|예비역|복무)/.exec(t) || ['복무'])[0] });
      }
    });

    return { name: name, org: org, pos: pos, records: records, warnings: warnings };
  }

  function nextDay(iso) {
    var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  /**
   * 첫 채용(일반공채·신규임용 등) 행은 종료일이 비어 있어 이후 전보·승진 행과 통째로 겹친다.
   * 나머지 행이 그 기간을 전부 이어서 덮는 경우에만 'H'(기본 제외)로 표시한다.
   */
  function markFirstHire(records) {
    var cand = null, INF = '9999-12-31';
    records.forEach(function (r) { if (r.k === 'S' && r.hire && (!cand || r.s < cand.s)) cand = r; });
    records.forEach(function (r) { delete r.hire; });
    if (!cand) return;
    var segs = records.filter(function (r) { return r !== cand && ['S', 'B', 'D', 'J', 'L'].indexOf(r.k) >= 0; })
      .map(function (r) { return { s: r.s, e: r.e || INF }; })
      .sort(function (a, b) { return a.s < b.s ? -1 : a.s > b.s ? 1 : 0; });
    var merged = [];
    segs.forEach(function (g) {
      var l = merged[merged.length - 1];
      if (l && (l.e === INF || g.s <= nextDay(l.e))) { if (g.e > l.e) l.e = g.e; }
      else merged.push({ s: g.s, e: g.e });
    });
    var ce = cand.e || INF;
    if (merged.some(function (m) { return m.s <= cand.s && m.e >= ce; })) { cand.k = 'H'; cand.x = 1; }
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
      total: pack(CC.subtract(CC.union(iv(kinds(['S', 'H', 'B', 'D', 'J'])), true), leaves)),
      mil: pack(CC.union(iv(records.filter(function (r) { return r.k === 'M'; })))),
      buzang: pack(CC.subtract(CC.union(iv(kinds(['B'])), true), leaves)),
      violence: pack(CC.union(iv(kinds(['V'])))),
      research: pack(CC.union(iv(kinds(['R'])))),
      dispatch: pack(CC.subtract(CC.union(iv(kinds(['D'])), true), leaves)),
      leave: pack(leaves),
      pro: pack(CC.subtract(CC.union(iv(kinds(['J'])), true), leaves))
    };
  }

  return { parsePages: parsePages, readPages: readPages, compute: compute };
});
