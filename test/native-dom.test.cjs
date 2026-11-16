const { test } = require("node:test");
const assert = require("node:assert/strict");
const { environment, reference, tick } = require("./dom-fixture.cjs");
test("native hit testing, pointer handler, popup delayer, output and selection remain untouched", async () => {
  const e = environment();
  const view = e.view;
  const identities = [
    view._getSelectableOverlay,
    view._handlePointerMove,
    view._onSetOverlayPopup,
    view._overlayPopupDelayer.open,
    view._overlayPopupDelayer.close,
    e.internal._createView,
  ];
  const selected = (view._selectedOverlay = { type: "citation" });
  e.addon.start();
  await tick();
  assert.equal(
    view._getSelectableOverlay,
    identities[0],
    "native hit testing must never be wrapped",
  );
  assert.equal(view._handlePointerMove, identities[1]);
  assert.equal(view._onSetOverlayPopup, identities[2]);
  assert.equal(view._overlayPopupDelayer.open, identities[3]);
  assert.equal(view._overlayPopupDelayer.close, identities[4]);
  assert.equal(e.internal._createView, identities[5]);
  assert.equal(view._selectedOverlay, selected);
  assert.equal(e.doc.querySelector(".cp-card"), null);
  assert.equal(e.doc.querySelector(".cp-toolbar"), null);
  e.addon.stop();
  assert.equal(view._selectedOverlay, selected);
});
test("adds metadata only inside an existing native popup and leaves its native content visible", async () => {
  const e = environment();
  e.addon.start();
  const host = e.popup({ type: "citation", references: [reference] });
  const inner = host.querySelector(".inner");
  await tick();
  await tick();
  assert.equal(e.urls.length, 1);
  assert.match(host.textContent, /Diffusion for World Modeling/);
  assert.match(host.textContent, /Real source abstract fixture/);
  assert.ok(host.querySelector(".cp-native-metadata"));
  assert.equal(inner.isConnected, true);
  assert.equal(host.classList.contains("cp-reference-enhanced"), false);
  assert.equal(e.doc.querySelector(".cp-card"), null);
  e.addon.stop();
  assert.equal(host.isConnected, true);
  assert.equal(inner.isConnected, true);
  assert.equal(host.querySelector(".cp-native-metadata"), null);
});
test("native DOM removal cancels the real HTTP request and late results cannot create or reopen a popup", async () => {
  let complete,
    cancelled = 0;
  const e = environment({
    request: (method, url, options) =>
      new Promise((resolve) => {
        complete = resolve;
        options.cancellerReceiver(() => cancelled++);
      }),
  });
  e.addon.start();
  const host = e.popup({ type: "citation", references: [reference] });
  await tick();
  assert.equal(e.urls.length, 1);
  e.close(host);
  await tick();
  assert.equal(cancelled, 1);
  complete({ responseText: JSON.stringify({ message: { items: [] } }) });
  await tick();
  assert.equal(e.doc.querySelector(".cp-native-metadata"), null);
  assert.equal(e.doc.querySelector(".view-popup"), null);
  assert.equal(e.errors.length, 0);
  e.addon.stop();
});
test("metadata reserves the same bounded height during loading and completion; native reference areas can scroll", async () => {
  let complete;
  const e = environment({
    request: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  e.addon.start();
  const host = e.popup({ type: "citation", references: [reference] });
  await tick();
  const block = host.querySelector(".cp-native-metadata");
  assert.ok(block);
  assert.match(block.textContent, /正在核对/);
  const css = e.doc.head.textContent,
    style = css.match(/\.cp-native-metadata\{([^}]+)\}/)[1];
  assert.match(
    style,
    /(?:^|;)height:min\(300px,40vh\)/,
    "loading must reserve the final metadata height",
  );
  assert.match(
    css,
    /\.citation-popup:has\(> \.cp-native-metadata\),\.reference-popup:has\(> \.cp-native-metadata\)\{[^}]*max-height:calc\(100% - 20px\)[^}]*overflow:auto/,
  );
  complete({ responseText: JSON.stringify({ message: { items: [] } }) });
  await tick();
  assert.equal(host.querySelector(".cp-native-metadata"), block);
  e.addon.stop();
});
