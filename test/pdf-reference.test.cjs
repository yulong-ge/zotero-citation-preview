const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractNumberedReference, markerNumber } = require("../core.js");
const fixture = require("./rlvr-ref-fixture.json");
test("Kalman-Edit worker discretionary hyphens join wrapped words without joining ordinary lines", () => {
  const lines = [
    "[44] Jascha Sohl-Dickstein, Eric Weiss, Niru Maheswaranathan, and Surya Ganguli. Deep unsuper-",
    "vised learning using nonequilibrium thermodynamics. In International Conference on Machine",
    "Learning, pages 2256–2265, 2015. 1, 2",
    "[45] Jiaming Song. Denoising diffusion implicit models. 2021.",
  ];
  const chars = lines.flatMap((line, row) =>
    [...line].map((c, col) => ({
      c,
      rect: [10 + col * 5, 500 - row * 12, 15 + col * 5, 510 - row * 12],
      lineBreakAfter: col === line.length - 1,
      ignorable: c === "-" && col === line.length - 1,
    })),
  );
  const raw = extractNumberedReference(chars, [10, 510], 44);
  assert.match(raw, /Deep unsupervised learning/);
  assert.match(raw, /Machine Learning/);
  assert.match(raw, /Sohl-Dickstein/);
  assert.doesNotMatch(raw, /Jiaming Song/);
});
test("actual RLVR-World Chinese PDF bibliography geometry returns only DIAMOND [2]", () => {
  const raw = extractNumberedReference(fixture.chars, fixture.point, 2);
  assert.match(raw, /Eloi Alonso/);
  assert.match(raw, /Diffusion for world modeling/);
  assert.match(raw, /2024/);
  assert.doesNotMatch(raw, /Kevin Black|\[3\]|Training diffusion/);
  assert.throws(
    () => extractNumberedReference(fixture.chars, fixture.point, 3),
    /起点/,
  );
  assert.throws(
    () =>
      extractNumberedReference(
        fixture.chars.filter((c) => c.rect[1] > 530),
        fixture.point,
        2,
      ),
    /边界/,
  );
});
test("single source marker required, grouped range does not guess", () => {
  const chars = [
    { c: "2", rect: [0, 0, 2, 5] },
    { c: ",", rect: [2, 0, 3, 5] },
  ];
  assert.equal(markerNumber(chars, [0, 0, 3, 5]), 2);
  assert.throws(
    () =>
      markerNumber([...chars, { c: "7", rect: [3, 0, 4, 5] }], [0, 0, 4, 5]),
    /单一编号/,
  );
});
test("native worker omits space glyphs and uses spaceAfter flags", () => {
  const native = [];
  for (const original of fixture.chars) {
    if (original.c === " ") {
      if (native.length) native[native.length - 1].spaceAfter = true;
    } else native.push({ ...original });
  }
  const raw = extractNumberedReference(native, fixture.point, 2);
  assert.match(raw, /Eloi Alonso, Adam Jelley/);
  assert.match(
    raw,
    /Diffusion for world modeling: Visual details matter in atari/,
  );
  assert.doesNotMatch(raw, /Kevin Black/);
});
test("actual EditHF table citation extracts dotted reference 24 without merging reference 25", () => {
  const f = require("./edithf-ref-fixture.json");
  const raw = extractNumberedReference(f.chars, f.point, 24);
  assert.match(raw, /^24\. Kawar/);
  assert.match(raw, /Imagic: Text-/);
  assert.match(raw, /2023/);
  assert.doesNotMatch(raw, /25\.|Kim, J\.|Reflex/);
  assert.throws(() => extractNumberedReference(f.chars, f.point, 23), /起点/);
  assert.throws(
    () =>
      extractNumberedReference(
        f.chars.filter((c) => c.rect[1] > 440),
        f.point,
        24,
      ),
    /边界/,
  );
});
