import { useCallback, useEffect, useState } from "react";
import {
  dashboardSchema,
  organizerSchema,
  type Organizer,
  type OrganizerRole,
} from "@voix-alumni/contracts";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  Archive,
  ArrowRight,
  AudioLines,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  Clapperboard,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Mic2,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Role = OrganizerRole;
type NavItem = { label: string; path: string; icon: LucideIcon; lot: number };

const navigation: NavItem[] = [
  { label: "Tableau de bord", path: "/", icon: LayoutDashboard, lot: 1 },
  { label: "Épisodes", path: "/episodes", icon: CalendarDays, lot: 2 },
  { label: "Intervenants", path: "/intervenants", icon: Users, lot: 2 },
  { label: "Studio créatif", path: "/studio", icon: Clapperboard, lot: 4 },
  {
    label: "Communications",
    path: "/communications",
    icon: MessageCircle,
    lot: 4,
  },
  { label: "Feedback", path: "/feedback", icon: BookOpenText, lot: 5 },
  { label: "Médiathèque", path: "/mediatheque", icon: FolderOpen, lot: 4 },
  { label: "Paramètres", path: "/parametres", icon: Settings2, lot: 1 },
];

async function loadOrganizer(): Promise<Organizer | null> {
  const response = await fetch("/api/v1/me", { credentials: "include" });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok)
    throw new Error(
      "Impossible de joindre le service pour vérifier votre session.",
    );
  return organizerSchema.parse(await response.json());
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-icon">
        <Mic2 size={24} strokeWidth={1.5} />
      </div>
      <div>
        <h1>Voix d’Alumni</h1>
        <span>Studio de production</span>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-card card">
        <Brand />
        <div className="skeleton wide" />
        <div className="skeleton" />
        <p className="muted">Vérification de la session…</p>
      </div>
    </div>
  );
}

async function startGoogleFlow(path: "sign-in/social" | "link-social") {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      callbackURL: path === "link-social" ? "/parametres" : "/",
    }),
  });
  if (!response.ok)
    throw new Error("La connexion Google ne peut pas démarrer.");
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error("Lien Google indisponible.");
  window.location.assign(data.url);
}

