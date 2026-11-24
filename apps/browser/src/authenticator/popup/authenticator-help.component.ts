import { ChangeDetectionStrategy, Component } from "@angular/core";

import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";

@Component({
  selector: "app-authenticator-help",
  imports: [PopupPageComponent, PopupHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <popup-page>
      <popup-header slot="header" pageTitle="使用说明" showBackButton></popup-header>
      <div class="tw-flex tw-flex-col tw-gap-4 tw-text-sm tw-leading-6 tw-text-main">
        <section>
          <h2 class="tw-mb-1 tw-text-base tw-font-semibold">添加验证码</h2>
          <p class="tw-m-0">
            在验证器页点「添加验证码」。可以扫描当前网页上的二维码，从图片导入，或粘贴
            otpauth:// 链接和 Base32 密钥。SHA1、SHA256、SHA512，6 位或 8 位，30 秒或 60
            秒都可以。Steam 和基于计数器的 HOTP 在高级设置里选类型。
          </p>
        </section>
        <section>
          <h2 class="tw-mb-1 tw-text-base tw-font-semibold">填到网页</h2>
          <p class="tw-m-0">
            编辑验证码时点「使用当前网站」，记下这个主机。之后在这个主机上自动填充登录时，如果登录项自己没有验证码，会填入这里的码，并按设置复制到剪贴板。剪贴板多久清空，沿用自动填充设置里的时间。快捷键「复制当前网站验证码」默认不占用按键，到浏览器的扩展快捷键页自己绑，例如
            Alt+Shift+T。
          </p>
        </section>
        <section>
          <h2 class="tw-mb-1 tw-text-base tw-font-semibold">导入和备份</h2>
          <p class="tw-m-0">
            可以粘贴多行 otpauth、Google 验证器的迁移二维码（otpauth-migration）、Aegis 或 2FAS
            的未加密 JSON，以及 Bitwarden 的 JSON 或 CSV。加密的 Aegis 和 Authy
            备份请先在原应用里导出明文。下载的 JSON
            是明文，只适合迁移。点「备份到保险库」会写成一条加密的安全笔记，存在服务器上。
          </p>
        </section>
        <section>
          <h2 class="tw-mb-1 tw-text-base tw-font-semibold">离线和同步</h2>
          <p class="tw-m-0">
            验证码加密后存在你的服务器上。服务器暂时连不上时，仍显示上次同步的码，但不能新增或修改。页面上会写明这是只读。连上之后再改。
          </p>
        </section>
        <section>
          <h2 class="tw-mb-1 tw-text-base tw-font-semibold">密码</h2>
          <p class="tw-m-0">
            设置里可以打开密码健康：本地检查太短、太简单和重复使用的密码。点检查泄露时，只把密码
            SHA-1 的前 5 位发给 Have I Been Pwned，密码本身不会发出去。生成器里有三个预设：20
            位强密码、6 位数字和 5 词口令。不再保存某些网站的密码，在自动填充设置的「已阻止的域名」里管理。删除的登录在密码库设置的回收站里，可以恢复。
          </p>
        </section>
      </div>
    </popup-page>
  `,
})
export class AuthenticatorHelpComponent {}
