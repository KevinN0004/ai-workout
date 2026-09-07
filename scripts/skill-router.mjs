import { createInterface } from "node:readline";

const RULES = [
  {
    skill: "superpowers:systematic-debugging",
    keywords: ["bug", "error", "fail", "failing", "broken", "not working", "exception", "crash"]
  },
  {
    skill: "superpowers:brainstorming",
    keywords: [
      "build me",
      "create a",
      "add feature",
      "new feature",
      "how should we build",
      "i want to build",
      "i want to add",
      "i want to create"
    ]
  },
  {
    skill: "superpowers:writing-plans",
    keywords: [
      "write a plan",
      "create a plan",
      "implementation plan",
      "architecture plan",
      "how should we approach",
      "make a spec"
    ]
  },
  {
    skill: "superpowers:requesting-code-review",
    keywords: [
      "review this",
      "review my",
      "code review",
      "pull request",
      "pr review",
      "check my code"
    ]
  },
  {
    skill: "superpowers:verification-before-completion",
    keywords: [
      "i'm done",
      "i am done",
      "finished implementing",
      "ready to merge",
      "ready to ship",
      "can we ship",
      "mark complete"
    ]
  },
  {
    skill: "context7-mcp",
    keywords: [
      "how do i use",
      "what is the api for",
      "library docs",
      "framework docs",
      "api syntax",
      "check the docs for"
    ]
  },
  {
    skill: "codebase-memory-mcp",
    keywords: [
      "find where",
      "search the codebase",
      "where is",
      "which files",
      "where does",
      "what calls",
      "what imports"
    ]
  },
  {
    skill: "frontend-design",
    keywords: [
      "build a ui",
      "build a page",
      "build a component",
      "create a component",
      "make it look better",
      "redesign",
      "new page",
      "new component"
    ]
  },
  {
    skill: "superpowers:test-driven-development",
    keywords: ["write tests for", "add tests", "unit tests", "tdd this", "test driven"]
  },
  {
    skill: "agentdb-vector-search",
    keywords: [
      "search memory",
      "store this pattern",
      "look up in memory",
      "remember this",
      "find in agentdb",
      "semantic search"
    ]
  }
];

const rl = createInterface({ input: process.stdin, terminal: false });
let raw = "";
rl.on("line", (line) => {
  raw += line;
});
rl.on("close", () => {
  try {
    const data = JSON.parse(raw);
    const prompt = (data.prompt || "").toLowerCase();

    for (const { skill, keywords } of RULES) {
      if (keywords.some((kw) => prompt.includes(kw))) {
        process.stdout.write(
          `[SKILL-ROUTER] Your task matches the skill: ${skill}.\n` +
            `You MUST invoke Skill('${skill}') before generating any other response.\n`
        );
        break;
      }
    }
  } catch {
    // Silent failure — never block Claude
  }
  process.exit(0);
});
