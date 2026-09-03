import { execSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  detectRepairLanguage,
  APPROVAL_MODE_MAP,
  buildCodexPrompt,
  selectWorkflow,
} from './codex-handoff/workflow-select.mjs';
import { suggestFiles } from './codex-handoff/file-suggest.mjs';
import { scoreContext } from './codex-handoff/context-score.mjs';

export { detectRepairLanguage, APPROVAL_MODE_MAP, buildCodexPrompt, selectWorkflow };

const CLAUDE_TO_CODEX_HEADER = `--- Claude -> Codex Superpowers Handoff ---
Task:
[fill in: one-sentence implementation objective]

Plan Source:
- [docs/superpowers/plans/YYYY-MM-DD-name.md OR pasted task text]
- [task id/title from the plan]

Scope:
- [what is in scope]
- [what is out of scope]

Files likely involved:`;

const CLAUDE_TO_CODEX_FOOTER = `
Acceptance criteria:
- [observable behavior]
- [required test or validation outcome]

Validation:
- [smallest targeted command]
- [final repo gate]

Risks to watch:
- [contract drift, API regression, edge case, migration risk]

Superpowers controller loop:
1. Claude writes or selects the approved plan and gives Codex the full task text.
2. Codex acts as the implementer subagent for one task only.
3. Codex reports DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT with files changed and tests run.
4. Claude runs spec compliance review against the plan before any code quality review.
5. Claude runs code quality review only after spec compliance passes.
6. If review finds issues, Claude sends Codex a focused patch request and repeats the review loop.

Codex return packet:
- Status: [DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT]
- Implemented: [summary]
- Files changed: [paths]
- Tests run: [commands and results]
- Self-review: [findings]
- Review needed from Claude: [spec compliance, then code quality]`;

