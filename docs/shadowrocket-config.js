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
  const includeNodes = options.includeNodes !== false;
  const nodeNames = nodes.map((node) => node.name);
  const proxyCandidates = nodeNames.length ? nodeNames.join(",") : "DIRECT";
  const selectedRules = [
    ...options.customRules,
    ...options.ruleSets.flatMap((ruleSet) => ruleSet.url ? [`RULE-SET,${ruleSet.url},${shadowrocketPolicyForAction(ruleSet.action, { includeNodes })}`] : []),
    ...(options.geoip ? [`GEOIP,CN,${shadowrocketPolicyForAction("DIRECT", { includeNodes })}`] : []),
    `FINAL,${shadowrocketFinalPolicy(options.finalPolicy, includeNodes)}`,
  ];
  const lines = [
    `# Shadowrocket: ${formatDate(options.now || new Date())}`,
    "[General]",
    "yaml = true",
    "bypass-system = true",
    "udp-policy-not-supported-behaviour = REJECT",
    "skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local, captive.apple.com",
    "tun-excluded-routes = 239.255.255.250/32",
    `dns-server = ${options.dns || "system"}`,
  ];
  if (includeNodes) {
    lines.push(
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
    );
  }
  lines.push("", "[Rule]", ...selectedRules, "");
  return lines.join("\n");
}

export function shadowrocketPolicyForAction(action, options = {}) {
  if (options.includeNodes === false) {
    if (action === "DIRECT" || action === "REJECT") return action;
    return "PROXY";
  }
  if (action === "DIRECT") return SHADOWROCKET_POLICY.direct;
  if (action === "REJECT") return SHADOWROCKET_POLICY.reject;
  return SHADOWROCKET_POLICY.proxy;
}

function shadowrocketFinalPolicy(finalPolicy, includeNodes) {
  if (!includeNodes) return finalPolicy === "DIRECT" ? "DIRECT" : "PROXY";
  return finalPolicy === "DIRECT" ? SHADOWROCKET_POLICY.direct : SHADOWROCKET_POLICY.final;
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
