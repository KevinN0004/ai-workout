import { jsPDF } from "jspdf";
import { defaultAuthForm, defaultSignupProfileForm } from "./constants";
import {
  getLocalDateKey,
  splitFullName
} from "./units";

const buildOptimisticId = (type) =>
  `optimistic-${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const downloadPlanPdfFromText = (planText) => {
  if (!planText) return;
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

export const createAppEventHandlers = ({
  apiFetch,
  form,
  setLoading,
  setError,
  setResult,
  setDashboard,
  closePlanner,
  isDashboardRoute,
  setPlanModalOpen,
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
  authAutoSignIn,
  clearOptimisticOperations,
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

    try {
      const res = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Something went wrong.");
      }

      const data = await res.json();
      setResult(data.plan);
      if (data.savedPlan) {
        setDashboard((prev) =>
          prev
            ? { ...prev, plans: [data.savedPlan, ...(prev.plans || [])] }
            : prev
        );
      }
      closePlanner();
      if (isDashboardRoute) {
        setPlanModalOpen(false);
        setDashView("summary");
        go("/dashboard");
      } else {
        setPlanModalOpen(false);
        go("/plan");
      }
    } catch (err) {
      setError(err.message || "Unable to generate plan.");
    } finally {
      setLoading(false);
    }
  };

  const openSignupWithPrefilledProfile = () => {
    const { firstName, lastName } = splitFullName(personal.name);
    const fallbackHeightCm = String(personal.heightCm || "").trim();
    const computedHeightCm = heightUnit === "ft"
      ? (toCmFromFeetInches(personal.heightFeet, personal.heightInches) || fallbackHeightCm)
      : fallbackHeightCm;
    const computedHeightSplit = heightUnit === "ft"
      ? {
          feet: String(personal.heightFeet || "").trim(),
          inches: String(personal.heightInches || "").trim()
        }
      : toFeetInchesFromCm(computedHeightCm);
    const normalizedWeight = String(personal.weight || "").trim();
    const computedWeightKg = weightUnit === "lb"
      ? toKg(normalizedWeight, "lb")
      : normalizedWeight;

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

  const downloadPlanPdf = () => {
    downloadPlanPdfFromText(result);
  };

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
      if (authMode === "signup") {
        const normalizedProfile = {
          ...signupProfileForm,
          heightCm:
            signupHeightUnit === "ft"
              ? toCmFromFeetInches(
                  signupProfileForm.heightFeet,
                  signupProfileForm.heightInches
                )
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

  const onLogout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    clearOptimisticOperations();
    clearDashboardDataState();
    clearDashboardToast();
    resetPersonalFlow();
    go("/");
  };

  const submitWorkout = async (event) => {
    event.preventDefault();
    const normalizedExercises = workoutForm.exercises
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const payload = {
      ...workoutForm,
      exercises: normalizedExercises
    };
    const operationId = buildOptimisticId("workout");
    const optimisticWorkout = {
      id: operationId,
      date: workoutForm.date || getLocalDateKey(),
      focus: workoutForm.focus || "General",
      duration: workoutForm.duration ? Number(workoutForm.duration) : null,
      exercises: normalizedExercises,
      sets: workoutForm.sets ? Number(workoutForm.sets) : null,
      reps: workoutForm.reps ? Number(workoutForm.reps) : null,
      intensityRpe: workoutForm.intensityRpe ? Number(workoutForm.intensityRpe) : null,
      notes: workoutForm.notes || "",
      createdAt: new Date().toISOString()
    };

    queueOptimisticLogCommit({
      type: "workout",
      item: optimisticWorkout,
      request: async () => {
        const res = await apiFetch("/api/dashboard/workout-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({}));
          throw new Error(errorPayload?.error || "Unable to save workout.");
        }
        return res.json();
      },
      pendingMessage: "Workout added. Undo?",
      successMessage: "Workout saved.",
      undoMessage: "Workout entry removed."
    });

    setWorkoutForm({
      date: getLocalDateKey(),
      focus: "",
      duration: "",
      exercises: "",
      sets: "",
      reps: "",
      intensityRpe: "",
      notes: ""
    });
    setWorkoutModalOpen(false);
  };

  const submitCalories = async (event) => {
    event.preventDefault();
    const operationId = buildOptimisticId("calories");
    const payload = {
      ...calorieForm,
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
      request: async () => {
        const res = await apiFetch("/api/dashboard/calories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({}));
          throw new Error(errorPayload?.error || "Unable to save calories.");
        }
        return res.json();
      },
      pendingMessage: "Calories added. Undo?",
      successMessage: "Calories logged.",
      undoMessage: "Calorie entry removed."
    });

    setCalorieForm({ calories: "" });
  };

  const submitGoals = async (event) => {
    event.preventDefault();
    setDashError("");
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
      setDashboard(data.dashboard);
      showDashboardToast("Goals updated.");
    } catch (err) {
      const message = err.message || "Unable to save goals.";
      setDashError(message);
      showDashboardToast(message, "error");
    }
  };

  const submitMealLog = async (event) => {
    event.preventDefault();
    const operationId = buildOptimisticId("meal");
    const payload = { ...mealLogForm };

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
      request: async () => {
        const res = await apiFetch("/api/dashboard/meal-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({}));
          throw new Error(errorPayload?.error || "Unable to save meal log.");
        }
        return res.json();
      },
      pendingMessage: "Meal added. Undo?",
      successMessage: "Meal logged.",
      undoMessage: "Meal entry removed."
    });

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
    try {
      const res = await apiFetch(`/api/dashboard/saved-exercises/${entryId}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to remove saved exercise.");
      }
      const data = await res.json();
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

  return {
    onSubmit,
    openSignupWithPrefilledProfile,
    downloadPlanPdf,
    onAuthChange,
    onSignupProfileChange,
    onAuthModeChange,
    onAuthSubmit,
    onLogout,
    submitWorkout,
    submitCalories,
    submitGoals,
    submitMealLog,
    submitProgressMetric,
    saveExerciseToPlan,
    removeSavedExercise
  };
};
