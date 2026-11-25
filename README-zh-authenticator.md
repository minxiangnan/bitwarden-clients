# 简体中文 Bitwarden 浏览器扩展（自建验证器）

当前版本：**1.1.7**（标签 `v-zh-authenticator-1.1.7`）。扩展清单版本是 `2026.11.7`，Chrome 能把它认成比 `2026.11.6` 新的一版。保存时带上读到的 `revisionDate`，服务器若已有更新会拒绝这次写入。别名变化也会跟着通知刷新。离线时不能改。

这个发布包把三部分合在一起，可以直接装进浏览器使用：

- 自动填充（普通输入框、Shadow DOM、没有 `<form>` 的登录框）
- 弹出窗口里的验证器（TOTP 验证码、二维码、导入、多设备同步）
- 界面默认简体中文，保存密码提示、基本认证自动填充、同源 iframe 里的通行密钥

配合的服务端是 [minxiangnan/vaultwarden](https://github.com/minxiangnan/vaultwarden) 带验证器条目和 MCP 的分支。库存的上游 Vaultwarden 没有验证器接口，扩展里不会出现「验证器」标签。

## 1. 部署 Vaultwarden

非本机访问必须使用 HTTPS。登录页遇到 `http://` 的局域网或公网地址会停在这一步，并说明只有本机的 localhost 和 127.0.0.1 可以用 HTTP。本机这两个地址从登录到接口请求都会放行。

证书必须被这台浏览器信任。自签证书如果没有装进系统或浏览器，保存和更新会失败，提示条写「服务器证书不受信任，保存失败」。本机 `http://127.0.0.1` 不走证书，可以保存。正式环境用受信任的证书，不要只靠浏览器的「忽略证书错误」，那个开关盖不到扩展后台的保存请求。

服务需要：

- `DOMAIN` 设成浏览器里打开的那个地址，带协议，末尾不要斜杠，例如 `https://vault.example.com`
- `ENABLE_WEBSOCKET=true`（镜像默认就是 true，请不要关掉）
- 反向代理把 `/notifications/hub` 升级成 WebSocket
- 数据目录做成持久卷

完整的 `docker-compose.yml` 和变量说明在服务端仓库的 `docs/zh-authenticator-deploy.md`。容器监听 8080，示例映射到宿主机 8080。

要让 AI 读取验证码：扩展「设置 → MCP 访问」创建令牌（只显示一次，点复制），再在验证器条目里填写别名并打开「允许 MCP 读取」。别名在添加和编辑时都看得到，列表行也会显示。客户端配置见服务端文档的 MCP 一节。

### Caddy

```caddy
vault.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

Caddy 会自动为 WebSocket 升级请求转发 `Connection` 和 `Upgrade`。

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name vault.example.com;

    # ssl_certificate 与 ssl_certificate_key 按你的证书填写

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /notifications/hub {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

Docker 镜像里的网页保险库是上游英文 web-vault。扩展本身默认简体中文。若网页也要简体中文，用本仓库构建网页端并把它放到 Vaultwarden 的 `WEB_VAULT_FOLDER`：

```bash
cd apps/web
NODE_OPTIONS=--max-old-space-size=8192 npm run build:oss:selfhost:prod
```

产物在 `apps/web/build`。生产构建拒绝明文 `http://` API。网页和 API 必须在同一个 HTTPS 源上，由反向代理把 `/api`、`/identity`、`/notifications`、`/icons` 转到 Vaultwarden。

## 2. 安装扩展

发布页有三个 zip：

| 文件 | 浏览器 |
| --- | --- |
| `bitwarden-chrome-mv3.zip` | Chrome |
| `bitwarden-edge-mv3.zip` | Edge |
| `bitwarden-firefox.zip` | Firefox |

Chrome 和 Edge 用「加载未打包的扩展」。不要直接把 zip 拖进 `chrome://extensions`。

1. 解压 zip。解压后的目录里要能直接看到 `manifest.json`。
2. 打开 `chrome://extensions`（Edge 是 `edge://extensions`）。
3. 打开「开发者模式」。
4. 「加载已解压的扩展程序」，选中含 `manifest.json` 的那个目录。
5. 把扩展固定到工具栏。

Firefox：`about:debugging#/runtime/this-firefox` → 「临时载入附加组件」→ 选择解压目录里的 `manifest.json`。临时载入会在浏览器完全退出后失效。

界面默认简体中文，和浏览器语言无关。要改语言：扩展 → 设置 → 外观。选「默认」会回到简体中文。

## 3. 连接到自建服务器

扩展名叫 **Bitwarden 验证器版**，可以和官方 Bitwarden 装在同一个浏览器里。登录页是服务器 URL 和邮箱，然后是主密码。没有公开注册、没有地区选择、没有通行密钥或 SSO。管理员在服务端关闭公开注册后，可以在 `/admin` 邀请邮箱；登录页的「收到邀请？创建账户」用这个邮箱创建账户。没有被邀请的邮箱会被服务器拒绝，页面上写明原因。

1. 服务器 URL 填 `DOMAIN`，例如 `https://vault.example.com`。没写 `https://` 会自动补上。本机 `http://localhost` 或 `http://127.0.0.1` 也可以。
2. 填邮箱，点「继续」，再填主密码。
3. 公开注册保持关闭。管理员先在 `/admin` 邀请邮箱，再用登录页的「收到邀请？创建账户」填写这个邮箱和主密码。

会话超时默认是「从不」，超时动作是「锁定」。每个账户在登录或创建之后都是这个默认值，除非你在设置里改过。关掉浏览器再打开，密码库保持解锁。点「立即锁定」后，这个窗口留在解锁页，不会自己关掉。改完会记在这台浏览器里；密码、文件夹和验证码记在服务器上。

## 3.1 和官方扩展共存

- 名称是「Bitwarden 验证器版」，图标是暖色，和官方蓝色盾牌不一样。
- 没有官方的 `key`，扩展 ID 不会和商店版撞车。Firefox 用了单独的 gecko id。
- 不占用 Ctrl+Shift+L / Y / U / 9。
- 右键菜单标题是「Bitwarden 验证器版」。
- 保存条用自己的节点，不会拆掉官方扩展的保存条。两个扩展都会在页面上各自提示，用哪一个保存由你点哪一条决定。
- 桌面端生物识别仍连接 `com.8bit.bitwarden`。官方桌面只允许官方扩展，本扩展连不上，也不会把官方扩展挤掉。

## 4. 打开验证器

登录并解锁之后，弹出窗口里会出现「验证器」标签。服务器如果是没有本分支的 Vaultwarden，这个标签会隐藏。

在该标签可以：

- 添加验证码。「扫描当前标签页」读的是你正在看的网页，工具栏弹出窗口和单独弹出的扩展页面都一样。页面上没有二维码时，列表上写「当前标签页没有找到二维码」。密钥在上面；名称、发行方、算法、位数、周期、网站主机、分组、Steam、HOTP 在「高级设置」
- 粘贴 `otpauth://` 链接，或在「更多」里导入 Google 迁移码、未加密的 Aegis / 2FAS / Bitwarden 导出
- 点卡片复制当前验证码。能看到倒计时和下一段。搜索、收藏、最近使用都在列表上
- 编辑页可以改这一条、上下移动。删除要再确认一次，先进入验证码回收站
- 登录项自己没有验证码时，按网站主机用验证器里的码自动填充，并在填完密码后复制
- 某条打开「允许 MCP 读取」并写别名后，AI 才能用「设置 → MCP 访问」里的令牌读取这一条的当前码。令牌只显示一次。HOTP 不能这样读取

另一台已登录同一账户的浏览器会通过 `/notifications/hub` 收到变更。两边都要能连上 HTTPS WebSocket。

## 5. 其他行为

- 保存登录：在网页提交用户名和密码后，右上角出现「保存登录」。两步登录（先用户名、后密码）会把两步合成一条。已有条目密码变化时出现「更新现有的登录」。点「此网站永不」会再确认一次，标题是这个网站，默认停在「取消」。
- 删除登录、文件夹、附件、验证码，以及吊销 MCP 令牌、注销，都会再确认一次。标题是要动的那一项，危险按钮在右边，键盘焦点在「取消」。
- 基本认证：设置 → 自动填充 → 打开「浏览器登录自动填充提示」。条目的 URI 匹配方式必须是「主机」，不能用默认匹配。服务器没有下发该功能开关时，这个选项仍然显示。
- 通行密钥：在 `http://localhost` 或任意 `https://` 页面可以创建和使用。`127.0.0.1` 不能作为通行密钥的依赖方 ID。同源 iframe 可以；跨源 iframe 仍受 Permissions Policy 限制。

## 6. 已知限制

- 通行密钥的依赖方不能是 IP 地址。请用 `localhost` 或真实域名。
- 跨源 iframe 的 `publickey-credentials-get` 权限策略不会在动态插入时补写。
- 基本认证自动填充默认关闭，而且每一条 URI 都要显式指定匹配方式。
- 生产扩展对通知通道要求 HTTPS。只在本机用 HTTP 时，验证器列表可用，推送同步不可用。
- Docker 镜像自带的网页保险库是上游英文版本。简体中文网页需要自行构建本仓库的 `apps/web`。
- Firefox 的临时载入在退出浏览器后会被卸掉。
