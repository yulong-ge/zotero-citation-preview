const { test } = require("node:test");
const assert = require("node:assert/strict");
const { environment, tick } = require("./dom-fixture.cjs");
const title = (n) => `Study ${n} of visual robot learning`;
const ref = (n) => ({
  chars: [...`${n}. Jane Researcher. ${title(n)}. 2024.`].map((c) => ({ c })),
});
const response = (n) => ({
  responseText: JSON.stringify({
    message: {
      items: [
        {
          title: [title(n)],
          author: [{ family: "Researcher" }],
          published: { "date-parts": [[2024]] },
          DOI: `10.1000/test-${n}`,
          abstract: `Abstract for ${n}.`,
          type: "journal-article",
        },
      ],
    },
  }),
});
function fixture() {
  const pending = [],
    cancelled = [];
  const e = environment({
    request: (_method, url, options) =>
      new Promise((resolve, reject) => {
        const number = Number(
          decodeURIComponent(url).match(/Study (\d+) of/)[1],
        );
        pending.push({
          number,
          resolve: () => resolve(response(number)),
          reject,
        });
        options.cancellerReceiver(() => cancelled.push(number));
      }),
  });
  e.addon.start();
  return { e, pending, cancelled };
}
test("opening a group preloads unselected entries with bounded concurrency and reuses in-flight work", async (t) => {
  const { e, pending } = fixture();
  t.after(() => e.addon.stop());
  const host = e.popup({
    type: "citation",
    references: [ref(2), ref(18), ref(45)],
  });
  await tick();
  assert.deepEqual(
    pending.map((x) => x.number),
    [2, 18],
    "first hover must start the selected paper and one prefetch",
  );
  pending[1].resolve();
  await tick();
  await tick();
  assert.deepEqual(
    pending.map((x) => x.number),
    [2, 18, 45],
  );
  host.querySelectorAll(".cp-reference-choice")[2].onclick();
  await tick();
  assert.equal(
    pending.length,
    3,
    "selecting an in-flight prefetch must not duplicate its request",
  );
  pending[2].resolve();
  await tick();
  await tick();
  assert.equal(host.querySelector("h2").textContent, title(45));
  pending[0].resolve();
  await tick();
  assert.equal(host.querySelector("h2").textContent, title(45));
});
test("a completed prefetch switches without another network request", async (t) => {
  const { e, pending } = fixture();
  t.after(() => e.addon.stop());
  const host = e.popup({ type: "citation", references: [ref(2), ref(18)] });
  await tick();
  assert.equal(pending.length, 2);
  pending[0].resolve();
  pending[1].resolve();
  await tick();
  await tick();
  host.querySelectorAll(".cp-reference-choice")[1].onclick();
  await tick();
  assert.equal(host.querySelector("h2").textContent, title(18));
  assert.equal(e.urls.length, 2);
});
test("a selected queued paper takes priority over the previous foreground request", async (t) => {
  const { e, pending, cancelled } = fixture();
  t.after(() => e.addon.stop());
  const host = e.popup({
    type: "citation",
    references: [ref(2), ref(18), ref(45), ref(64)],
  });
  await tick();
  assert.equal(pending.length, 2);
  host.querySelectorAll(".cp-reference-choice")[3].onclick();
  await tick();
  assert.deepEqual(cancelled, [2]);
  assert.deepEqual(
    pending.map((x) => x.number),
    [2, 18, 64],
  );
  pending[2].resolve();
  await tick();
  assert.equal(host.querySelector("h2").textContent, title(64));
});
test("closing cancels foreground and prefetch, prevents queued work and rejects late cache writes", async (t) => {
  const { e, pending, cancelled } = fixture();
  t.after(() => e.addon.stop());
  const refs = [ref(2), ref(18), ref(45)];
  const host = e.popup({ type: "citation", references: refs });
  await tick();
  assert.equal(pending.length, 2);
  e.close(host);
  await tick();
  assert.deepEqual(
    cancelled.sort((a, b) => a - b),
    [2, 18],
  );
  pending[0].resolve();
  pending[1].resolve();
  await tick();
  await tick();
  assert.equal(pending.length, 2);
  assert.equal(e.errors.length, 0);
  e.popup({ type: "citation", references: refs });
  await tick();
  assert.equal(
    pending.length,
    4,
    "cancelled responses must not populate the cache",
  );
});
test("prefetch failures stay explicit without replacing a successful selected paper or retrying automatically", async (t) => {
  const { e, pending } = fixture();
  t.after(() => e.addon.stop());
  const host = e.popup({ type: "citation", references: [ref(2), ref(18)] });
  await tick();
  assert.equal(pending.length, 2);
  pending[0].resolve();
  pending[1].reject(new Error("provider unavailable"));
  await tick();
  await tick();
  assert.equal(host.querySelector("h2").textContent, title(2));
  const button = host.querySelectorAll(".cp-reference-choice")[1];
  assert.equal(button.getAttribute("data-cp-status"), "error");
  assert.match(button.title, /provider unavailable/);
  button.onclick();
  await tick();
  assert.match(
    host.querySelector(".cp-content").textContent,
    /引用查询失败：provider unavailable/,
  );
  assert.equal(e.errors.length, 1);
  assert.equal(pending.length, 2);
});
test("duplicate bibliography text shares one request and disabling cancels background work", async () => {
  const { e, pending, cancelled } = fixture();
  e.popup({ type: "citation", references: [ref(2), ref(2), ref(18)] });
  await tick();
  assert.deepEqual(
    pending.map((x) => x.number),
    [2, 18],
  );
  e.addon.stop();
  assert.deepEqual(
    cancelled.sort((a, b) => a - b),
    [2, 18],
  );
  for (const item of pending) item.resolve();
  await tick();
  assert.equal(e.doc.querySelector(".cp-native-metadata"), null);
  assert.equal(e.errors.length, 0);
});
test("switching duplicate reference choices retains the shared lookup deadline", async (t) => {
  const { e, pending, cancelled } = fixture();
  t.after(() => e.addon.stop());
  const timers = new Map();
  let serial = 0;
  e.win.setTimeout = (fn) => {
    timers.set(++serial, fn);
    return serial;
  };
  e.win.clearTimeout = (id) => timers.delete(id);
  const host = e.popup({ type: "citation", references: [ref(2), ref(2)] });
  await tick();
  assert.equal(timers.size, 1);
  host.querySelectorAll(".cp-reference-choice")[1].onclick();
  await tick();
  assert.equal(timers.size, 1, "reusing a lookup must not remove its timeout");
  for (const fn of timers.values()) fn();
  assert.deepEqual(cancelled, [2]);
  pending[0].reject(new Error("transport cancelled"));
  await tick();
  assert.match(host.textContent, /查询超时/);
  assert.equal(e.urls.length, 1);
  assert.equal(timers.size, 0);
});
