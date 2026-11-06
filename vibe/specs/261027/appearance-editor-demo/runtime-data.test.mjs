import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {projectTaskSnapshot,subscribePlatformTasks} from './task-snapshot.js'
import {readClaudeStatusline} from './claude-cache.mjs'

const task=(provider,phase,extra={})=>({provider,phase,capabilities:{open:true},dynamicEligible:true,...extra})
const snapshot=()=>({complete:true,freshness:'fresh',packageRevision:4,providers:{codex:true,claude:true,cursor:true,orca:true},providerHealth:{},views:{counts:{input:2,active:2,unread:1}},tasks:[
 task('codex','waiting-input'),task('claude','waiting-approval'),task('cursor','running'),task('orca','running',{dynamicEligible:false,localPin:true}),task('codex','completed',{unread:true}),task('claude','running',{hidden:true}),task('cursor','waiting-input',{paused:true}),task('orca','running',{capabilities:{open:false}})
]})
test('按内核相位和隐藏、置顶规则分别计算来源，并核对总数',()=>{
 const actual=projectTaskSnapshot(snapshot());assert.deepEqual(actual.byProvider,{codex:{input:1,active:0,unread:1},claude:{input:1,active:0,unread:0},cursor:{input:0,active:1,unread:0},orca:{input:0,active:1,unread:0}})
 const bad=snapshot();bad.views.counts.input=99;assert.equal(projectTaskSnapshot(bad),null);bad.complete=false;assert.equal(projectTaskSnapshot(bad),null)
})
test('只读桥不存在或快照正在核实时不提供虚构数字',()=>{
 assert.equal(subscribePlatformTasks({},()=>{}),null);const s=snapshot();s.freshness='verifying';assert.equal(projectTaskSnapshot(s),null)
 const seen=[];let emit;subscribePlatformTasks({companionKernel:{getLatest:()=>snapshot(),subscribe:(_,fn)=>{emit=fn;return()=>{}}}},v=>seen.push(v));const old=snapshot();old.packageRevision=3;emit(old);assert.equal(seen.length,1)
})
test('Claude 使用插件计划历史合并规则并保留可验证的重置时间',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eypc-claude-test-')),file=path.join(dir,'quota.json'),now=Date.now()
 try{fs.writeFileSync(file,JSON.stringify({version:1,updatedAt:now-600000,rate_limits:{seven_day:{used_percentage:40,resets_at:Math.floor((now+86400000)/1000)}}}));const fresh=readClaudeStatusline(file,now,{at:now-60000,sevenDayUsedPercent:20,fiveHourUsedPercent:null});assert.equal(fresh.status,'fresh');assert.equal(fresh.primary,80);assert.equal(fresh.source,'plan-history');assert.equal(fresh.resetAt,Math.floor((now+86400000)/1000)*1000);const stale=readClaudeStatusline(file,now,{at:now-3600000,sevenDayUsedPercent:20});assert.equal(stale.status,'fresh');const missing=readClaudeStatusline(file+'-missing',now,{at:now,sevenDayUsedPercent:20});assert.equal(missing.status,'stale');assert.equal(missing.resetAt,null)}finally{fs.rmSync(dir,{recursive:true,force:true})}
})
