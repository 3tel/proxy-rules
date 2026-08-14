import QRCode from "qrcode";
import { buildClashConfig, enrichClashConfig } from "./clash-config.js";
import { createSubconverterUrl, isDirectNodeLink, isSubscriptionUrl, subscriptionLines } from "./converter.js";
import { SHADOWROCKET_POLICY, buildShadowrocketConfig, shadowrocketPolicyForAction } from "./shadowrocket-config.js";

const form = document.querySelector("#generator");
const nodeInput = document.querySelector("#nodes");
const messages = document.querySelector("#messages");
const summary = document.querySelector("#summary");
const status = document.querySelector("#status");
const output = document.querySelector("#output");
const outputType = document.querySelector("#output-type");
let generatedConfig = "";
let generatedNodes = [];
let generatedExtension = "conf";
let generatedSummary = "";
let generatedStatus = "";
let generatedRuleSummary = "";
const remoteRuleCache = new Map();
const PUBLISHED_RULES_BASE = "https://3tel.github.io/proxy-rules/rules";
const RULE_LABELS = { reject: "REJECT", proxy: "PROXY", direct: "DIRECT" };

document.querySelector("#clear").addEventListener("click", () => { nodeInput.value = ""; updateSummary(); nodeInput.focus(); });
nodeInput.addEventListener("input", () => { updateSummary(); toggleConversionMode(); });
outputType.addEventListener("change", () => { toggleConversionMode(); updateSummary(); });
document.querySelectorAll(".rule-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".rule-tabs button,.rule-input").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(`#custom-${button.dataset.rule}`).classList.add("active");
}));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  messages.textContent = "";
  try {
    const lines = nodeInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length && outputType.value !== "shadowrocket") throw new Error("请至少添加一个订阅地址或节点分享链接。");
    if (outputType.value === "shadowrocket") {
      const subscriptions = lines.filter(isSubscriptionUrl);
      const nodeLinks = lines.filter((line) => !isSubscriptionUrl(line));
      let resolvedLinks = nodeLinks;
      if (subscriptions.length) {
        const converted = await convertWithSubconverter(subscriptions, "shadowrocket");
        const convertedLinks = subscriptionLines(converted, decodeBase64);
        if (!convertedLinks.length) throw new Error("转换服务未返回可识别的节点链接。请检查订阅地址或服务兼容性。");
        resolvedLinks = [...nodeLinks, ...convertedLinks];
      }
      const nodes = uniqueNames(resolvedLinks.map(parseNode));
      generatedNodes = nodes;
      generatedConfig = buildConfig(nodes);
      generatedExtension = "conf";
      generatedSummary = nodes.length
        ? `Shadowrocket 规则配置已生成，可扫码添加 ${nodes.length} 个节点`
        : "Shadowrocket 规则配置已生成，不包含节点";
      generatedRuleSummary = selectedRuleSummary("Shadowrocket");
      generatedStatus = `配置文件不包含 [Proxy] 节点和 [Proxy Group]；${generatedRuleSummary}；节点请在 Shadowrocket 中单独添加。`;
    } else if (outputType.value === "clash") {
      const subscriptions = lines.filter(isSubscriptionUrl);
      const nodeLinks = lines.filter(isDirectNodeLink);
      const unsupported = lines.filter((line) => !isSubscriptionUrl(line) && !isDirectNodeLink(line));
      if (unsupported.length) throw new Error(`Clash 生成暂不支持这类输入：${unsupported[0].slice(0, 32)}…`);
      const nodes = uniqueNames(nodeLinks.map(parseNode));
      generatedNodes = nodes;
      generatedConfig = subscriptions.length
        ? enrichClashConfig(await convertWithSubconverter(subscriptions, "clash"), nodes, clashOptions())
        : buildClashConfig(nodes, clashOptions());
      generatedExtension = "yaml";
      generatedSummary = subscriptions.length && nodes.length
        ? `Clash 配置已生成，已合并订阅节点和 ${nodes.length} 个手工节点`
        : subscriptions.length
          ? "Clash 配置已生成，已合并订阅节点和分流引用"
          : `Clash 配置已生成，包含 ${nodes.length} 个节点`;
      generatedRuleSummary = selectedRuleSummary("Clash");
      generatedStatus = `YAML 已包含 proxies、proxy-groups、rule-providers 和 rules；${generatedRuleSummary}；可复制或下载导入 Clash/Mihomo 类客户端。`;
    } else {
      throw new Error("当前项目只支持 Shadowrocket 和 Clash 类客户端。");
    }
    renderOutput();
    await renderQr();
    summary.textContent = generatedSummary;
    status.textContent = generatedStatus;
  } catch (error) {
    messages.textContent = error.message;
  }
});

