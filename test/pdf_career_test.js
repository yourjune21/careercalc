// 합성 데이터(개인정보 없음)로 PDF 표 해석과 총경력/부장/학교폭력 계산을 검증합니다.
const PC = require('../public/js/pdf-career.js');
const CC = require('../public/js/calc.js');
const it = (str, x, y, w) => ({ str, x, y, w: w || str.length * 6 });
const page = { items: [
  it('홍길동', 50, 800), it('(', 90, 800), it('40', 100, 800), it('세', 115, 800), it(')', 125, 800),
  it('주민등록번호', 300, 800), it('000000-0000000', 360, 800),                      // 읽지 않아야 함
  it('12. 가산점', 49, 700), it('영', 112, 690), it('역', 135, 690), it('연도', 259, 690),
  it('2023.03.01 ~', 238, 660, 64), it('학교폭력예방및기여(공통)', 70, 653, 118), it('담임', 486, 653), it('2024.02.29', 243, 646, 53),
  it('2022.03.01 ~', 238, 620, 64), it('연구・시범학교(공통)', 80, 613, 90), it('학교폭력예방및기여', 450, 613, 90), it('2023.02.28', 243, 606, 53),
  it('16. 경', 49, 500), it('력', 88, 500), it('기 간', 72, 490), it('임용구분', 154, 490),
  it('2020.03.01 ~', 58, 470, 64), it('일반공채(일반)', 136, 470), it('초등학교교사', 218, 470),
  it('2023.03.01 ~', 58, 440, 64), it('부장교사(교사(초', 218, 433), it('2024.02.29', 64, 426, 53),
  it('2024.03.01 ~', 58, 400, 64), it('7호:육아휴직(첫', 136, 393), it('2024.08.31', 64, 386, 53), it('째)', 136, 380),
  it('2024.09.01 ~', 58, 360, 64), it('휴직복직', 136, 353), it('2024.09.01', 64, 346, 53),
  it('17. 보충기재', 49, 300), it('2011.01.01 ~', 58, 270, 64), it('부장', 218, 263), it('2011.12.31', 64, 256, 53),   // 다른 항목: 무시
  it('1 / 1', 280, 56), it('기관/2026.11.23 13:55/10.0.0.1/홍길동', 392, 13)
] };
const r = PC.parsePages([page]);
const fail = (m, ...a) => { console.log('FAIL', m, ...a); process.exitCode = 1; };
if (r.name !== '홍길동') fail('name', r.name);
const kinds = r.records.map(x => x.k + x.s + '~' + (x.e || '')).join(' ');
const expect = 'V2023-03-01~2024-02-29 S2020-03-01~ B2023-03-01~2024-02-29 L2024-03-01~2024-08-31 S2024-09-01~2024-09-01 R2022-03-01~2023-02-28';
// 정렬 순서는 달라도 되므로 집합으로 비교
const got = r.records.map(x => x.k + x.s + '~' + (x.e || '')).sort().join(' ');
if (got !== expect.split(' ').sort().join(' ')) fail('records', kinds);
const c = PC.compute(r.records, '2025-03-31', CC);
const f = v => v.sum.years + 'y' + v.sum.months + 'm' + v.sum.days + 'd/' + v.rec.years + 'y' + v.rec.months + 'm';
if (f(c.total) !== '4y7m0d/4y7m') fail('total', f(c.total));
if (f(c.buzang) !== '1y0m0d/1y0m') fail('buzang', f(c.buzang));
if (f(c.violence) !== '1y0m0d/1y0m') fail('violence', f(c.violence));
// 반영 해제: 휴직 기록을 끄면 근무로 간주 → 2020.03.01~2025.03.31
const r2 = r.records.map(x => Object.assign({}, x, { x: x.k === 'L' ? 1 : 0 }));
if (f(PC.compute(r2, '2025-03-31', CC).total) !== '5y1m0d/5y1m') fail('leave off', f(PC.compute(r2, '2025-03-31', CC).total));
console.log(process.exitCode ? 'pdf_career tests FAILED' : 'pdf_career tests ok');
