# 简体中文 Bitwarden 浏览器扩展（自建验证器）

这个发布包把三部分合在一起，可以直接装进浏览器使用：

- 自动填充（普通输入框、Shadow DOM、没有 `<form>` 的登录框）
- 弹出窗口里的验证器（TOTP 验证码、二维码、导入、多设备同步）
- 界面默认简体中文，保存密码提示、基本认证自动填充、同源 iframe 里的通行密钥

配合的服务端是 [minxiangnan/vaultwarden](https://github.com/minxiangnan/vaultwarden) 分支 `cursor/authenticator-entries-9888`。库存的上游 Vaultwarden 没有验证器接口，扩展里不会出现「验证器」标签。

## 1. 部署 Vaultwarden

非本机访问必须使用 HTTPS。浏览器扩展的生产版本在 `https://` 之外不会建立通知 WebSocket，两台设备之间的验证器推送也就不会工作。

服务需要：

- `DOMAIN` 设成浏览器里打开的那个地址，带协议，末尾不要斜杠，例如 `https://vault.example.com`
- `ENABLE_WEBSOCKET=true`（镜像默认就是 true，请不要关掉）
- 反向代理把 `/notifications/hub` 升级成 WebSocket
- 数据目录做成持久卷

完整的 `docker-compose.yml` 和变量说明在服务端仓库的 `docs/zh-authenticator-deploy.md`。下面是同一台机器上的反向代理例子。容器内部监听 80，映射到宿主机 8080。

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

1. 打开扩展，在登录页选择自建服务器（「自托管」或服务器环境下拉）。
2. 服务器 URL 填 `DOMAIN` 的值，例如 `https://vault.example.com`。生产扩展不会用明文 HTTP 做推送。
3. 注册或登录。`SIGNUPS_ALLOWED=true` 时可以在扩展里创建账户。

## 4. 打开验证器

登录并解锁之后，弹出窗口里会出现「验证器」标签。服务器如果是没有本分支的 Vaultwarden，这个标签会隐藏。

在该标签可以：

- 添加验证码（发行方、账户、Base32 密钥、算法、位数、周期）
- 从当前标签页扫描二维码，或粘贴 `otpauth://` 链接导入
- 复制当前验证码、搜索、收藏、上下移动、编辑、删除

另一台已登录同一账户的浏览器会通过 `/notifications/hub` 收到变更。两边都要能连上 HTTPS WebSocket。

## 5. 其他行为

- 保存登录：在网页提交用户名和密码后，右上角出现「保存登录」。两步登录（先用户名、后密码）会把两步合成一条。已有条目密码变化时出现「更新现有的登录」。
- 基本认证：设置 → 自动填充 → 打开「浏览器登录自动填充提示」。条目的 URI 匹配方式必须是「主机」，不能用默认匹配。服务器没有下发该功能开关时，这个选项仍然显示。
- 通行密钥：在 `http://localhost` 或任意 `https://` 页面可以创建和使用。`127.0.0.1` 不能作为通行密钥的依赖方 ID。同源 iframe 可以；跨源 iframe 仍受 Permissions Policy 限制。

## 6. 已知限制

- 通行密钥的依赖方不能是 IP 地址。请用 `localhost` 或真实域名。
- 跨源 iframe 的 `publickey-credentials-get` 权限策略不会在动态插入时补写。
- 基本认证自动填充默认关闭，而且每一条 URI 都要显式指定匹配方式。
- 生产扩展对通知通道要求 HTTPS。只在本机用 HTTP 时，验证器列表可用，推送同步不可用。
- Docker 镜像自带的网页保险库是上游英文版本。简体中文网页需要自行构建本仓库的 `apps/web`。
- Firefox 的临时载入在退出浏览器后会被卸掉。
