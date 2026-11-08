/**
 * Pins the end-of-rest alert (roadmap B6): the beep plays only once a tap has
 * unlocked the audio, and only where there is an AudioContext; the buzz only
 * where there is navigator.vibrate. Each test loads the module afresh, since it
 * keeps its one AudioContext for the page's life.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let restAlert;
let contexts;

/** An AudioContext that records what is played through it. */
class FakeAudioContext {
  state = "running";
  currentTime = 10;
  destination = { node: "destination" };
  oscillators = [];
  resume = vi.fn(() => Promise.resolve());

  constructor() {
    contexts.push(this);
  }

  createOscillator() {
    const oscillator = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    return { gain: { value: 1 }, connect: vi.fn() };
  }
}

beforeEach(async () => {
  contexts = [];
  vi.resetModules();
  restAlert = await import("../restAlert");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete navigator.vibrate;
});

describe("restAlert", () => {
  test("beep plays nothing until a tap unlocks the audio", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    restAlert.beep();

    expect(contexts).toHaveLength(0);
  });

  test("once unlocked, beep plays 880 Hz for 0.2 seconds", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    restAlert.unlockAudio();
    restAlert.beep();

    const [context] = contexts;
    const [oscillator] = context.oscillators;
    expect(oscillator.frequency.value).toBe(880);
    expect(oscillator.connect).toHaveBeenCalledTimes(1);
    const gain = oscillator.connect.mock.calls[0][0];
    expect(gain.gain.value).toBeLessThan(1);
    expect(gain.connect).toHaveBeenCalledWith(context.destination);
    expect(oscillator.start).toHaveBeenCalledTimes(1);
    expect(oscillator.stop).toHaveBeenCalledWith(10.2);
  });

  test("unlocking again keeps the one context, and resumes it when suspended", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);

    restAlert.unlockAudio();
    const [context] = contexts;
    expect(context.resume).not.toHaveBeenCalled();
    context.state = "suspended";
    restAlert.unlockAudio();

    expect(contexts).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  test("a resume the browser refuses is ignored", async () => {
    class Suspended extends FakeAudioContext {
      state = "suspended";
      resume = vi.fn(() => Promise.reject(new Error("not allowed")));
    }
    vi.stubGlobal("AudioContext", Suspended);

    restAlert.unlockAudio();
    await Promise.resolve();

    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
  });

  test("without an AudioContext, unlocking and beeping do nothing", () => {
    vi.stubGlobal("AudioContext", undefined);

    expect(() => {
      restAlert.unlockAudio();
      restAlert.beep();
    }).not.toThrow();
  });

  test("a context the browser refuses to make leaves the beep silent", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("NotSupportedError");
        }
      }
    );

    expect(() => {
      restAlert.unlockAudio();
      restAlert.beep();
    }).not.toThrow();
  });

  test("buzz vibrates twice where the browser can", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });

    restAlert.buzz();

    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
  });

  test("buzz does nothing where the browser cannot vibrate", () => {
    expect(() => restAlert.buzz()).not.toThrow();
  });
});
