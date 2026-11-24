import { DialogRef, DIALOG_DATA } from "@angular/cdk/dialog";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";

import { SimpleConfigurableDialogComponent } from "./simple-configurable-dialog.component";

describe("SimpleConfigurableDialogComponent", () => {
  async function setup(focusCancel: boolean): Promise<ComponentFixture<SimpleConfigurableDialogComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SimpleConfigurableDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        {
          provide: DIALOG_DATA,
          useValue: {
            title: "Paste · ada",
            content: "验证码会先放进回收站，还可以恢复。",
            type: "danger",
            acceptButtonText: "删除",
            cancelButtonText: { key: "cancel" },
            focusCancel,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SimpleConfigurableDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  function button(fixture: ComponentFixture<SimpleConfigurableDialogComponent>, label: string) {
    return Array.from(fixture.nativeElement.querySelectorAll("button")).find(
      (item: HTMLButtonElement) => item.textContent?.trim() === label,
    ) as HTMLButtonElement;
  }

  it("does not submit the form from the danger button when cancel is focused", async () => {
    const fixture = await setup(true);

    expect(button(fixture, "删除").type).toBe("button");
    expect(button(fixture, "cancel").type).toBe("submit");
  });

  it("submits the form from the accept button when cancel is not the default", async () => {
    const fixture = await setup(false);

    expect(button(fixture, "删除").type).toBe("submit");
  });
});
