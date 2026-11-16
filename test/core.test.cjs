const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validate, referenceText, invertedAbstract } = require("../core.js");
const work = {
  title: ["Attention is all you need"],
  author: [{ family: "Vaswani" }],
  published: { "date-parts": [[2017]] },
};
test("matches title author year, not metadata rank", () => {
  assert.equal(
    validate("Vaswani et al. Attention is all you need. 2017.", work),
    true,
  );
  assert.equal(
    validate("Smith. Attention is all you need. 2017.", work),
    false,
  );
  assert.equal(
    validate("Vaswani. Attention is all you need. 2024.", work),
    false,
  );
  assert.equal(validate("Vaswani. Attention is all you need.", work), false);
  assert.equal(
    validate("Vaswani. Attention is all you need. 2017.", {
      ...work,
      published: undefined,
    }),
    false,
  );
  assert.equal(
    validate("Vaswani 2017 Something completely different", work),
    false,
  );
});
test("does not guess short titles", () =>
  assert.equal(
    validate("Vaswani. BERT. 2017.", { ...work, title: ["BERT"] }),
    false,
  ));
test("preserves reference char boundaries and skips ignored chars", () =>
  assert.equal(
    referenceText({
      chars: [
        { c: "One", spaceAfter: true },
        { c: "ignored", ignorable: true },
        { c: "two", lineBreakAfter: true },
        { c: "three" },
      ],
    }),
    "One two three",
  ));
test("reconstructs published OpenAlex abstract in indexed order", () =>
  assert.equal(
    invertedAbstract({ Hello: [0, 2], world: [1] }),
    "Hello world Hello",
  ));
test("explicit MIT Press book cannot resolve to a same-title IEEE journal record", () => {
  const raw =
    "Richard S Sutton, Andrew G Barto, et al. Reinforcement learning: An introduction. MIT press Cambridge, 1998.";
  const record = {
    title: ["Reinforcement Learning: An Introduction"],
    author: [{ family: "Sutton" }, { family: "Barto" }],
    published: { "date-parts": [[1998]] },
    type: "journal-article",
    publisher: "Institute of Electrical and Electronics Engineers (IEEE)",
  };
  assert.equal(validate(raw, record), false);
  assert.equal(
    validate(raw, { ...record, type: "book", publisher: "The MIT Press" }),
    true,
  );
  assert.equal(
    validate(raw, {
      ...record,
      type: "book",
      publisher: "Oxford University Press",
    }),
    false,
  );
  assert.equal(
    validate(raw, { ...record, type: "book", publisher: undefined }),
    false,
  );
});
test("publisher Press in a conference article does not make it a book", () => {
  const record = {
    title: ["A practical learning method"],
    author: [{ family: "Sutton" }],
    published: { "date-parts": [[1998]] },
    type: "proceedings-article",
    publisher: "MIT Press",
  };
  assert.equal(
    validate(
      "Sutton. A practical learning method. In Advances in Neural Information Processing Systems. MIT Press, 1998.",
      record,
    ),
    true,
  );
});
test("DIAMOND conference record remains compatible", () => {
  const raw =
    "Eloi Alonso et al. Diffusion for world modeling: Visual details matter in atari. In NeurIPS, 2024.";
  assert.equal(
    validate(raw, {
      title: ["Diffusion for World Modeling: Visual Details Matter in Atari"],
      author: [{ family: "Alonso" }],
      published: { "date-parts": [[2024]] },
      type: "proceedings-article",
      publisher: "Curran Associates, Inc.",
    }),
    true,
  );
});
