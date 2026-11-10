/**
 * App's event handlers: plan generation and PDF export, sign-up, sign-in and
 * logout, the dashboard's logs, goals and saved exercises, and the account
 * settings. App rebuilds them from its current state on every render.
 */
import { clearActiveSession, readActiveSession, writeActiveSession } from "./activeSession";
import { buildScopedCacheKey, removeJsonCache } from "./cache";
import {
  AIR_QUALITY_CACHE_PREFIX,
  DASHBOARD_CACHE_PREFIX,
  SESSION_CACHE_KEY,
  WEATHER_CACHE_PREFIX,
  defaultAuthForm,
  defaultSignupProfileForm
} from "./constants";
import { newWorkoutForm, toExerciseSets } from "./exerciseSets";
import { clearOutbox, readOutbox } from "./outbox";
import { personalToProfile } from "./profileMapping";
import { postLog } from "./sendLog";
import { getLocalDateKey, getPreferredMeasurementSystem, splitFullName } from "./units";
import { loggedSetCount, toWorkoutSave } from "./workoutSession";

// The longest logout waits for the sends it flushes, in milliseconds. A save
// still running when it passes may be lost: logout goes ahead without it.
const LOGOUT_FLUSH_CAP_MS = 5000;

// How long plan generation may take before the client gives up, in
// milliseconds: the server's deadline for the coach notes (GEMINI_TIMEOUT_MS,
// 8 s unless set), after which it writes them by rule, plus room for the save
// and the network. A deployment that raises that setting past about 15 s has to
// raise this with it.
const GENERATE_TIMEOUT_MS = 20000;

// Settles when `promise` does or after `ms`, whichever comes first, and clears
// its timer either way, so a quick promise leaves no timer behind.
const settleWithin = (promise, ms) => {
  let timerId;
  const cap = new Promise((resolve) => {
    timerId = setTimeout(resolve, ms);
  });
  return Promise.race([promise, cap]).finally(() => clearTimeout(timerId));
};

