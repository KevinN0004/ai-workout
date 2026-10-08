/**
 * How codex-handoff.mjs chooses a Claude -> Codex workflow (Rescue → Review,
 * Review → Patch or Plan → Execute), the Codex sandbox flags for each, and the
 * prompt its --launch sends Codex.
 */
const FIX_WORDS = ["fix", "broken", "failing", "repair"];
const REVIEW_WORDS = ["review", "audit", "confidence", "looks right"];
const REPAIR_DESC_WORDS = ["broken", "failing", "regression", "hotfix"];
const HASH_RE = /^[a-f0-9]+ /;
const CONV_PREFIX_RE = /^\w+(\([^)]+\))?!?:\s*/;
const FIX_TYPE_RE = /^fix(\([^)]+\))?!?:/;

/**
 * True when any line of `git log --oneline` output is a revert, or a `fix:`
 * commit (with or without a scope or `!`) whose description contains one of
 * REPAIR_DESC_WORDS. A `fix:` without one of those words does not count.
 */
export function detectRepairLanguage(log) {
  return log.split("\n").some((line) => {
    const withoutHash = line.toLowerCase().replace(HASH_RE, "");
    if (withoutHash.startsWith("revert")) return true;
    if (!FIX_TYPE_RE.test(withoutHash)) return false;
    const description = withoutHash.replace(CONV_PREFIX_RE, "");
    return REPAIR_DESC_WORDS.some((k) => description.includes(k));
  });
}

// The Codex sandbox flags for each workflow. codex-handoff.mjs's --launch uses
// them unless --approval-mode overrides them.
export const APPROVAL_MODE_MAP = {
  "Rescue → Review": "--sandbox workspace-write",
  "Review → Patch": "--sandbox workspace-write",
  "Plan → Execute": "--full-auto"
};

const SUPERPOWERS_CONTROLLER_PROTOCOL = [
  "Superpowers-compatible controller protocol:",
  "- Treat the Claude-authored plan as the source of truth.",
  "- Execute one plan task at a time; do not start the next task until reviews pass.",
  "- Act as the implementer subagent: ask for missing context before editing, implement exactly the task, test, self-review, and report status.",
  "- Return Status as DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT.",
  "- After each implementation, hand control back to Claude for spec compliance review first.",
  "- Only after spec compliance passes should Claude run code quality review.",
  "- If either review finds issues, apply only the focused patch requested by Claude and return another implementation report.",
  "- Never treat Codex self-review as a substitute for Claude review."
].join("\n");

const WORKFLOW_INSTRUCTIONS = {
  "Rescue → Review":
    "Identify what is broken, repair it, and verify the fix passes all checks before returning control.",
  "Review → Patch":
    "Review the current branch state and apply the minimal patch needed to continue. Commit and return a summary.",
  "Plan → Execute":
    "Plan and implement the requested feature from a clean state. Write failing tests first, then make them pass."
};

/**
 * Builds the prompt codex-handoff.mjs's --launch feeds `codex exec` on stdin:
 * the workflow and its reason, the task, plan and git state it was given, and
 * the workflow's instruction. The Superpowers controller protocol follows when
 * `superpowers` is set or a plan reference or contract is given, then the
 * contract. codex-handoff.mjs always passes a contract, so its prompts always
 * carry the protocol.
 */
export function buildCodexPrompt({
  workflow,
  reason,
  taskText = "",
  branch = "",
  staged = "",
  unstaged = "",
  recentLog = "",
  planFile = "",
  taskId = "",
  handoffContract = "",
  superpowers = false
}) {
  const lines = [`Workflow: ${workflow}`, `Reason: ${reason}`];
  if (taskText) lines.push(`Task: ${taskText}`);
  if (planFile) lines.push(`Plan source: ${planFile}`);
  if (taskId) lines.push(`Plan task: ${taskId}`);
  lines.push("", "Current state:");
  if (branch) lines.push(`- Branch: ${branch}`);
  lines.push(`- Staged changes: ${staged.trim() || "none"}`);
  lines.push(`- Unstaged changes: ${unstaged.trim() || "none"}`);
  if (recentLog) lines.push(`- Recent commits: ${recentLog.trim()}`);
  lines.push("", WORKFLOW_INSTRUCTIONS[workflow] ?? "Complete the task and return a summary.");
  if (superpowers || planFile || taskId || handoffContract) {
    lines.push("", SUPERPOWERS_CONTROLLER_PROTOCOL);
  }
  if (handoffContract) {
    lines.push("", "Claude handoff contract:", handoffContract);
  }
  return lines.join("\n");
}

/**
 * Picks the workflow and the reason codex-handoff.mjs prints. The first signal
 * that applies wins: a usage limit, then repair language in the recent log,
 * then uncommitted changes, then review words in the task text; with none of
 * those it is Plan → Execute.
 */
export function selectWorkflow({ hasChanges, hasFixInLog, hasUsageLimit = false, taskText = "" }) {
  const text = taskText.toLowerCase();

  // ---- Signals checked before the working tree ------------------------------
  if (hasUsageLimit) {
    return {
      workflow: "Review → Patch",
      reason: "Claude usage limit reached — Codex picks up and continues from current state"
    };
  }

  if (hasFixInLog) {
    return {
      workflow: "Rescue → Review",
      reason: "Recent commit contains repair language (fix/repair/broken/revert)"
    };
  }

  // ---- Uncommitted changes --------------------------------------------------
  if (hasChanges) {
    if (FIX_WORDS.some((k) => text.includes(k))) {
      return {
        workflow: "Rescue → Review",
        reason: "Uncommitted changes with repair keywords in task text"
      };
    }
    return {
      workflow: "Review → Patch",
      reason: "Uncommitted changes detected, no failure signals"
    };
  }

  // ---- No uncommitted changes detected --------------------------------------
  if (REVIEW_WORDS.some((k) => text.includes(k))) {
    return {
      workflow: "Review → Patch",
      reason: "Clean state with review keywords in task text"
    };
  }

  return {
    workflow: "Plan → Execute",
    reason: "Clean state, no failure signals"
  };
}
