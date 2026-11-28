import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { BehaviorSubject, map } from "rxjs";

import { ButtonModule, FormFieldModule, IconModule, ItemModule } from "@bitwarden/components";

import { AuthenticatorEntryView } from "../../authenticator/authenticator.models";
import { AuthenticatorListComponent } from "../../authenticator/popup/authenticator-list.component";
import { AuthenticatorService } from "../../authenticator/popup/authenticator.service";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";

const previewEntries: AuthenticatorEntryView[] = [
  {
    id: "gh",
    name: "公司统一身份认证平台管理员账号",
    issuer: "GitHub",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    notes: "这是一段完整备注，用来确认名称和备注都会换行显示，而不是被省略号截断。",
    favorite: true,
    sortOrder: 1,
    revisionDate: "",
    creationDate: "",
    undecryptable: false,
  },
  {
    id: "google",
    name: "minxiangnan@qq.com",
    issuer: "Google",
    secret: "GEZDGNBVGY3TQOJQ",
    algorithm: "SHA1",
    digits: 8,
    period: 30,
    notes: "",
    favorite: false,
    sortOrder: 2,
    revisionDate: "",
    creationDate: "",
    undecryptable: false,
  },
  {
    id: "amazon",
    name: "购物",
    issuer: "Amazon",
    secret: "ORUGS4ZANFZSAYJA",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    notes: "家庭",
    favorite: false,
    sortOrder: 3,
    revisionDate: "",
    creationDate: "",
    undecryptable: false,
  },
];

/** Mock vault so the real authenticator list can render without an account. */
function previewAuthenticator(): AuthenticatorService {
  const orderBySecret = new Map(
    previewEntries.map((entry, index) => [entry.secret, (index + 1) * 1000]),
  );
  return {
    state$: new BehaviorSubject({
      status: "ready" as const,
      entries: previewEntries,
      syncedAt: null,
    }),
    confirmServer: () => Promise.resolve(),
    totpOrderIndex: () =>
      Promise.resolve({
        orderBySecret,
        secretsWithCipher: new Set(previewEntries.map((entry) => entry.secret)),
      }),
    setFavorite: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    move: () => Promise.resolve(),
    writeTotpOrders: () => Promise.resolve(),
  } as unknown as AuthenticatorService;
}

/**
 * Screenshot harness. It is not linked from the product UI.
 * Each `?screen=` paints one popup using the real layout, items, fields, and authenticator list.
 */
@Component({
  selector: "app-design-preview",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PopupPageComponent,
    PopupHeaderComponent,
    ButtonModule,
    FormFieldModule,
    IconModule,
    ItemModule,
    AuthenticatorListComponent,
  ],
  providers: [{ provide: AuthenticatorService, useFactory: previewAuthenticator }],
  host: { class: "tw-block tw-h-full" },
  templateUrl: "./design-preview.component.html",
})
export class DesignPreviewComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly screen = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get("screen") ?? "vault")),
    { initialValue: "vault" },
  );

  protected readonly tabs = [
    { id: "vault", label: "密码库" },
    { id: "generator", label: "生成器" },
    { id: "authenticator", label: "验证器" },
    { id: "settings", label: "设置" },
  ];

  protected title(): string {
    const titles: Record<string, string> = {
      login: "登录",
      unlock: "解锁",
      vault: "密码库",
      item: "GitHub",
      edit: "编辑",
      generator: "生成器",
      settings: "设置",
      about: "关于",
      security: "账户安全",
      autofill: "自动填充",
      uri: "URI 匹配",
      dialog: "更新",
      toast: "提示",
      overlay: "自动填充",
      empty: "密码库",
    };
    return titles[this.screen() ?? "vault"] ?? "密码库";
  }

  protected tabId(): string {
    const screen = this.screen();
    if (screen === "generator") {
      return "generator";
    }
    if (
      screen === "settings" ||
      screen === "about" ||
      screen === "security" ||
      screen === "autofill"
    ) {
      return "settings";
    }
    return "vault";
  }
}
