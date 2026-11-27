import { Injectable } from "@angular/core";
import { IndividualConfig, ToastrService } from "ngx-toastr";

import type { ToastComponent } from "./toast.component";
import { calculateToastTimeout, isShortSuccessToast, SHORT_SUCCESS_TIMEOUT_MS } from "./utils";

export type ToastOptions = {
  /**
   * The duration the toast will persist in milliseconds
   **/
  timeout?: number;
  message: ReturnType<ToastComponent["message"]>;
  variant?: ReturnType<ToastComponent["variant"]>;
  title?: ReturnType<ToastComponent["title"]>;
};

/**
 * Presents toast notifications
 **/
@Injectable({ providedIn: "root" })
export class ToastService {
  /** The one short success toast currently on screen, so a repeat replaces it. */
  private compactToastId: number | null = null;

  constructor(private toastrService: ToastrService) {}

  showToast(options: ToastOptions): void {
    const compact = isShortSuccessToast(options);
    if (compact && this.compactToastId != null) {
      const previous = this.compactToastId;
      this.compactToastId = null;
      this.toastrService.remove(previous);
    }

    let timeOut = calculateToastTimeout(options.message);
    if (options.timeout != null && options.timeout > 0) {
      timeOut = options.timeout;
    } else if (compact) {
      timeOut = SHORT_SUCCESS_TIMEOUT_MS;
    }

    const toastrConfig: Partial<IndividualConfig> = {
      payload: {
        message: options.message,
        variant: options.variant,
        title: options.title,
        compact,
      },
      timeOut,
    };

    if (compact) {
      toastrConfig.progressBar = false;
      toastrConfig.closeButton = false;
      toastrConfig.extendedTimeOut = 0;
      toastrConfig.toastClass = "ngx-toastr bit-toast-compact";
    }

    const active = this.toastrService.show(undefined, options.title, toastrConfig);
    if (compact && active != null) {
      this.compactToastId = active.toastId;
      active.onHidden.subscribe(() => {
        if (this.compactToastId === active.toastId) {
          this.compactToastId = null;
        }
      });
    }
  }

  /**
   * @deprecated use `showToast` instead
   *
   * Converts options object from PlatformUtilsService
   **/
  _showToast(options: {
    type: "error" | "success" | "warning" | "info";
    title: string;
    text: string | string[];
    options?: {
      timeout?: number;
    };
  }) {
    this.showToast({
      message: options.text,
      variant: options.type,
      title: options.title,
      timeout: options.options?.timeout,
    });
  }
}
