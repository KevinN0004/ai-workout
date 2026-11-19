// The app's own fields on Express's Request: middleware/requestContext.js sets
// requestId and log, services/auth/sessionService.js sets user and csrfToken.
// Types only; nothing imports or runs this file (decision record 0017).
export {};

declare global {
  namespace Express {
    interface Request {
      /** The id requestContext gives each request. */
      requestId: string;
      /** pino's child logger, bound to requestId. */
      log: import("pino").Logger;
      /** The signed-in user, or null when there is no live session. */
      user?: import("../services/auth/authUserService.js").AuthUser | null;
      /** This session's CSRF token. */
      csrfToken?: string;
    }
  }
}
