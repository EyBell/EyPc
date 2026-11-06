import { createApp, h, reactive } from 'vue'
import CodexWaterBall from '../../../../src/components/CodexWaterBall.vue'
import { resolveCompactQuotaGridPresentation } from '../../../../src/domain/magpieQuota.ts'

// All visual layers are the real component, not screenshots or a tinted replacement.
const layers = [
  { id:'base', name:'球体与高光', x:-70, y:-24, z:-55 },
  { id:'liquid', name:'三层水波', x:70, y:18, z:35 },
  { id:'track', name:'外环轨道', x:-44, y:-74, z:4 },
  { id:'ring', name:'额度外环', x:56, y:-72, z:78 },
  { id:'reading', name:'中心额度', x:0, y:76, z:115 }
]
function reading(kind, percent) {
  return Number.isFinite(percent) ? {kind, family:'normal', label:kind==='weekly'?'Weekly':'5h',longLabel:kind==='weekly'?'周限额':'5 小时限额',limitName:'',bucket:{remainingPercent:percent}} : null
}
export function mountRealBall(element, handlers) {
  const data=reactive({visible:true, expanded:[],selected:null,hovered:null,colors:{},params:{},sizes:{},sources:{},magpie:null,quota:null,claude:null,counts:null,yaw:0,pitch:0})
  let down=null
  function props() {
    const p=data.params,c=data.colors,q=data.sources.Codex?data.quota:null
    const weekly=reading('weekly',q?.weekly),primary=reading(q?.primaryKind||'short',q?.primary)
    const grid=resolveCompactQuotaGridPresentation(data.magpie,{enabled:data.sources.Magpie===true,status:data.magpie?'ok':'loading'})
    const claudeOnly=data.sources.Claude&&!data.sources.Codex&&data.claude?.status==='fresh'
    return {primary,secondary:primary?.kind==='short'?weekly:null,stateLabel:'暂无额度',label:'实际水球样式预览',decorative:true,
      appearance:{inner:{palette:p.palette,fillColorA:c.liquid,fillColorB:p.fillColorB,opacity:p.opacity,amplitude:p.amplitude,motion:p.motion,baseOpacity:p.baseOpacity,showPercent:p.showPercent,percentPosition:p.percentPosition,percentSize:p.percentSize,percentTextStyle:p.percentTextStyle,percentColor:c.reading},outer:{style:p.ringStyle,thickness:p.ringThickness,colorMode:p.colorMode,progressColor:c.ring,trackColor:c.track,glow:p.glow}},
      colors:{healthy:c.healthy,warning:c.warning,critical:c.critical,water:c.base,card:c.card,cardForeground:c.ink},quotaGrid:grid.enabled?grid.cells:null,
      percentOverride:claudeOnly?data.claude.primary:null,liquidPercent:claudeOnly?data.claude.primary:null,ringPercent:claudeOnly?data.claude.weekly:null}
  }
  function pick(event){const el=event.target;if(!(el instanceof Element))return null;if(el.closest('.codex-water-ball__value'))return 'reading';if(el.closest('.codex-water-ball__ring'))return 'ring';if(el.closest('.codex-water-ball__liquid'))return 'liquid';return el.closest('.codex-water-ball')?'base':null}
  function onDown(e){if(e.button!==0)return;down={x:e.clientX,y:e.clientY,yaw:data.yaw,pitch:data.pitch,moved:false,id:e.target.closest?.('[data-part]')?.dataset.part||pick(e)};e.currentTarget.setPointerCapture(e.pointerId)}
  function onMove(e){if(down){const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>4)down.moved=true;if(down.moved)handlers.rotate(down.yaw+dx*.006,Math.max(-.8,Math.min(.8,down.pitch-dy*.006)));return}const id=e.target.closest?.('[data-part]')?.dataset.part||pick(e);handlers.hover(id||null)}
  function onUp(e){if(!down)return;if(!down.moved){const id=down.id;if(id)handlers.select(id)}down=null}
  const app=createApp({render(){
    if(!data.visible)return null
    const expanded=data.expanded.length>0
    const balls=expanded?layers.map(layer=>{const move=data.expanded.includes(layer.id),style={transform:`translate3d(${move?layer.x:0}px,${move?layer.y:0}px,${move?layer.z:0}px) scale(${(data.sizes[layer.id]||100)/100})`};const actual=props(),sample=move&&((layer.id==='liquid'&&!(actual.liquidPercent??actual.primary?.bucket?.remainingPercent))||(layer.id==='ring'&&!(actual.ringPercent??(actual.primary?.kind==='weekly'?actual.primary?.bucket?.remainingPercent:actual.secondary?.bucket?.remainingPercent))));if(sample&&layer.id==='liquid')actual.liquidPercent=62;if(sample&&layer.id==='ring')actual.ringPercent=62;return h('div',{class:['real-ball-layer','layer-'+layer.id,{selected:data.selected===layer.id,hovered:data.hovered===layer.id}],style,'data-part':layer.id},[h(CodexWaterBall,actual),move?h('button',{class:'real-ball-chip',type:'button','data-part':layer.id,onClick:e=>{e.stopPropagation();handlers.select(layer.id)}},layer.name+(sample?' · 示例':'') ):null])}):[h('div',{class:['real-ball-complete',data.selected?'selected-'+data.selected:'',data.hovered?'hovered-'+data.hovered:'']},[h(CodexWaterBall,props())])]
    // Actual task snapshot unavailable means no guessed badges; support real counts when provided.
    const badges=data.counts?['input','active','unread'].filter(id=>data.counts[id]>0).map(id=>h('button',{class:['real-counter',id],'data-part':id,style:{background:data.colors[id]},onClick:e=>{e.stopPropagation();handlers.select(id)}},String(data.counts[id]))):[]
    return h('div',{class:'real-ball-stage',onPointerdown:onDown,onPointermove:onMove,onPointerup:onUp,onPointercancel:()=>{down=null},onPointerleave:()=>handlers.hover(null),onDblclick:e=>{e.preventDefault();handlers.toggle()}},[h('div',{class:['real-ball-scene',{exploded:expanded}],style:{transform:`rotateX(${data.pitch}rad) rotateY(${data.yaw}rad)`}},[...balls,...badges])])
  }})
  app.mount(element)
  return {update(next){Object.assign(data,next)},destroy(){app.unmount()}}
}
