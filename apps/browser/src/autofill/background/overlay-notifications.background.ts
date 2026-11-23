import { firstValueFrom, Subject, switchMap, timer } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getOptionalUserId } from "@bitwarden/common/auth/services/account.service";
import { CLEAR_NOTIFICATION_LOGIN_DATA_DURATION } from "@bitwarden/common/autofill/constants";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";

import { BrowserApi } from "../../platform/browser/browser-api";
import { FillCipherPolicy } from "../services/abstractions/fill-cipher-policy";
import { generateDomainMatchPatterns } from "../utils";

import {
  ActiveFormSubmissionRequests,
  ModifyLoginCipherFormData,
  ModifyLoginCipherFormDataForTab,
  OverlayNotificationsBackground as OverlayNotificationsBackgroundInterface,
  OverlayNotificationsExtensionMessage,
  OverlayNotificationsExtensionMessageHandlers,
  NotificationScenarios,
  NotificationScenario,
  WebsiteOriginsWithFields,
} from "./abstractions/overlay-notifications.background";
import NotificationBackground from "./notification.background";

export class OverlayNotificationsBackground implements OverlayNotificationsBackgroundInterface {
  private websiteOriginsWithFields: WebsiteOriginsWithFields = new Map();
  private activeFormSubmissionRequests: ActiveFormSubmissionRequests = new Set();
  private modifyLoginCipherFormData: ModifyLoginCipherFormDataForTab = new Map();
  private clearLoginCipherFormDataSubject: Subject<void> = new Subject();
  private notificationFallbackTimeout: number | NodeJS.Timeout | null = null;
  private pendingLoginFormData = new Map<
    number,
    { message: OverlayNotificationsExtensionMessage; sender: chrome.runtime.MessageSender }
  >();
  /**
   * Username typed on an earlier step of the same tab and origin. Kept separately from the
   * submission buffer so a password-only second step can still be saved.
   * https://github.com/bitwarden/clients/issues/320
   */
  private capturedUsernames = new Map<
    number,
    { origin: string; username: string; expiresAt: number }
  >();
  private readonly capturedUsernameTtlMs = 2 * 60 * 1000;
  private readonly formSubmissionRequestMethods: Set<string> = new Set(["POST", "PUT", "PATCH"]);
  private readonly extensionMessageHandlers: OverlayNotificationsExtensionMessageHandlers = {
    generatedPasswordFilled: ({ message, sender }) =>
      this.handleModifiedLoginFormData(message, sender),
    formFieldSubmitted: ({ message, sender }) => this.handleModifiedLoginFormData(message, sender),
    collectPageDetailsResponse: ({ message, sender }) =>
      this.handleCollectPageDetailsResponse(message, sender),
  };
  constructor(
    private logService: LogService,
    private notificationBackground: NotificationBackground,
    private accountService: AccountService,
    private fillCipherPolicy: FillCipherPolicy,
  ) {}

  /**
   * Initialize the overlay notifications background service.
   */
  async init() {
    this.setupExtensionListeners();

    this.clearLoginCipherFormDataSubject
      .pipe(switchMap(() => timer(CLEAR_NOTIFICATION_LOGIN_DATA_DURATION)))
      .subscribe(() => this.modifyLoginCipherFormData.clear());
  }

