export const SHADOWROCKET_POLICY = {
  proxy: "🚀 节点选择",
  auto: "♻️ 自动选择",
  fallback: "🔯 故障转移",
  balance: "🔮 负载均衡",
  direct: "🎯 全球直连",
  reject: "🛑 全球拦截",
  openai: "💻 OPENAI",
  final: "🐟 漏网之鱼",
};

export function buildShadowrocketConfig(nodes, options) {
  const nodeNames = nodes.map((node) => node.name);
  const proxyCandidates = nodeNames.length ? nodeNames.join(",") : "DIRECT";
  const selectedRules = [
    ...options.customRules,
    ...options.ruleSets.flatMap(({ rules }) => rules),
    ...(options.geoip ? [`GEOIP,CN,${SHADOWROCKET_POLICY.direct}`] : []),
    `FINAL,${options.finalPolicy === "DIRECT" ? SHADOWROCKET_POLICY.direct : SHADOWROCKET_POLICY.final}`,
  ];
  return [
    `# Shadowrocket: ${formatDate(options.now || new Date())}`,
    "[General]",
    "yaml = true",
    "bypass-system = true",
    "udp-policy-not-supported-behaviour = REJECT",
    "skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local, captive.apple.com",
    "tun-excluded-routes = 239.255.255.250/32",
    `dns-server = ${options.dns || "system"}`,
    "",
    "[Proxy]",
    ...nodes.map((node) => node.line),
    "",
    "[Proxy Group]",
    `${SHADOWROCKET_POLICY.proxy} = select,${[SHADOWROCKET_POLICY.auto, SHADOWROCKET_POLICY.fallback, SHADOWROCKET_POLICY.balance, "DIRECT", ...nodeNames].join(",")}`,
    `${SHADOWROCKET_POLICY.auto} = url-test,${proxyCandidates}`,
    `${SHADOWROCKET_POLICY.fallback} = fallback,${proxyCandidates}`,
    `${SHADOWROCKET_POLICY.balance} = load-balance,${proxyCandidates}`,
    `${SHADOWROCKET_POLICY.direct} = select,DIRECT,${SHADOWROCKET_POLICY.proxy},${SHADOWROCKET_POLICY.auto}`,
    `${SHADOWROCKET_POLICY.reject} = select,REJECT,DIRECT`,
    `${SHADOWROCKET_POLICY.openai} = select,${[...nodeNames, SHADOWROCKET_POLICY.proxy, SHADOWROCKET_POLICY.auto].join(",") || SHADOWROCKET_POLICY.proxy}`,
    `${SHADOWROCKET_POLICY.final} = select,${[SHADOWROCKET_POLICY.proxy, SHADOWROCKET_POLICY.direct, SHADOWROCKET_POLICY.auto, SHADOWROCKET_POLICY.fallback, SHADOWROCKET_POLICY.balance, ...nodeNames].join(",")}`,
    "",
    "[Rule]",
    ...selectedRules,
    "",
  ].join("\n");
}

export function mapShadowrocketRules(text, action) {
  const target = shadowrocketPolicyForAction(action);
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const parts = line.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    return [parts[0], parts[1], target, ...shadowrocketRuleOptions(parts)].join(",");
  }).filter(Boolean);
}

export function shadowrocketPolicyForAction(action) {
  if (action === "DIRECT") return SHADOWROCKET_POLICY.direct;
  if (action === "REJECT") return SHADOWROCKET_POLICY.reject;
  return SHADOWROCKET_POLICY.proxy;
}

function shadowrocketRuleOptions(parts) {
  const start = isActionOrPolicy(parts[2]) ? 3 : 2;
  return parts.slice(start);
}

function isActionOrPolicy(value) {
  return ["DIRECT", "PROXY", "REJECT"].includes(String(value || "").toUpperCase()) || Object.values(SHADOWROCKET_POLICY).includes(value);
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
