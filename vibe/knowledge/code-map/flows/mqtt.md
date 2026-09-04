# 04 MQTT

连接配置在域模型里；密码只活在 preload 加密信封。页面不得直接 `mqtt.connect`。

## 状态

[normalizeMqttState](../../../../src/domain/mqtt.ts#L273) 规范化连接、分组、布局、视图偏好。分组是插件树，不代表 broker 资源。

连接树：[mqttConnectionTree.ts](../../../../src/domain/mqttConnectionTree.ts#L1)。Runtime 拥有生命周期；组焦点不得切换当前连接配置。

## 连接

[mqttConnectOptionsFromConfig](../../../../src/domain/mqtt.ts#L791) 组客户端选项。密码由平台在连接瞬间注入，不进 `AppState`、归档、导出 JSON。

## 归档与发送

- 追加消息：[appendMqttMessage](../../../../src/domain/mqtt.ts#L529)
- 模板 / 草稿历史：同文件后续 export
- 多记录导出：[mqttExport.ts](../../../../src/domain/mqttExport.ts#L1)

页面：[MqttPage.vue](../../../../src/pages/MqttPage.vue#L1)。默认验证集不含 MQTT 巨型用例，除非当前任务明确要求。