document.querySelector("#qr-target").addEventListener("change", renderQr);
document.querySelector("#copy-config").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(generatedConfig);
    status.textContent = "配置已复制到剪贴板。";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#config-preview"));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    status.textContent = "浏览器未允许自动复制，已为你选中配置文本。";
  }
});
document.querySelector("#download-config").addEventListener("click", () => {
  const requestedName = document.querySelector("#filename").value.trim() || "custom-proxy";
  download(`${safeName(requestedName)}.${generatedExtension}`, generatedConfig);
});

toggleConversionMode();
updateSummary();
loadProjectRules();

function updateSummary() {
  const count = nodeInput.value.split(/\r?\n/).filter((line) => line.trim()).length;
  const hasSubscription = inputLines().some(isSubscriptionUrl);
  summary.textContent = count
    ? `已添加 ${count} 条订阅或节点链接`
    : outputType.value === "shadowrocket"
      ? "可直接生成 Shadowrocket 规则配置"
      : "等待添加订阅或节点";
  if ((outputType.value === "shadowrocket" || outputType.value === "clash") && !hasSubscription) {
    status.textContent = "节点名称、UUID 和密码不会离开此页面。";
  } else if (outputType.value === "clash") {
    status.textContent = "订阅会通过转换服务取得节点，随后在浏览器内生成本项目远程规则引用。";
  }
}

function toggleConversionMode() {
  const localRuleFormat = outputType.value === "shadowrocket" || outputType.value === "clash";
  const needsConverter = inputLines().some(isSubscriptionUrl);
  document.querySelector("#converter-options").hidden = !needsConverter;
  document.querySelectorAll(".local-only").forEach((element) => { element.hidden = !localRuleFormat; });
  output.hidden = true;
  generatedConfig = "";
  generatedNodes = [];
  generatedSummary = "";
  generatedStatus = "";
  generatedRuleSummary = "";
  status.textContent = needsConverter
    ? "订阅地址或所选格式将使用你指定的 subconverter 服务转换。"
    : "节点和配置只在当前浏览器处理。";
}

