/*
 * 경력 계산 로직 (민법 역(曆)에 의한 계산)
 *
 * 엑셀 '경력계산기(ver. 20181112)'의 I·J·K열(년·월·일) 및 합산 수식을
 * 그대로 옮긴 것입니다. 시작일·종료일은 모두 기간에 포함(양 끝 포함)합니다.
 *   - 월 단위: 시작일의 '전일'이 해당 월의 종료일과 같으면 만(滿) 1개월
 *   - 일 단위: 30일은 29일로 처리 (엑셀 수식과 동일)
 *   - 합산: 일 30일 = 1개월, 월 12개월 = 1년
 * 근거: 2017 공무원보수 등의 업무지침(인사혁신처 예규 제35호)
 *
 * 날짜는 '일련번호(1970-01-01 기준 일수)'로 다루어 시간대 영향을 받지 않습니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CareerCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MS = 86400000;

  // Excel DATE(y, m, d) 와 같이 일/월이 넘치면 자동으로 이월됩니다.
  function ser(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / MS); }
  function parts(n) {
    var dt = new Date(n * MS);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  // EOMONTH(date, k): date가 속한 달에서 k개월 뒤 달의 말일
  function eomonth(y, m, k) { return ser(y, m + k + 1, 0); }

  /** 시작일~종료일(양 끝 포함)의 경과 기간 → {years, months, days} */
  function diff(sSer, eSer) {
    var s = parts(sSer), e = parts(eSer);
    var eEom = eomonth(e.y, e.m, 0);
    var eEomDay = parts(eEom).d;
    var sPrevDay = parts(sSer - 1).d;

    // 종료일이 '만 N개월'이 되는 날인지 (엑셀의 OR(AND..., AND..., AND...) 부분)
    var full =
      (s.d === 1 && eSer === eEom) ||
      (s.d > 1 && sPrevDay === e.d) ||
      (s.d > 1 && sPrevDay > eEomDay && eSer === eEom);

    var anniv = ser(e.y, s.m, s.d) > eSer;          // DATE(YEAR(E),MONTH(D),DAY(D)) > E
    var mRaw = (e.m - s.m) + (anniv ? 12 : 0) + (full ? 1 : 0) - (s.d > e.d ? 1 : 0);

    var years = (e.y - s.y) + (mRaw === 12 ? 1 : 0) - (anniv ? 1 : 0);
    var months = mRaw === 12 ? 0 : mRaw;

    var days;
    if (full) {
      days = 0;
    } else {
      var t;
      if (s.d > e.d) {
        var py = e.m === 1 ? e.y - 1 : e.y;
        var pm = e.m === 1 ? 12 : e.m - 1;
        var prevEomDay = parts(eomonth(e.y, e.m, -1)).d;
        t = eSer - ser(py, pm, s.d > prevEomDay ? prevEomDay + 1 : s.d);
      } else {
        t = eSer - ser(e.y, e.m, s.d);
      }
      days = (t + 1 === 30) ? 29 : t + 1;
    }
    return { years: years, months: months, days: days };
  }

  /** 여러 기간의 합산 (엑셀 I30:K30) */
  function sum(list) {
    var Y = 0, M = 0, D = 0;
    for (var i = 0; i < list.length; i++) {
      Y += list[i].years; M += list[i].months; D += list[i].days;
    }
    var carryM = Math.floor(D / 30);
    var totalM = M + carryM;
    return {
      years: Y + Math.floor(totalM / 12),
      months: totalM % 12,
      days: D % 30
    };
  }

  /** 두 기간이 겹치는 구간 (양 끝 포함). 겹치지 않으면 null */
  function overlap(a, b) {
    var lo = Math.max(a.s, b.s), hi = Math.min(a.e, b.e);
    return lo <= hi ? { s: lo, e: hi } : null;
  }

  /**
   * 입력 행들 사이의 중복 기간 검출.
   * rows: [{s:일련번호|null, e:일련번호|null}]  (무효 행은 null)
   * 반환: [{i, j, s, e, dur:{years,months,days}}]  (i<j, 행 인덱스는 0부터)
   */
  function findOverlaps(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i];
      if (!a || a.s == null || a.e == null || a.e < a.s) continue;
      for (var j = i + 1; j < rows.length; j++) {
        var b = rows[j];
        if (!b || b.s == null || b.e == null || b.e < b.s) continue;
        var o = overlap(a, b);
        if (o) out.push({ i: i, j: j, s: o.s, e: o.e, dur: diff(o.s, o.e) });
      }
    }
    return out;
  }

  /**
   * 겹치는 기간을 하나로 합침 (중복 제외 합산용).
   * 하루라도 겹치는 기간만 합치고, 맞닿기만 한 기간(종료일 다음날 시작)은 따로 둡니다.
   * 그래서 중복이 없으면 '포함 합산'과 '제외 합산'이 항상 같습니다.
   */
  function union(rows) {
    var v = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r && r.s != null && r.e != null && r.e >= r.s) v.push({ s: r.s, e: r.e });
    }
    v.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
    var out = [];
    v.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r.s <= last.e) { if (r.e > last.e) last.e = r.e; }
      else out.push(r);
    });
    return out;
  }

  /** 'YYYY-MM-DD' ↔ 일련번호 */
  function isoToSer(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var n = ser(y, mo, d), p = parts(n);
    return (p.y === y && p.m === mo && p.d === d) ? n : null;
  }
  function serToIso(n) {
    var p = parts(n);
    return p.y + '-' + pad(p.m) + '-' + pad(p.d);
  }
  function pad(x) { return (x < 10 ? '0' : '') + x; }

  /** 사용자가 입력한 문자열 → 'YYYY-MM-DD' (실패 시 null).
   *  2026-3-1, 2026/3/1, 2026.3.1, 2026. 3. 1., 20260301 모두 허용 */
  function parseDate(text) {
    if (text == null) return null;
    var t = String(text).trim();
    if (!t) return null;
    var y, m, d, r;
    if ((r = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/.exec(t))) { y = +r[1]; m = +r[2]; d = +r[3]; }
    else if ((r = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) { y = +r[1]; m = +r[2]; d = +r[3]; }
    else return null;
    if (y < 1900 || y > 2200) return null;
    var iso = y + '-' + pad(m) + '-' + pad(d);
    return isoToSer(iso) == null ? null : iso;
  }

  /** 표시용: 2026. 3. 1. */
  function fmtSer(n) { var p = parts(n); return p.y + '. ' + p.m + '. ' + p.d + '.'; }
  function fmtIso(iso) { var n = isoToSer(iso); return n == null ? '' : fmtSer(n); }

  /** 표시용: '1년 2개월 3일' (0인 단위는 생략, 모두 0이면 '0일') */
  function fmtDur(d) {
    var a = [];
    if (d.years) a.push(d.years + '년');
    if (d.months) a.push(d.months + '개월');
    if (d.days) a.push(d.days + '일');
    return a.length ? a.join(' ') : '0일';
  }

  /** 해당 월의 말일 (윤년 안내용; 그레고리력 규칙) */
  function lastDayOfMonth(y, m) { return parts(eomonth(y, m, 0)).d; }

  return {
    diff: diff, sum: sum, overlap: overlap, findOverlaps: findOverlaps, union: union,
    isoToSer: isoToSer, serToIso: serToIso, parseDate: parseDate,
    fmtSer: fmtSer, fmtIso: fmtIso, fmtDur: fmtDur, lastDayOfMonth: lastDayOfMonth
  };
});