function Login({
  onLogin,
  googleOAuth,
}: {
  onLogin: () => Promise<void>;
  googleOAuth: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError("Adresse ou mot de passe invalide, ou accès non autorisé.");
        return;
      }
      await onLogin();
    } catch {
      setError("Service momentanément indisponible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-intro">
        <span className="eyebrow">Espace organisateurs</span>
        <Brand />
        <h1>Les belles rencontres se préparent ensemble.</h1>
        <p>
          Un espace privé pour suivre chaque épisode de Voix d’Alumni, du
          premier contact aux souvenirs partagés.
        </p>
        <div className="login-ornament" aria-hidden="true">
          <AudioLines size={92} strokeWidth={0.65} />
        </div>
      </div>
      <main className="login-panel">
        <div className="login-box card">
          <span className="eyebrow">Connexion sécurisée</span>
          <h2>Bienvenue au Studio</h2>
          <p className="muted">
            Connectez-vous avec votre compte organisateur autorisé.
          </p>
          <form onSubmit={submit}>
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
            />
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="form-help">
              Accès perdu ? Contactez l’administrateur du projet pour une
              réinitialisation privée.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="login-submit" disabled={busy}>
              {busy ? "Connexion…" : "Se connecter"}
              <ArrowRight size={16} />
            </Button>
          </form>
          {googleOAuth && (
            <button
              className="google-button"
              onClick={() =>
                void startGoogleFlow("sign-in/social").catch((cause: unknown) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Connexion Google indisponible",
                  ),
                )
              }
            >
              Continuer avec Google <ArrowRight size={15} />
            </button>
          )}
          <div className="login-foot">
            <ShieldCheck size={16} /> Accès réservé aux deux organisateurs
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyState({
  title,
  text,
  icon: Icon = Archive,
}: {
  title: string;
  text: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={26} strokeWidth={1.4} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="role-badge">
      <span className="role-dot" />
      {role === "RESPONSABLE" ? "Responsable" : "Production"}
    </span>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="page-header">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function Dashboard({ organizer }: { organizer: Organizer }) {
  const isResponsible = organizer.role === "RESPONSABLE";
  const firstName = organizer.name.trim().split(/\s+/)[0];
  const [state, setState] = useState<"loading" | "empty" | "error">("loading");
  useEffect(() => {
    let active = true;
    fetch("/api/v1/dashboard", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = dashboardSchema.parse(await response.json());
        if (
          data.role !== organizer.role ||
          data.status !== "empty" ||
          data.items.length
        )
          throw new Error();
        if (active) setState("empty");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [organizer.role]);
  return (
    <>
      <PageHeader
        eyebrow="Vue d’ensemble"
        title={firstName ? `Bonjour, ${firstName}` : "Bonjour à vous"}
        subtitle={
          isResponsible
            ? "Votre espace de suivi des intervenants et des sessions à venir."
            : "Votre espace de préparation des épisodes et des contenus."
        }
      />
      <div className="dashboard-grid">
        <section className="hero-card card">
          <div className="hero-copy">
            <span className="badge">Lot 1 · Espace prêt</span>
            <h2>
              {isResponsible
                ? "Chaque rencontre commence ici."
                : "Un studio pour chaque histoire."}
            </h2>
            <p>
              {isResponsible
                ? "Les intervenants et épisodes apparaîtront ici après leur création dans le prochain lot."
                : "Les épisodes transmis et les tâches de production apparaîtront ici dans les prochains lots."}
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <span>VA</span>
            <div className="hero-ring" />
          </div>
        </section>
        <section className="quick-card card">
          <span className="eyebrow">Votre rôle</span>
          <RoleBadge role={organizer.role} />
          <p>
            {isResponsible
              ? "Vous gardez le contact avec les alumni et confirmez les sessions."
              : "Vous préparez les ressources, communications et suites de chaque session."}
          </p>
        </section>
      </div>
      <div className="dashboard-columns">
        <section className="card content-card">
          <div className="card-heading">
            <h2>
              {isResponsible ? "Épisodes à suivre" : "Production à préparer"}
            </h2>
            <span className="badge gray">Aucune donnée</span>
          </div>
          {state === "loading" ? (
            <div role="status" className="skeleton-list">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : state === "error" ? (
            <EmptyState
              title="Chargement impossible"
              text="Le tableau de bord n’a pas pu être chargé. Rechargez la page."
            />
          ) : (
            <EmptyState
              title="Aucun épisode pour le moment"
              text="La création et le suivi des épisodes seront disponibles au Lot 2."
              icon={CalendarDays}
            />
          )}
        </section>
        <section className="card content-card">
          <div className="card-heading">
            <h2>{isResponsible ? "Demandes internes" : "À garder en tête"}</h2>
          </div>
          <EmptyState
            title={isResponsible ? "Aucune demande" : "Aucune tâche connectée"}
            text={
              isResponsible
                ? "Les demandes de Production apparaîtront ici lorsque le parcours sera disponible."
                : "Le suivi des tâches sera intégré au Lot 3."
            }
            icon={isResponsible ? Mail : BookOpenText}
          />
        </section>
      </div>
    </>
  );
}

const placeholders: Record<
  string,
  {
    eyebrow: string;
    title: string;
    subtitle: string;
    empty: string;
    lot: number;
    icon: LucideIcon;
  }
> = {
  "/episodes": {
    eyebrow: "Programme",
    title: "Épisodes",
    subtitle: "Toutes les rencontres Voix d’Alumni au même endroit.",
    empty: "Aucun épisode enregistré. La gestion des épisodes arrive au Lot 2.",
    lot: 2,
    icon: CalendarDays,
  },
  "/intervenants": {
    eyebrow: "Réseau alumni",
    title: "Intervenants",
    subtitle: "Le vivier et les profils de vos invités.",
    empty: "Aucun intervenant enregistré. Le vivier sera disponible au Lot 2.",
    lot: 2,
    icon: Users,
  },
  "/studio": {
    eyebrow: "Création",
    title: "Studio créatif",
    subtitle: "Préparation des affiches d’annonce et de remerciement.",
    empty: "Le studio de création et l’export PNG seront disponibles au Lot 4.",
    lot: 4,
    icon: Clapperboard,
  },
  "/communications": {
    eyebrow: "Diffusion",
    title: "Communications",
    subtitle: "Messages, validations et publications constatées.",
    empty:
      "Les communications seront disponibles au Lot 4. Aucun message n’a été publié par cette application.",
    lot: 4,
    icon: MessageCircle,
  },
  "/feedback": {
    eyebrow: "Écoute",
    title: "Feedback",
    subtitle: "Retours des participants et enseignements des sessions.",
    empty: "Le formulaire natif et les réponses seront disponibles au Lot 5.",
    lot: 5,
    icon: BookOpenText,
  },
  "/mediatheque": {
    eyebrow: "Ressources",
    title: "Médiathèque",
    subtitle: "Photos, affiches et archives autorisées.",
    empty:
      "Aucun média enregistré. Le stockage privé sera raccordé dans un lot ultérieur.",
    lot: 4,
    icon: FolderOpen,
  },
};

function PlaceholderPage({ path }: { path: string }) {
  const page = placeholders[path];
  if (!page) return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader
        eyebrow={page.eyebrow}
        title={page.title}
        subtitle={page.subtitle}
      />
      <section className="card content-card placeholder-card">
        <span className="badge">Prévu au Lot {page.lot}</span>
        <EmptyState
          title="Espace en préparation"
          text={page.empty}
          icon={page.icon}
        />
      </section>
    </>
  );
}

function Settings({
  organizer,
  googleOAuth,
}: {
  organizer: Organizer;
  googleOAuth: boolean;
}) {
  const [googleError, setGoogleError] = useState("");
  return (
    <>
      <PageHeader
        eyebrow="Compte"
        title="Paramètres"
        subtitle="Votre identité et vos accès au Studio."
      />
      <div className="settings-grid">
        <section className="card content-card">
          <h2>Compte organisateur</h2>
          <div className="detail-row">
            <span>Nom</span>
            <strong>{organizer.name}</strong>
          </div>
          <div className="detail-row">
            <span>Adresse</span>
            <strong>{organizer.email}</strong>
          </div>
          <div className="detail-row">
            <span>Rôle</span>
            <RoleBadge role={organizer.role} />
          </div>
        </section>
        <section className="card content-card">
          <h2>Sécurité</h2>
          <p>
            Votre session est protégée par Better Auth. Pour récupérer votre
            accès, demandez une réinitialisation privée à l’administrateur du
            projet.
          </p>
          <div className="note">
            <ShieldCheck size={18} />
            <span>
              {googleOAuth
                ? "Google doit être associé explicitement à ce compte avant de pouvoir servir à la connexion."
                : "La liaison Google sera activée après configuration du fournisseur OAuth."}
            </span>
          </div>
          {googleOAuth && (
            <button
              className="google-button"
              onClick={() =>
                void startGoogleFlow("link-social").catch((cause: unknown) =>
                  setGoogleError(
                    cause instanceof Error
                      ? cause.message
                      : "Liaison Google indisponible",
                  ),
                )
              }
            >
              Associer mon compte Google <ArrowRight size={15} />
            </button>
          )}
          {googleError && (
            <p className="form-error" role="alert">
              {googleError}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function AppShell({
  organizer,
  onLogout,
  googleOAuth,
}: {
  organizer: Organizer;
  onLogout: () => Promise<void>;
  googleOAuth: boolean;
}) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const current =
    navigation.find((item) => item.path === location.pathname) ?? navigation[0];
  useEffect(() => setMenuOpen(false), [location.pathname]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="nav-label">Espace de travail</p>
        <nav className="side-nav" aria-label="Navigation principale">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-caption">Compte actif</span>
          <strong>{organizer.name}</strong>
          <RoleBadge role={organizer.role} />
          <button className="logout-link" onClick={onLogout}>
            <LogOut size={16} /> Se déconnecter
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Studio</span>
            <span className="breadcrumb-sep">/</span>
            <strong>{current.label}</strong>
          </div>
          <div className="head-actions">
            <RoleBadge role={organizer.role} />
            <div className="avatar" aria-label={organizer.name}>
              {organizer.name.trim().slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard organizer={organizer} />} />
            <Route
              path="/parametres"
              element={
                <Settings organizer={organizer} googleOAuth={googleOAuth} />
              }
            />
            {Object.keys(placeholders).map((path) => (
              <Route
                key={path}
                path={path}
                element={<PlaceholderPage path={path} />}
              />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <nav className="mobile-bar" aria-label="Navigation mobile">
        {navigation.slice(0, 4).map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `mobile-link${isActive ? " active" : ""}`
            }
          >
            <Icon size={20} strokeWidth={1.7} />
            <span>
              {label === "Tableau de bord"
                ? "Accueil"
                : label === "Intervenants"
                  ? "Alumni"
                  : label === "Studio créatif"
                    ? "Studio"
                    : label}
            </span>
          </NavLink>
        ))}
        <button
          className={`mobile-link${menuOpen ? " active" : ""}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
          <span>Plus</span>
        </button>
      </nav>
      {menuOpen && (
        <div className="mobile-drawer">
          <div className="drawer-heading">
            Autres rubriques <ChevronDown size={16} />
          </div>
          {navigation.slice(4).map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} className="drawer-link">
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          <button className="drawer-link" onClick={onLogout}>
            <LogOut size={18} />
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [googleOAuth, setGoogleOAuth] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setOrganizer(await loadOrganizer());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    void fetch("/api/capabilities")
      .then((response) => response.json())
      .then((data: { googleOAuth: boolean }) =>
        setGoogleOAuth(data.googleOAuth),
      )
      .catch(() => setGoogleOAuth(false));
  }, []);
  async function logout() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    setOrganizer(null);
    window.history.replaceState(null, "", "/");
  }
  if (state === "loading") return <LoadingScreen />;
  if (state === "error")
    return (
      <div className="loading-screen">
        <div className="loading-card card">
          <Brand />
          <h1>Service indisponible</h1>
          <p>La session ne peut pas être vérifiée actuellement.</p>
          <Button onClick={() => void refresh()}>Réessayer</Button>
        </div>
      </div>
    );
  if (!organizer) return <Login onLogin={refresh} googleOAuth={googleOAuth} />;
  return (
    <BrowserRouter>
      <AppShell
        organizer={organizer}
        onLogout={logout}
        googleOAuth={googleOAuth}
      />
    </BrowserRouter>
  );
}
