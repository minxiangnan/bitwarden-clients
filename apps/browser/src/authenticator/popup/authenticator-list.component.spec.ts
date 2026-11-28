import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { BehaviorSubject } from "rxjs";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ToastService } from "@bitwarden/components";

import { AuthenticatorEntryView } from "../authenticator.models";

import {
  AUTHENTICATOR_COPY_TOAST_MS,
  AUTHENTICATOR_DRAG_HOLD_MS,
  AuthenticatorListComponent,
  rowSlideOffsets,
} from "./authenticator-list.component";
import { AuthenticatorService } from "./authenticator.service";
import { McpAccessService } from "./mcp-access.service";

describe("AuthenticatorListComponent", () => {
  const entry = {
    id: "1",
    name: "Ada",
    issuer: "",
    secret: "WQIQ25BRKZYCJVYP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    notes: "",
    favorite: false,
    sortOrder: 1,
    revisionDate: "",
    creationDate: "",
    undecryptable: false,
  } satisfies AuthenticatorEntryView;

  function setup() {
    const state$ = new BehaviorSubject({
      status: "ready" as const,
      entries: [entry],
      syncedAt: null as string | null,
    });
    const authenticator = {
      state$,
      setFavorite: jest.fn(() => new Promise<void>(() => undefined)),
      remove: jest.fn(() => new Promise<void>(() => undefined)),
      move: jest.fn().mockResolvedValue(undefined),
      totpOrderIndex: jest.fn(async () => ({
        orderBySecret: new Map<string, number>(),
        secretsWithCipher: new Set<string>(["WQIQ25BRKZYCJVYP"]),
      })),
      writeTotpOrders: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.overrideComponent(AuthenticatorListComponent, {
      set: { imports: [], template: "" },
    });
    TestBed.configureTestingModule({
      imports: [AuthenticatorListComponent],
      providers: [
        { provide: AuthenticatorService, useValue: authenticator },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: PlatformUtilsService, useValue: { copyToClipboard: jest.fn() } },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
        { provide: I18nService, useValue: { t: (key: string, value?: string) => value ?? key } },
        {
          provide: McpAccessService,
          useValue: {
            aliasEpoch: () => 0,
            authenticatorAliases: jest.fn(async () => ({ "1": "gh" })),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AuthenticatorListComponent);
    return { fixture, authenticator };
  }

  it("drags the custom-order list after a hold, and turns drag off while searching", () => {
    const { fixture } = setup();
    const component = fixture.componentInstance;

    expect(component["dragHoldMs"]).toBe(AUTHENTICATOR_DRAG_HOLD_MS);
    expect(AUTHENTICATOR_DRAG_HOLD_MS).toBe(400);
    expect(component["canDrag"]()).toBe(true);

    component["query"].set("ada");
    fixture.detectChanges();
    expect(component["canReorder"]()).toBe(false);
    expect(component["canDrag"]()).toBe(false);
  });

  it("does not drag while a search or the recent filter is active", () => {
    const { fixture } = setup();
    const component = fixture.componentInstance;

    expect(component["canDrag"]()).toBe(true);

    component["query"].set("ada");
    fixture.detectChanges();
    expect(component["canDrag"]()).toBe(false);

    component["query"].set("");
    component["ui"].recentOnly.set(true);
    fixture.detectChanges();
    expect(component["canDrag"]()).toBe(false);
  });

  it("still copies on a short click, and shows the full name with the full notes", async () => {
    const { fixture } = setup();
    const named = {
      ...entry,
      issuer: "GitHub",
      name: "公司统一身份认证平台管理员账号",
      notes: "这是一段完整备注，列表应换行而不是截断。",
    };
    fixture.componentInstance["rememberCode"]("1", "123456");

    await fixture.componentInstance["copy"](entry);

    expect(fixture.componentInstance["copyNotice"]()).toBeGreaterThan(0);
    expect(fixture.componentInstance["rowTitle"](named)).toBe(
      "GitHub · 公司统一身份认证平台管理员账号",
    );
    expect(fixture.componentInstance["rowNotes"](named)).toBe(
      "这是一段完整备注，列表应换行而不是截断。",
    );
  });

  it("moves the focused row with Alt+ArrowUp", async () => {
    const { fixture, authenticator } = setup();
    const ada = { ...entry, id: "a", name: "Ada" };
    const bea = { ...entry, id: "b", name: "Bea", secret: "BEASECRETSECRET" };
    fixture.componentInstance["orderIndex"].set({
      orderBySecret: new Map([
        ["WQIQ25BRKZYCJVYP", 1000],
        ["BEASECRETSECRET", 2000],
      ]),
      secretsWithCipher: new Set(["WQIQ25BRKZYCJVYP", "BEASECRETSECRET"]),
    });
    const event = {
      altKey: true,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      key: "ArrowUp",
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    fixture.componentInstance["onRowKey"](event, bea, [ada, bea], document.createElement("ul"));
    await Promise.resolve();
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(authenticator.writeTotpOrders).toHaveBeenCalled();
  });

  it("slides a pinned row up and the rows above it down", () => {
    const offsets = rowSlideOffsets(
      new Map([
        ["a", 0],
        ["b", 40],
        ["c", 80],
      ]),
      new Map([
        ["c", 0],
        ["a", 40],
        ["b", 80],
      ]),
    );

    expect(offsets.get("c")).toBe(80);
    expect(offsets.get("a")).toBe(-40);
    expect(offsets.get("b")).toBe(-40);
  });

  it("opens the tools page for import and trash", () => {
    const { fixture } = setup();
    const router = TestBed.inject(Router);

    fixture.componentInstance["openTools"]();

    expect(router.navigate).toHaveBeenCalledWith(["/authenticator-tools"]);
  });

  it("does not edit an entry that could not be decrypted", () => {
    const { fixture } = setup();
    const router = TestBed.inject(Router);

    fixture.componentInstance["edit"]({ ...entry, undecryptable: true });

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("shows a top copy bubble for 1.5s instead of a row mark or a stacked toast", async () => {
    const { fixture, authenticator } = setup();
    const toast = TestBed.inject(ToastService);
    fixture.componentInstance["rememberCode"]("1", "123456");

    await fixture.componentInstance["copy"](entry);

    expect(toast.showToast).not.toHaveBeenCalled();
    expect(AUTHENTICATOR_COPY_TOAST_MS).toBe(1500);
    expect(fixture.componentInstance["copyToastMs"]).toBe(1500);
    const first = fixture.componentInstance["copyNotice"]();
    expect(first).toBeGreaterThan(0);
    expect(authenticator.writeTotpOrders).not.toHaveBeenCalled();

    await fixture.componentInstance["copy"](entry);
    fixture.detectChanges();
    expect(fixture.componentInstance["copyNotice"]()).toBe(first + 1);

    await new Promise((resolve) => setTimeout(resolve, AUTHENTICATOR_COPY_TOAST_MS + 40));
    expect(fixture.componentInstance["copyNotice"]()).toBe(0);
  });

  it("writes one midpoint when a row moves up, and refuses to reorder a search", async () => {
    const { fixture, authenticator } = setup();
    const ada = { ...entry, id: "a", name: "Ada" };
    const bea = { ...entry, id: "b", name: "Bea", secret: "BEASECRETSECRET" };
    await Promise.resolve();
    await Promise.resolve();
    fixture.componentInstance["orderIndex"].set({
      orderBySecret: new Map([
        ["WQIQ25BRKZYCJVYP", 1000],
        ["BEASECRETSECRET", 2000],
      ]),
      secretsWithCipher: new Set(["WQIQ25BRKZYCJVYP", "BEASECRETSECRET"]),
    });

    await fixture.componentInstance["moveEntry"](bea, 0, [ada, bea]);

    expect(authenticator.writeTotpOrders).toHaveBeenCalledWith([
      { secret: "BEASECRETSECRET", order: 0 },
    ]);

    authenticator.writeTotpOrders.mockClear();
    fixture.componentInstance["query"].set("ada");

    expect(fixture.componentInstance["canDrag"]()).toBe(false);
    await fixture.componentInstance["moveEntry"](bea, 0, [ada, bea]);
    expect(authenticator.writeTotpOrders).not.toHaveBeenCalled();
  });

  it("keeps custom order even when a name sort was saved", async () => {
    const { fixture, authenticator } = setup();
    const ada = { ...entry, id: "a", name: "Ada", secret: "WQIQ25BRKZYCJVYP", sortOrder: 2 };
    const bea = { ...entry, id: "b", name: "Bea", secret: "BEASECRETSECRET", sortOrder: 1 };
    authenticator.state$.next({ status: "ready", entries: [ada, bea], syncedAt: null });
    await Promise.resolve();
    await Promise.resolve();
    fixture.componentInstance["orderIndex"].set({
      orderBySecret: new Map([["BEASECRETSECRET", 1000]]),
      secretsWithCipher: new Set(["WQIQ25BRKZYCJVYP", "BEASECRETSECRET"]),
    });

    expect(fixture.componentInstance["visible"]().map((item) => item.name)).toEqual(["Bea", "Ada"]);

    fixture.componentInstance["ui"].setSort("name");

    expect(fixture.componentInstance["visible"]().map((item) => item.name)).toEqual(["Bea", "Ada"]);
  });

  it("shows the MCP alias and a zh-CN sync time", async () => {
    const { fixture, authenticator } = setup();
    authenticator.state$.next({
      status: "ready",
      entries: [entry],
      syncedAt: "2026-11-24T08:29:08",
    });
    fixture.detectChanges();

    await Promise.resolve();

    expect(fixture.componentInstance["aliases"]()).toEqual({ "1": "gh" });
    expect(fixture.componentInstance["syncedLabel"]()).toBe("2026/11/24 08:29:08");
  });
});
