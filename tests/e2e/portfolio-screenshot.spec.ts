import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.skip(
  !process.env.CAPTURE_PORTFOLIO_SCREENSHOT,
  "Manual portfolio asset generation.",
);

test("capture the real authenticated workspace", async ({ page }) => {
  const email = "demo@luma.local";

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Registracija" }).click();
  await page.getByLabel("Ime").fill("Aleksa");
  await page.getByLabel("Email adresa").fill(email);
  await page
    .getByPlaceholder("Najmanje 8 karaktera")
    .fill("portfolio-screenshot-only");
  await page.getByRole("button", { name: "Kreiraj nalog" }).click();

  const notes = [
    {
      title: "Priprema za tehnički intervju",
      content:
        "Proći kroz arhitekturu, trade-off odluke i demonstrirati kompletan korisnički tok.",
    },
    {
      title: "Ideje za novi feature",
      content:
        "Offline draft, bolja pretraga i opcioni MFA za javne self-hosted instance.",
    },
    {
      title: "Plan za ovu nedelju",
      content:
        "Završiti E2E testove, proveriti Docker image i pripremiti kratak demo.",
    },
  ];

  for (const note of notes) {
    await page.getByTestId("new-note").click();
    await page.getByLabel("Naslov beleške").fill(note.title);
    await page.getByTestId("note-editor").fill(note.content);
    await expect(
      page.getByRole("button", { name: new RegExp(note.title) }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Sačuvano", { exact: true })).toBeVisible({
      timeout: 5_000,
    });
  }

  await page.getByRole("button", { name: "Zakači belešku" }).click();
  await expect(page.getByText("Sačuvano", { exact: true })).toBeVisible({
    timeout: 5_000,
  });

  const screenshotDirectory = path.resolve("docs/screenshots");
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, "notes-workspace.png"),
    fullPage: true,
  });
});
