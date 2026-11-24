export type NeverSaveConfirmCopy = {
  title: string;
  body: string;
  acceptLabel: string;
  cancelLabel: string;
};

const CREAM = "#FAF9F5";
const INK = "#3D3929";
const MUTED = "#5C584E";
const TERRACOTTA = "#C4532A";
const SCRIM = "rgba(61, 57, 41, 0.28)";

/**
 * Second confirm inside the notification iframe. The bar is not an Angular
 * dialog, so this paints the same cream card: item (host) as the title,
 * terracotta accept, 取消 focused. No black.
 */
export function confirmNeverSave(copy: NeverSaveConfirmCopy): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", copy.title);
    root.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:5",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:16px",
      `background:${SCRIM}`,
      "font-family:inherit",
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      `background:${CREAM}`,
      `color:${INK}`,
      "border-radius:16px",
      "padding:16px",
      "width:min(280px,100%)",
      "box-shadow:0 12px 32px rgba(61, 57, 41, 0.16)",
    ].join(";");

    const title = document.createElement("h2");
    title.textContent = copy.title;
    title.style.cssText = `margin:0 0 8px;font-size:16px;line-height:22px;color:${INK};`;

    const body = document.createElement("p");
    body.textContent = copy.body;
    body.style.cssText = `margin:0 0 12px;font-size:13px;line-height:18px;color:${MUTED};`;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = copy.cancelLabel;
    cancel.style.cssText = [
      `background:${CREAM}`,
      `color:${INK}`,
      "border:1px solid #E8E6DC",
      "border-radius:8px",
      "padding:6px 12px",
      "font-size:13px",
      "cursor:pointer",
    ].join(";");

    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = copy.acceptLabel;
    accept.style.cssText = [
      `background:${TERRACOTTA}`,
      `color:${CREAM}`,
      "border:0",
      "border-radius:8px",
      "padding:6px 12px",
      "font-size:13px",
      "cursor:pointer",
    ].join(";");

    const finish = (accepted: boolean) => {
      document.removeEventListener("keydown", onKey);
      root.remove();
      resolve(accepted);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    };

    cancel.addEventListener("click", () => finish(false));
    accept.addEventListener("click", () => finish(true));
    root.addEventListener("click", (event) => {
      if (event.target === root) {
        finish(false);
      }
    });
    document.addEventListener("keydown", onKey);

    actions.append(cancel, accept);
    card.append(title, body, actions);
    root.append(card);
    document.body.append(root);
    cancel.focus();
  });
}

export function neverSaveHost(referrer: string, fallback: string): string {
  try {
    const host = new URL(referrer).host;
    return host || fallback;
  } catch {
    return fallback;
  }
}
