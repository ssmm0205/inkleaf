import { test, expect } from "@playwright/test";

test("a Claude-style write appears live in the notebook and animates", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Inkleaf");

  // The page must be connected to the live stream for the magic moment to work.
  await expect(page.locator(".status.on")).toBeVisible();

  // Simulate Claude writing into the notebook from outside the page — exactly
  // what the MCP server does on the agent's behalf (same REST endpoint).
  const text = `매직 모먼트 ${Date.now()}`;
  const res = await request.post("/api/blocks", {
    data: { type: "todo", text },
  });
  expect(res.ok()).toBeTruthy();

  // It should appear on the open page with no reload...
  const block = page.locator(".block", { hasText: text });
  await expect(block).toBeVisible();

  // ...and it should be playing the handwriting (mask-reveal) animation.
  await expect(block.locator(".ink")).toHaveClass(/handwrite/, { timeout: 1500 });

  // And its checkbox is interactive: clicking it checks the todo.
  await block.locator(".checkbox").click();
  await expect(block).toHaveClass(/done/);
});
