import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { api } from "../api";
import { AuthScreen } from "./AuthScreen";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      authConfig: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.mocked(api.authConfig).mockResolvedValue({ registrationMode: "open" });
});

test("shows registration fields when the server allows registration", async () => {
  const user = userEvent.setup();
  render(<AuthScreen onAuthenticated={vi.fn()} />);

  await user.click(await screen.findByRole("button", { name: "Registracija" }));

  expect(
    screen.getByRole("heading", { name: "Kreirajte nalog" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Ime")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Najmanje 8 karaktera")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
});
