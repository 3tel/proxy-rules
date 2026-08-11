# custom-proxy-rules

将公开规则源与你自己的域名、IP/CIDR 和覆盖规则合并，并在浏览器里生成可下载的
Shadowrocket 或 Clash 配置。

## 特点

- 聚合公开的 DIRECT、PROXY、REJECT 数据源
- 支持裸域名、通配域名、IPv4、IPv6、CIDR 和完整规则语法
- 自动规范化、去重、稳定排序并生成冲突报告
- 本地规则优先于公开源，私有规则优先级最高
- 私有目录默认被 Git 忽略，降低内网信息误提交风险
- 静态网页支持 VLESS、VMess、Trojan 和 Shadowsocks 分享链接
- 可按需启用广告拦截、代理域名、国内直连和 GEOIP 分流
- 生成后可直接预览、复制或显示本地二维码，不会自动下载
- 支持逐节点标准分享二维码；完整配置使用 `.conf` 文件导入
- 提供与 subconverter 对应的客户端生成类型选择
- Clash 目标对 VLESS、VMess、Trojan 和 SS 直链优先在浏览器本地生成，避免旧版 subconverter 无法识别 VLESS 直链
- 节点凭据只在浏览器本地处理，不上传、不存储
- GitHub Actions 每日自动测试、构建规则并部署 GitHub Pages

## 快速开始

普通用户直接打开在线生成器：

https://3tel.github.io/proxy-rules/

粘贴节点或订阅链接、选择分流规则和策略，然后点击“生成配置”。网页会生成包含节点组和
分流规则的临时配置，并提供预览、复制、二维码和可选下载。直接节点的 UUID、密码和服务器
信息不会离开当前浏览器；订阅链接需要通过你指定的 subconverter 服务解析。

单个节点二维码使用原始标准分享链接，可以直接扫码添加。Shadowrocket 的扫码入口不接受
普通二维码中的完整配置正文，因此网页不会再生成无效的“整份配置二维码”。完整配置请下载
`.conf` 文件，再从 iOS“文件”中用 Shadowrocket 打开，或进入 Shadowrocket 的“配置”页面导入。

## 订阅转换

“生成类型”支持 Shadowrocket 本地配置，以及 Clash、ClashR、Quantumult、Quantumult X、
Loon、SS、SSD、SSR、Surfboard、Surge 2/3/4、Trojan、V2Ray、Mixed 和 Auto。这些名称及
目标参数与 [subconverter](https://github.com/tindy2013/subconverter) 保持一致。

Shadowrocket 配置直接在浏览器本地生成。其他格式默认使用项目维护的
`https://convert.3tel.net` subconverter 服务，也可以替换成其他服务地址。网页只有在用户
明确勾选同意后才会发送订阅信息；转换服务会接触订阅地址、UUID 和密码等节点信息。

输入框支持一行一个 HTTP/HTTPS 订阅链接，也可同时填写多个订阅地址进行合并。选择
Shadowrocket 时，直接节点仍在浏览器本地解析；如果输入中包含订阅链接，则使用用户填写的
subconverter 服务以 `mixed` 格式解析订阅，再与直接节点合并成带分流规则的配置。

选择 Clash 时，VLESS、VMess、Trojan 或 SS 直链会直接写入 `proxies`；订阅链接会先通过
subconverter 取得节点，再在浏览器里合并本项目的 `rule-providers`、自定义规则和最终策略。
VLESS Reality 等新协议字段需要使用支持相应协议的 Clash Meta 客户端。

本地构建需要 Node.js 20 或更高版本：

```bash
cp -R rules/private.example rules/private
npm test
npm run build
```

不下载公开源、只验证本地规则：

```bash
npm run build:local
```

一般用户只需订阅合并模块：

```text
https://raw.githubusercontent.com/3tel/proxy-rules/main/dist/shadowrocket/all.module
```

生成文件位于 `dist/shadowrocket/`：

- `all.module`（推荐，包含全部规则）
- `direct.module`
- `proxy.module`
- `reject.module`
- `direct.list`、`proxy.list`、`reject.list`（供网页生成的配置引用）

构建统计和前 100 条冲突写入 `build-report.json`。

## 添加自定义规则

公开规则写入 `rules/local/direct.txt`、`proxy.txt` 或 `reject.txt`。真实内网信息写入同名的
`rules/private/` 文件。后者不会被 Git 跟踪。

每行一条，支持以下写法：

```text
example.com
*.internal.example
10.10.0.0/16
fd00::/8
DOMAIN,api.example.com,PROXY
IP-CIDR,203.0.113.0/24,DIRECT,no-resolve
```

裸域名和 `*.域名` 都会转换为 `DOMAIN-SUFFIX`。IP 地址和 CIDR 会自动识别 IPv4/IPv6、
规范网络地址，并添加 `no-resolve`。

## 冲突规则

同一个目标同时出现在多个策略中时，优先级为：

```text
rules/private > rules/local > REJECT 公开源 > PROXY 公开源 > DIRECT 公开源
```

因此可以在 `rules/private/direct.txt` 中把被公开广告源误杀的内部域名强制改为 DIRECT。

## 数据源

数据源在 `config/sources.json` 中声明，目前默认使用：

- [dnsmasq-china-list](https://github.com/felixonmars/dnsmasq-china-list)
- [gfwlist](https://github.com/gfwlist/gfwlist)
- [AdGuard DNS filter](https://github.com/AdguardTeam/AdguardSDNSFilter)

本仓库只在构建时获取并转换这些上游数据。使用或再分发生成规则前，请同时检查各上游项目
的许可证和使用条款。详细边界见 [SOURCES.md](SOURCES.md)。

## 隐私提醒

`.gitignore` 只能避免普通的 `git add` 误操作。不要使用 `git add -f rules/private`，也不要把
含有内部信息的生成文件发布到公共仓库。如果需要跨设备同步真实内网规则，建议使用单独的
私有仓库或加密存储。
