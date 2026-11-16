const { test } = require("node:test");
const assert = require("node:assert/strict");
const { environment, reference, tick } = require("./dom-fixture.cjs");
test("same reference reuses metadata cache but never recreates a native popup", async () => {
  const e = environment();
  e.addon.start();
  const first = e.popup({ type: "citation", references: [reference] });
  await tick();
  await tick();
  e.close(first);
  await tick();
  assert.equal(e.doc.querySelector(".view-popup"), null);
  const second = e.popup({ type: "citation", references: [reference] });
  await tick();
  await tick();
  assert.equal(e.urls.length, 1);
  assert.equal(e.addon.metrics.cacheHits, 1);
  assert.match(second.textContent, /Real source abstract fixture/);
  e.addon.stop();
});
test("a rejected metadata match remains an explicit error within the original native popup", async () => {
  const e = environment({
    request: async () => ({
      responseText: JSON.stringify({ message: { items: [] } }),
    }),
  });
  e.addon.start();
  const host = e.popup({ type: "citation", references: [reference] });
  await tick();
  await tick();
  assert.match(host.textContent, /未找到标题、作者、年份及文献载体一致/);
  assert.equal(e.errors.length, 1);
  assert.equal(host.isConnected, true);
  e.addon.stop();
});
test("changing reference cancels the old request; late completion cannot overwrite the selected reference", async () => {
  const pending = [],
    cancelled = [];
  const e = environment({
    request: (method, url, options) =>
      new Promise((resolve) => {
        pending.push(resolve);
        options.cancellerReceiver(() => cancelled.push(url));
      }),
  });
  e.addon.start();
  const second = {
    chars: [
      ..."[3] Kevin Black et al. Diffusion Policy for Robot Learning. 2023.",
    ].map((c) => ({ c })),
  };
  const host = e.popup({ type: "citation", references: [reference, second] });
  await tick();
  host.querySelectorAll(".cp-reference-choice")[1].onclick();
  await tick();
  assert.equal(pending.length, 2);
  assert.equal(cancelled.length, 1);
  pending[0]({ responseText: JSON.stringify({ message: { items: [] } }) });
  await tick();
  e.close(host);
  await tick();
  assert.equal(
    cancelled.length,
    2,
    "late completion must not erase the newer request cancellation handle",
  );
  pending[1]({ responseText: JSON.stringify({ message: { items: [] } }) });
  await tick();
  assert.equal(e.errors.length, 0);
  assert.equal(e.doc.querySelector(".view-popup"), null);
  e.addon.stop();
});
test("seven citations use numbered choices outside one content scroller and fetch only the selected entry", async () => {
  const pending = [],
    cancelled = [];
  const e = environment({
    request: (method, url, options) =>
      new Promise((resolve) => {
        pending.push(resolve);
        options.cancellerReceiver(() => cancelled.push(url));
      }),
  });
  e.addon.start();
  const numbers = [2, 18, 45, 47, 64, 75, 80];
  const refs = numbers.map((n) => ({
    chars: [
      `${n}. Eloi Alonso et al. Diffusion for World Modeling: Visual Details Matter in Atari. 2024.`,
    ].map((c) => ({ c })),
  }));
  const host = e.popup({ type: "citation", references: refs });
  await tick();
  const buttons = host.querySelectorAll(".cp-reference-choice");
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    numbers.map((n) => `[${n}]`),
    "all seven citation numbers must be directly selectable",
  );
  assert.equal(host.querySelector("select"), null);
  assert.equal(pending.length, 1);
  const block = host.querySelector(".cp-native-metadata"),
    scroller = host.querySelector(".cp-content");
  assert.equal(block.getAttribute("data-cp-multiple"), "true");
  assert.equal(scroller.contains(buttons[0]), false);
  buttons[6].onclick();
  await tick();
  assert.equal(pending.length, 2);
  assert.equal(cancelled.length, 1);
  assert.equal(buttons[6].getAttribute("aria-pressed"), "true");
  assert.equal(buttons[0].getAttribute("aria-pressed"), "false");
  assert.match(host.querySelector(".cp-original").textContent, /^80\./);
  e.close(host);
  await tick();
  assert.equal(cancelled.length, 2);
  for (const resolve of pending)
    resolve({ responseText: JSON.stringify({ message: { items: [] } }) });
  await tick();
  assert.equal(e.doc.querySelector(".cp-native-metadata"), null);
  assert.equal(e.errors.length, 0);
  e.addon.stop();
});
test("each of seven choices renders its own paper and preserves the complete set of choices", async () => {
  const numbers = [2, 18, 45, 47, 64, 75, 80],
    title = (n) => `Study ${n} of visual robot learning`;
  const refs = numbers.map((n) => ({
    chars: [...`${n}. Jane Researcher. ${title(n)}. 2024.`].map((c) => ({ c })),
  }));
  const e = environment({
    request: async (method, url) => {
      const n = Number(decodeURIComponent(url).match(/Study (\d+) of/)[1]);
      return {
        responseText: JSON.stringify({
          message: {
            items: [
              {
                title: [title(n)],
                author: [{ family: "Researcher" }],
                published: { "date-parts": [[2024]] },
                DOI: `10.1000/test-${n}`,
                abstract: `Abstract for citation ${n}.`,
                type: "journal-article",
              },
            ],
          },
        }),
      };
    },
  });
  e.addon.start();
  const host = e.popup({ type: "citation", references: refs });
  await tick();
  await tick();
  for (let i = 0; i < numbers.length; i++) {
    const buttons = host.querySelectorAll(".cp-reference-choice");
    assert.equal(buttons.length, 7);
    buttons[i].onclick();
    await tick();
    await tick();
    assert.equal(host.querySelector("h2").textContent, title(numbers[i]));
    assert.match(
      host.textContent,
      new RegExp(`Abstract for citation ${numbers[i]}\\.`),
    );
    assert.match(
      host.querySelector(".cp-original").textContent,
      new RegExp(`^${numbers[i]}\\.`),
    );
    assert.equal(
      buttons.filter((b) => b.getAttribute("aria-pressed") === "true").length,
      1,
    );
  }
  assert.equal(e.urls.length, 7);
  assert.equal(e.errors.length, 0);
  e.addon.stop();
});
