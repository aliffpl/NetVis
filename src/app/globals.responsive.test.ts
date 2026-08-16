import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "vitest";

const cssPath = new URL("./globals.css", import.meta.url);
const pagePath = new URL("./page.tsx", import.meta.url);

test("responsive layout rules cover desktop, tablet, and mobile controls", async () => {
  const css = await readFile(cssPath, "utf8");
  const page = await readFile(pagePath, "utf8");

  assert.equal((page.match(/header-select-control h-7 w-\[1[34]0px\]/g) ?? []).length, 3);
  assert.equal((css.match(/@media \(max-width: 1180px\)/g) ?? []).length, 1);
  assert.match(css, /\.app-header \.header-select-control \{ width: 112px; \}/);
  assert.equal((css.match(/@media \(max-width: 820px\)/g) ?? []).length, 1);
  assert.match(css, /\.app-layout \{ overflow-y: auto; flex-direction: column; \}/);
  assert.doesNotMatch(css, /w-\\\[140px\]/);
});

