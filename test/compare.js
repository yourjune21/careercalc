const C=require('../js/calc.js');
const cases=require('./cases.json'), ex=require('./excel_res.json');
let bad=0;
cases.forEach(([s,e],i)=>{
  const d=C.diff(C.isoToSer(s),C.isoToSer(e));
  const x=ex[i];
  if(d.years!==x[0]||d.months!==x[1]||d.days!==x[2]){ if(bad++<15) console.log('DIFF',s,e,'js',d,'excel',x); }
});
console.log('total',cases.length,'mismatch',bad);
