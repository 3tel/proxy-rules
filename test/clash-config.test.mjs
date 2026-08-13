import test from "node:test";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import { buildClashConfig, enrichClashConfig, formatClashRuleList } from "../docs/clash-config.js";

const options = {
  dnsServers: ["223.5.5.5", "119.29.29.29"],
  groupMode: "select",
  finalPolicy: "PROXY",
  ruleSets: [
    { id: "reject", action: "REJECT", rules: ["DOMAIN-SUFFIX,ads.example,REJECT"] },
    { id: "proxy", action: "PROXY", rules: ["DOMAIN-SUFFIX,openai.com,PROXY"] },
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
  assert.equal(config["rule-providers"], undefined);
  assert.deepEqual(config.rules, [
    "DOMAIN-SUFFIX,internal.example,DIRECT",
    "DOMAIN-SUFFIX,ads.example,REJECT",
    "DOMAIN-SUFFIX,openai.com,PROXY",
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
  const config = parseYaml(enrichClashConfig(source, [vlessNode], { ...options, finalPolicy: "DIRECT", ruleSets: [{ id: "direct", action: "DIRECT", rules: ["DOMAIN-SUFFIX,example.cn,DIRECT"] }], geoip: false }));
  assert.deepEqual(config.proxies.map((proxy) => proxy.name), ["HK VLESS", "HK VLESS 2"]);
  assert.equal(config["proxy-groups"][0].name, "PROXY");
  assert.deepEqual(config["proxy-groups"][0].proxies, ["Subscription", "HK VLESS", "HK VLESS 2", "DIRECT"]);
  assert.deepEqual(config.rules, [
    "DOMAIN-SUFFIX,internal.example,DIRECT",
    "DOMAIN-SUFFIX,example.cn,DIRECT",
    "MATCH,DIRECT",
  ]);
});

test("Clash list rules are expanded with selected actions", () => {
  assert.deepEqual(formatClashRuleList("# comment\nDOMAIN-SUFFIX,example.com\nIP-CIDR,10.0.0.0/8,no-resolve", "DIRECT"), [
    "DOMAIN-SUFFIX,example.com,DIRECT",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
  ]);
});
