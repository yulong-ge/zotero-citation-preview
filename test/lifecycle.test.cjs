const { test } = require("node:test");
const assert = require("node:assert/strict");
const { environment, reference, tick } = require("./dom-fixture.cjs");
test("native view replacement is observed without wrapping createView or retaining obsolete view hooks", async () => {
  const e = environment();
  e.addon.start();
  const first = e.popup({ type: "citation", references: [reference] });
  await tick();
  await tick();
  e.close(first);
  const original = e.internal._createView;
  e.internal._primaryView = {
    _onSetOverlayPopup() {},
    _getSelectableOverlay() {},
  };
  const output = e.internal._primaryView._onSetOverlayPopup;
  const second = e.popup({ type: "citation", references: [reference] });
  await tick();
  await tick();
  assert.ok(second.querySelector(".cp-native-metadata"));
  assert.equal(e.internal._createView, original);
  assert.equal(e.internal._primaryView._onSetOverlayPopup, output);
  assert.equal(e.urls.length, 1);
  e.addon.stop();
});
test("reader DOM replacement disconnects the old observer and cleans only plugin-owned content", async () => {
  const e = environment();
  e.addon.start();
  const oldHost = e.popup({ type: "reference", references: [reference] });
  await tick();
  await tick();
  const other = environment();
  e.reader._iframeWindow.document = other.doc;
  e.Zotero.Reader.listener({ reader: e.reader, doc: other.doc });
  await tick();
  assert.equal(oldHost.isConnected, true);
  assert.equal(oldHost.querySelector(".cp-native-metadata"), null);
  assert.equal(e.observers.size, 0);
  assert.equal(other.observers.size, 1);
  e.addon.stop();
  assert.equal(other.observers.size, 0);
});
test("no polling or new requests occur when unrelated reader DOM changes", async () => {
  const e = environment();
  e.addon.start();
  for (let i = 0; i < 100; i++) {
    const node = e.doc.createElement("span");
    e.doc.body.append(node);
    node.remove();
  }
  await tick();
  assert.equal(e.urls.length, 0);
  assert.equal(e.addon.metrics.pdfPageReads, 0);
  assert.equal(e.addon.debugHooks()[0].activePopups, 0);
  e.addon.stop();
  assert.equal(e.observers.size, 0);
});
test("new-reader waived event document is normalized to the same privileged DOM used for existing readers", async () => {
  const e = environment();
  let waivedConstructors = 0,
    normalized = 0;
  const plainClone = e.Cu.cloneInto;
  const waivedWindow = {
    ...e.win,
    MutationObserver: class extends e.win.MutationObserver {
      constructor(callback) {
        super(callback);
        waivedConstructors++;
      }
      observe(target, options) {
        throw new TypeError(
          "MutationObserver.observe: One of 'childList', 'attributes', 'characterData' must not be false.",
        );
      }
    },
  };
  const waivedDoc = Object.create(e.doc);
  waivedDoc.defaultView = waivedWindow;
  e.Cu.unwaiveXrays = (value) => {
    if (value === waivedDoc) {
      normalized++;
      return e.doc;
    }
    return value;
  };
  e.Zotero.Reader._readers = [];
  e.addon.start();
  assert.equal(e.addon.debugHooks().length, 0);
  assert.doesNotThrow(
    () => e.Zotero.Reader.listener({ reader: e.reader, doc: waivedDoc }),
    "event doc must not construct a content-realm observer with opaque privileged options",
  );
  await tick();
  assert.ok(normalized > 0);
  assert.equal(waivedConstructors, 0);
  assert.equal(e.addon.debugHooks()[0].observedDocument, true);
  assert.equal(e.observers.size, 1);
  const host = e.popup({ type: "citation", references: [reference] });
  await tick();
  await tick();
  assert.match(host.textContent, /Real source abstract fixture/);
  e.Zotero.Reader.listener({ reader: e.reader, doc: e.doc });
  await tick();
  assert.equal(
    e.observers.size,
    1,
    "ordinary and waived entry paths share one observer",
  );
  e.addon.stop();
  assert.equal(e.observers.size, 0);
  assert.equal(
    e.Cu.cloneInto,
    plainClone,
    "DOM normalization does not change the PDF worker parameter boundary",
  );
});
