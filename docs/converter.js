export const CONVERTER_TARGETS = {
  shadowrocket: { target: "mixed", extension: "conf" },
  clash: { target: "clash", extension: "yaml" },
};

export function isSubscriptionUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isDirectNodeLink(value) {
  return /^(?:vless|vmess|trojan|ss):\/\//i.test(value.trim());
}

export function subscriptionLines(value, decode) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  let content = trimmed;
  if (!/^(?:vless|vmess|trojan|ss):\/\//im.test(content)) {
    try { content = decode(content.replace(/\s/g, "")); } catch { return []; }
  }
  return content.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^(?:vless|vmess|trojan|ss):\/\//i.test(line));
}

export function createSubconverterUrl(endpointValue, inputs, type) {
  const settings = CONVERTER_TARGETS[type];
  if (!settings) throw new Error(`unsupported target: ${type}`);
  const endpoint = new URL(endpointValue);
  if (!/^https?:$/.test(endpoint.protocol)) throw new Error("endpoint must use HTTP or HTTPS");
  const basePath = endpoint.pathname.replace(/\/$/, "");
  endpoint.pathname = basePath.endsWith("/sub") ? basePath : `${basePath}/sub`;
  endpoint.search = "";
  endpoint.searchParams.set("target", settings.target);
  endpoint.searchParams.set("url", inputs.join("|"));
  if (settings.version) endpoint.searchParams.set("ver", settings.version);
  return endpoint;
}
