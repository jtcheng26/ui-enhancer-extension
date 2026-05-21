import { baseTest, expect } from "./fixtures/base";

baseTest("has title", async ({ page }) => {
  await expect(page).toHaveTitle("Forest Sound");
  await page.locator("ai-ui-floating-popup").waitFor({ state: "attached" });
});
