# MQTT Subscription Rail SyncDoc

Tool: codex

## Current Truth Before This Task

- MQTT Tab already uses a three-column workbench in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L256), with connection rail, subscription rail, and receive/send workspace.
- Connection config persisted `subscriptions: string[]` only; the subscription rail projected topic rows from runtime in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L517).
- Subscription notes were runtime-only and not stored; filtering was single-topic through `mqttActiveSubscriptionTopic`.
- Config editing used a textarea for default subscription topics in [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L475).

## Synced Target After This Task

- `MqttConnectionConfig` keeps `subscriptions: string[]` and adds `subscriptionAliases: Record<string, string>` in [src/domain/types.ts](../../../src/domain/types.ts#L45); normalization trims topics, removes empty/duplicate subscriptions, and prunes aliases for deleted topics in [src/domain/mqtt.ts](../../../src/domain/mqtt.ts#L49).
- Runtime exposes subscription rows with `alias`, `displayName`, `active`, `selected`, and `focused`; multi-filter state is stored as arrays while `mqttActiveSubscriptionTopic` remains a first-topic compatibility field.
- The subscription rail is a compact command-owned list: click row filters one topic, blank list space clears filters, Space toggles multi-select, Enter applies selected filters, and Delete removes the focused subscription.
- Config editing no longer owns topic row editing. It shows a subscription summary and opens a dedicated subscription editor draft from [src/pages/MqttPage.vue](../../../src/pages/MqttPage.vue#L755).
- `mqttSubscriptionDraft` owns subscription row editing with stable item ids, so typing in a topic input does not remount the row or lose focus.
- Saving the subscription editor updates only `subscriptions` and `subscriptionAliases`; added topics are best-effort subscribed and removed topics are best-effort unsubscribed when the current MQTT client is connected.
- `mqtt-editor` and `mqtt-subscription-editor` use edit-layer shortcut ownership: save/cancel/field-cycle shortcuts work, while workbench commands such as `c-→`, `c-t`, `c-l`, and `c-1/2/3` are blocked during text editing.

## Verification Hooks

- Domain behavior is covered in [tests/domain/mqtt.test.ts](../../../tests/domain/mqtt.test.ts#L20).
- Runtime subscription filtering and deletion are covered in [tests/runtime/action.test.ts](../../../tests/runtime/action.test.ts#L1256).
- MQTT unsubscribe behavior is covered in [tests/runtime/mqttConnectionLog.test.ts](../../../tests/runtime/mqttConnectionLog.test.ts#L220).
- Shortcut ownership is covered in [tests/runtime/keybinding.test.ts](../../../tests/runtime/keybinding.test.ts#L150) and [tests/runtime/keyboardEvent.test.ts](../../../tests/runtime/keyboardEvent.test.ts#L62).
- Static UI markers are covered in [tests/ui/mqttPage.test.ts](../../../tests/ui/mqttPage.test.ts#L5).
