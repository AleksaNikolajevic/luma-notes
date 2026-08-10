import { expect, test } from "@playwright/test";

test("user can register, create, find and reopen an autosaved note", async ({
  page,
}) => {
  const email = `portfolio-${Date.now()}@notes.test`;
  const password = "correct-horse-battery-staple";
  const title = "Plan za portfolio intervju";
  const content = "Pripremiti arhitekturu, testove i kratku tehničku odbranu.";

  await page.goto("/");
  await page.getByRole("button", { name: "Registracija" }).click();
  await page.getByLabel("Ime").fill("Portfolio tester");
  await page.getByLabel("Email adresa").fill(email);
  await page.getByPlaceholder("Najmanje 8 karaktera").fill(password);
  await page.getByRole("button", { name: "Kreiraj nalog" }).click();

  await expect(page.getByRole("heading", { name: "Beleške" })).toBeVisible();
  await page.getByTestId("new-note").click();
  await page.getByLabel("Naslov beleške").fill(title);
  await page.getByTestId("note-editor").fill(content);
  await expect(page.getByText("Sačuvano", { exact: true })).toBeVisible({
    timeout: 5_000,
  });

  await page.getByLabel("Pretraži beleške").fill("portfolio intervju");
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await expect(page.getByLabel("Naslov beleške")).toHaveValue(title);
  await expect(page.getByTestId("note-editor")).toContainText(content);

  await page.getByRole("button", { name: "Odjavi se" }).click();
  await page.getByLabel("Email adresa").fill(email);
  await page.getByPlaceholder("Vaša lozinka").fill(password);
  await page.getByRole("button", { name: "Otvori moje beleške" }).click();

  await expect(page.getByLabel("Naslov beleške")).toHaveValue(title);
  await expect(page.getByTestId("note-editor")).toContainText(content);
});
