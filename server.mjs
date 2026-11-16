import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const port=Number(process.env.PORT)||4173;
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const requested=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!requested.startsWith(root)){res.writeHead(403);res.end();return;}const body=await readFile(requested);res.writeHead(200,{'Content-Type':mime[path.extname(requested)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Knit Studio: http://127.0.0.1:${port}`));
