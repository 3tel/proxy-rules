import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const HEALTH_CHECK_URL = "http://www.gstatic.com/generate_204";

export function buildClashConfig(nodes, options) {
  const config = {
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    ipv6: true,
    dns: {
      enable: true,
      nameserver: options.dnsServers,
    },
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
  if (options.dnsServers.length) {
    const currentDns = isPlainObject(config.dns) ? config.dns : {};
    config.dns = { ...currentDns, enable: true, nameserver: options.dnsServers };
  }
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
