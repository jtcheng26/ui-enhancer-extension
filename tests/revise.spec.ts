import { baseTest, expect } from "./fixtures/base";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const pathPrefix = `file://${CWD}`;
const dataset = "dataset_bad";
const datasetRoot = path.join(CWD, "tests", dataset);

const testCases = fssync
  .readdirSync(datasetRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const name = entry.name;
    const taskPath = path.join(datasetRoot, name, "Task.txt");
    const prompt = fssync.readFileSync(taskPath, "utf8").trim();

    return {
      name,
      inputFile: `${pathPrefix}/tests/${dataset}/${name}/Before/index.html`,
      prompt,
      outputPrefix: `tests/${dataset}/${name}/After`,
    };
  });

for (const tc of testCases) {
  baseTest(tc.name, async ({ page }) => {
    await page.goto(tc.inputFile);
    await page.locator("ai-ui-floating-popup").waitFor({ state: "attached" });
    // up to 3 trials
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("agent-skip-approvals-checkbox").check();
      await page.getByTestId("agent-prompt-input").fill(tc.prompt);
      await page.getByTestId("agent-flow-button").click();

      await expect(page.getByText("Agent is working")).toBeAttached({
        timeout: 60 * 1000,
      });

      await expect(page.getByTestId("agent-history")).toBeVisible({
        timeout: 5 * 60 * 1000,
      });
      try {
        await expect(page.getByTestId("failed-gen")).toBeVisible({
          timeout: 2000,
        });
      } catch {
        break;
      }
    }

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
      path: `${tc.outputPrefix}/screenshot.png`,
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

    await fs.writeFile(`${tc.outputPrefix}/index.html`, html, "utf8");
  });
}
