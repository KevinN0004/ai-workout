/**
 * The account routes: session check, profile read and update, signup, login,
 * password change, account deletion and logout. Registered by registerApiRoutes;
 * the rate limiters and CSRF check in front of them are mounted in index.js.
 */
import crypto from "crypto";
import { sendErrorResponse } from "../services/http/errorResponseService.js";
import { sessionErrorStatus } from "../services/auth/sessionService.js";

/**
 * Registers the account routes on `app`, taking the session helpers, user
 * repositories and password functions from the shared `deps` object. Every
 * failed password check counts toward `metrics.authFailures`, which nothing
 * reports at present. Signup and login both start a session that defaults to
 * "remember me". A route that reads or writes a session answers 503 when the
 * session store is unavailable (see sessionErrorStatus), and 500 otherwise.
 */
export const registerAuthRoutes = (app, deps) => {
  const {
    getSessionUser,
    defaultProfile,
    requireAuth,
    validateBody,
    profileBodySchema,
    buildProfile,
    findUserWithDashboard,
    updateProfile,
    mapDbDocToUser,
    signupBodySchema,
    cleanText,
    findUserByEmail,
    isCompleteSignupProfile,
    hashPassword,
    defaultDashboard,
    createUser,
    createSession,
    setSessionCookie,
    setCsrfCookie,
    loginBodySchema,
    passwordChangeBodySchema,
    accountDeleteBodySchema,
    updatePasswordHash,
    deleteUser,
    metrics,
    getDummyPasswordRecord,
    verifyPassword,
    shouldUpgradePasswordToArgon2id,
    upgradeUserPasswordToArgon2id,
    toShortText,
    parseCookies,
    deleteSession,
    clearSessionCookie,
    clearCsrfCookie
  } = deps;

  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "Not signed in." });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          profile: user.profile || defaultProfile()
        }
      });
    } catch (err) {
      sendErrorResponse(req, res, err, sessionErrorStatus(err));
    }
  });

  app.get("/api/profile", requireAuth, (req, res) => {
    res.json({ profile: req.user.profile || defaultProfile() });
  });

  app.post("/api/profile", requireAuth, async (req, res) => {
    try {
      const profileInput = validateBody(req, res, profileBodySchema);
      if (!profileInput) return;

      const nextProfile = buildProfile({
        ...(req.user.profile || defaultProfile()),
        ...profileInput
      });
      await updateProfile({ userId: req.user.id, profile: nextProfile });

      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });

      const updated = mapDbDocToUser(updatedDoc);
      res.json({ profile: updated?.profile || defaultProfile() });
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const body = validateBody(req, res, signupBodySchema);
      if (!body) return;

      // Validate: one account per email, compared lower-cased, and a complete
      // profile (name, age, height, weight and sex).
      const { email, password, profile } = body;
      const rememberMe = body.rememberMe ?? true;
      const normalizedEmail = cleanText(email, 254).toLowerCase();
      const exists = await findUserByEmail(normalizedEmail);
      if (exists) {
        return res.status(409).json({ error: "Account already exists." });
      }
      const builtProfile = buildProfile(profile);
      if (!isCompleteSignupProfile(builtProfile)) {
        return res.status(400).json({
          error: "Complete profile details are required to create an account."
        });
      }

      // Write the account, then sign it in: a session cookie and a new CSRF token.
      // A session store that is down fails createSession before either cookie
      // is set, so the answer is a 503 with no cookie, and the account it
      // leaves behind signs in once the store is back.
      const { salt, hash, passwordAlgo } = await hashPassword(password);
      const newUser = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        salt,
        hash,
        passwordAlgo,
        createdAt: new Date().toISOString(),
        profile: builtProfile,
        dashboard: defaultDashboard()
      };
      await createUser(newUser);
      const token = await createSession(newUser.id);
      setSessionCookie(res, token, rememberMe);
      // A new CSRF token replaces the one the browser held while signed out.
      // useApiClient reads this cookie before every write, so the client's
      // next request sends the new token.
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: newUser.id,
          email: newUser.email,
          profile: newUser.profile || defaultProfile()
        }
      });
    } catch (err) {
      sendErrorResponse(req, res, err, sessionErrorStatus(err));
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = validateBody(req, res, loginBodySchema);
      if (!body) return;

      // Check the credentials. An unknown email still pays for one password
      // verify, against a dummy record, so the response time does not reveal
      // whether the account exists; both failures answer the same 401.
      const { email, password } = body;
      const rememberMe = body.rememberMe ?? true;
      const normalizedEmail = cleanText(email, 254).toLowerCase();
      const user = await findUserByEmail(normalizedEmail);
      if (!user) {
        metrics.authFailures += 1;
        const dummyPasswordRecord = await getDummyPasswordRecord();
        await verifyPassword(password, dummyPasswordRecord);
        return res.status(401).json({ error: "Invalid credentials." });
      }
      if (!(await verifyPassword(password, user))) {
        metrics.authFailures += 1;
        return res.status(401).json({ error: "Invalid credentials." });
      }

      // Rehash a non-argon2id hash while the plaintext is at hand. A failed
      // upgrade is logged and does not block the sign-in.
      if (shouldUpgradePasswordToArgon2id(user)) {
        try {
          await upgradeUserPasswordToArgon2id(user.id, password);
        } catch (upgradeErr) {
          req.log?.error(
            {
              event: "password_upgrade_failed",
              error: toShortText(upgradeErr?.message || String(upgradeErr), 240)
            },
            "Password hash upgrade failed."
          );
        }
      }

      // Sign in: a session cookie and a new CSRF token, both set only once
      // createSession has stored the session.
      const token = await createSession(user.id);
      setSessionCookie(res, token, rememberMe);
      // Replaces the signed-out CSRF token, as signup does.
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: user.id,
          email: user.email,
          profile: user.profile || defaultProfile()
        }
      });
    } catch (err) {
      sendErrorResponse(req, res, err, sessionErrorStatus(err));
    }
  });

  app.post("/api/auth/password", requireAuth, async (req, res) => {
    try {
      const body = validateBody(req, res, passwordChangeBodySchema);
      if (!body) return;

      const { currentPassword, newPassword } = body;
      // requireAuth has already put the mapped user on req.user, hash and all,
      // so there is no second lookup to do here.
      const correct = await verifyPassword(currentPassword, req.user);
      if (!correct) {
        metrics.authFailures += 1;
        return res.status(401).json({ error: "Current password is incorrect." });
      }

      const { salt, hash, passwordAlgo } = await hashPassword(newPassword);
      // A stamp intent, not a timestamp: the repository owns the clock, so no
      // caller can supply an absent, invalid or backwards one.
      const stored = await updatePasswordHash({
        userId: req.user.id,
        salt,
        hash,
        passwordAlgo,
        stampPasswordChange: true
      });

      // Checked, unlike deleteUser's boolean in the route below. The reasoning
      // that makes ignoring that one correct -- an idempotent delete reporting
      // success when the account is already gone -- does not transfer: a
      // password change that matched no row changed nothing, and there is no
      // sense in which that succeeded. The row can only vanish between
      // requireAuth and here if the account was deleted in another tab.
      //
      // Returning before the session swap is the point. Destroying the old
      // session first would sign the caller out AND mint a replacement for an
      // account that no longer exists, while answering 200.
      if (!stored) {
        return res.status(401).json({ error: "Account is no longer available." });
      }

      // Every other session is now older than passwordChangedAt and will be
      // rejected by getSessionUser. This device would be too, so it gets a
      // fresh token -- minted after the stamp, and compared with a strict `<`,
      // so it survives even in the same millisecond.
      //
      // The new password is stored by now. Deleting the old token only tidies
      // up, since passwordChangedAt already rejects it, so a failure there is
      // logged and the change goes on. A failure to create the replacement
      // session still answers 503: the password has changed, but this device
      // holds no valid session and signs in again with the new password, as
      // a sign-up does when its session cannot be stored.
      const previousToken = parseCookies(req.headers.cookie || "").sid;
      if (previousToken) {
        try {
          await deleteSession(previousToken);
        } catch (deleteErr) {
          req.log?.error(
            {
              event: "previous_session_delete_failed",
              error: toShortText(String(deleteErr), 240)
            },
            "Old session delete failed after a password change. Continuing."
          );
        }
      }
      const token = await createSession(req.user.id);
      // rememberMe is not recoverable from the old session, which stores only
      // userId and createdAt. Defaulting to true matches signup and login.
      setSessionCookie(res, token, true);

      res.json({ ok: true });
    } catch (err) {
      sendErrorResponse(req, res, err, sessionErrorStatus(err));
    }
  });

  app.delete("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const body = validateBody(req, res, accountDeleteBodySchema);
      if (!body) return;

      const correct = await verifyPassword(body.password, req.user);
      if (!correct) {
        metrics.authFailures += 1;
        return res.status(401).json({ error: "Password is incorrect." });
      }

      // Every AppUser relation cascades on delete (see schema.prisma), so this
      // removes every row the user owns along with the account.
      await deleteUser({ userId: req.user.id });

      // The cookies are cleared before the session delete, as in logout, so a
      // browser whose account is gone is signed out even when that delete
      // fails. The failure still answers 503: the session stays in the store
      // until it expires, though it names a user that no longer exists.
      const token = parseCookies(req.headers.cookie || "").sid;
      clearSessionCookie(res);
      clearCsrfCookie(res);
      if (token) await deleteSession(token);

      res.json({ ok: true });
    } catch (err) {
      sendErrorResponse(req, res, err, sessionErrorStatus(err));
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie || "");
      const token = cookies.sid;
      // The cookies are cleared first, so this browser is signed out even when
      // the delete fails. That failure still answers 503: the session itself
      // stays valid in the store until it expires.
      clearSessionCookie(res);
      clearCsrfCookie(res);
      if (token) await deleteSession(token);
      res.json({ ok: true });
    } catch (err) {
      sendErrorResponse(req, res, err, sessionErrorStatus(err));
    }
  });
};