function inputLines() {
  return nodeInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseNode(value) {
  const scheme = value.match(/^([a-z0-9-]+):\/\//i)?.[1]?.toLowerCase();
  let node;
  if (scheme === "vless") node = parseStandard(value, "vless");
  else if (scheme === "trojan") node = parseStandard(value, "trojan");
  else if (scheme === "ss") node = parseShadowsocks(value);
  else if (scheme === "vmess") node = parseVmess(value);
  else throw new Error(`暂不支持的节点链接：${value.slice(0, 18)}…`);
  return { ...node, uri: value };
}

function parseStandard(value, protocol) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${protocol.toUpperCase()} 链接格式无效。`); }
  if (!url.username || !url.hostname || !url.port) throw new Error(`${protocol.toUpperCase()} 链接缺少身份、地址或端口。`);
  const q = url.searchParams;
  const name = decodeHash(url.hash) || `${protocol.toUpperCase()} ${url.hostname}`;
  const security = q.get("security") || (protocol === "trojan" ? "tls" : "none");
  const transport = q.get("type") || "tcp";
  const options = [`password=${decodeURIComponent(url.username)}`];
  if (security === "tls" || security === "reality" || protocol === "trojan") options.push("tls=true");
  const sni = q.get("sni") || q.get("peer");
  if (sni) options.push(`peer=${clean(sni)}`);
  if (q.get("allowInsecure") === "1") options.push("skip-cert-verify=true");
  if (transport === "ws") {
    options.push("obfs=websocket");
    const host = q.get("host"); if (host) options.push(`obfs-host=${clean(host)}`);
    const path = q.get("path"); if (path) options.push(`obfs-uri=${clean(path)}`);
  } else if (transport === "grpc") {
    options.push("obfs=grpc");
    const service = q.get("serviceName"); if (service) options.push(`grpc-service-name=${clean(service)}`);
  } else if (transport !== "tcp" && transport !== "none") {
    options.push(`obfs=${clean(transport)}`);
    const path = q.get("path"); if (path) options.push(`obfs-uri=${clean(path)}`);
  }
  if (security === "reality") {
    if (q.get("pbk")) options.push(`pbk=${clean(q.get("pbk"))}`);
    if (q.get("sid")) options.push(`sid=${clean(q.get("sid"))}`);
    if (q.get("fp")) options.push(`fingerprint=${clean(q.get("fp"))}`);
  }
  if (q.get("flow")) options.push(`flow=${clean(q.get("flow"))}`);
  options.push("udp=true");
  const clash = {
    type: protocol,
    server: url.hostname,
    port: Number(url.port),
    ...(protocol === "vless" ? { uuid: decodeURIComponent(url.username) } : { password: decodeURIComponent(url.username) }),
    udp: true,
  };
  if (security !== "none") clash.tls = true;
  if (transport !== "tcp" && transport !== "none") clash.network = transport;
  if (sni) clash.servername = sni;
  if (q.get("allowInsecure") === "1") clash["skip-cert-verify"] = true;
  if (protocol === "vless" && q.get("flow")) clash.flow = q.get("flow");
  if (security === "reality") {
    clash["client-fingerprint"] = q.get("fp") || "chrome";
    clash["reality-opts"] = {};
    if (q.get("pbk")) clash["reality-opts"]["public-key"] = q.get("pbk");
    if (q.get("sid")) clash["reality-opts"]["short-id"] = q.get("sid");
  }
  if (transport === "ws") {
    clash["ws-opts"] = { path: q.get("path") || "/" };
    if (q.get("host")) clash["ws-opts"].headers = { Host: q.get("host") };
  } else if (transport === "grpc" && q.get("serviceName")) {
    clash["grpc-opts"] = { "grpc-service-name": q.get("serviceName") };
  }
  return { name: cleanName(name), line: `${cleanName(name)}=${protocol},${host(url.hostname)},${url.port},${options.join(",")}`, clash };
}

function parseVmess(value) {
  let data;
  try { data = JSON.parse(decodeBase64(value.slice(8))); } catch { throw new Error("VMess 链接不是有效的 Base64 JSON。"); }
  if (!data.add || !data.port || !data.id) throw new Error("VMess 链接缺少地址、端口或 UUID。");
  const name = cleanName(data.ps || `VMESS ${data.add}`);
  const options = [`password=${clean(data.id)}`, `alterId=${clean(String(data.aid || 0))}`, "method=auto"];
  if (data.tls === "tls") options.push("tls=true");
  if (data.sni) options.push(`peer=${clean(data.sni)}`);
  if (data.net === "ws") {
    options.push("obfs=websocket");
    if (data.host) options.push(`obfs-host=${clean(data.host)}`);
    if (data.path) options.push(`obfs-uri=${clean(data.path)}`);
  }
  options.push("udp=true");
  const clash = {
    type: "vmess",
    server: String(data.add),
    port: Number(data.port),
    uuid: String(data.id),
    alterId: Number(data.aid || 0),
    cipher: data.scy || "auto",
    udp: true,
  };
  if (data.tls === "tls") clash.tls = true;
  if (data.sni || data.host) clash.servername = data.sni || data.host;
  if (data.net && data.net !== "tcp") clash.network = data.net;
  if (data.net === "ws") {
    clash["ws-opts"] = { path: data.path || "/" };
    if (data.host) clash["ws-opts"].headers = { Host: data.host };
  }
  return { name, line: `${name}=vmess,${host(String(data.add))},${clean(String(data.port))},${options.join(",")}`, clash };
}

function parseShadowsocks(value) {
  const body = value.slice(5);
  const hashIndex = body.indexOf("#");
  const name = hashIndex >= 0 ? decodeURIComponent(body.slice(hashIndex + 1)) : "Shadowsocks";
  const withoutHash = hashIndex >= 0 ? body.slice(0, hashIndex) : body;
  const queryIndex = withoutHash.indexOf("?");
  const core = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  let credentials, endpoint;
  if (core.includes("@")) [credentials, endpoint] = core.split("@");
  else {
    const decoded = decodeBase64(core);
    const at = decoded.lastIndexOf("@");
    if (at < 0) throw new Error("Shadowsocks 链接格式无效。");
    credentials = decoded.slice(0, at); endpoint = decoded.slice(at + 1);
  }
  if (!credentials.includes(":")) credentials = decodeBase64(credentials);
  const separator = credentials.indexOf(":");
  const method = credentials.slice(0, separator); const password = credentials.slice(separator + 1);
  const match = endpoint.match(/^\[?([^\]]+)\]?:(\d+)$/);
  if (!match || !method || !password) throw new Error("Shadowsocks 链接缺少加密方式、密码或地址。");
  const safe = cleanName(name || `SS ${match[1]}`);
  return { name: safe, line: `${safe}=ss,${host(match[1])},${match[2]},password=${clean(password)},method=${clean(method)},udp=true`, clash: {
    type: "ss", server: match[1], port: Number(match[2]), cipher: method, password, udp: true,
  } };
}

async function convertWithSubconverter(inputs, type) {
  const endpointValue = document.querySelector("#converter-url").value.trim();
  if (!endpointValue) throw new Error("请填写 subconverter 服务地址。");
  if (!document.querySelector("#converter-consent").checked) throw new Error("请确认你了解订阅信息将发送到转换服务。");
  let endpoint;
  try {
    endpoint = createSubconverterUrl(endpointValue, inputs, type);
  } catch {
    throw new Error("Subconverter 服务地址格式无效。");
  }
  let response;
  try {
    response = await fetch(endpoint, { headers: { Accept: "text/plain, application/yaml, application/json" } });
  } catch {
    throw new Error("无法连接转换服务。请检查服务地址、HTTPS 和 CORS 设置。");
  }
  const result = await response.text();
  if (!response.ok) {
    const detail = result.replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(`转换服务返回 HTTP ${response.status}${detail ? `：${detail}` : "。"}`);
  }
  if (!result.trim()) throw new Error("转换服务返回了空内容。");
  return result;
}

function buildConfig(nodes) {
  return buildShadowrocketConfig(nodes, {
    includeNodes: false,
    dns: clean(document.querySelector("#dns").value) || "system",
    finalPolicy: document.querySelector("#final-policy").value,
    ruleSets: ruleSetReferences(),
    customRules: [
      ...customRules("reject", shadowrocketPolicyForAction("REJECT", { includeNodes: false })),
      ...customRules("proxy", shadowrocketPolicyForAction("PROXY", { includeNodes: false })),
      ...customRules("direct", shadowrocketPolicyForAction("DIRECT", { includeNodes: false })),
    ],
    geoip: document.querySelector("#rule-geoip").checked,
  });
}

function renderOutput() {
  output.hidden = false;
  document.querySelector("#config-preview").textContent = generatedConfig;
  document.querySelector("#config-size").textContent = `${new Blob([generatedConfig]).size.toLocaleString()} bytes`;
  const select = document.querySelector("#qr-target");
  select.replaceChildren();
  generatedNodes.forEach((node, index) => select.add(new Option(`节点：${node.name}`, String(index))));
  document.querySelector("#qr-box").hidden = outputType.value !== "shadowrocket" || generatedNodes.length === 0;
  document.querySelector("#config-import-help").hidden = outputType.value !== "shadowrocket";
  output.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderQr() {
  if (!generatedConfig || !generatedNodes.length) return;
  const target = document.querySelector("#qr-target").value;
  const value = generatedNodes[Number(target)]?.uri;
  if (!value) return;
  const help = document.querySelector("#qr-help");
  try {
    await QRCode.toCanvas(document.querySelector("#qr-code"), value, {
      errorCorrectionLevel: "L",
      margin: 2,
      width: 320,
      color: { dark: "#0a0c0b", light: "#ffffff" },
    });
    help.textContent = outputType.value === "shadowrocket"
      ? "这是原始标准节点分享链接，可在 Shadowrocket 首页使用扫码按钮添加。"
      : "这是原始标准节点分享链接；完整 Clash YAML 请复制或下载导入。";
  } catch {
    const context = document.querySelector("#qr-code").getContext("2d");
    context.fillStyle = "#fff"; context.fillRect(0, 0, 320, 320);
    context.fillStyle = "#111"; context.font = "14px sans-serif"; context.textAlign = "center";
    context.fillText("内容超过二维码容量", 160, 150);
    context.fillText("请复制节点链接导入", 160, 176);
    help.textContent = "该节点链接超过二维码容量，请复制原始节点链接导入。";
  }
}

function clashOptions() {
  return {
    dnsServers: document.querySelector("#dns").value.split(",").map((server) => server.trim()).filter(Boolean),
    groupMode: document.querySelector("#group-mode").value,
    finalPolicy: document.querySelector("#final-policy").value,
    ruleSets: ruleSetReferences(),
    customRules: [
      ...customRules("reject", "REJECT"),
      ...customRules("proxy", "PROXY"),
      ...customRules("direct", "DIRECT"),
    ],
    geoip: document.querySelector("#rule-geoip").checked,
  };
}

function enabledRuleProviders() {
  return [
    { id: "reject", action: "REJECT", enabled: document.querySelector("#rule-reject").checked },
    { id: "proxy", action: "PROXY", enabled: document.querySelector("#rule-proxy").checked },
    { id: "direct", action: "DIRECT", enabled: document.querySelector("#rule-direct").checked },
  ].filter((provider) => provider.enabled);
}

function ruleSetReferences() {
  return enabledRuleProviders().map(({ id, action }) => ({
    id,
    action,
    url: `${activeRulesBase()}/${id}.list`,
  }));
}

async function loadProjectRules() {
  try {
    await Promise.all(enabledRuleProviders().map(({ id }) => loadRuleList(id)));
    updateRuleCounts();
  } catch {
    status.textContent = "规则列表暂未加载完成；生成配置时会自动重试。";
  }
}

async function loadRuleList(id) {
  if (remoteRuleCache.has(id)) return remoteRuleCache.get(id);
  let response;
  try {
    response = await fetch(`${publicRulesBase()}/${id}.list`, { headers: { Accept: "text/plain" } });
  } catch {
    response = null;
  }
  if ((!response || !response.ok) && location.protocol === "file:") {
    response = await fetch(`${PUBLISHED_RULES_BASE}/${id}.list`, { headers: { Accept: "text/plain" } });
  }
  if (!response || !response.ok) throw new Error(`rules/${id}.list HTTP ${response?.status || "failed"}`);
  const text = await response.text();
  remoteRuleCache.set(id, text);
  updateRuleCount(id);
  return text;
}

function publicRulesBase() {
  return `${location.origin}${location.pathname.replace(/\/[^/]*$/, "/")}rules`;
}

function activeRulesBase() {
  return location.protocol === "http:" || location.protocol === "https:" ? publicRulesBase() : PUBLISHED_RULES_BASE;
}

function customRules(id, action) {
  return document.querySelector(`#custom-${id}`).value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    if (line.includes(",")) return normalizeCustomRule(line, action);
    if (/^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/.test(line)) return `IP-CIDR,${line.includes("/") ? line : `${line}/32`},${action},no-resolve`;
    if (line.includes(":")) return `IP-CIDR6,${line.includes("/") ? line : `${line}/128`},${action},no-resolve`;
    return `DOMAIN-SUFFIX,${line.replace(/^\*\./, "").toLowerCase()},${action}`;
  });
}

