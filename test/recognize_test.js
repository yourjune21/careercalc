const C=require('../public/js/calc.js');
const T=(y,m,d,ey,em)=>{const r=C.recognize({years:y,months:m,days:d});if(r.years!==ey||r.months!==em){console.log('FAIL',[y,m,d],r,'expected',[ey,em]);process.exitCode=1;}};
T(1,1,15,1,2);T(1,1,14,1,1);T(0,11,15,1,0);T(0,11,14,0,11);T(2,0,29,2,1);T(0,0,0,0,0);T(3,11,29,4,0);T(0,0,15,0,1);
console.log(process.exitCode?'recognize tests FAILED':'recognize tests ok');
