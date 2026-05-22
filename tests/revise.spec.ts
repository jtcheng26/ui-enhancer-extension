import { baseTest, expect } from "./fixtures/base";
import fs from "node:fs/promises";

const testCases = [
  {
    name: "red top bar",
    inputFile: "tests/inputs/test.html",
    prompt: "Make the top bar have a red background",
    outputPrefix: "results/red-top-bar",
  },
  {
    name: "pink top bar",
    inputFile: "tests/inputs/test.html",
    prompt: "Make the top bar have a pink background",
    outputPrefix: "results/pink-top-bar",
  },
];

for (const tc of testCases) {
  baseTest(tc.name, async ({ page }) => {
    await page.goto(tc.inputFile);
    await page.locator("ai-ui-floating-popup").waitFor({ state: "attached" });
    await page.getByTestId("agent-skip-approvals-checkbox").check();
    await page.getByTestId("agent-prompt-input").fill(tc.prompt);
    await page.getByTestId("agent-flow-button").click();
    await expect(page.getByTestId("agent-history")).toContainText(/Hide|Show/, {
      timeout: 120_000,
    });
    await page.getByTestId("ai-ui-close-popup").click();

    const agentLogs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("aui-agent-run-logs") ?? "[]"),
    );

    await fs.mkdir(tc.outputPrefix, {
      recursive: true,
    });

    await fs.writeFile(
      `${tc.outputPrefix}/agent-logs.json`,
      JSON.stringify(agentLogs, null, 2),
      "utf8",
    );

    await page.screenshot({
      path: `${tc.outputPrefix}/final-page.png`,
      fullPage: true,
    });

    const html = await page.evaluate(() => {
      document
        .querySelectorAll("[data-aui-overlay=true]")
        .forEach((e) => e.remove());
      function serializeNode(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent ?? "";
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const element = node as Element;
        const attrs = Array.from(element.attributes)
          .map(
            (attr) => `${attr.name}="${attr.value.replaceAll('"', "&quot;")}"`,
          )
          .join(" ");

        const open = attrs
          ? `<${element.tagName.toLowerCase()} ${attrs}>`
          : `<${element.tagName.toLowerCase()}>`;

        const shadow = element.shadowRoot
          ? `<template shadowrootmode="${element.shadowRoot.mode}">${Array.from(
              element.shadowRoot.childNodes,
            )
              .map(serializeNode)
              .join("")}</template>`
          : "";

        const children = Array.from(element.childNodes)
          .map(serializeNode)
          .join("");

        return `${open}${shadow}${children}</${element.tagName.toLowerCase()}>`;
      }

      return `<!doctype html>\n${serializeNode(document.documentElement)}`;
    });

    await fs.writeFile(`${tc.outputPrefix}/final-page.html`, html, "utf8");
  });
}
