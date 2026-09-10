const CRITERIA_WORDS = ["should", "must", "expect", "assert", "given", "when", "then"];

export function scoreContext({
  taskText = "",
  files = [],
  staged = "",
  unstaged = "",
  recentLog = ""
} = {}) {
  const gaps = [];
  let score = 0;

  // Task text present and >10 words (20 pts)
  const wordCount = taskText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 10) {
    score += 20;
  } else {
    gaps.push("task description too brief");
  }

  // ≥2 files identified (20 pts)
  if (files.length >= 2) {
    score += 20;
  } else {
    gaps.push("no files identified");
  }

  // Staged or unstaged changes present (20 pts)
  const hasChanges =
    (staged && staged.trim().length > 0) || (unstaged && unstaged.trim().length > 0);
  if (hasChanges) {
    score += 20;
  } else {
    gaps.push("no changes detected");
  }

  // Recent log has ≥2 meaningful commits (10 pts)
  const commitCount = recentLog.trim().split("\n").filter(Boolean).length;
  if (commitCount >= 2) {
    score += 10;
  } else {
    gaps.push("thin commit history");
  }

  // Acceptance criteria language (30 pts)
  const textLower = taskText.toLowerCase();
  const hasCriteria = CRITERIA_WORDS.some((w) => textLower.includes(w));
  if (hasCriteria) {
    score += 30;
  } else {
    gaps.push("acceptance criteria missing");
  }

  const label = score < 40 ? "low" : score <= 70 ? "medium" : "high";
  return { score, label, gaps };
}
