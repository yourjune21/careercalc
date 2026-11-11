// 로컬 확인용 정적 서버 (Cloudflare Pages처럼 _headers의 헤더를 적용)
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','public');
const hdr={};fs.readFileSync(path.join(root,'_headers'),'utf8').split('\n').slice(1).forEach(l=>{const i=l.indexOf(':');if(i>0)hdr[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('nf');}
 r.writeHead(200,Object.assign({'Content-Type':types[path.extname(f)]||'text/plain'},hdr));r.end(fs.readFileSync(f));
}).listen(+process.argv[2]||8787,()=>console.log('listening'));
