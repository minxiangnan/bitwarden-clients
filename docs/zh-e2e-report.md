# 登录提示和界面检查（1.0.6）

这次检查的是登录之后该不该提示、提示成保存还是更新，以及提示条好不好懂。用的是本地页面和已经登录的扩展，服务器是本机 `http://127.0.0.1:8000`。自签的 `https://127.0.0.1:8443` 代理能打开登录，但扩展里的加密保存客户端发不出去，所以保存和更新是对着明文的本机地址做的。

## 提示怎么选

- 这个主机没有这个用户名：标题是「保存登录」，下面是主机和用户名，按钮是「保存」。
- 有这个用户名、密码不同：标题是「更新现有的登录」，下面是同一条的用户名，按钮是「更新」。只改密码。
- 用户名和密码都一样：不出现提示。同一个标签页里同一组也不会再问第二次。
- 两条下面都有「此网站永不」。点了记这个主机，保存和更新都不再问。

## 结果

| 场景 | 结果 | 截图 |
| --- | --- | --- |
| 无表单页面，新用户 | 通过，已写入服务器 | `/opt/cursor/artifacts/tour5/spa-new-save.png` |
| 无表单页面，改密码 | 通过，「登录已更新」 | `/opt/cursor/artifacts/tour5/spa-changed-update.png` |
| 无表单页面，同一组密码 | 通过，没有提示 | `/opt/cursor/artifacts/tour5/spa-same-none.png` |
| 普通表单再跳转，新用户 | 通过 | `/opt/cursor/artifacts/tour5/classic-new-save.png` |
| 普通表单，改密码 | 通过 | `/opt/cursor/artifacts/tour5/classic-changed-update.png` |
| 普通表单，同一组密码 | 通过，没有提示 | `/opt/cursor/artifacts/tour5/classic-same-none.png` |
| 先邮箱后密码，新用户 | 通过，用户名还在 | `/opt/cursor/artifacts/tour5/two-step-new-save.png` |
| 先邮箱后密码，改密码 | 通过 | `/opt/cursor/artifacts/tour5/two-step-changed-update.png` |
| 先邮箱后密码，同一组密码 | 通过，没有提示 | `/opt/cursor/artifacts/tour5/two-step-same-none.png` |
| iframe 里登录，新用户 | 通过 | `/opt/cursor/artifacts/tour5/iframe-new-save.png` |
| iframe，改密码 | 通过 | `/opt/cursor/artifacts/tour5/iframe-changed-update.png` |
| iframe，同一组密码 | 通过，没有提示 | `/opt/cursor/artifacts/tour5/iframe-same-none.png` |
| GitLab 样式表单，新用户 | 通过 | `/opt/cursor/artifacts/tour5/gitlab-new-save.png` |
| GitLab 样式，改密码 | 通过 | `/opt/cursor/artifacts/tour5/gitlab-changed-update.png` |
| GitLab 样式，同一组密码 | 通过，没有提示 | `/opt/cursor/artifacts/tour5/gitlab-same-none.png` |
| 更新后验证码还在 | 通过。密钥仍是原来的，密码变成 `Classic-pass-3` | `/opt/cursor/artifacts/tour5/totp-after-update.png` |
| 保存条写明账户，并有「此网站永不」 | 通过 | `/opt/cursor/artifacts/tour5/save-bar-never.png` |
| 更新条写明账户，并有「此网站永不」 | 通过 | `/opt/cursor/artifacts/tour5/update-bar-never.png` |

五条新登录对应五次 `POST /api/ciphers` 200。随后的更新对应 `PUT /api/ciphers` 200。密码库条目从 16 变成 21。

## 用着别扭、已经改的

- 更新按钮的名字里还带着项目名，自动化要点「更新」这两个字，不能按整个无障碍名称。人看的按钮仍然只写「更新」。
- 自签 HTTPS 代理下，登录可以，点保存会失败。明文 `http://127.0.0.1` 可以保存。正式部署要用正常证书的 HTTPS，不要用这个自签代理做保存。

## 这次没有重跑的

下面这些要用刚发布的安装包和 Vaultwarden 发布二进制，从空目录装起来再测。这次没有重做：

- 全新配置、服务器上开户、扩展里只填 URL 和邮箱
- 两个配置互相同步、1.0.5 升到 1.0.6
- 和官方扩展并排
- Firefox 临时载入

机器详情在 `/opt/cursor/artifacts/tour5/results.json`。
