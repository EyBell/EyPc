'use strict'
// Optional local preview bridge. It exports only aggregate counts, never tasks.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net')
const ids=['codex','claude','cursor','orca'],keys=['input','active','unread'],instances=new WeakMap()
function project(snapshot){
 if(!snapshot||snapshot.complete!==true||snapshot.freshness!=='fresh'||!Array.isArray(snapshot.tasks)||!snapshot.views?.counts)return null
 const counts=Object.fromEntries(ids.map(id=>[id,{input:0,active:0,unread:0}]))
 for(const t of snapshot.tasks){if(t.hidden||t.paused||!t.capabilities?.open)continue;if(!counts[t.provider])return null;const c=counts[t.provider];if(t.phase==='waiting-input'||t.phase==='waiting-approval')c.input++;else if(t.phase==='running'&&(t.dynamicEligible||t.localPin===true||t.providerPin===true))c.active++;else if(t.phase==='completed'&&t.unread===true)c.unread++}
 for(const key of keys)if(ids.reduce((n,id)=>n+counts[id][key],0)!==snapshot.views.counts[key])return null
 return {revision:snapshot.packageRevision,counts,providers:Object.fromEntries(ids.map(id=>[id,snapshot.providers?.[id]===true])),health:Object.fromEntries(ids.map(id=>[id,{status:['ready','unavailable','degraded','disabled'].includes(snapshot.providerHealth?.[id]?.status)?snapshot.providerHealth[id].status:'unavailable'}]))}
}
function start(kernel,options={}){
 if(!kernel||typeof kernel.getLatest!=='function')return ()=>{}
 const dir=options.directory||(process.platform==='win32'?os.tmpdir():'/tmp'),uid=typeof process.getuid==='function'?process.getuid():null,descriptor=path.join(dir,`eypc-preview-${uid}.json`)
 function send(){try{
  const st=fs.lstatSync(descriptor);if(!st.isFile()||(uid!==null&&st.uid!==uid)||(st.mode&0o077)!==0||st.size>1024)return
  const d=JSON.parse(fs.readFileSync(descriptor,'utf8'));if(typeof d.socket!=='string'||!d.socket.startsWith(path.join(dir,'eypc-p-'))||!/^\w{64}$/.test(d.token))return
  const socketStat=fs.lstatSync(d.socket);if(!socketStat.isSocket()||(uid!==null&&socketStat.uid!==uid)||(socketStat.mode&0o077)!==0)return
  const payload=project(kernel.getLatest()),client=net.createConnection(d.socket);client.setTimeout(1000,()=>client.destroy());client.on('error',()=>{});client.on('connect',()=>client.end(JSON.stringify({token:d.token,payload})+'\n'))
 }catch{}}
 // Absent descriptor means zero ongoing polling in the normal plugin runtime.
 try{if(!fs.existsSync(descriptor))return ()=>{}}catch{return ()=>{}}
 const dispose=typeof kernel.onPackage==='function'?kernel.onPackage(send):()=>{};const timer=setInterval(send,5000);timer.unref?.();send();const stop=()=>{clearInterval(timer);dispose?.();instances.delete(kernel)};instances.set(kernel,stop);return stop
}
module.exports={project,start,stop:kernel=>instances.get(kernel)?.()}
