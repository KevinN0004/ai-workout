/**
 * Reads a Strava webhook event (roadmap C2, docs/specs/2026-11-12-strava-import-design.md,
 * "The webhook"). Events are unsigned, so the body is anyone's: ids are positive
 * whole numbers or nothing, and a malformed body is no event.
 */
// @ts-check

// How much of a type is kept: Strava's are "activity", "athlete", "create",
// "update" and "delete", and anything longer is only logged.
const TYPE_MAX = 20;

/**
 * The positive whole number `value` holds, as digits, or null. Only a number or
 * a string of digits counts, so true, "" and null are never read as an id.
 * @param {unknown} value
 */
const idOf = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  return Number.isSafeInteger(Number(value)) ? value : null;
};

/** @param {unknown} value */
const typeOf = (value) => (typeof value === "string" ? value.slice(0, TYPE_MAX) : "");

/**
 * The event in `body`: its object and aspect types, the object's id (null when
 * it has none), the athlete and subscription it names, and whether it reports
 * access revoked, which Strava marks with `authorized: "false"` in `updates`.
 * Null without a readable athlete and subscription.
 * @param {any} body
 */
export const readEvent = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const ownerId = idOf(body.owner_id);
  const subscriptionId = idOf(body.subscription_id);
  if (!ownerId || !subscriptionId) return null;
  return {
    objectType: typeOf(body.object_type),
    aspectType: typeOf(body.aspect_type),
    objectId: idOf(body.object_id),
    ownerId: Number(ownerId),
    subscriptionId: Number(subscriptionId),
    deauthorized: body.updates?.authorized === "false"
  };
};
