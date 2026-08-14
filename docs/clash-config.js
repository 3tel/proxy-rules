import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const HEALTH_CHECK_URL = "http://www.gstatic.com/generate_204";
const CLASH_DNS_CONFIG = {
  enable: true,
  ipv6: true,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "240.0.0.1/8",
  "cache-algorithm": "arc",
  "use-hosts": true,
  "use-system-hosts": true,
  "fake-ip-filter-mode": "blacklist",
  "fake-ip-filter": [
    "*.lan",
    "*.local",
    "*.localhost",
    "*.localdomain",
    "*.home.arpa",
    "localhost",
    "time.*.com",
    "ntp.*.com",
    "+.pool.ntp.org",
    "+.stun.*",
    "+.stun.*.*",
    "+.stun.*.*.*",
  ],
  "default-nameserver": [
    "223.5.5.5",
    "119.29.29.29",
  ],
  nameserver: [
    "https://dns.alidns.com/dns-query",
    "https://doh.pub/dns-query",
  ],
  "proxy-server-nameserver": [
    "https://dns.alidns.com/dns-query",
    "https://doh.pub/dns-query",
  ],
  "nameserver-policy": {
    "geosite:private": [
      "https://dns.alidns.com/dns-query",
    ],
    "geosite:cn": [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query",
    ],
    "geosite:geolocation-!cn": [
      "https://1.1.1.1/dns-query#PROXY",
      "https://dns.google/dns-query#PROXY",
    ],
  },
};

export function buildClashConfig(nodes, options) {
  const config = {
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    ipv6: true,
    dns: createClashDnsConfig(),
    proxies: nodes.map((node) => ({ name: node.name, ...node.clash })),
    "proxy-groups": [makeProxyGroup("PROXY", options.groupMode, nodes.map((node) => node.name))],
  };
  return stringifyClashConfig(applyClashRules(config, options));
}

export function enrichClashConfig(configText, nodes, options) {
  const config = parseClashYaml(configText);
  applyClashDefaults(config, options);
  appendClashNodes(config, nodes);
  ensureProxyGroup(config, options.groupMode);
  return stringifyClashConfig(applyClashRules(config, options));
}

function parseClashYaml(configText) {
  let config;
  try {
    config = parseYaml(configText);
  } catch {
    throw new Error("转换服务返回的 Clash YAML 无法解析，无法添加本项目规则引用。");
  }
  if (!isPlainObject(config)) throw new Error("转换服务返回的 Clash 配置不是有效对象。");
  return config;
}

function applyClashDefaults(config, options) {
  config.mode = "rule";
  if (!("mixed-port" in config) && !("port" in config) && !("socks-port" in config)) config["mixed-port"] = 7890;
  if (!("allow-lan" in config)) config["allow-lan"] = false;
  if (!("ipv6" in config)) config.ipv6 = true;
  config.dns = createClashDnsConfig();
  if (!Array.isArray(config.proxies)) config.proxies = [];
}

function appendClashNodes(config, nodes) {
  if (!nodes.length) return;
  const usedNames = new Set(config.proxies.map((proxy) => proxy?.name).filter(Boolean));
  nodes.forEach((node) => {
    const name = nextName(node.name, usedNames);
    config.proxies.push({ name, ...node.clash });
  });
}

function ensureProxyGroup(config, groupMode) {
  if (!Array.isArray(config["proxy-groups"])) config["proxy-groups"] = [];
  const groups = config["proxy-groups"].filter(isPlainObject);
  config["proxy-groups"] = groups;
  const proxyNames = config.proxies.map((proxy) => proxy?.name).filter(Boolean);
  const groupNames = groups.map((group) => group.name).filter((name) => name && name !== "PROXY");
  const candidates = groupMode === "select" ? unique([...groupNames, ...proxyNames]) : proxyNames;
  const existing = groups.find((group) => group.name === "PROXY");
  const nextGroup = makeProxyGroup("PROXY", groupMode, candidates);
  if (existing) {
    Object.assign(existing, nextGroup);
  } else {
    groups.unshift(nextGroup);
  }
}

function applyClashRules(config, options) {
  applyClashRuleProviders(config, options.ruleSets);
  config.rules = [
    ...options.customRules,
    ...options.ruleSets.map(({ id, action }) => `RULE-SET,${id},${action}`),
    ...(options.geoip ? ["GEOIP,CN,DIRECT"] : []),
    `MATCH,${options.finalPolicy}`,
  ];
  return config;
}

function applyClashRuleProviders(config, ruleSets) {
  if (!ruleSets.length) {
    delete config["rule-providers"];
    return;
  }
  config["rule-providers"] = Object.fromEntries(ruleSets.map(({ id, url }) => [id, {
    type: "http",
    behavior: "classical",
    format: "text",
    url,
    path: `./rules/${id}.list`,
    interval: 86400,
  }]));
}

function makeProxyGroup(name, type, proxies) {
  const group = { name, type: type || "select", proxies: unique([...proxies, "DIRECT"]) };
  if (group.type === "url-test" || group.type === "fallback") {
    group.url = HEALTH_CHECK_URL;
    group.interval = 600;
  }
  if (group.type === "url-test") group.tolerance = 50;
  return group;
}

function stringifyClashConfig(config) {
  return stringifyYaml(config, { lineWidth: 0 });
}

function createClashDnsConfig() {
  return JSON.parse(JSON.stringify(CLASH_DNS_CONFIG));
}

function nextName(name, usedNames) {
  let count = 1;
  let candidate = name;
  while (usedNames.has(candidate)) {
    count += 1;
    candidate = `${name} ${count}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
