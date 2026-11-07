/**
 * One exercise in the Log workout modal (roadmap B1): its name, whether its
 * sets count reps or seconds, and its set rows of reps or seconds, load and
 * RPE, with buttons to add and remove a set and to remove the exercise.
 */
import {
  MAX_SETS,
  addSet,
  removeCard,
  removeSet,
  updateCard,
  updateSet
} from "../../../app/exerciseSets";

/**
 * Renders `card`. Every change goes through `onChange(updater)`, which takes
 * the card list and returns the next one, so each control names its own card
 * and row by key. `errors` holds the save's messages by key, `unitLabel` is
 * "kg" or "lb", and `position` numbers a card that has no name yet.
 */
export default function ExerciseCard({ card, position, unitLabel, errors, onChange }) {
  const label = card.name.trim() || `Exercise ${position}`;
  const amountLabel = card.kind === "seconds" ? "Seconds" : "Reps";
  const nameId = `${card.key}-name`;
  const nameError = errors[card.key];

  return (
    <div className="set-log-card" role="group" aria-label={label}>
      {/* ---- Name, what the sets count, and remove ---- */}
      <div className="set-log-card-head">
        <label className="set-log-name" htmlFor={nameId}>
          <span className="dashboard-workout-label">Exercise</span>
          <input
            id={nameId}
            value={card.name}
            maxLength={140}
            placeholder="Squat"
            aria-invalid={nameError ? "true" : undefined}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            onChange={(e) =>
              onChange((cards) => updateCard(cards, card.key, { name: e.target.value }))
            }
          />
        </label>
        <label className="set-log-kind">
          <span className="dashboard-workout-label">Counts</span>
          <select
            value={card.kind}
            onChange={(e) =>
              onChange((cards) => updateCard(cards, card.key, { kind: e.target.value }))
            }
          >
            <option value="reps">Reps</option>
            <option value="seconds">Seconds</option>
          </select>
        </label>
        <button
          type="button"
          className="ghost icon-button set-log-remove"
          aria-label={`Remove ${label}`}
          onClick={() => onChange((cards) => removeCard(cards, card.key))}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {nameError ? (
        <p className="set-log-error" id={`${nameId}-error`}>
          {nameError}
        </p>
      ) : null}
      {card.perSide ? <p className="muted set-log-hint">Count each side.</p> : null}

      {/* ---- The set rows, under a header row sighted users read them by ---- */}
      {card.sets.length ? (
        <div className="set-log-rows">
          <div className="set-log-row set-log-row-head" aria-hidden="true">
            <span>Set</span>
            <span>{amountLabel}</span>
            <span>{unitLabel}</span>
            <span>RPE</span>
            <span />
          </div>
          {card.sets.map((row, index) => {
            const number = index + 1;
            const rowError = errors[`${card.key}:${row.key}`];
            const errorId = `${row.key}-error`;
            const update = (patch) =>
              onChange((cards) => updateSet(cards, card.key, row.key, patch));
            return (
              <div key={row.key} className="set-log-row-group">
                <div className="set-log-row">
                  <span className="set-log-number">{number}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={card.kind === "seconds" ? 1 : 0}
                    max={card.kind === "seconds" ? 3600 : 200}
                    step="1"
                    value={row.amount}
                    placeholder={card.targets?.amount ?? ""}
                    aria-label={`Set ${number} ${amountLabel.toLowerCase()}, ${label}`}
                    aria-invalid={rowError ? "true" : undefined}
                    aria-describedby={rowError ? errorId : undefined}
                    onChange={(e) => update({ amount: e.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={unitLabel === "lb" ? 2204.6 : 1000}
                    step="0.01"
                    value={row.load}
                    placeholder={card.targets?.load ?? ""}
                    aria-label={`Set ${number} load in ${unitLabel}, ${label}`}
                    onChange={(e) => update({ load: e.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    max="10"
                    step="0.5"
                    value={row.rpe}
                    placeholder={card.targets?.rpe ?? ""}
                    aria-label={`Set ${number} RPE, ${label}`}
                    onChange={(e) => update({ rpe: e.target.value })}
                  />
                  <button
                    type="button"
                    className="ghost icon-button set-log-remove"
                    aria-label={`Remove set ${number}, ${label}`}
                    onClick={() => onChange((cards) => removeSet(cards, card.key, row.key))}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path
                        d="M6 12h12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                {rowError ? (
                  <p className="set-log-error" id={errorId}>
                    {rowError}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        className="ghost set-log-add"
        disabled={card.sets.length >= MAX_SETS}
        aria-label={`Add set to ${label}`}
        onClick={() => onChange((cards) => addSet(cards, card.key))}
      >
        Add set
      </button>
    </div>
  );
}
