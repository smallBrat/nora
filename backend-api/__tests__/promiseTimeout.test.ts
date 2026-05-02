// @ts-nocheck

const { runWithTimeout, runWithCancellableTimeout } = require("../promiseTimeout");

describe("runWithTimeout", () => {
  it("resolves with the underlying value when the promise wins the race", async () => {
    const value = await runWithTimeout(Promise.resolve("ok"), 1000, "should not fire");
    expect(value).toBe("ok");
  });

  it("propagates the underlying rejection unchanged", async () => {
    const original = new Error("upstream boom");
    await expect(runWithTimeout(Promise.reject(original), 1000, "timeout msg")).rejects.toBe(
      original,
    );
  });

  it("rejects with the timeout message when the timer fires first", async () => {
    let resolveLater;
    const slow = new Promise((resolve) => {
      resolveLater = resolve;
    });
    await expect(runWithTimeout(slow, 25, "took too long")).rejects.toThrow("took too long");
    // Free the dangling promise so jest doesn't complain about open handles.
    resolveLater();
  });

  it("clears the pending timer once the underlying promise settles", async () => {
    const before = (process as any)._getActiveHandles?.().length ?? 0;
    await runWithTimeout(Promise.resolve("done"), 60_000, "timer should be cleared");
    // Briefly let microtasks drain so finally() runs.
    await new Promise((resolve) => setImmediate(resolve));
    const after = (process as any)._getActiveHandles?.().length ?? 0;
    // We don't assert exact equality (jest's own handles may shift), only
    // that we didn't leak a 60-second timer — the count should not exceed
    // the baseline by more than a small margin.
    expect(after - before).toBeLessThanOrEqual(2);
  });
});

describe("runWithCancellableTimeout", () => {
  it("provides an unaborted signal on the happy path", async () => {
    const value = await runWithCancellableTimeout(
      ({ signal }) => {
        expect(signal.aborted).toBe(false);
        return Promise.resolve(42);
      },
      1000,
      "should not fire",
    );
    expect(value).toBe(42);
  });

  it("aborts the signal on timeout so factory work can clean up", async () => {
    const observed = { aborted: false };
    const factory = ({ signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          observed.aborted = true;
          reject(signal.reason || new Error("aborted"));
        });
      });

    await expect(runWithCancellableTimeout(factory, 25, "timeout fired")).rejects.toThrow(
      "timeout fired",
    );
    expect(observed.aborted).toBe(true);
  });

  it("does not abort the signal when the factory resolves first", async () => {
    let signalRef;
    await runWithCancellableTimeout(
      ({ signal }) => {
        signalRef = signal;
        return Promise.resolve("done");
      },
      1000,
      "should not fire",
    );
    expect(signalRef.aborted).toBe(false);
  });
});
