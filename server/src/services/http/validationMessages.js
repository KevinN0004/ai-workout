// The wording zod 3 gave validation errors, which the client has always shown
// users verbatim. zod 4 rewrote its defaults ("Too small: expected string to
// have >=8 characters"), so both request formatters pass this to safeParse as
// the per-parse error map. A message written into a schema still outranks it.
//
// Only wording recorded from zod 3.25.76 against these schemas is reproduced.
// Anything else returns undefined, which falls through to zod's own message
// rather than guessing at what zod 3 would have said.

// JSON only ever delivers these shapes. zod 3 named NaN "nan", which is what a
// coerced non-numeric query value becomes.
const receivedType = (input) => {
  if (Array.isArray(input)) return "array";
  if (input === null) return "null";
  if (typeof input === "number" && Number.isNaN(input)) return "nan";
  return typeof input;
};

const quote = (value) => (typeof value === "string" ? `'${value}'` : String(value));

const tooSmall = {
  string: (min) => `String must contain at least ${min} character(s)`,
  number: (min) => `Number must be greater than or equal to ${min}`,
  array: (min) => `Array must contain at least ${min} element(s)`
};

const tooBig = {
  string: (max) => `String must contain at most ${max} character(s)`,
  number: (max) => `Number must be less than or equal to ${max}`,
  array: (max) => `Array must contain at most ${max} element(s)`
};

export const validationMessage = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      // zod 4 reports a failed .int() as an invalid type; zod 3 did too, in
      // these words.
      if (issue.expected === "int") return "Expected integer, received float";
      if (issue.input === undefined) return "Required";
      return `Expected ${issue.expected}, received ${receivedType(issue.input)}`;
    // Inclusive bounds only: every min/max here is inclusive, and zod 3's
    // exclusive and exact wordings were never recorded.
    case "too_small":
      return issue.inclusive && !issue.exact ? tooSmall[issue.origin]?.(issue.minimum) : undefined;
    case "too_big":
      return issue.inclusive && !issue.exact ? tooBig[issue.origin]?.(issue.maximum) : undefined;
    // invalid_value also covers z.literal, which zod 3 worded differently.
    case "invalid_value":
      return issue.inst?._zod?.def?.type === "enum"
        ? `Invalid enum value. Expected ${issue.values.map(quote).join(" | ")}, received '${issue.input}'`
        : undefined;
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${issue.keys.map(quote).join(", ")}`;
    case "invalid_union":
      return "Invalid input";
    default:
      return undefined;
  }
};
