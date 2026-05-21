import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';

export const baseTest = base.extend<{
  context: BrowserContext;
  extensionId: string;
  page: Page;
}>({
  context: async ({}, use) => {
    if (!process.env.OPENAI_API_KEY)
      throw new Error('Must pass OPENAI_API_KEY env var');
    const pathToExtension = path.join('.output', 'chrome-mv3-dev');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    // for local dev
    await context.grantPermissions(['local-network-access']);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto(process.env.PAGE || 'file:///Users/jeff/dev/capstone/src/services/test.html');

    // await page.waitForSelector('#IDToken2');
    // await page.waitForSelector('#IDToken3');

    // await page.fill('#IDToken2', process.env.CANVAS_USERNAME!);
    // await page.fill('#IDToken3', process.env.CANVAS_PASSWORD!);
    // await page.press('#IDToken3', 'Enter');

    // // wait for canvas to load
    // await page.waitForSelector('#dashboard');

    // // wait for bettercampus to load
    // await page.locator('#bettercanvas-theme-preset').waitFor({ state: 'attached' });

    await use(page);
    await page.close();
  },
});
export const expect = baseTest.expect;
