// 중복 제외(union) 검증: 무작위 기간들에서 날짜 집합이 같고 서로 겹치지 않는지 확인
const C=require('../public/js/calc.js');
let bad=0;
for(let t=0;t<5000;t++){
  const n=1+Math.floor(Math.random()*8), rows=[], days=new Set();
  for(let i=0;i<n;i++){const s=Math.floor(Math.random()*120), e=s+Math.floor(Math.random()*40); rows.push({s,e}); for(let d=s;d<=e;d++)days.add(d);}
  const u=C.union(rows), cov=new Set();
  u.forEach((m,i)=>{for(let d=m.s;d<=m.e;d++)cov.add(d); if(i&&u[i-1].e>=m.s) bad++; });
  if(cov.size!==days.size||[...days].some(d=>!cov.has(d))) bad++;
  if(C.findOverlaps(u).length) bad++;
}
// 중복이 없으면 포함 합산 == 제외 합산
const a=C.isoToSer('2026-04-01'), b=C.isoToSer('2026-04-30'), c=C.isoToSer('2026-05-01'), d=C.isoToSer('2026-05-31');
const rows=[{s:a,e:b},{s:c,e:d}];
const inc=C.sum(rows.map(r=>C.diff(r.s,r.e))), exc=C.sum(C.union(rows).map(r=>C.diff(r.s,r.e)));
if(JSON.stringify(inc)!==JSON.stringify(exc)) bad++;
console.log('union mismatches:',bad);
