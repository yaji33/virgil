import { expect, test, type Page } from "@playwright/test";

async function createDraft(
  page: Page,
  amount = "250",
  title = "My BTC purchase",
): Promise<void> {
  await page.getByRole("button", { name: "Create your first plan" }).click();
  await page.getByLabel("Plan name").fill(title);
  await page.getByLabel("Amount in USDT").fill(amount);
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
}

test("create, approve, revise, and approve the new terms", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.screenshot({
    path: "test-results/overview-empty.png",
    fullPage: true,
  });
  await createDraft(page);
  await page.getByRole("button", { name: "Review this plan" }).click();
  await page
    .getByRole("button", { name: "Approve purchase of 250 USDT of BTC" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Terms approved. You’re in control." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Amount in USDT").fill("200");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(
    page.getByRole("heading", { name: "Terms approved. You’re in control." }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Review this plan" }).click();
  await page
    .getByRole("button", { name: "Approve purchase of 200 USDT of BTC" })
    .click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Terms revised. Previous approval cleared.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("conflict blocks approval and resizing requires another review", async ({
  page,
}) => {
  await page.goto("/");
  await createDraft(page);
  await page.getByRole("switch", { name: "Simulate capital conflict" }).click();
  await expect(
    page.getByText("SIMULATED CAPITAL CONFLICT", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review this plan" }).click();
  await expect(
    page.getByRole("button", { name: "Approve purchase of 250 USDT of BTC" }),
  ).toBeDisabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/conflict-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use 150 USDT", exact: true }).click();
  await page.getByRole("button", { name: "Review this plan" }).click();
  await page
    .getByRole("button", { name: "Approve purchase of 150 USDT of BTC" })
    .click();
  await expect(
    page.getByText("No order submitted", { exact: true }),
  ).toBeVisible();
});

test("validates input and safely renders titles", async ({ page }) => {
  await page.goto("/");
  await createDraft(page, "0", "<img src=x onerror=alert(1)>");
  await expect(page.getByRole("alert")).toContainText(
    "positive decimal amount",
  );
  await page.getByLabel("Amount in USDT").fill("0.000000000000000001");
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "<img src=x onerror=alert(1)>" }),
  ).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
});

test("snapshot examples block approval and stay labelled", async ({ page }) => {
  await page.goto("/");
  await createDraft(page);
  await page.getByRole("button", { name: "Review this plan" }).click();
  await page.getByLabel("Explore a labelled account snapshot").selectOption("disconnected");
  await expect(page.getByRole("heading", { name: "Disconnected" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve purchase of 250 USDT of BTC" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/snapshot-disconnected.png",
    fullPage: true,
  });
  await page.getByLabel("Explore a labelled account snapshot").selectOption("current");
  await page
    .getByRole("button", { name: "Approve purchase of 250 USDT of BTC" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Terms approved. You’re in control." }),
  ).toBeVisible();
});

test("execution examples and attention stay separate from approval", async ({
  page,
}) => {
  await page.goto("/");
  await createDraft(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "test-results/overview-attention.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Ready to review when you are/ }).click();
  await expect(page.getByRole("heading", { name: "Intentions with structure." })).toBeVisible();
  await page.getByRole("button", { name: "Review this plan" }).click();
  await page
    .getByRole("button", { name: "Approve purchase of 250 USDT of BTC" })
    .click();
  await page
    .getByLabel("Explore a labelled execution example")
    .selectOption("receipt");
  await expect(page.getByText("LABELLED EXECUTION EXAMPLE").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Example verified receipt" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/receipt-example.png",
    fullPage: true,
  });
  await expect(
    page.getByText("No order submitted", { exact: true }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Simulate capital conflict" }).click();
  await expect(
    page.getByLabel("Example integration plan"),
  ).toContainText("Example strategy");
});

test("mobile review layout and keyboard dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first plan" }).click();
  await expect(page.getByLabel("Plan name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await createDraft(page);
  await page.getByRole("button", { name: "Review this plan" }).click();
  await expect(
    page.getByRole("button", { name: "Approve purchase of 250 USDT of BTC" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/review-mobile.png",
    fullPage: true,
  });
});