function normalizeCustomRule(line, action) {
  const parts = line.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return line;
  const start = isRuleAction(parts[2]) || isShadowrocketPolicy(parts[2]) ? 3 : 2;
  return [parts[0], parts[1], action, ...parts.slice(start)].join(",");
}

function selectedRuleSummary(type) {
  const providers = enabledRuleProviders();
  if (!providers.length) return `${type} 未启用本项目抓取规则`;
  const items = providers.map(({ id }) => remoteRuleCache.has(id)
    ? `${RULE_LABELS[id]} ${countRuleLines(remoteRuleCache.get(id)).toLocaleString()} 条`
    : `${RULE_LABELS[id]} 远程规则`);
  return `已引用本项目每日抓取规则：${items.join("、")}`;
}

function updateRuleCounts() {
  for (const id of Object.keys(RULE_LABELS)) updateRuleCount(id);
}

function updateRuleCount(id) {
  const element = document.querySelector(`#rule-${id}-count`);
  if (!element) return;
  if (!remoteRuleCache.has(id)) {
    element.textContent = `${RULE_LABELS[id]} · 加载中`;
    return;
  }
  element.textContent = `${RULE_LABELS[id]} · ${countRuleLines(remoteRuleCache.get(id)).toLocaleString()} 条`;
}

function countRuleLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#")).length;
}

function isRuleAction(value) {
  return ["DIRECT", "PROXY", "REJECT"].includes(String(value || "").toUpperCase());
}

function isShadowrocketPolicy(value) {
  return Object.values(SHADOWROCKET_POLICY).includes(value);
}

function uniqueNames(nodes) {
  const counts = new Map();
  return nodes.map((node) => {
    const count = (counts.get(node.name) || 0) + 1; counts.set(node.name, count);
    if (count === 1) return node;
    const name = `${node.name} ${count}`;
    return { ...node, name, line: node.line.replace(/^[^=]+=/, `${name}=`) };
  });
}

function decodeBase64(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); return decodeURIComponent(escape(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")))); }
function decodeHash(hash) { try { return decodeURIComponent(hash.replace(/^#/, "")); } catch { return hash.replace(/^#/, ""); } }
function host(value) { return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value; }
function clean(value) { return String(value).replace(/[\r\n,]/g, "").trim(); }
function cleanName(value) { return clean(value).replace(/=/g, "-").slice(0, 80) || "Unnamed"; }
function safeName(value) { return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "custom-proxy"; }
function download(name, content) { const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" })); const link = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
