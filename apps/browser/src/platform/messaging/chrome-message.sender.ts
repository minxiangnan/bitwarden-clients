// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CommandDefinition, MessageSender } from "@bitwarden/common/platform/messaging";
// This import has been flagged as unallowed for this class. It may be involved in a circular dependency loop.
// eslint-disable-next-line no-restricted-imports
import { getCommand } from "@bitwarden/common/platform/messaging/internal";

type ErrorHandler = (logger: LogService, command: string) => void;

const HANDLED_ERRORS: Record<string, ErrorHandler> = {
  "Could not establish connection. Receiving end does not exist.": (logger, command) =>
    logger.debug(`Receiving end didn't exist for command '${command}'`),

  "The message port closed before a response was received.": (logger, command) =>
    logger.debug(`Port was closed for command '${command}'`),
};

export class ChromeMessageSender implements MessageSender {
  constructor(private readonly logService: LogService) {}

  send<T extends Record<string, unknown>>(
    commandDefinition: string | CommandDefinition<T>,
    payload: Record<string, unknown> | T = {},
  ): void {
    const command = getCommand(commandDefinition);
    const sent = chrome.runtime.sendMessage(Object.assign(payload, { command: command }), () => {
      const errorMessage = chrome.runtime.lastError?.message;
      if (errorMessage) {
        const errorHandler =
          HANDLED_ERRORS[errorMessage] ??
          (errorMessage.includes("back/forward cache") ? () => undefined : undefined);
        if (errorHandler != null) {
          errorHandler(this.logService, command);
          return;
        }

        this.logService.warning(
          `Unhandled error while sending message with command '${command}': ${errorMessage}`,
        );
      }
    });
    // Chrome 127+ returns a promise even when a callback is passed. With no
    // extension page open, that promise rejects and chrome://extensions shows
    // "Uncaught (in promise) Error: Could not establish connection."
    void Promise.resolve(sent).catch((): void => undefined);
  }
}