function findCodexJs() {
  try {
    const prefix = execSync('npm config get prefix', { encoding: 'utf8', stdio: 'pipe' }).trim();
    const p = join(prefix, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

function probe(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

function parseArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
}

function buildHandoffTemplate(
  files,
  { workflow = '', reason = '', planFile = '', taskId = '' } = {},
) {
  const filesSection =
    files.length > 0
      ? files.map((f) => `- ${f.path}  <- ${f.label}`).join('\n')
      : '- [path]\n- [path]';
  const selected = workflow
    ? `Workflow Selected: ${workflow}\nReason: ${reason || '[selection reason]'}\n\n`
    : '';
  const planHint =
    planFile || taskId
      ? `\nResolved Plan Context:\n- Plan source: ${planFile || '[not provided]'}\n- Plan task: ${taskId || '[not provided]'}\n`
      : '';
  return `${selected}${CLAUDE_TO_CODEX_HEADER}\n${filesSection}${planHint}${CLAUDE_TO_CODEX_FOOTER}`;
}

function main() {
  const taskText = parseArgValue('--task');
  const hasUsageLimit = process.argv.includes('--usage-limit');
  const shouldLaunch = process.argv.includes('--launch');
  const hookMode = process.argv.includes('--hook');
  const superpowersMode = process.argv.includes('--superpowers');
  const approvalModeOverride = parseArgValue('--approval-mode');
  const planFile = parseArgValue('--plan');
  const taskId = parseArgValue('--task-id');
  let hasChanges = false;
  let hasFixInLog = false;
  let gitAvailable = true;
  let branch = '';
  let staged = '';
  let unstaged = '';
  let recentLog = '';
  let changedFiles = [];
  let stagedFilesList = [];
  let repoRoot = process.cwd();

  const status = probe('git status --porcelain');
  if (status === null) {
    gitAvailable = false;
    console.warn('Warning: git probe failed — falling back to text-only detection\n');
  } else {
    hasChanges = status.trim().length > 0;
  }

  if (gitAvailable) {
    branch = probe('git branch --show-current')?.trim() ?? '';
    staged = probe('git diff --cached --stat') ?? '';
    unstaged = probe('git diff --stat') ?? '';
    const log = probe('git log --oneline -5');
    if (log !== null) {
      recentLog = log.trim();
      hasFixInLog = detectRepairLanguage(log);
    }
    const changedRaw = probe('git diff --name-only HEAD') ?? '';
    const stagedRaw = probe('git diff --cached --name-only') ?? '';
    changedFiles = changedRaw.trim().split('\n').filter(Boolean);
    stagedFilesList = stagedRaw.trim().split('\n').filter(Boolean);
    repoRoot = probe('git rev-parse --show-toplevel')?.trim() ?? process.cwd();
  }

  if (!gitAvailable && !taskText) {
    console.log('Workflow:  Plan → Execute');
    console.log(
      'Reason:    git unavailable and no --task provided; defaulting to Plan → Execute\n',
    );
    console.log(
      buildHandoffTemplate([], {
        workflow: 'Plan → Execute',
        reason: 'git unavailable and no --task provided',
        planFile,
        taskId,
      }),
    );
    return;
  }

  const files = suggestFiles({ changedFiles, stagedFiles: stagedFilesList, repoRoot });
  const { score, label, gaps } = scoreContext({
    taskText,
    files: files.map((f) => f.path),
    staged,
    unstaged,
    recentLog,
  });

  const { workflow, reason } = selectWorkflow({ hasChanges, hasFixInLog, hasUsageLimit, taskText });

  if (hookMode) {
    const gapSuffix = gaps.length ? ` — gaps: ${gaps.join(', ')}` : '';
    console.log(
      JSON.stringify({
        systemMessage: `Codex handoff: ${workflow} — ${reason} — confidence ${score}% (${label})${gapSuffix}`,
      }),
    );
    return;
  }

  const gapSuffix = gaps.length ? ` — gaps: ${gaps.join(', ')}` : '';
  console.log(`Workflow:  ${workflow}`);
  console.log(`Confidence: ${score}% (${label})${gapSuffix}`);
  console.log(`Reason:    ${reason}\n`);

  if (shouldLaunch) {
    const handoffContract = buildHandoffTemplate(files, { workflow, reason, planFile, taskId });
    const prompt = buildCodexPrompt({
      workflow,
      reason,
      taskText,
      branch,
      staged,
      unstaged,
      recentLog,
      planFile,
      taskId,
      handoffContract,
      superpowers: superpowersMode,
    });
    const modeFlag =
      approvalModeOverride || APPROVAL_MODE_MAP[workflow] || '--sandbox workspace-write';
    const modeArgs = modeFlag.trim().split(/\s+/);

    // Show what is being sent to Codex before launching
    console.log(handoffContract);
    console.log(`\nLaunching: codex exec ${modeArgs.join(' ')}\n`);

    // On Windows, Node.js child_process stdin piping to cmd.exe or even
    // direct node spawns fails to deliver the buffer to codex reliably.
    // Write the prompt to a temp file and use bash's '<' redirection instead
    // — bash piping works correctly on this machine.
    // mkdtemp rather than a Date.now() filename in the shared temp dir: that name
    // is guessable, so another local user can pre-create the path as a symlink and
    // redirect this write (CodeQL js/insecure-temporary-file). mkdtemp creates the
    // directory itself with a random suffix, 0700 on POSIX.
    const tmpPromptDir = mkdtempSync(join(tmpdir(), 'codex-handoff-'));
    const tmpPromptPath = join(tmpPromptDir, 'prompt.txt').replace(/\\/g, '/');
    writeFileSync(tmpPromptPath, prompt, 'utf8');

    const codexJs = findCodexJs();
    if (!codexJs) {
      console.error('Error: could not locate codex.js. Install with: npm install -g @openai/codex');
      process.exit(1);
    }
    const codexJsUnix = codexJs.replace(/\\/g, '/');

    // bash still performs the stdin redirect — see the note above about Windows
    // piping — but nothing is interpolated into the command string any more.
    // Values arrive as positional parameters ($0 is the script name, $1 and $2
    // the paths, $3 onward the mode flags), so an --approval-mode override
    // containing shell metacharacters is data rather than code.
    //
    // Verified: with the old interpolated form, a mode of `x; echo INJECTED`
    // ran `echo` as a separate command. With this form the same string arrives
    // as one literal argument. CodeQL js/indirect-command-line-injection.
    const child = spawn(
      'bash',
      [
        '-c',
        'node "$1" exec "${@:3}" < "$2"',
        'codex-handoff',
        codexJsUnix,
        tmpPromptPath,
        ...modeArgs,
      ],
      { stdio: 'inherit' },
    );

    child.on('error', (err) => {
      try {
        rmSync(tmpPromptDir, { recursive: true, force: true });
      } catch {
        // Temp prompt dir may already be gone; nothing to clean up.
      }
      console.error(`Error launching codex via bash: ${err.message}`);
      process.exit(1);
    });

    child.on('close', (code) => {
      try {
        rmSync(tmpPromptDir, { recursive: true, force: true });
      } catch {
        // Temp prompt dir may already be gone; nothing to clean up.
      }
      process.exit(code ?? 0);
    });

    return; // handoffContract already printed above; do not fall through
  }

  console.log(buildHandoffTemplate(files, { workflow, reason, planFile, taskId }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
