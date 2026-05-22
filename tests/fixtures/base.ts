import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "path";

export const baseTest = base.extend<{
  context: BrowserContext;
  extensionId: string;
  page: Page;
}>({
  context: async ({}, use) => {
    const pathToExtension = path.join(".output", "chrome-mv3-dev");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    // for local dev
    await context.grantPermissions(["local-network-access"]);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker)
      serviceWorker = await context.waitForEvent("serviceworker");
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();

    await use(page);
    await page.close();
  },
});
export const expect = baseTest.expect;
