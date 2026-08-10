import { lazy, Suspense, useEffect, useState } from "react";
import type { User } from "@notes/contracts";
import { AuthScreen } from "./components/AuthScreen";
import { api, ApiRequestError } from "./api";

const NotesWorkspace = lazy(async () => {
  const module = await import("./components/NotesWorkspace");
  return { default: module.NotesWorkspace };
});

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: User };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    api
      .me()
      .then(({ user }) => {
        if (active) setAuth({ status: "authenticated", user });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          setAuth({ status: "anonymous" });
          return;
        }
        setAuth({ status: "anonymous" });
      });

    return () => {
      active = false;
    };
  }, []);

  if (auth.status === "loading") {
    return <LoadingScreen />;
  }

  if (auth.status === "anonymous") {
    return (
      <AuthScreen
        onAuthenticated={(user) => setAuth({ status: "authenticated", user })}
      />
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <NotesWorkspace
        user={auth.user}
        onSignedOut={() => setAuth({ status: "anonymous" })}
      />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <main className="boot-screen" aria-label="Učitavanje aplikacije">
      <div className="brand-mark" aria-hidden="true">
        L
      </div>
      <span>Pripremamo vaše beleške…</span>
    </main>
  );
}
