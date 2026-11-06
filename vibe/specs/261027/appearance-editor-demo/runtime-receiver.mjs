import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
// Private per-user Unix socket; browser has no write endpoint.
export function startRuntimeReceiver({directory=process.platform==='win32'?os.tmpdir():'/tmp',now=()=>Date.now()}={}){
 const uid=typeof process.getuid==='function'?process.getuid():null,descriptor=path.join(directory,`eypc-preview-${uid}.json`),socket=path.join(directory,`eypc-p-${crypto.randomBytes(8).toString('hex')}.sock`),token=crypto.randomBytes(32).toString('hex');let latest=null,at=0,descriptorInode=null,socketInode=null
 const server=net.createServer(client=>{let data='';client.setTimeout(1000,()=>client.destroy());client.on('error',()=>{});client.on('data',chunk=>{data+=chunk;if(data.length>8192){client.destroy();return}const end=data.indexOf('\n');if(end<0)return;try{const message=JSON.parse(data.slice(0,end));if(typeof message.token!=='string'||message.token.length!==token.length||!crypto.timingSafeEqual(Buffer.from(message.token),Buffer.from(token)))return;const p=message.payload;if(p===null){latest=null;at=now();return}const ids=['codex','claude','cursor','orca'],keys=['input','active','unread'];if(!Number.isSafeInteger(p?.revision)||!ids.every(id=>keys.every(k=>Number.isSafeInteger(p.counts?.[id]?.[k])&&p.counts[id][k]>=0&&p.counts[id][k]<=100000)&&typeof p.providers?.[id]==='boolean'&&['ready','unavailable','degraded','disabled'].includes(p.health?.[id]?.status)))return;latest={revision:p.revision,byProvider:Object.fromEntries(ids.map(id=>[id,Object.fromEntries(keys.map(k=>[k,p.counts[id][k]]))])),providers:Object.fromEntries(ids.map(id=>[id,p.providers[id]])),health:Object.fromEntries(ids.map(id=>[id,{status:p.health[id].status}]))};at=now()}catch{}client.end()})})
 server.on('error',()=>{})
 server.listen(socket,()=>{try{fs.chmodSync(socket,0o600);socketInode=fs.lstatSync(socket).ino;const fd=fs.openSync(descriptor,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({socket,token}));descriptorInode=fs.fstatSync(fd).ino}finally{fs.closeSync(fd)}}catch{server.close();unlinkOwned(socket,socketInode)}})
 function unlinkOwned(file,ino){try{if(ino!==null&&fs.lstatSync(file).ino===ino)fs.unlinkSync(file)}catch{}}
 function close(){server.close();unlinkOwned(descriptor,descriptorInode);unlinkOwned(socket,socketInode)}
 return {read:()=>latest&&now()-at<15000?latest:null,close}
}
