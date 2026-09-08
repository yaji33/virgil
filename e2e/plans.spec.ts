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
  await page.getByText("Revision and approval history").click();
  await expect(page.getByText("Revision 1: Terms approved")).toBeVisible();
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

test("an unresolved order can be reconciled after the plan is revised", async ({ page }) => {
  await page.goto("/");
  await createDraft(page);
  await page.getByRole("button", { name: "Review this plan" }).click();
  await page.getByRole("button", { name: "Approve purchase of 250 USDT of BTC" }).click();
  await page.getByRole("button", { name: "Submit purchase of 250 USDT of BTC" }).click();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Amount in USDT").fill("200");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(page.getByRole("button", { name: "Reconcile order" })).toBeVisible();
  await page.getByText("Revision and approval history").click();
  await expect(
    page.locator(".history-list li").filter({ hasText: "Revision 1: Terms approved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reconcile order" }).click();
  await expect(page.getByRole("heading", { name: "Verified demo receipt." })).toBeVisible();
  await expect(page.getByText("250 USDT filled for revision 1.")).toBeVisible();
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

test("submit and reconcile stay separate from approval", async ({
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
  await expect(
    page.getByText("No order submitted", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit purchase of 250 USDT of BTC" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Awaiting reconciliation." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reconcile order" }).click();
  await expect(
    page.getByRole("heading", { name: "Verified demo receipt." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/receipt-example.png",
    fullPage: true,
  });
  await expect(
    page.getByText("No order submitted", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("switch", { name: "Simulate capital conflict" }).click();
  await expect(
    page.getByLabel("Example integration plan"),
  ).toContainText("Example strategy");
});

test("plans survive reload for the signed-in workspace", async ({ page }) => {
  await page.goto("/");
  await createDraft(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My BTC purchase" }),
  ).toBeVisible();
  await expect(page.getByText("Draft created.", { exact: true })).toBeVisible();
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

test("shows configured OAuth providers when the hosted session is missing", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }),
  }));
  await page.route("**/api/auth/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
      providers: ["google", "github"],
    }),
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Continue to Virgil." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByText("Local demo mode remains account-free.")).toBeVisible();
});
