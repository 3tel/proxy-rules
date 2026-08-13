import test from "node:test";
import assert from "node:assert/strict";
import { createSubconverterUrl, isDirectNodeLink, isSubscriptionUrl, subscriptionLines } from "../docs/converter.js";

test("subconverter URL maps Clash and merges subscription inputs", () => {
  const result = createSubconverterUrl(
    "https://converter.example.com",
    ["https://one.example/sub?a=1", "https://two.example/sub"],
    "clash",
  );
  assert.equal(result.pathname, "/sub");
  assert.equal(result.searchParams.get("target"), "clash");
  assert.equal(result.searchParams.has("ver"), false);
  assert.equal(result.searchParams.get("url"), "https://one.example/sub?a=1|https://two.example/sub");
});

test("subconverter URL preserves an existing sub endpoint", () => {
  const result = createSubconverterUrl("https://converter.example.com/api/sub", ["vless://example"], "clash");
  assert.equal(result.pathname, "/api/sub");
  assert.equal(result.searchParams.get("target"), "clash");
});

test("Shadowrocket subscriptions use mixed output", () => {
  const result = createSubconverterUrl("https://converter.example.com", ["https://provider.example/sub"], "shadowrocket");
  assert.equal(result.searchParams.get("target"), "mixed");
});

test("subscription URLs are distinguished from node links", () => {
  assert.equal(isSubscriptionUrl("https://provider.example/sub?token=secret"), true);
  assert.equal(isSubscriptionUrl("vless://uuid@example.com:443"), false);
  assert.equal(isDirectNodeLink("vless://uuid@example.com:443"), true);
  assert.equal(isDirectNodeLink("https://provider.example/sub?token=secret"), false);
});

test("base64 mixed subscription is expanded into node links", () => {
  const source = "vmess://abc\nss://def\n# comment";
  const encoded = Buffer.from(source).toString("base64");
  assert.deepEqual(subscriptionLines(encoded, (value) => Buffer.from(value, "base64").toString()), ["vmess://abc", "ss://def"]);
});
