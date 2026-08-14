import test from "node:test";
import assert from "node:assert/strict";
import { buildShadowrocketConfig } from "../docs/shadowrocket-config.js";

const nodes = [
  { name: "nyc_8443", line: "nyc_8443=vless,example.com,443,password=uuid,tls=true,udp=true" },
  { name: "clash_zm", line: "clash_zm=ss,example.net,8388,password=pass,method=aes-128-gcm,udp=true" },
];

test("Shadowrocket config uses multi-policy groups", () => {
  const config = buildShadowrocketConfig(nodes, {
    now: new Date(2026, 7, 14, 6, 32, 32),
    dns: "system",
    finalPolicy: "PROXY",
    customRules: ["DOMAIN-KEYWORD,github.com,🚀 节点选择"],
    ruleSets: [{ id: "direct", action: "DIRECT", url: "https://example.com/rules/direct.list" }],
    geoip: true,
  });
  assert.match(config, /^# Shadowrocket: 2026-08-14 06:32:32/m);
  assert.match(config, /\[General\]\nyaml = true\nbypass-system = true/);
  assert.match(config, /\[Proxy\]\nnyc_8443=vless/);
  assert.match(config, /🚀 节点选择 = select,♻️ 自动选择,🔯 故障转移,🔮 负载均衡,DIRECT,nyc_8443,clash_zm/);
  assert.match(config, /♻️ 自动选择 = url-test,nyc_8443,clash_zm/);
  assert.match(config, /🔯 故障转移 = fallback,nyc_8443,clash_zm/);
  assert.match(config, /🔮 负载均衡 = load-balance,nyc_8443,clash_zm/);
  assert.match(config, /💻 OPENAI = select,nyc_8443,clash_zm,🚀 节点选择,♻️ 自动选择/);
  assert.match(config, /DOMAIN-KEYWORD,github.com,🚀 节点选择/);
  assert.match(config, /RULE-SET,https:\/\/example\.com\/rules\/direct\.list,🎯 全球直连/);
  assert.match(config, /GEOIP,CN,🎯 全球直连/);
  assert.match(config, /FINAL,🐟 漏网之鱼/);
});

test("Shadowrocket config references fetched project rule files", () => {
  const config = buildShadowrocketConfig(nodes, {
    now: new Date(2026, 7, 14, 6, 32, 32),
    dns: "system",
    finalPolicy: "PROXY",
    customRules: [],
    ruleSets: [
      {
        id: "proxy",
        action: "PROXY",
        url: "https://example.com/rules/proxy.list",
      },
      {
        id: "reject",
        action: "REJECT",
        url: "https://example.com/rules/reject.list",
      },
    ],
    geoip: false,
  });

  assert.match(config, /RULE-SET,https:\/\/example\.com\/rules\/proxy\.list,🚀 节点选择/);
  assert.match(config, /RULE-SET,https:\/\/example\.com\/rules\/reject\.list,🛑 全球拦截/);
  assert.doesNotMatch(config, /DOMAIN-SUFFIX,github\.com/);
});
