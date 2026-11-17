const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { DOMParser } = require("linkedom");
const { environment, tick } = require("./dom-fixture.cjs");
const { validate } = require("../core.js");
const atom = fs.readFileSync(
  require.resolve("./host/addon/issue-1-arxiv.xml"),
  "utf8",
);
const raw =
  "[44] Jascha Sohl-Dickstein, Eric Weiss, Niru Maheswaranathan, and Surya Ganguli. Deep unsuper- vised learning using nonequilibrium thermodynamics. In International Conference on Machine Learning, pages 2256–2265, 2015. 1, 2";
const reference = { chars: [...raw].map((c) => ({ c })) };
function setup(response = atom) {
  return environment({
    DOMParser,
    request: async (_method, url) => ({
      responseText: url.startsWith("https://api.crossref.org/")
        ? JSON.stringify({ message: { items: [] } })
        : response,
    }),
  });
}
async function open(e, ref = reference) {
  e.addon.start();
  const host = e.popup({ type: "citation", references: [ref] });
  await tick();
  await tick();
  return host;
}
test("Issue 1: no Crossref match resolves the line-wrapped reference through validated arXiv metadata", async () => {
  const e = setup();
  try {
    const host = await open(e);
    assert.match(host.textContent, /Deep Unsupervised Learning/);
    assert.match(host.textContent, /arXiv · 1503.03585/);
    assert.equal(e.errors.length, 0);
    assert.equal(e.urls.length, 2);
    assert.match(decodeURIComponent(e.urls[1]), /all:unsupervised/);
    assert.match(e.urls[1], /max_results=5/);
  } finally {
    e.addon.stop();
  }
});
test("line-wrap matching retains author hyphens and still rejects the wrong year", () => {
  const work = {
    title: ["Deep Unsupervised Learning using Nonequilibrium Thermodynamics"],
    author: [{ family: "Sohl-Dickstein" }],
    published: { "date-parts": [[2015]] },
  };
  assert.equal(validate(raw, work), true);
  assert.equal(validate(raw.replace("2015", "2025"), work), false);
});
for (const [label, response] of [
  ["wrong year", atom.replace("2015-03", "2025-03")],
  [
    "wrong authors",
    atom.replace(
      /<author>.*?<\/author>/g,
      "<author><name>Unrelated Person</name></author>",
    ),
  ],
  [
    "wrong title",
    atom.replace(
      "Deep Unsupervised Learning using Nonequilibrium Thermodynamics",
      "Different research about unrelated mathematical questions",
    ),
  ],
  [
    "ambiguous records",
    atom.replace(
      "</feed>",
      atom
        .match(/<entry>[\s\S]*?<\/entry>/)[0]
        .replace("1503.03585", "1503.99999") + "</feed>",
    ),
  ],
  [
    "invalid identifier",
    atom.replace(
      "http://arxiv.org/abs/1503.03585v8",
      "https://example.com/abs/1503.03585v8",
    ),
  ],
  [
    "API error entry",
    "<feed><entry><id>http://arxiv.org/api/errors</id><title>Error</title><summary>Invalid query</summary></entry></feed>",
  ],
])
  test(`arXiv search rejects ${label}`, async () => {
    const e = setup(response);
    try {
      const host = await open(e);
      assert.equal(e.urls.length, 2);
      assert.equal(host.querySelector("h2"), null);
      assert.match(host.textContent, /引用查询失败/);
      assert.equal(e.errors.length, 1);
    } finally {
      e.addon.stop();
    }
  });
test("a Crossref transport error does not trigger another service", async () => {
  const e = environment({
    DOMParser,
    request: async () => {
      throw new Error("Crossref unavailable");
    },
  });
  try {
    const host = await open(e);
    assert.match(host.textContent, /Crossref unavailable/);
    assert.equal(e.urls.length, 1);
  } finally {
    e.addon.stop();
  }
});
test("arXiv transport errors remain explicit", async () => {
  const e = environment({
    DOMParser,
    request: async (_method, url) => {
      if (url.includes("arxiv")) throw new Error("arXiv unavailable");
      return { responseText: JSON.stringify({ message: { items: [] } }) };
    },
  });
  try {
    const host = await open(e);
    assert.equal(e.urls.length, 2);
    assert.match(host.textContent, /arXiv unavailable/);
  } finally {
    e.addon.stop();
  }
});
test("explicit arXiv identifier preserves its version and performs no bibliographic search", async () => {
  const e = setup();
  try {
    const host = await open(e, {
      chars: [..."arXiv:1503.03585v8"].map((c) => ({ c })),
    });
    assert.match(host.textContent, /arXiv · 1503.03585v8/);
    assert.deepEqual(e.urls, [
      "https://export.arxiv.org/api/query?id_list=1503.03585v8",
    ]);
  } finally {
    e.addon.stop();
  }
});
test("bibliographic arXiv results are cached across repeated hovers", async () => {
  const e = setup();
  try {
    const first = await open(e);
    e.close(first);
    await tick();
    const second = e.popup({ type: "citation", references: [reference] });
    await tick();
    await tick();
    assert.match(second.textContent, /Deep Unsupervised Learning/);
    assert.equal(e.urls.length, 2);
    assert.equal(e.addon.metrics.cacheHits, 1);
  } finally {
    e.addon.stop();
  }
});
test("closing during arXiv search cancels the second request and discards its late response", async () => {
  let complete,
    cancelled = false;
  const e = environment({
    DOMParser,
    request: async (_method, url, options) => {
      if (url.includes("crossref"))
        return { responseText: JSON.stringify({ message: { items: [] } }) };
      options.cancellerReceiver(() => {
        cancelled = true;
      });
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  try {
    const host = await open(e);
    assert.equal(e.urls.length, 2);
    e.close(host);
    await tick();
    assert.equal(cancelled, true);
    complete({ responseText: atom });
    await tick();
    await tick();
    assert.equal(e.doc.querySelector(".view-popup"), null);
    assert.equal(e.errors.length, 0);
  } finally {
    e.addon.stop();
  }
});
test("an explicit DOI mismatch does not become an arXiv title search", async () => {
  const e = environment({
    DOMParser,
    request: async () => ({
      responseText: JSON.stringify({ message: { DOI: "10.1000/wrong" } }),
    }),
  });
  try {
    const host = await open(e, {
      chars: [...(raw + " DOI:10.1000/example")].map((c) => ({ c })),
    });
    assert.match(host.textContent, /引用查询失败/);
    assert.equal(e.urls.length, 1);
  } finally {
    e.addon.stop();
  }
});
