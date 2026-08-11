import test from "node:test";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import { buildClashConfig, enrichClashConfig } from "../docs/clash-config.js";

const options = {
  dnsServers: ["223.5.5.5", "119.29.29.29"],
  groupMode: "select",
  finalPolicy: "PROXY",
  rulesBase: "https://3tel.github.io/proxy-rules/rules",
  providers: [
    { id: "reject", action: "REJECT" },
    { id: "proxy", action: "PROXY" },
  ],
  customRules: ["DOMAIN-SUFFIX,internal.example,DIRECT"],
  geoip: true,
};

const vlessNode = {
  name: "HK VLESS",
  clash: {
    type: "vless",
    server: "node.example.com",
    port: 443,
    uuid: "00000000-0000-0000-0000-000000000000",
    tls: true,
    udp: true,
    "client-fingerprint": "chrome",
    "reality-opts": {
      "public-key": "public-key",
      "short-id": "abcd",
    },
  },
};

test("direct nodes generate Clash YAML with proxies, groups and rules", () => {
  const config = parseYaml(buildClashConfig([vlessNode], options));
  assert.equal(config.mode, "rule");
  assert.equal(config.proxies[0].name, "HK VLESS");
  assert.equal(config.proxies[0].type, "vless");
  assert.deepEqual(config["proxy-groups"][0].proxies, ["HK VLESS", "DIRECT"]);
  assert.equal(config["rule-providers"].proxy.url, "https://3tel.github.io/proxy-rules/rules/proxy.list");
  assert.deepEqual(config.rules, [
    "DOMAIN-SUFFIX,internal.example,DIRECT",
    "RULE-SET,reject,REJECT",
    "RULE-SET,proxy,PROXY",
    "GEOIP,CN,DIRECT",
    "MATCH,PROXY",
  ]);
});

test("converted Clash YAML is enriched with local nodes and project rules", () => {
  const source = [
    "proxies:",
    "  - name: HK VLESS",
    "    type: ss",
    "    server: sub.example.com",
    "    port: 8388",
    "    cipher: aes-128-gcm",
    "    password: pass",
    "proxy-groups:",
    "  - name: Subscription",
    "    type: select",
    "    proxies:",
    "      - HK VLESS",
    "rules:",
    "  - MATCH,Subscription",
    "",
  ].join("\n");
  const config = parseYaml(enrichClashConfig(source, [vlessNode], { ...options, finalPolicy: "DIRECT", providers: [{ id: "direct", action: "DIRECT" }], geoip: false }));
  assert.deepEqual(config.proxies.map((proxy) => proxy.name), ["HK VLESS", "HK VLESS 2"]);
  assert.equal(config["proxy-groups"][0].name, "PROXY");
  assert.deepEqual(config["proxy-groups"][0].proxies, ["Subscription", "HK VLESS", "HK VLESS 2", "DIRECT"]);
  assert.deepEqual(config.rules, [
    "DOMAIN-SUFFIX,internal.example,DIRECT",
    "RULE-SET,direct,DIRECT",
    "MATCH,DIRECT",
  ]);
});
