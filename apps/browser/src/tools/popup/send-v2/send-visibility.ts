import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

/**
 * Private builds hide Send. The screens, services, and routes stay in the build;
 * set this to true to show the tab, the share actions, and the Send routes again.
 */
export const SHOW_SEND = false;

/** Sends a hidden Send route back to the vault. Other guards still run when Send is shown. */
export const sendVisibleGuard: CanActivateFn = () =>
  SHOW_SEND || inject(Router).createUrlTree(["/tabs/vault"]);
