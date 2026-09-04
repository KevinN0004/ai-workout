import crypto from "crypto";
import { sendErrorResponse } from "../services/errorResponseService.js";

export const registerAuthRoutes = (app, deps) => {
  const {
    getSessionUser,
    defaultProfile,
    requireAuth,
    validateBody,
    profileBodySchema,
    buildProfile,
    User,
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
      sendErrorResponse(req, res, err, 500);
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
      const updatedDoc = await User.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { profile: nextProfile } },
        { new: true }
      );
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
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: newUser.id,
          email: newUser.email,
          profile: newUser.profile || defaultProfile()
        }
      });
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = validateBody(req, res, loginBodySchema);
      if (!body) return;

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
      const token = await createSession(user.id);
      setSessionCookie(res, token, rememberMe);
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: user.id,
          email: user.email,
          profile: user.profile || defaultProfile()
        }
      });
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie || "");
      const token = cookies.sid;
      if (token) await deleteSession(token);
      clearSessionCookie(res);
      clearCsrfCookie(res);
      res.json({ ok: true });
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  });
};
