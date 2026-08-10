import { useEffect, useState, type FormEvent } from "react";
import type { ApiError, AuthConfig, User } from "@notes/contracts";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Feather,
  LockKeyhole,
} from "lucide-react";
import { api, ApiRequestError } from "../api";

type Mode = "login" | "register";

type AuthScreenProps = {
  onAuthenticated: (user: User) => void;
};

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [registrationMode, setRegistrationMode] =
    useState<AuthConfig["registrationMode"]>("closed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    api
      .authConfig()
      .then((result) => {
        if (active) setRegistrationMode(result.registrationMode);
      })
      .catch(() => {
        if (active) setRegistrationMode("closed");
      });
    return () => {
      active = false;
    };
  }, []);

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result =
        mode === "register"
          ? await api.register({
              name,
              email,
              password,
              ...(registrationMode === "invite" ? { inviteCode } : {}),
            })
          : await api.login({ email, password });
      onAuthenticated(result.user);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.payload);
      } else {
        setError({
          error: "Nije moguće povezati se sa serverom. Pokušajte ponovo.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="O aplikaciji">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>Luma Notes</span>
        </div>

        <div className="story-copy">
          <span className="eyebrow">Vaše misli, bez buke</span>
          <h1>Mirno mesto za sve što ne želite da zaboravite.</h1>
          <p>
            Zapišite ideju, sredite plan i nastavite tamo gde ste stali — sve je
            privatno i automatski sačuvano.
          </p>
          <ul>
            <li>
              <Check size={17} aria-hidden="true" />
              Trenutno automatsko čuvanje
            </li>
            <li>
              <Check size={17} aria-hidden="true" />
              Jednostavno formatiranje teksta
            </li>
            <li>
              <LockKeyhole size={17} aria-hidden="true" />
              Beleške vidljive samo vama
            </li>
          </ul>
        </div>

        <div className="note-sample" aria-hidden="true">
          <div className="sample-topline">
            <span>Danas</span>
            <Feather size={16} />
          </div>
          <strong>Ideje za vikend</strong>
          <p>Jutarnja kafa, duga šetnja i knjiga koju već dugo odlažem.</p>
          <span className="sample-highlight" />
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>Luma Notes</span>
          </div>
          <div className="auth-heading">
            <span className="eyebrow">
              {mode === "login"
                ? "Dobro došli nazad"
                : "Napravite svoj prostor"}
            </span>
            <h2>{mode === "login" ? "Prijavite se" : "Kreirajte nalog"}</h2>
            <p>
              {mode === "login"
                ? "Vaše beleške vas čekaju."
                : "Počnite sa prvom beleškom za manje od minuta."}
            </p>
          </div>

          {registrationMode !== "closed" && (
            <div className="mode-switch" aria-label="Izaberite način pristupa">
              <button
                type="button"
                className={mode === "login" ? "active" : ""}
                onClick={() => changeMode("login")}
              >
                Prijava
              </button>
              <button
                type="button"
                className={mode === "register" ? "active" : ""}
                onClick={() => changeMode("register")}
              >
                Registracija
              </button>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            {mode === "register" && (
              <>
                <label>
                  Ime
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Kako da vas oslovljavamo?"
                    aria-invalid={Boolean(error?.issues?.name)}
                  />
                  {error?.issues?.name && (
                    <span className="field-error">{error.issues.name}</span>
                  )}
                </label>
                {registrationMode === "invite" && (
                  <label>
                    Pozivni kod
                    <input
                      autoComplete="off"
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value)}
                      placeholder="Unesite kod administratora"
                      aria-invalid={Boolean(error?.issues?.inviteCode)}
                    />
                    {error?.issues?.inviteCode && (
                      <span className="field-error">
                        {error.issues.inviteCode}
                      </span>
                    )}
                  </label>
                )}
              </>
            )}

            <label>
              Email adresa
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ime@primer.rs"
                aria-invalid={Boolean(error?.issues?.email)}
              />
              {error?.issues?.email && (
                <span className="field-error">{error.issues.email}</span>
              )}
            </label>

            <label>
              Lozinka
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    mode === "register"
                      ? "Najmanje 8 karaktera"
                      : "Vaša lozinka"
                  }
                  aria-invalid={Boolean(error?.issues?.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={
                    showPassword ? "Sakrij lozinku" : "Prikaži lozinku"
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {error?.issues?.password && (
                <span className="field-error">{error.issues.password}</span>
              )}
            </label>

            {error && !error.issues && (
              <div className="form-error" role="alert">
                {error.error}
              </div>
            )}

            <button className="primary-button" type="submit" disabled={busy}>
              {busy
                ? "Samo trenutak…"
                : mode === "login"
                  ? "Otvori moje beleške"
                  : "Kreiraj nalog"}
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </form>

          {registrationMode !== "closed" && (
            <p className="auth-footnote">
              {mode === "login"
                ? "Imate poziv za pristup?"
                : "Već imate nalog?"}{" "}
              <button
                type="button"
                onClick={() =>
                  changeMode(mode === "login" ? "register" : "login")
                }
              >
                {mode === "login" ? "Registrujte se" : "Prijavite se"}
              </button>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
