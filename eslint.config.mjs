import js from "@eslint/js";
import globals from "globals";
export default [
  { ignores: [".local/**", ".venv/**", "node_modules/**", "dist/**"] },
  js.configs.recommended,
  { rules: { "no-unused-vars": ["error", { args: "none" }] } },
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, status: "off" },
    },
  },
  {
    files: [
      "bootstrap.js",
      "core.js",
      "preview.js",
      "test/host/addon/bootstrap.js",
    ],
    languageOptions: {
      sourceType: "script",
      globals: {
        Zotero: "readonly",
        Services: "readonly",
        Components: "readonly",
        ChromeUtils: "readonly",
        Cu: "readonly",
        CitationCore: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern:
            "^(CitationCore|CitationPreview|startup|shutdown|install|uninstall)$",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
