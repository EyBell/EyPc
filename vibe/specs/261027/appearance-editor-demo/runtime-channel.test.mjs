import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {createRequire} from 'node:module'
import {startRuntimeReceiver} from './runtime-receiver.mjs'
const require=createRequire(import.meta.url),bridge=require('../../../../preload/companion/appearance-preview-bridge.cjs')
const delay=ms=>new Promise(r=>setTimeout(r,ms))
test('只读通道仅传来源汇总，拒绝错误总数并在超时后失效',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eypc-p-')),uid=process.getuid(),descriptor=path.join(dir,`eypc-preview-${uid}.json`);let now=1000
 const receiver=startRuntimeReceiver({directory:dir,now:()=>now});let stop=()=>{}
 try{
  for(let i=0;i<100&&!fs.existsSync(descriptor);i++)await delay(10);assert.equal(fs.existsSync(descriptor),true)
  const snapshot={complete:true,freshness:'fresh',packageRevision:7,providers:{codex:true},providerHealth:{codex:{status:'ready'}},views:{counts:{input:1,active:0,unread:0}},tasks:[{provider:'codex',phase:'waiting-input',capabilities:{open:true},displayName:'PRIVATE TITLE',projectName:'PRIVATE PROJECT'}]}
  const desc=JSON.parse(fs.readFileSync(descriptor,'utf8'));const bad=net.createConnection(desc.socket);await new Promise((resolve,reject)=>{bad.once('error',reject);bad.once('connect',()=>{bad.end(JSON.stringify({token:'0'.repeat(64),payload:bridge.project(snapshot)})+'\n');resolve()})});await delay(40);assert.equal(receiver.read(),null)
  stop=bridge.start({getLatest:()=>snapshot,onPackage:f=>{f(snapshot);return()=>{}}},{directory:dir})
  for(let i=0;i<100&&!receiver.read();i++)await delay(10)
  const received=receiver.read();assert.equal(received.byProvider.codex.input,1);assert.equal(received.revision,7);assert.equal(JSON.stringify(received).includes('PRIVATE'),false)
  snapshot.views.counts.input=9;assert.equal(bridge.project(snapshot),null);now+=16000;assert.equal(receiver.read(),null)
 }finally{stop();receiver.close();await delay(20);fs.rmSync(dir,{recursive:true,force:true})}
})
