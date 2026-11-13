import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readClaudeStatusline } from './claude-cache.mjs'
import { startRuntimeReceiver } from './runtime-receiver.mjs'

const root=path.dirname(fileURLToPath(import.meta.url))
const require=createRequire(path.resolve(root,'../../../../package.json'))
const {createPlanUsageReader}=require(path.resolve(root,'../../../../preload/claude/plan-usage.cjs'))
const planUsage=createPlanUsageReader({fs,path,os,platform:process.platform})
const readClaude=()=>readClaudeStatusline(claudeCache,Date.now(),planUsage.read())
const leveldown=require(path.resolve(root,'../../../../node_modules/.pnpm/leveldown@6.1.1/node_modules/leveldown'))
const database=path.join(os.homedir(),'Library/Application Support/uTools/database/55fdfd9a3e3f16f2629fc822e0df0bcf')
const claudeCache=path.join(os.homedir(),'Library/Application Support/uTools/claude-companion/eypc-claude-quota.json')
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{}
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(plain(value),k)).map(k=>[k,value[k]]))
function appearanceOnly(settings){const water=plain(settings.waterAppearance);return {displayStyle:settings.displayStyle,magpieQuotaAccess:settings.magpieQuotaAccess===true,providers:pick(settings.providers,['codex','claude','cursor','orca']),colors:pick(settings.colors,['healthy','warning','critical','water','card','cardForeground']),counterColors:pick(settings.counterColors,['input','active','unread']),waterAppearance:{inner:pick(water.inner,['palette','fillColorA','fillColorB','opacity','amplitude','motion','baseOpacity','showPercent','percentPosition','percentSize','percentTextStyle','percentColor']),outer:pick(water.outer,['style','thickness','colorMode','progressColor','trackColor','glow'])},expandedCardAppearance:pick(settings.expandedCardAppearance,['surface','surfaceRaised','foreground','secondary','border','focus','accent','running','pending','codexQuota','claudeQuota'])}}
function fingerprint(){return JSON.stringify(fs.readdirSync(database).filter(n=>/^(CURRENT|MANIFEST-|\d+\.(ldb|log))/.test(n)).sort().map(n=>{const s=fs.statSync(path.join(database,n));return [n,s.size,s.mtimeMs]}))}
async function readSettings(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'eypc-preview-'));fs.chmodSync(tmp,0o700);let db
 try{const before=fingerprint(),dir=path.join(tmp,'db');fs.cpSync(database,dir,{recursive:true,filter:s=>!['LOCK','LOG','LOG.old'].includes(path.basename(s))});if(before!==fingerprint())throw Error('配置快照在读取期间发生变化，请重试');db=leveldown(dir)
 await new Promise((resolve,reject)=>db.open({createIfMissing:false},e=>e?reject(e):resolve()));const get=k=>new Promise((resolve,reject)=>db.get(Buffer.from(k),(e,v)=>e?reject(e):resolve(v)))
 const meta=JSON.parse((await get('ÿdocument-storeÿzsccxdt8/eypc/state/v1')).toString());const seq=meta.rev_map?.[meta.winningRev];if(!Number.isInteger(seq))throw Error('无法确认配置版本')
 const doc=JSON.parse((await get('ÿby-sequenceÿ'+String(seq).padStart(16,'0'))).toString());if(doc._id!=='zsccxdt8/eypc/state/v1'||doc._rev!==meta.winningRev)throw Error('配置身份校验失败')
 const settings=plain(doc.value?.codex?.settings);if(!settings.waterAppearance||!settings.expandedCardAppearance||!settings.colors)throw Error('当前配置缺少外观字段')
 const quota=plain(doc.value?.codex?.cachedQuota);const bucket=x=>{const v=plain(x).remainingPercent;return typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(100,Math.round(v))):null};const normal=plain(quota.normal);const sparks=Array.isArray(quota.spark)?quota.spark.map(p=>({short:bucket(p.short),weekly:bucket(p.weekly)})):[]
 const reset=x=>{const n=plain(x).resetAt;return typeof n==='number'&&Number.isFinite(n)&&n>0?n:null};return {settings:appearanceOnly(settings),quota:{short:bucket(normal.short??quota.short),weekly:bucket(normal.weekly??quota.weekly),shortReset:reset(normal.short??quota.short),weeklyReset:reset(normal.weekly??quota.weekly),sparks,status:quota.status,updatedAt:quota.updatedAt}}
 }finally{if(db)await new Promise(r=>db.close(()=>r()));fs.rmSync(tmp,{recursive:true,force:true})}
}
async function readMagpie(){try{const response=await fetch('http://127.0.0.1:3425/v1/magpie/quotas',{signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error('unavailable');const payload=await response.json(),list=Array.isArray(payload)?payload:payload.data;if(!Array.isArray(list))throw Error('invalid');return list.filter(p=>['codex','grok','cursor'].includes(p.provider)).map(p=>({provider:p.provider,...(p.provider==='codex'&&typeof p.balance==='string'?{balance:p.balance.match(/[\d,.]+/)?.[0]||''}:{}),windows:Array.isArray(p.windows)?p.windows.filter(w=>['7 days','Cursor Models','Other Models'].includes(w.name)).map(w=>({name:w.name,remaining:typeof w.remaining==='number'?w.remaining:null,resetsAt:typeof w.resetsAt==='string'&&Number.isFinite(Date.parse(w.resetsAt))?w.resetsAt:null})):[]}))}catch{return null}}
const taskReceiver=startRuntimeReceiver()
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{taskReceiver.close();process.exit(0)})
http.createServer(async(req,res)=>{const host=req.headers.host;if(host!=='127.0.0.1:8094'&&host!=='localhost:8094'){res.writeHead(403);res.end();return}const url=new URL(req.url,'http://127.0.0.1:8094');if(req.method!=='GET'){res.writeHead(405);res.end();return}
 if(url.pathname==='/api/runtime-tasks'){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(taskReceiver.read()));return}
 if(url.pathname==='/api/claude-quota'){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(readClaude()));return}
 if(url.pathname==='/api/current-config'){try{let snapshot;for(let attempt=0;attempt<3;attempt++){try{snapshot=await readSettings();break}catch(error){if(attempt===2)throw error}}const {settings,quota}=snapshot;const magpie=settings.magpieQuotaAccess===true?await readMagpie():null;res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify({source:'installed-utools',settings,quota,magpie,claude:readClaude()}))}catch(e){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'当前配置暂不可用'}))}return}
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','app.js','styles.css','three.module.min.js','appearance-domain.js','magpie-domain.js','task-snapshot.js','real-build/real-ball.js','real-build/real-ball.css'].includes(name)){res.writeHead(404);res.end();return}try{const data=fs.readFileSync(path.join(root,name));res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(data)}catch{res.writeHead(404);res.end()}
}).listen(8094,'127.0.0.1',()=>console.log('EyPc appearance preview ready on 127.0.0.1:8094'))