  /**
   * Handles the response from the content script with the page details. Triggers an initialization
   * of the add login or change password notification if the conditions are met.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   */
  private async handleCollectPageDetailsResponse(
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) {
    const shouldInit = await this.shouldInitAddLoginOrChangePasswordNotification(message, sender);
    if (shouldInit) {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        return;
      }
      this.websiteOriginsWithFields.set(tabId, this.getSenderUrlMatchPatterns(sender));
      this.setupWebRequestsListeners();
      this.flushPendingLoginFormData(tabId);
    }
  }

  /**
   * Determines if the add login or change password notification should be initialized. This depends
   * on whether the user has enabled the notification, the sender is not from an excluded domain, the
   * tab's page details contains fillable fields, and the website origin has not been previously stored.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   */
  private async shouldInitAddLoginOrChangePasswordNotification(
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      return false;
    }

    return (
      (await this.isAddLoginOrChangePasswordNotificationEnabled()) &&
      !(await this.isSenderFromExcludedDomain(sender)) &&
      (message.details?.fields?.length ?? 0) > 0 &&
      !this.websiteOriginsWithFields.has(tabId)
    );
  }

  /**
   * Determines if the add login or change password notification is enabled.
   * This is based on the user's settings for the notification.
   */
  private async isAddLoginOrChangePasswordNotificationEnabled() {
    return (
      (await this.notificationBackground.getEnableChangedPasswordPrompt()) ||
      (await this.notificationBackground.getEnableAddedLoginPrompt())
    );
  }

  /**
   * Returns the match patterns for the sender's URL. This is used to filter out
   * the web requests that are not from the sender's tab.
   *
   * @param sender - The sender of the message
   */
  private getSenderUrlMatchPatterns(sender: chrome.runtime.MessageSender) {
    return new Set([
      ...(sender.url ? generateDomainMatchPatterns(sender.url) : []),
      ...(sender.tab?.url ? generateDomainMatchPatterns(sender.tab.url) : []),
    ]);
  }

  /**
   * Handles a content script's report of modified login form data. The data is stored without
   * holding the message channel open for a response.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   */
  private handleModifiedLoginFormData(
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ): undefined {
    this.storeModifiedLoginFormData(message, sender).catch((error) => this.logService.error(error));
  }

  /**
   * Stores the login form data that was modified by the user in the content script. This data is
   * used to trigger the add login or change password notification when the form is submitted.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   */
  private storeModifiedLoginFormData = async (
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      return;
    }
    if (!this.websiteOriginsWithFields.has(tabId)) {
      // A React page often never qualifies its inputs, so collectPageDetailsResponse
      // never registers the tab and this submission used to sit here forever.
      // A password (or a password merged with an earlier username) registers the tab
      // itself. A username alone still waits, so the first step of a two-step login
      // does not open a prompt.
      const pending = this.pendingLoginFormData.get(tabId);
      const merged = this.mergePendingSubmission(pending?.message, message);
      this.pendingLoginFormData.set(tabId, { message: merged, sender });
      if (await this.ensureTabRegisteredForSubmission(tabId, merged, sender)) {
        this.flushPendingLoginFormData(tabId);
      }
      return;
    }

    const { uri, username, password, newPassword } = message;
    if (!username && !password && !newPassword) {
      return;
    }

    // A tab is registered by the first frame that reports fields, but any frame in the tab may
    // submit afterward, so each submission is checked against exclusions using its own origin.
    if (await this.isSenderFromExcludedDomain(sender)) {
      return;
    }

    this.clearLoginCipherFormDataSubject.next();
    const formData = { uri, username, password, newPassword };
    const origin = this.senderOrigin(sender);
    if (formData.username) {
      this.capturedUsernames.set(tabId, {
        origin,
        username: formData.username,
        expiresAt: Date.now() + this.capturedUsernameTtlMs,
      });
    } else {
      const remembered = this.capturedUsername(tabId, origin);
      if (remembered) {
        formData.username = remembered;
      }
    }

    const existingModifyLoginData = this.modifyLoginCipherFormData.get(tabId);
    if (existingModifyLoginData) {
      formData.username = formData.username || existingModifyLoginData.username;
      formData.password = formData.password || existingModifyLoginData.password;
      formData.newPassword = formData.newPassword || existingModifyLoginData.newPassword;
    }

    this.modifyLoginCipherFormData.set(tabId, formData);

    this.clearNotificationFallbackTimeout();
    // A username by itself is not a login to save. Prompting now would discard it
    // before the password step. The captured username is combined when the password arrives.
    if (!formData.password && !formData.newPassword) {
      return;
    }
    this.notificationFallbackTimeout = setTimeout(() => {
      const modifyLoginData = this.modifyLoginCipherFormData.get(tabId);
      if (modifyLoginData) {
        this.setupNotificationInitTrigger(tabId, "", modifyLoginData).catch((error) =>
          this.logService.error(error),
        );
      }
    }, 1500);
  };

  /**
   * Clears the timeout used when triggering a notification on click of the submit button.
   */
  private clearNotificationFallbackTimeout() {
    if (this.notificationFallbackTimeout) {
      clearTimeout(this.notificationFallbackTimeout);
      this.notificationFallbackTimeout = null;
    }
  }

  /**
   * Determines if the sender of the message is from an excluded domain. This is used to prevent the
   * add login or change password notification from being triggered on the user's vault domain or
   * other excluded domains.
   *
   * Both the sending frame and the top-level page of its tab are checked, so an exclusion for a
   * page covers every frame within it, while an exclusion for a sub-frame covers only that frame.
   *
   * @param sender - The sender of the message
   */
  private async isSenderFromExcludedDomain(sender: chrome.runtime.MessageSender): Promise<boolean> {
    try {
      const origins: string[] = [];
      if (sender.origin) {
        origins.push(sender.origin);
      }
      if (sender.tab?.url) {
        origins.push(new URL(sender.tab.url).origin);
      }
      if (!origins.length) {
        return false;
      }

      const serverConfig = await this.notificationBackground.getActiveUserServerConfig();
      const activeUserVault = serverConfig?.environment?.vault;
      if (activeUserVault && origins.includes(activeUserVault)) {
        return true;
      }

      const excludedDomains = await this.notificationBackground.getExcludedDomains();
      if (!excludedDomains) {
        return false;
      }

      return origins.some((origin) => {
        const url = new URL(origin);
        // host keeps a non-default port, so "此网站永不" on 127.0.0.1:8776
        // does not also hide prompts on 127.0.0.1:8000. hostname still matches
        // older entries that were stored without a port.
        return (
          excludedDomains[url.host] !== undefined || excludedDomains[url.hostname] !== undefined
        );
      });
    } catch {
      return true;
    }
  }

  /**
   * Removes and resets the onBeforeRequest and onCompleted listeners for web requests. This ensures
   * that we are only listening for form submission requests on the tabs that have fillable form fields.
   */
  private setupWebRequestsListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(this.handleOnBeforeRequestEvent);
    chrome.webRequest.onCompleted.removeListener(this.handleOnCompletedRequestEvent);
    if (this.websiteOriginsWithFields.size) {
      const requestFilter: chrome.webRequest.RequestFilter = this.generateRequestFilter();
      chrome.webRequest.onBeforeRequest.addListener(this.handleOnBeforeRequestEvent, requestFilter);
      chrome.webRequest.onCompleted.addListener(this.handleOnCompletedRequestEvent, requestFilter);
    }
  }

  /**
   * Generates the request filter for the web requests. This is used to filter out the web requests
   * that are not from the tabs that have fillable form fields.
   */
  private generateRequestFilter(): chrome.webRequest.RequestFilter {
    // Login calls often leave the page host (api.example.com, an auth provider).
    // A host-only filter never sees them, so the save prompt never opens.
    // The handlers still require a tab that captured a password.
    return {
      urls: ["<all_urls>"],
      types: ["main_frame", "sub_frame", "xmlhttprequest"],
    };
  }

  /**
   * Handles the onBeforeRequest event for web requests. This is used to ensures that the following
   * onCompleted event is only triggered for form submission requests.
   *
   * @param details - The details of the web request
   */
  private handleOnBeforeRequestEvent = (
    details: chrome.webRequest.OnBeforeRequestDetails,
  ): undefined => {
    if (this.isPostSubmissionFormRedirection(details)) {
      const modifyLoginData = this.modifyLoginCipherFormData.get(details.tabId);
      if (modifyLoginData) {
        this.setupNotificationInitTrigger(details.tabId, details.requestId, modifyLoginData).catch(
          (error) => this.logService.error(error),
        );
      }

      return;
    }

    if (!this.isValidFormSubmissionRequest(details)) {
      return;
    }

    const { requestId, tabId, frameId } = details;
    this.activeFormSubmissionRequests.add(requestId);

    if (this.notificationDataIncompleteOnBeforeRequest(tabId)) {
      this.getFormFieldDataFromTab(tabId, frameId).catch((error) => this.logService.error(error));
    }
  };

  /**
   * Captures the modified login form data if the tab contains incomplete data. This is used as
   * a redundancy to ensure that the modified login form data is captured in cases where the form
   * is split into multiple parts.
   *
   * @param tabId - The id of the tab
   */
  private notificationDataIncompleteOnBeforeRequest = (tabId: number) => {
    const modifyLoginData = this.modifyLoginCipherFormData.get(tabId);

    if (!modifyLoginData) {
      return true;
    }

    const shouldAttemptAddNotification = this.shouldAttemptNotification(
      modifyLoginData,
      NotificationScenarios.Add,
    );

    if (shouldAttemptAddNotification) {
      return false;
    }

    const shouldAttemptChangeNotification = this.shouldAttemptNotification(
      modifyLoginData,
      NotificationScenarios.Change,
    );

    if (shouldAttemptChangeNotification) {
      return false;
    }

    // Username-only, or any other incomplete capture, still needs the fields read
    // from the page when a request is submitted without a form event.
    return true;
  };

  private senderOrigin(sender: chrome.runtime.MessageSender): string {
    if (sender.origin) {
      return sender.origin;
    }
    try {
      return sender.tab?.url ? new URL(sender.tab.url).origin : "";
    } catch {
      return "";
    }
  }

  private capturedUsername(tabId: number, origin: string): string {
    const saved = this.capturedUsernames.get(tabId);
    if (saved == null || saved.expiresAt < Date.now()) {
      this.capturedUsernames.delete(tabId);
      return "";
    }
    if (origin && saved.origin && saved.origin !== origin) {
      return "";
    }
    return saved.username;
  }

  /**
   * Determines whether the request is happening after a form submission. This is identified by a GET
   * request that is triggered after a form submission POST request from the same request id. If
   * this is the case, and the modified login form data is available, the add login or change password
   * notification is triggered.
   *
   * @param details - The details of the web request
   */
  private isPostSubmissionFormRedirection = (details: chrome.webRequest.OnBeforeRequestDetails) => {
    return (
      details.method?.toUpperCase() === "GET" &&
      this.activeFormSubmissionRequests.has(details.requestId) &&
      this.modifyLoginCipherFormData.has(details.tabId)
    );
  };

  /**
   * Determines if the web request is a valid form submission request. A valid web request
   * is a POST, PUT, or PATCH request that is not from an invalid host.
   *
   * @param details - The details of the web request
   */
  private isValidFormSubmissionRequest = (details: chrome.webRequest.OnBeforeRequestDetails) => {
    return (
      !this.requestHostIsInvalid(details) &&
      this.formSubmissionRequestMethods.has(details.method?.toUpperCase())
    );
  };

  /**
   * Retrieves the form field data from the tab. This is used to get the modified login form data
   * in cases where the submit button is not clicked, but the form is submitted through other means.
   *
   * @param tabId - The senders tab id
   * @param frameId - The frame where the form is located
   */
  private getFormFieldDataFromTab = async (tabId: number, frameId: number) => {
    const tab = await BrowserApi.getTab(tabId);
    if (!tab) {
      return;
    }

    const response = (await BrowserApi.tabSendMessage(
      tab,
      { command: "getInlineMenuFormFieldData" },
      { frameId },
    )) as OverlayNotificationsExtensionMessage;
    if (!response) {
      return;
    }

    // The response carries no browser-attested sender, so the responding frame's origin is
    // resolved here for the exclusion check. Without one, the data is not stored.
    const frameUrl = await BrowserApi.getFrameDetails({ tabId, frameId })
      .then((frame) => frame?.url)
      .catch((): undefined => undefined);
    if (!frameUrl) {
      return;
    }

    await this.storeModifiedLoginFormData(response, {
      tab,
      frameId,
      origin: new URL(frameUrl).origin,
    });
  };

  /**
   * Handles the onCompleted event for web requests. This is used to trigger the add login or change
   * password notification when a form submission request is completed.
   *
   * @param details - The details of the web response
   */
  private handleOnCompletedRequestEvent = async (details: chrome.webRequest.OnCompletedDetails) => {
    if (
      this.requestHostIsInvalid(details) ||
      !this.activeFormSubmissionRequests.has(details.requestId)
    ) {
      return;
    }

    // 302 is how a classic form (GitLab) finishes. 401/422 is how a SPA
    // reports a rejected login. Both are a completed submit, and the prompt
    // should still appear. Only a cancelled request (0) or a 5xx keeps the
    // click fallback alive instead of opening the bar on a failed request.
    if (!this.submissionStatusShouldPrompt(details.statusCode)) {
      return;
    }

    const modifyLoginData = this.modifyLoginCipherFormData.get(details.tabId);
    if (!modifyLoginData) {
      return;
    }

    this.setupNotificationInitTrigger(details.tabId, details.requestId, modifyLoginData).catch(
      (error) => this.logService.error(error),
    );
  };

  /**
   * Sets up the initialization trigger for the add login or change password notification. This is used
   * to ensure that the notification is triggered after the tab has finished loading.
   *
   * @param tabId - The id of the tab
   * @param requestId - The request id of the web request
   * @param modifyLoginData - The modified login form data
   */
  private setupNotificationInitTrigger = async (
    tabId: number,
    requestId: string,
    modifyLoginData: ModifyLoginCipherFormData,
  ) => {
    this.clearNotificationFallbackTimeout();

    const tab = await BrowserApi.getTab(tabId);
    if (!tab) {
      return;
    }

    if (tab.status !== "complete") {
      await this.delayNotificationInitUntilTabIsComplete(tabId, requestId, modifyLoginData);
      return;
    }

    await this.processNotifications(requestId, modifyLoginData, tab);
  };

  /**
   * Delays the initialization of the add login or change password notification
   * until the tab is complete. This is used to ensure that the notification is
   * triggered after the tab has finished loading.
   *
   * @param tabId - The id of the tab
   * @param requestId - The request id of the web request
   * @param modifyLoginData - The modified login form data
   */
  private delayNotificationInitUntilTabIsComplete = async (
    tabId: chrome.webRequest.WebRequestDetails["tabId"],
    requestId: chrome.webRequest.WebRequestDetails["requestId"],
    modifyLoginData: ModifyLoginCipherFormData,
  ) => {
    const handleWebNavigationOnCompleted = async () => {
      chrome.webNavigation.onCompleted.removeListener(handleWebNavigationOnCompleted);
      const tab = await BrowserApi.getTab(tabId);
      if (tab) {
        await this.processNotifications(requestId, modifyLoginData, tab);
      }
    };
    chrome.webNavigation.onCompleted.addListener(handleWebNavigationOnCompleted);
  };

  /**
   * This method attempts to trigger the add login, change password, or at-risk password notifications
   * based on the modified login data and the tab details.
   *
   * @param requestId - The details of the web response
   * @param modifyLoginData  - The modified login form data
   * @param tab - The tab details
   */
  private processNotifications = async (
    requestId: chrome.webRequest.WebRequestDetails["requestId"],
    modifyLoginData: ModifyLoginCipherFormData,
    tab: chrome.tabs.Tab,
    config: { skippable: NotificationScenario[] } = { skippable: [] },
  ) => {
    if (!(await this.canOfferSave(modifyLoginData))) {
      this.clearCompletedWebRequest(requestId, tab.id);
      return "";
    }

    const notificationCandidates = [
      {
        type: NotificationScenarios.Cipher,
        trigger: this.notificationBackground.triggerCipherNotification,
      },
      {
        type: NotificationScenarios.AtRiskPassword,
        trigger: this.notificationBackground.triggerAtRiskPasswordNotification,
      },
    ];
    const filteredNotificationCandidates = notificationCandidates.filter(
      (candidate) =>
        this.shouldAttemptNotification(modifyLoginData, candidate.type) ||
        config.skippable.includes(candidate.type),
    );

    const results: string[] = [];
    for (const { trigger, type } of filteredNotificationCandidates) {
      const success = await trigger.bind(this.notificationBackground)(modifyLoginData, tab);
      if (success) {
        results.push(`Success: ${type}`);
        break;
      } else {
        results.push(`Unqualified ${type} notification attempt.`);
      }
    }

    this.clearCompletedWebRequest(requestId, tab.id);
    return results.join(" ");
  };

  /**
   * Asks the {@link FillCipherPolicy} whether the form may get an add or update prompt. With no
   * active user, the prompt is not blocked.
   */
  private async canOfferSave(modifyLoginData: ModifyLoginCipherFormData): Promise<boolean> {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getOptionalUserId));
    return userId == null || this.fillCipherPolicy.canOfferSave(modifyLoginData, userId);
  }

  /**
   * Determines if the add login notification should be attempted based on the modified login form data.
   * @param modifyLoginData modified login form data
   * @param notificationType The type of notification to be triggered
   * @returns true if the notification should be attempted, false otherwise
   */
  private shouldAttemptNotification = (
    modifyLoginData: ModifyLoginCipherFormData,
    notificationType: NotificationScenario,
  ): boolean => {
    if (notificationType === NotificationScenarios.Cipher) {
      // The logic after this block pre-qualifies some cipher add/update scenarios
      // prematurely (where matching against vault contents is required) and should be
      // skipped for this case (these same checks are performed early in the
      // notification triggering logic).
      return true;
    }

    // Intentionally not stripping whitespace characters here as they
    // represent user entry.
    const usernameFieldHasValue = !!(modifyLoginData?.username || "").length;
    const passwordFieldHasValue = !!(modifyLoginData?.password || "").length;
    const newPasswordFieldHasValue = !!(modifyLoginData?.newPassword || "").length;

    const canBeUserLogin = usernameFieldHasValue && passwordFieldHasValue;
    const canBePasswordUpdate = passwordFieldHasValue && newPasswordFieldHasValue;

    switch (notificationType) {
      // `Add` case included because all forms with cached usernames (from previous
      // visits) will appear to be "password only" and otherwise trigger the new login
      // save notification.
      case NotificationScenarios.Add:
        // Can be values for nonstored login or account creation
        return usernameFieldHasValue && (passwordFieldHasValue || newPasswordFieldHasValue);
      case NotificationScenarios.Change:
        // Can be login with nonstored login changes or account password update
        return canBeUserLogin || canBePasswordUpdate;
      case NotificationScenarios.AtRiskPassword:
        return !newPasswordFieldHasValue;
      case NotificationScenarios.Unlock:
        // Unlock notifications are handled separately and do not require form data
        return false;
      default:
        this.logService.error(`Unknown notification type: ${notificationType}`);
        return false;
    }
  };

  /**
   * Clears the completed web request and removes the modified login form data for the tab.
   *
   * @param requestId - The request id of the web request
   * @param tab - The tab details
   */
  private clearCompletedWebRequest = (
    requestId: chrome.webRequest.WebRequestDetails["requestId"],
    tabId: chrome.tabs.Tab["id"],
  ) => {
    this.activeFormSubmissionRequests.delete(requestId);
    this.modifyLoginCipherFormData.delete(tabId);
    this.capturedUsernames.delete(tabId);
    this.websiteOriginsWithFields.delete(tabId);
    this.setupWebRequestsListeners();
  };

  /**
   * Determines if the host of the web request is invalid. An invalid host is any host that does not
   * start with "http" or a tab id that is less than 0.
   *
   * @param details - The details of the web request
   */
  private requestHostIsInvalid = (
    details: SetPartial<
      chrome.webRequest.WebRequestDetails,
      "documentId" | "documentLifecycle" | "frameType"
    >,
  ) => {
    return !details.url?.startsWith("http") || details.tabId < 0;
  };

  /**
   * Sets up the listeners for the extension messages and the tab events.
   */
  private setupExtensionListeners() {
    BrowserApi.addListener(chrome.runtime.onMessage, this.handleExtensionMessage);
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved);
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated);
  }

  /**
   * Handles messages that are sent to the extension background.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   * @param sendResponse - The response to send back to the content script
   */
  private handleExtensionMessage = (
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => {
    const handler: CallableFunction = this.extensionMessageHandlers[message.command];
    if (!handler) {
      return null;
    }

    const messageResponse = handler({ message, sender });
    if (typeof messageResponse === "undefined") {
      return null;
    }

    Promise.resolve(messageResponse)
      .then((response) => sendResponse(response))
      .catch((error) => this.logService.error(error));
    return true;
  };

  /**
   * Handles the removal of a tab. This is used to remove the modified login form data for the tab.
   *
   * @param tabId - The id of the tab that was removed
   */
  /**
   * A missing status is treated as success so callers that do not set one still prompt.
   * 2xx, 3xx, and 4xx are completed attempts. 0 and 5xx are not.
   */
  private submissionStatusShouldPrompt(statusCode: number | undefined): boolean {
    if (typeof statusCode !== "number") {
      return true;
    }
    return statusCode > 0 && statusCode < 500;
  }

  private mergePendingSubmission(
    previous: OverlayNotificationsExtensionMessage | undefined,
    next: OverlayNotificationsExtensionMessage,
  ): OverlayNotificationsExtensionMessage {
    if (!previous) {
      return next;
    }
    return {
      ...next,
      uri: next.uri || previous.uri,
      username: next.username || previous.username,
      password: next.password || previous.password,
      newPassword: next.newPassword || previous.newPassword,
    };
  }

  /**
   * Registers a tab that reported a password before page details did.
   * Returns false when the prompt is disabled, the site is excluded, or the
   * sender has no URL to match.
   */
  private async ensureTabRegisteredForSubmission(
    tabId: number,
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ): Promise<boolean> {
    if (this.websiteOriginsWithFields.has(tabId)) {
      return true;
    }
    if (!message.password && !message.newPassword) {
      return false;
    }
    if (!(await this.isAddLoginOrChangePasswordNotificationEnabled())) {
      return false;
    }
    if (await this.isSenderFromExcludedDomain(sender)) {
      return false;
    }
    const patterns = this.getSenderUrlMatchPatterns(sender);
    if (!patterns.size) {
      return false;
    }
    this.websiteOriginsWithFields.set(tabId, patterns);
    this.setupWebRequestsListeners();
    return true;
  }

  private flushPendingLoginFormData(tabId: number) {
    const pending = this.pendingLoginFormData.get(tabId);
    this.pendingLoginFormData.delete(tabId);
    if (pending) {
      void this.storeModifiedLoginFormData(pending.message, pending.sender);
    }
  }

  private handleTabRemoved = (tabId: number) => {
    this.modifyLoginCipherFormData.delete(tabId);
    this.capturedUsernames.delete(tabId);
    this.pendingLoginFormData.delete(tabId);
    if (this.websiteOriginsWithFields.has(tabId)) {
      this.websiteOriginsWithFields.delete(tabId);
      this.setupWebRequestsListeners();
    }
  };

  /**
   * Handles the update of a tab. This is used to remove the modified
   * login form  data for the tab when the tab is loading.
   *
   * @param tabId - The id of the tab that was updated
   * @param changeInfo - The change info of the tab
   */
  private handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
    if (changeInfo.url) {
      const pending = this.pendingLoginFormData.get(tabId);
      if (pending) {
        let nextOrigin = "";
        try {
          nextOrigin = new URL(changeInfo.url).origin;
        } catch {
          nextOrigin = "";
        }
        if (!nextOrigin || nextOrigin !== this.senderOrigin(pending.sender)) {
          this.pendingLoginFormData.delete(tabId);
        }
      }
    }

    if (changeInfo.status !== "loading" || !changeInfo.url) {
      return;
    }

    const originPatterns = this.websiteOriginsWithFields.get(tabId);
    if (!originPatterns) {
      return;
    }

    const matchPatters = generateDomainMatchPatterns(changeInfo.url);
    if (matchPatters.some((pattern) => originPatterns.has(pattern))) {
      return;
    }

    this.websiteOriginsWithFields.delete(tabId);
  };
}