// The id an entry has on screen until the server answers. It is never sent:
// each log's body carries its own replay key, from crypto.randomUUID(), as `id`
// (docs/specs/2026-11-06-offline-ready-pwa-design.md). The server keeps that
// key as the entry's id, so a resent entry updates its row instead of adding
// one, and hands it back as the entry's id, which must not start "optimistic-"
// (useProgression reads those as not yet saved).
const buildOptimisticId = (type) =>
  `optimistic-${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// jspdf is one of the largest chunks in the build, for a path most sessions
// never take. Importing it on demand keeps it out of the initial download; the
// plan page's Download PDF button is its only caller and can await it.
const downloadPlanPdfFromText = async (planText) => {
  if (!planText) return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 16;
  const lines = doc.splitTextToSize(planText, pageWidth - margin * 2);

  let y = margin;
  lines.forEach((line) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  });

  doc.save("ai-workout-plan.pdf");
};

/**
 * Builds the handlers from App's state and setters, all passed in one object.
 * Rebuilt every render, each handler sees the values of the render that built
 * it. The members that need a word: `apiFetch` (useApiClient, which adds the
 * CSRF header to writes); `queueOptimisticLogCommit` and `showDashboardToast`
 * (useOptimisticLogs, which shows a workout, calorie or meal log as pending and
 * sends it after the undo window); `captureAccount` (useOptimisticLogs), which
 * every handler that writes account state after an await calls before it
 * sends and checks once the answer is in; `flushOptimisticOperations`, which
 * logout runs before anything else and waits on for at most
 * LOGOUT_FLUSH_CAP_MS; and the resets logout and account
 * deletion run, `clearOptimisticOperations`, `clearDashboardDataState`,
 * `clearDashboardToast` and `resetPersonalFlow`; `setSignOutUnfinished`,
 * which logout sets when the server could not end the session; and
 * `setSignOutConfirmCount`, which logout sets to the number of entries kept on
 * the device and still unsent, for SignOutConfirm to ask about, and
 * `confirmSignOut` sets back to 0.
 */
export const createAppEventHandlers = ({
  apiFetch,
  user,
  form,
  setLoading,
  setError,
  setResult,
  setResultPayload,
  setDashboard,
  closePlanner,
  isDashboardRoute,
  setDashView,
  go,
  personal,
  heightUnit,
  weightUnit,
  setAuthForm,
  setAuthMode,
  setAuthError,
  setShowPassword,
  setAuthAutoSignIn,
  setSignupHeightUnit,
  setSignupWeightUnit,
  setSignupProfileForm,
  toCmFromFeetInches,
  toFeetInchesFromCm,
  toKg,
  result,
  authMode,
  setAuthLoading,
  signupProfileForm,
  signupHeightUnit,
  signupWeightUnit,
  authForm,
  setUser,
  setSignOutUnfinished,
  setSignOutConfirmCount,
  pendingSession,
  setPendingSession,
  authAutoSignIn,
  clearOptimisticOperations,
  flushOptimisticOperations,
  captureAccount,
  clearDashboardDataState,
  clearDashboardToast,
  resetPersonalFlow,
  queueOptimisticLogCommit,
  workoutForm,
  setWorkoutForm,
  setWorkoutModalOpen,
  calorieForm,
  setCalorieForm,
  goalForm,
  setDashError,
  showDashboardToast,
  mealLogForm,
  setMealLogForm,
  progressForm,
  setProgressForm
}) => {
  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult("");
    setResultPayload(null);
    const isSameAccount = captureAccount();

    try {
      // Generate. The answer carries the plan's text and the structure the
      // server parsed from it. For a signed-in visitor the server also saves the
      // plan and returns it as savedPlan, which goes to the head of the
      // dashboard's list.
      const res = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        timeoutMs: GENERATE_TIMEOUT_MS
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Something went wrong.");
      }

      const data = await res.json();
      // Generation can outlast a logout. A plan asked for by an account that is
      // no longer signed in is dropped: not shown, not added to the dashboard,
      // and no trip to /plan.
      if (!isSameAccount()) return;
      setResult(data.plan);
      setResultPayload(data.payload ?? null);
      if (data.savedPlan) {
        setDashboard((prev) =>
          prev ? { ...prev, plans: [data.savedPlan, ...(prev.plans || [])] } : prev
        );
      }

      // Close the planner, then go to the dashboard's summary when generating
      // from the dashboard, or to /plan, which shows the new plan, from
      // anywhere else.
      closePlanner();
      if (isDashboardRoute) {
        setDashView("summary");
        go("/dashboard");
      } else {
        go("/plan");
      }
    } catch (err) {
      setError(err.message || "Unable to generate plan.");
    } finally {
      setLoading(false);
    }
  };

  const openSignupWithPrefilledProfile = () => {
    // The signup form carries height in centimetres and in feet and inches, and
    // weight in the visitor's unit and in kilograms, so the home flow's entries
    // are converted from whichever unit the visitor typed in.
    const { firstName, lastName } = splitFullName(personal.name);
    const fallbackHeightCm = String(personal.heightCm || "").trim();
    const computedHeightCm =
      heightUnit === "ft"
        ? toCmFromFeetInches(personal.heightFeet, personal.heightInches) || fallbackHeightCm
        : fallbackHeightCm;
    const computedHeightSplit =
      heightUnit === "ft"
        ? {
            feet: String(personal.heightFeet || "").trim(),
            inches: String(personal.heightInches || "").trim()
          }
        : toFeetInchesFromCm(computedHeightCm);
    const normalizedWeight = String(personal.weight || "").trim();
    const computedWeightKg = weightUnit === "lb" ? toKg(normalizedWeight, "lb") : normalizedWeight;

    // Then signup opens on clean credentials, in the visitor's units, with the
    // profile filled in.
    setAuthForm({ ...defaultAuthForm });
    setAuthMode("signup");
    setAuthError("");
    setShowPassword(false);
    setAuthAutoSignIn(false);
    setSignupHeightUnit(heightUnit === "ft" ? "ft" : "cm");
    setSignupWeightUnit(weightUnit === "lb" ? "lb" : "kg");
    setSignupProfileForm({
      ...defaultSignupProfileForm,
      firstName,
      lastName,
      age: String(personal.age || "").trim(),
      heightCm: String(computedHeightCm || "").trim(),
      heightFeet: String(computedHeightSplit.feet || "").trim(),
      heightInches: String(computedHeightSplit.inches || "").trim(),
      weight: normalizedWeight,
      weightKg: String(computedWeightKg || "").trim(),
      sex: String(personal.sex || "").trim(),
      bodyFat: String(personal.bodyFat || "").trim(),
      activity: String(personal.activity || "").trim() || defaultSignupProfileForm.activity,
      notes: String(personal.notes || "").trim()
    });
    go("/auth");
  };

  const downloadPlanPdf = () =>
    downloadPlanPdfFromText(result).catch((err) => {
      // Loading jspdf on demand can fail where a static import cannot: the
      // chunk fetch can fail on a flaky network or against a stale deploy.
      // Surface it instead of leaving an unhandled rejection.
      setError(err?.message || "Could not prepare the PDF. Please try again.");
    });

  const onAuthChange = (event) => {
    setAuthForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const onSignupProfileChange = (event) => {
    setSignupProfileForm((prev) => ({
      ...prev,
      [event.target.name]: event.target.value
    }));
  };

  const onAuthModeChange = (mode) => {
    const isSwitchingMode = mode !== authMode;
    setAuthMode(mode);
    setAuthError("");
    if (!isSwitchingMode) return;
    setAuthForm({ ...defaultAuthForm });
    setSignupProfileForm({ ...defaultSignupProfileForm });
    setSignupHeightUnit("ft");
    setSignupWeightUnit("lb");
    setAuthAutoSignIn(false);
    setShowPassword(false);
  };

  const onAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      // Sign-up: the profile goes in centimetres and kilograms, converted from
      // the form's units, and the new account comes back signed in.
      if (authMode === "signup") {
        const normalizedProfile = {
          ...signupProfileForm,
          heightCm:
            signupHeightUnit === "ft"
              ? toCmFromFeetInches(signupProfileForm.heightFeet, signupProfileForm.heightInches)
              : signupProfileForm.heightCm,
          weightKg:
            signupWeightUnit === "lb"
              ? toKg(signupProfileForm.weight, "lb")
              : signupProfileForm.weight || signupProfileForm.weightKg
        };
        const res = await apiFetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...authForm,
            profile: normalizedProfile
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || "Unable to create account.");
        }
        const data = await res.json();
        setUser(data.user || null);
        setAuthForm({ ...defaultAuthForm });
        setSignupProfileForm({ ...defaultSignupProfileForm });
        setSignupHeightUnit("ft");
        setSignupWeightUnit("lb");
        go("/dashboard");
        return;
      }

      // Otherwise authMode is "login", which names the route.
      const res = await apiFetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authForm,
          rememberMe: authAutoSignIn
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to authenticate.");
      }
      const data = await res.json();
      setUser(data.user || null);

      setAuthForm({ ...defaultAuthForm });
      go("/dashboard");
    } catch (err) {
      setAuthError(err.message || "Unable to authenticate.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Ends the session on the server if it can, and clears this browser of the
  // account either way.
  const signOut = async () => {
    // Signing out locally must not depend on the request succeeding. The button
    // is wired straight to this, so an uncaught rejection would skip every clear
    // below and leave the previous account's dashboard on screen, with no sign
    // that Log out had not worked. A dead network, or apiFetch refusing to send
    // without a CSRF token, both get here.
    let sessionEnded = false;
    try {
      // Waited on no longer than the flush: the browser signs out either way.
      const res = await apiFetch("/api/auth/logout", {
        method: "POST",
        timeoutMs: LOGOUT_FLUSH_CAP_MS
      });
      sessionEnded = res.ok;
    } catch {
      // The cookie is HttpOnly and cannot be cleared from here, so the server
      // session may outlive this. Clearing what we can beats clearing nothing.
    }
    setUser(null);
    clearOptimisticOperations();
    clearDashboardDataState();
    clearDashboardToast();
    resetPersonalFlow();
    // The dashboard cache stays for this account's return, but the kept sign-in
    // goes: with it, a launch with no answer from the server would sign the
    // visitor back in. So does an open in-gym session, which is this account's.
    removeJsonCache(SESSION_CACHE_KEY);
    clearActiveSession(user);
    go("/");
    // Any answer but OK, the server's 503 included, means the session may still
    // be valid in the store until it expires, so the visitor is told.
    setSignOutUnfinished(!sessionEnded);
  };

  const onLogout = async () => {
    // The entries still inside their undo window go first, on this account's
    // session: their toast said they were saved, and the server refuses them
    // once the session ends. The flush waits for every send this account
    // started, but for no longer than LOGOUT_FLUSH_CAP_MS. A send still
    // running then may be lost, because logout goes ahead without it rather
    // than leaving the user signed in behind a request that may never answer.
    await settleWithin(flushOptimisticOperations(), LOGOUT_FLUSH_CAP_MS);
    // Entries kept on the device that still could not be sent are lost on
    // sign-out, so it asks first; SignOutConfirm's Sign out anyway runs
    // confirmSignOut (docs/specs/2026-11-06-offline-ready-pwa-design.md). An
    // open in-gym session with logged sets counts as one more.
    const openSession = readActiveSession(user);
    const unsent = readOutbox(user).length + (openSession && loggedSetCount(openSession) ? 1 : 0);
    if (unsent) {
      setSignOutConfirmCount(unsent);
      return;
    }
    await signOut();
  };

  // Signs out after the visitor chose to let the unsent entries go.
  const confirmSignOut = async () => {
    setSignOutConfirmCount(0);
    clearOutbox(user);
    await signOut();
  };

  // The Log workout save, shared by the form and the in-gym session's Finish
  // (roadmap B6): `id` is the replay key, and `exerciseSets` are in the API's
  // shape, in kg. A workout logged from a plan day carries its link; an ordinary
  // one leaves it out, since the server takes an absent planId, never a null one.
  const queueWorkout = ({
    id,
    date,
    focus,
    duration,
    notes,
    exerciseSets,
    planId,
    planDayIndex
  }) => {
    const exerciseNames = exerciseSets.map((exercise) => exercise.name);
    const link = planId ? { planId, planDayIndex } : null;
    const payload = {
      id,
      date,
      focus,
      duration,
      notes,
      exercises: exerciseNames,
      exerciseSets,
      ...link
    };

    // The entry shows at once and is sent only when the undo window closes,
    // unless it is undone first (useOptimisticLogs).
    const operationId = buildOptimisticId("workout");
    const optimisticWorkout = {
      id: operationId,
      date: date || getLocalDateKey(),
      focus: focus || "General",
      duration: duration ? Number(duration) : null,
      exercises: exerciseNames,
      exerciseSets,
      sets: null,
      reps: null,
      intensityRpe: null,
      notes: notes || "",
      planId: link?.planId ?? null,
      planDayIndex: link?.planDayIndex ?? null,
      createdAt: new Date().toISOString()
    };

    queueOptimisticLogCommit({
      type: "workout",
      item: optimisticWorkout,
      request: () =>
        postLog(
          apiFetch,
          { url: "/api/dashboard/workout-sessions", body: payload },
          "Unable to save workout."
        ),
      outbox: { clientId: payload.id, url: "/api/dashboard/workout-sessions", body: payload },
      pendingMessage: "Workout added. Undo?",
      successMessage: "Workout saved.",
      undoMessage: "Workout entry removed."
    });
  };

  const submitWorkout = async (event) => {
    event.preventDefault();
    // The modal has already checked the cards, so this only reads them: the
    // exercises with their sets, loads in kg. The label only names the day in
    // the modal and is never sent.
    const { exerciseSets } = toExerciseSets(
      workoutForm.exerciseSets ?? [],
      getPreferredMeasurementSystem()
    );
    queueWorkout({
      id: crypto.randomUUID(),
      date: workoutForm.date,
      focus: workoutForm.focus,
      duration: workoutForm.duration,
      notes: workoutForm.notes,
      exerciseSets,
      planId: workoutForm.planId,
      planDayIndex: workoutForm.planDayIndex
    });

    // The form resets and the modal closes without waiting for the request.
    setWorkoutForm(newWorkoutForm());
    setWorkoutModalOpen(false);
  };

  // Finish in the in-gym session: the session is saved like the form's
  // workout, under its own replay key, then leaves the device, and the Logs
  // open (roadmap B6).
  const finishSession = (session) => {
    queueWorkout(toWorkoutSave(session, Date.now()));
    clearActiveSession(user);
    go("/dashboard/workouts");
  };

  // Start workout and Start a blank workout: the new session is kept on the
  // device and opened. With one already open, App asks first
  // (StartSessionConfirm), holding the new one as `pendingSession`.
  const startSession = (session) => {
    if (readActiveSession(user)) {
      setPendingSession(session);
      return;
    }
    if (!writeActiveSession(user, session)) {
      setDashError("This device can't keep a workout in progress, so it can't start one.");
      return;
    }
    go("/workout");
  };

  // StartSessionConfirm's answer: "resume" opens the session already open, and
  // "replace" discards it for the one waiting.
  const resolveSessionConflict = (choice) => {
    if (choice === "replace") writeActiveSession(user, pendingSession);
    setPendingSession(null);
    go("/workout");
  };

  // Cancel workout, once confirmed: the session leaves the device unsaved.
  const discardSession = () => {
    clearActiveSession(user);
    go("/dashboard/workouts");
  };

  const submitCalories = async (event) => {
    event.preventDefault();
    const operationId = buildOptimisticId("calories");
    const payload = {
      ...calorieForm,
      id: crypto.randomUUID(),
      date: getLocalDateKey()
    };

    queueOptimisticLogCommit({
      type: "calorie",
      item: {
        id: operationId,
        date: payload.date,
        calories: Number(calorieForm.calories || 0),
        createdAt: new Date().toISOString()
      },
      request: () =>
        postLog(
          apiFetch,
          { url: "/api/dashboard/calories", body: payload },
          "Unable to save calories."
        ),
      outbox: { clientId: payload.id, url: "/api/dashboard/calories", body: payload },
      pendingMessage: "Calories added. Undo?",
      successMessage: "Calories logged.",
      undoMessage: "Calorie entry removed."
    });

    setCalorieForm({ calories: "" });
  };

  const submitGoals = async (event) => {
    event.preventDefault();
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch("/api/dashboard/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goalForm)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save goals.");
      }
      const data = await res.json();
      // The account that sent this has signed out since: its dashboard must not
      // reach whoever is signed in now.
      if (!isSameAccount()) return;
      setDashboard(data.dashboard);
      showDashboardToast("Goals updated.");
    } catch (err) {
      const message = err.message || "Unable to save goals.";
      setDashError(message);
      showDashboardToast(message, "error");
    }
  };

  // The units travel with the draft rather than being read from App state. The
  // app-level heightUnit/weightUnit belong to the home flow's toggles, while
  // Settings renders in whatever the visitor's locale implies -- so reading the
  // app-level ones here would convert a locale-imperial form with a metric unit
  // and store 170 lb as 170 kg. The app-level values remain the default for any
  // caller that does not pass units.
  const submitProfile = async (draft, units = { heightUnit, weightUnit }) => {
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personalToProfile(draft, units))
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save profile.");
      }
      const data = await res.json();
      // Saved, but for an account that has signed out since: its profile must
      // not land on whoever is signed in now.
      if (!isSameAccount()) return { ok: true };
      // Only the user is updated, deliberately. `personal` is the home flow's
      // form state, not account state: it is read by HomePage and the signup
      // prefill, both meant for a signed-out visitor, and it is blanked on
      // logout. Settings reads user.profile.
      //
      // Writing it here would look like keeping the two in sync, but nothing
      // hydrates `personal` on load -- so it would be correct right after a save
      // and blank on the next page load. Half-synced state is worse than
      // unsynced.
      setUser((prev) => (prev ? { ...prev, profile: data.profile } : prev));
      showDashboardToast("Profile updated.");
      return { ok: true };
    } catch (err) {
      const message = err.message || "Unable to save profile.";
      showDashboardToast(message, "error");
      return { ok: false, error: message };
    }
  };

  const changePassword = async ({ currentPassword, newPassword }) => {
    try {
      const res = await apiFetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to change password.");
      }
      showDashboardToast("Password changed.");
      return { ok: true };
    } catch (err) {
      // No error toast, deliberately. SettingsAccountPanel renders this same
      // string in a role="alert" region attached to the form the visitor is
      // looking at. The toast is role="status" aria-live="polite", so raising
      // both would announce every failure twice, at two politeness levels. The
      // inline region is the one that survives: it is tied to the field that
      // needs correcting, and it stays put instead of timing out.
      const message = err.message || "Unable to change password.";
      return { ok: false, error: message };
    }
  };

  const deleteAccount = async (password) => {
    try {
      const res = await apiFetch("/api/auth/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to delete account.");
      }
    } catch (err) {
      // Announced inline by the panel's role="alert" region, not by a toast --
      // see the note in changePassword above.
      const message = err.message || "Unable to delete account.";
      return { ok: false, error: message };
    }
    // Only past the request. Unlike onLogout, this must NOT clear local state
    // when the call fails: a rejected password means the account is still
    // there, and signing the user out anyway would look like it worked.
    //
    // The scoped cache is removed here and NOT in onLogout, which is the
    // distinction worth protecting: logging out is the same account coming
    // back, and the cache is a deliberate fast rehydrate for it. Deleting is
    // that account ceasing to exist. `buildScopedCacheKey` scopes on
    // `user?.userId || user?.email`, and the server's auth responses carry no
    // `userId`, so the key is the EMAIL -- signing up again with the same
    // address on the same browser would otherwise rehydrate the deleted
    // account's dashboard, weather and air-quality snapshots into the new one.
    //
    // The keys are built before setUser(null) for readability only. `user` is
    // a parameter of createAppEventHandlers, so it is a closure constant:
    // setUser sets React state and cannot reassign it, and nothing here does
    // either, so building the keys after the reset would read the same value.
    const scopedCacheKeysToClear = [
      DASHBOARD_CACHE_PREFIX,
      WEATHER_CACHE_PREFIX,
      AIR_QUALITY_CACHE_PREFIX
    ].map((prefix) => buildScopedCacheKey(prefix, user));

    setUser(null);
    clearOptimisticOperations();
    clearDashboardDataState();
    clearDashboardToast();
    resetPersonalFlow();
    scopedCacheKeysToClear.forEach(removeJsonCache);
    removeJsonCache(SESSION_CACHE_KEY);
    // The account is gone, so its unsent entries and any open in-gym session
    // can never be sent.
    clearOutbox(user);
    clearActiveSession(user);
    go("/");
    return { ok: true };
  };

  const submitMealLog = async (event) => {
    event.preventDefault();
    const operationId = buildOptimisticId("meal");
    const payload = { ...mealLogForm, id: crypto.randomUUID() };

    // Queued like a workout: shown at once, sent when the undo window closes.
    queueOptimisticLogCommit({
      type: "meal",
      item: {
        id: operationId,
        date: mealLogForm.date || getLocalDateKey(),
        mealType: mealLogForm.mealType || "other",
        name: mealLogForm.name || "",
        calories: mealLogForm.calories ? Number(mealLogForm.calories) : null,
        proteinG: mealLogForm.proteinG ? Number(mealLogForm.proteinG) : null,
        carbsG: mealLogForm.carbsG ? Number(mealLogForm.carbsG) : null,
        fatG: mealLogForm.fatG ? Number(mealLogForm.fatG) : null,
        notes: mealLogForm.notes || "",
        loggedAt: new Date().toISOString()
      },
      request: () =>
        postLog(
          apiFetch,
          { url: "/api/dashboard/meal-logs", body: payload },
          "Unable to save meal log."
        ),
      outbox: { clientId: payload.id, url: "/api/dashboard/meal-logs", body: payload },
      pendingMessage: "Meal added. Undo?",
      successMessage: "Meal logged.",
      undoMessage: "Meal entry removed."
    });

    // The form resets without waiting for the request.
    setMealLogForm({
      date: getLocalDateKey(),
      mealType: "breakfast",
      name: "",
      calories: "",
      proteinG: "",
      carbsG: "",
      fatG: "",
      notes: ""
    });
  };

  const submitProgressMetric = async (event) => {
    event.preventDefault();
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch("/api/dashboard/progress-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(progressForm)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save progress metric.");
      }
      const data = await res.json();
      // As in submitGoals: an answer for an account that has signed out since
      // is dropped.
      if (!isSameAccount()) return;
      setDashboard(data.dashboard);
      setProgressForm({
        date: getLocalDateKey(),
        weightLb: "",
        bodyFatPct: "",
        waistCm: "",
        restingHr: "",
        notes: ""
      });
      showDashboardToast("Progress metric saved.");
    } catch (err) {
      const message = err.message || "Unable to save progress metric.";
      setDashError(message);
      showDashboardToast(message, "error");
    }
  };

  const saveExerciseToPlan = async (exercisePayload) => {
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch("/api/dashboard/saved-exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exercisePayload || {})
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save exercise.");
      }
      const data = await res.json();
      // As in submitGoals. The caller still hears that the save went through.
      if (!isSameAccount()) return { ok: true, data };
      setDashboard(data.dashboard);
      showDashboardToast("Exercise saved to your plan.");
      return { ok: true, data };
    } catch (err) {
      const message = err.message || "Unable to save exercise.";
      setDashError(message);
      showDashboardToast(message, "error");
      return { ok: false, error: message };
    }
  };

  const removeSavedExercise = async (entryId) => {
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch(`/api/dashboard/saved-exercises/${entryId}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to remove saved exercise.");
      }
      const data = await res.json();
      // As in submitGoals. The caller still hears that the removal went through.
      if (!isSameAccount()) return { ok: true, data };
      setDashboard(data.dashboard);
      showDashboardToast("Saved exercise removed.");
      return { ok: true, data };
    } catch (err) {
      const message = err.message || "Unable to remove saved exercise.";
      setDashError(message);
      showDashboardToast(message, "error");
      return { ok: false, error: message };
    }
  };

  // Roadmap C4: the plan a swap or an undo answers, in place of the plan with
  // its id. The swap's own request is made where the swap is chosen.
  const replacePlan = (plan) =>
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            plans: (prev.plans || []).map((entry) => (entry.id === plan.id ? plan : entry))
          }
        : prev
    );

  return {
    replacePlan,
    onSubmit,
    openSignupWithPrefilledProfile,
    downloadPlanPdf,
    onAuthChange,
    onSignupProfileChange,
    onAuthModeChange,
    onAuthSubmit,
    onLogout,
    confirmSignOut,
    submitWorkout,
    finishSession,
    startSession,
    resolveSessionConflict,
    discardSession,
    submitCalories,
    submitGoals,
    submitProfile,
    changePassword,
    deleteAccount,
    submitMealLog,
    submitProgressMetric,
    saveExerciseToPlan,
    removeSavedExercise
  };
};
