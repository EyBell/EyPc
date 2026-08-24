'use strict'

const manifest = require('./provider-manifest.json')

const PROVIDER_REGISTRY_REVISION = 'companion-provider-registry-v1'

function loadProviderRegistry(value = manifest) {
  if (!value || typeof value !== 'object' || value.revision !== PROVIDER_REGISTRY_REVISION) {
    throw new Error('companion-provider-registry-invalid')
  }
  const providers = value.providers && typeof value.providers === 'object' ? value.providers : {}
  if (value.kernelRevision !== 'companion-task-kernel-v6'
    || value.topologyRevision !== 'companion-task-topology-v2'
    || value.snapshotRevision !== 'companion-task-snapshot-v6'
    || value.commandRevision !== 'companion-task-command-v1'
    || value.subscribeRevision !== 'companion-task-subscribe-v1'
    || value.ackRevision !== 'companion-task-ack-v2') {
    throw new Error('companion-provider-contract-revisions-invalid')
  }
  const order = Array.isArray(value.order) ? value.order.filter((id) => typeof id === 'string') : []
  if (!order.length || new Set(order).size !== order.length) throw new Error('companion-provider-order-invalid')
  for (const [index, id] of order.entries()) {
    const provider = providers[id]
    if (!provider || provider.id !== id || typeof provider.label !== 'string'
      || !['exact', 'none'].includes(provider.relationMode)
      || !Array.isArray(provider.capabilities)
      || !provider.capabilities.includes('open')) {
      throw new Error(`companion-provider-invalid:${index}`)
    }
  }
  return Object.freeze({
    revision: value.revision,
    kernelRevision: String(value.kernelRevision || ''),
    topologyRevision: String(value.topologyRevision || ''),
    snapshotRevision: String(value.snapshotRevision || ''),
    commandRevision: String(value.commandRevision || ''),
    subscribeRevision: String(value.subscribeRevision || ''),
    ackRevision: String(value.ackRevision || ''),
    order: Object.freeze([...order]),
    providers: Object.freeze(Object.fromEntries(order.map((id) => [id, Object.freeze({
      ...providers[id],
      topologySources: Object.freeze([...(Array.isArray(providers[id].topologySources) ? providers[id].topologySources : [])]),
      capabilities: Object.freeze([...(Array.isArray(providers[id].capabilities) ? providers[id].capabilities : [])])
    })])))
  })
}

const registry = loadProviderRegistry()

function providerShape(value) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(registry.order.map((id) => [
    id,
    source[id] === undefined ? registry.providers[id].enabledByDefault === true : source[id] === true
  ]))
}

function providerSet(value) {
  const shape = providerShape(value)
  return new Set(registry.order.filter((id) => shape[id] === true))
}

/** Process-private Provider-to-Host binding. It contains behavior only; IDs,
 * order, capabilities and relation policy always come from the manifest. */
function createCompanionHostRegistry(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.freeze({
    revision: `${registry.revision}:host-bindings-v1`,
    registryRevision: registry.revision,
    adapters: Object.freeze(Object.fromEntries(registry.order.map((id) => [
      id,
      source[id] && typeof source[id] === 'object' ? Object.freeze({ ...source[id] }) : Object.freeze({})
    ])))
  })
}

module.exports = {
  PROVIDER_REGISTRY_REVISION,
  registry,
  PROVIDERS: registry.order,
  providerShape,
  providerSet,
  createCompanionHostRegistry,
  loadProviderRegistry
}
