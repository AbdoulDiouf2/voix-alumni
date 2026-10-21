import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Health = "loading" | "online" | "offline";

export function App() {
  const [health, setHealth] = useState<Health>("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API indisponible");
        setHealth("online");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError")
          setHealth("offline");
      });
    return () => controller.abort();
  }, []);

  const status = {
    loading: "Vérification de l’API…",
    online: "API locale disponible",
    offline: "API locale indisponible",
  }[health];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-5 py-12">
      <section className="w-full border border-[var(--line)] bg-[var(--white)] p-8 shadow-sm sm:p-12">
        <p className="mb-4 text-xs font-semibold tracking-[0.24em] text-[var(--gold)] uppercase">
          Voix d’Alumni Studio
        </p>
        <h1 className="mb-4 font-serif text-4xl text-[var(--deep)] sm:text-5xl">
          Socle local · Lot 0
        </h1>
        <p className="mb-8 max-w-2xl text-[var(--ink)]">
          Le frontend et l’API sont initialisés. Les parcours métier et
          l’authentification seront développés après validation du Lot 1.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <span role="status" className="text-sm text-[var(--muted)]">
            {status}
          </span>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Vérifier à nouveau
          </Button>
        </div>
      </section>
    </main>
  );
}
