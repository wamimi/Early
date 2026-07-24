import { expect, test } from "@playwright/test";

const routes = ["/", "/proof", "/vault", "/campaigns", "/developers"];

test.describe("Early V2 product surfaces", () => {
  test("explains the public and private proof paths", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Being early used to be a story. Now it's proof.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A fact anyone can check." })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A history nobody can browse." })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Before you prove it." })
    ).toBeVisible();
  });

  test("rejects an invalid X URL before opening the proof console", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByLabel("X post URL").fill("https://x.com/not-a-post");
    await page.getByRole("button", { name: "Create an X proof" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Paste the URL of the original X post.",
      })
    ).toHaveText("Paste the URL of the original X post.");
    await expect(page).toHaveURL("/");
  });

  test("keeps the proof workspace explicit about X requirements", async ({
    page,
  }) => {
    await page.goto("/proof");

    const createProof = page.getByRole("button", { name: "Create proof" });
    await expect(createProof).toBeDisabled();
    await page
      .getByLabel("Original X post")
      .fill("https://x.com/openai/status/1234567890123456789");
    await expect(createProof).toBeEnabled();
    await expect(
      page.getByText(
        "Your account must have liked it and replied to it.",
        { exact: false }
      )
    ).toBeVisible();
  });

  test("renders intentional signed-out vault and campaign states", async ({
    page,
  }) => {
    await page.goto("/vault");
    await expect(
      page.getByRole("heading", {
        name: "Your private discoveries live here.",
      })
    ).toBeVisible();

    await page.goto("/campaigns");
    await expect(
      page.getByRole("heading", {
        name: "Reward the people who arrived early.",
      })
    ).toBeVisible();
    await expect(page.getByText("fetch failed", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(
        /No campaigns are active yet|Campaign listings are temporarily unavailable/,
      )
    ).toBeVisible();
  });

  test("documents the atomic registry and honest trust boundary", async ({
    page,
  }) => {
    await page.goto("/developers");

    await expect(
      page.getByRole("heading", { name: "Build with verified discovery." })
    ).toBeVisible();
    await expect(
      page.getByText("There is no externally callable publish function", {
        exact: false,
      })
    ).toBeVisible();
    await expect(
      page.getByText("Early attestor sees verified plaintext", {
        exact: false,
      })
    ).toBeVisible();
  });
});

test.describe("responsive and accessible motion", () => {
  test("all product routes stay inside the mobile viewport", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile project only.");

    for (const route of routes) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document, `${route} overflows horizontally`).toBeLessThanOrEqual(
        dimensions.viewport
      );
    }
  });

  test("mobile navigation exposes every primary destination", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile project only.");
    await page.goto("/");

    await page.getByRole("button", { name: "Open navigation" }).click();
    const navigation = page.getByRole("navigation", {
      name: "Main navigation",
    });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Vault" })).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: "Developers" })
    ).toBeVisible();
  });

  test("reduced motion removes entrance transforms", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Desktop project only.");
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();

    await page.goto("/");
    const motionState = await page.locator("#how article").evaluateAll((items) =>
      items.map((item) => {
        const style = getComputedStyle(item);
        return { opacity: style.opacity, transform: style.transform };
      })
    );

    expect(motionState).toEqual([
      { opacity: "1", transform: "none" },
      { opacity: "1", transform: "none" },
      { opacity: "1", transform: "none" },
    ]);
    await context.close();
  });
});
