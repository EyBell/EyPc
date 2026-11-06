// A read-only projection of the existing Kernel package. Reject partial or
// inconsistent packages rather than guessing a provider or displaying zero.
const providers=['codex','claude','cursor','orca']
export function projectTaskSnapshot(snapshot) {
  if (!snapshot || snapshot.complete!==true || snapshot.freshness!=='fresh' || !Array.isArray(snapshot.tasks) || !snapshot.views?.counts) return null
  const totals={input:0,active:0,unread:0},byProvider=Object.fromEntries(providers.map(p=>[p,{input:0,active:0,unread:0}]))
  for (const t of snapshot.tasks) {
    if (t.hidden || t.paused || !t.capabilities?.open) continue
    if (!providers.includes(t.provider)) return null
    const counts=byProvider[t.provider]
    if (t.phase==='waiting-input'||t.phase==='waiting-approval') counts.input++
    else if (t.phase==='running'&&(t.dynamicEligible||t.localPin===true||t.providerPin===true)) counts.active++
    else if (t.phase==='completed'&&t.unread===true) counts.unread++
  }
  for(const counts of Object.values(byProvider)) for(const key of Object.keys(totals))totals[key]+=counts[key]
  if(Object.keys(totals).some(key=>totals[key]!==snapshot.views.counts[key]))return null
  return {revision:snapshot.packageRevision,byProvider,health:snapshot.providerHealth||{},providers:snapshot.providers||{}}
}
export function subscribePlatformTasks(platform,onUpdate) {
  const kernel=platform?.companionKernel
  if(!kernel||typeof kernel.getLatest!=='function'||typeof kernel.subscribe!=='function')return null
  let revision=-1
  function accept(raw){const nextRevision=raw?.packageRevision;if(Number.isSafeInteger(nextRevision)&&nextRevision<revision)return;const projected=projectTaskSnapshot(raw);if(!projected){if(Number.isSafeInteger(nextRevision))revision=nextRevision;onUpdate(null);return}if(!Number.isSafeInteger(projected.revision))return;revision=projected.revision;onUpdate(projected)}
  try {accept(kernel.getLatest());return kernel.subscribe(revision,accept)} catch {onUpdate(null);return null}
}
