import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Plus,
  Search,
  Send,
  Users,
} from "lucide-react";
import type { Organizer } from "@voix-alumni/contracts";

type Alumni = {
  id: string;
  full_name: string;
  promotion_year: string | null;
  job_title: string | null;
  company: string | null;
  linkedin_url: string | null;
  biography: string | null;
  contact_notes: string | null;
  source_ref: string | null;
  relation_status: string;
  last_contact_at: string | null;
  last_contact_channel: string | null;
  archived_at: string | null;
  version: number;
  updated_at: string;
};
export type Episode = {
  id: string;
  alumni_id: string;
  alumni_name: string | null;
  public_number: number | null;
  title: string | null;
  topic: string | null;
  status: string;
  tentative_start_at: string | null;
  start_at_utc: string | null;
  event_timezone: string | null;
  confirmed_at: string | null;
  handed_off_at: string | null;
  schedule_version: number;
  status_reason: string | null;
  version: number;
};
type AlumniDetail = Alumni & { episodes: Episode[] };
type EpisodeDetail = Episode & {
  alumni: Alumni;
  missing_information: string[];
};
type Audit = {
  id: string;
  action: string;
  details: string | null;
  occurred_at: string;
};
type Notification = {
  id: string;
  episode_id: string;
  alumni_name: string;
  public_number: number | null;
  read_at: string | null;
};
type WorkflowTask = {
  id: string;
  stage: number;
  title: string;
  required: boolean;
  owner_role: "RESPONSABLE" | "PRODUCTION";
  status: string;
  due_at: string | null;
  comment: string | null;
  version: number;
};
type WorkflowRequest = {
  id: string;
  subject: string;
  question: string;
  status: string;
  response: string | null;
  due_at: string | null;
  version: number;
};
type Workflow = {
  tasks: WorkflowTask[];
  requests: WorkflowRequest[];
  stages: {
    number: number;
    completed: boolean;
    ready: boolean;
    version: number;
    done: number;
    total: number;
    state: "a_venir" | "en_cours" | "taches_terminees" | "validee";
  }[];
  progress: {
    done: number;
    total: number;
    current_stage: number;
    attention_stage: number | null;
    remaining: number;
    pending_requests: number;
  };
  history: {
    id: string;
    action: string;
    details: string | null;
    subject_type: string;
    subject_id: string;
    actor_name: string | null;
    occurred_at: string;
  }[];
};

const auditNames: Record<string, string> = {
  "alumni.created": "Fiche créée",
  "alumni.updated": "Fiche modifiée",
  "alumni.archived": "Fiche archivée",
  "alumni.contact_status_changed": "Statut de relation actualisé",
  "episode.created": "Épisode proposé",
  "episode.updated": "Dossier modifié",
  "episode.confirmed": "Participation et horaire confirmés",
  "episode.handed_off": "Dossier transmis à la Production",
  "episode.rescheduled": "Épisode reporté",
  "episode.cancelled": "Épisode annulé",
};

const relationNames: Record<string, string> = {
  brouillon: "Brouillon",
  a_contacter: "À contacter",
  contacte: "Contacté",
  interesse: "Intéressé",
  confirme: "Confirmé",
  a_relancer: "À relancer",
  indisponible: "Indisponible",
  decline: "Décliné",
  archive: "Archivé",
};
const episodeNames: Record<string, string> = {
  proposition: "Proposition",
  a_confirmer: "À confirmer",
  confirme: "Confirmé",
  en_preparation: "En préparation",
  reporte: "Reporté",
  annule: "Annulé",
  realise: "Réalisé",
  postproduction: "Postproduction",
  cloture: "Clôturé",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = data?.error?.code;
    const message =
      code === "VERSION_CONFLICT"
        ? "Cette fiche a changé. Rechargez-la avant de réessayer."
        : code === "INCOMPLETE_DOSSIER"
          ? "Renseignez le poste et l’entreprise avant la transmission."
          : code === "INVALID_TRANSITION"
            ? "Cette transition n’est pas autorisée dans l’état actuel."
            : code === "AMBIGUOUS_LOCAL_TIME"
              ? "Cette heure existe deux fois lors du changement d’heure. Choisissez une autre heure."
              : code === "NONEXISTENT_LOCAL_TIME"
                ? "Cette heure n’existe pas dans le fuseau choisi."
                : response.status === 403
                  ? "Vous n’avez pas le droit d’effectuer cette action."
                  : (data?.error?.message ??
                    `Erreur ${response.status}. Réessayez.`);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
const json = (data: unknown) => JSON.stringify(data);
const formatDate = (value: string | null, zone?: string | null) => {
  if (!value) return "Date à confirmer";
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: zone ?? "Europe/Paris",
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date(value))
        .map((part) => [part.type, part.value]),
    );
    return `${parts.day}/${parts.month}/${parts.year} à ${parts.hour}:${parts.minute} ${parts.timeZoneName}${zone ? ` · ${zone}` : ""}`;
  } catch {
    return "Date à vérifier";
  }
};
const localInput = (value: string | null, zone: string | null) => {
  if (!value || !zone) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
};
const localToApi = (value: string) => {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute));
  if (
    date.getUTCFullYear() !== +year ||
    date.getUTCMonth() !== +month - 1 ||
    date.getUTCDate() !== +day ||
    date.getUTCHours() !== +hour ||
    date.getUTCMinutes() !== +minute
  )
    return null;
  return `${year}-${month}-${day}T${hour}:${minute}`;
};
function Header({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="lot2-header">
      <div className="page-header">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions}
    </header>
  );
}
function Status({ text }: { text: string }) {
  return <span className="badge">{text}</span>;
}
function Feedback({ value, error }: { value?: string; error?: string }) {
  if (error)
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  if (value)
    return (
      <p className="lot2-success" role="status">
        {value}
      </p>
    );
  return null;
}
function Loading() {
  return (
    <section className="card lot2-panel" role="status">
      <div className="skeleton wide" />
      <p className="muted">Chargement des données…</p>
    </section>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="card lot2-panel">
      <div className="empty-state">
        <div className="empty-icon">
          <Users size={25} />
        </div>
        <strong>{title}</strong>
        <p>{text}</p>
        {action}
      </div>
    </section>
  );
}
function Timeline({ items }: { items: Audit[] }) {
  return (
    <section className="card lot2-panel">
      <h2>Historique</h2>
      {items.length ? (
        <ol className="lot2-timeline">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{auditNames[item.action] ?? item.action}</strong>
              <span>{formatDate(item.occurred_at)}</span>
              {item.details && <p>{item.details}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Aucun événement enregistré.</p>
      )}
    </section>
  );
}

export function AlumniList() {
  const [items, setItems] = useState<Alumni[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("updated");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      q,
      status,
      sort,
      archived: String(archived),
    });
    const timer = setTimeout(
      () =>
        void api<{ items: Alumni[]; next_offset: number | null }>(
          `/alumni?${params}`,
        )
          .then((data) => {
            if (active) {
              setItems(data.items);
              setNextOffset(data.next_offset);
            }
          })
          .catch((cause) => {
            if (active) setError(cause.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, status, sort, archived]);
  async function loadMore() {
    if (nextOffset === null) return;
    setMoreBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q,
        status,
        sort,
        archived: String(archived),
        offset: String(nextOffset),
      });
      const data = await api<{ items: Alumni[]; next_offset: number | null }>(
        `/alumni?${params}`,
      );
      setItems((current) => [...current, ...data.items]);
      setNextOffset(data.next_offset);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setMoreBusy(false);
    }
  }
  return (
    <>
      <Header
        eyebrow="Vivier & relations"
        title="Intervenants"
        subtitle="Un profil peut rester dans le vivier sans épisode ni date."
        actions={
          <Link className="lot2-button primary" to="/intervenants/nouveau">
            <Plus size={16} /> Ajouter un intervenant
          </Link>
        }
      />
      <section className="card lot2-toolbar">
        <label className="lot2-search">
          <Search size={17} />
          <span className="sr-only">Rechercher un intervenant</span>
          <input
            aria-label="Rechercher un intervenant"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom, promotion, poste, entreprise"
          />
        </label>
        <select
          aria-label="Filtrer par statut"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(relationNames).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Trier les intervenants"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">Dernière modification</option>
          <option value="name">Nom A–Z</option>
        </select>
        <label className="lot2-check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{" "}
          Archivés
        </label>
      </section>
      <Feedback error={error} />
      {loading ? (
        <Loading />
      ) : items.length ? (
        <section className="card lot2-list">
          {items.map((item) => (
            <Link
              className="lot2-list-row"
              to={`/intervenants/${item.id}`}
              key={item.id}
            >
              <span className="lot2-initial">
                {item.full_name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <span className="lot2-list-main">
                <strong>{item.full_name}</strong>
                <small>
                  {[
                    item.promotion_year && `Promotion ${item.promotion_year}`,
                    item.job_title,
                    item.company,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Profil à compléter"}
                </small>
              </span>
              <Status
                text={
                  relationNames[item.relation_status] ?? item.relation_status
                }
              />
              <ArrowRight size={17} />
            </Link>
          ))}
        </section>
      ) : (
        <Empty
          title="Aucun intervenant trouvé"
          text={
            q || status || archived
              ? "Modifiez les filtres ou la recherche."
              : "Commencez par enregistrer un profil, même sans date ni épisode."
          }
          action={
            !q &&
            !status &&
            !archived && (
              <Link className="lot2-button primary" to="/intervenants/nouveau">
                Créer une fiche
              </Link>
            )
          }
        />
      )}
      {nextOffset !== null && !loading && (
        <button
          className="lot2-button"
          type="button"
          onClick={() => void loadMore()}
          disabled={moreBusy}
        >
          {moreBusy ? "Chargement…" : "Charger plus d’intervenants"}
        </button>
      )}
      <p className="lot2-tip">
        La Responsable reste l’unique interlocutrice des alumni. Aucune action
        ici n’envoie de message externe.
      </p>
    </>
  );
}

export function AlumniForm({ organizer }: { organizer: Organizer }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [version, setVersion] = useState<number | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    promotion_year: "",
    job_title: "",
    company: "",
    linkedin_url: "",
    biography: "",
    contact_notes: "",
    source_ref: "",
  });
  const [duplicates, setDuplicates] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  useEffect(() => {
    if (!id) return;
    let active = true;
    void api<Alumni>(`/alumni/${id}`)
      .then((row) => {
        if (!active) return;
        setVersion(row.version);
        setForm({
          full_name: row.full_name,
          promotion_year: row.promotion_year ?? "",
          job_title: row.job_title ?? "",
          company: row.company ?? "",
          linkedin_url: row.linkedin_url ?? "",
          biography: row.biography ?? "",
          contact_notes: row.contact_notes ?? "",
          source_ref: row.source_ref ?? "",
        });
      })
      .catch((cause) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (form.full_name.trim().length < 2) {
      setDuplicates([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        name: form.full_name,
        promotion_year: form.promotion_year,
        exclude_id: id ?? "",
      });
      void api<{ items: { id: string; full_name: string }[] }>(
        `/alumni/duplicates?${params}`,
      )
        .then((data) => active && setDuplicates(data.items))
        .catch(() => active && setDuplicates([]));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.full_name, form.promotion_year, id]);
  const change = (name: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        Object.entries(form)
          .filter(
            ([key]) =>
              organizer.role === "RESPONSABLE" || key !== "contact_notes",
          )
          .map(([key, value]) => [key, value.trim() || null]),
      );
      const row = await api<Alumni>(id ? `/alumni/${id}` : "/alumni", {
        method: id ? "PATCH" : "POST",
        body: json(id ? { ...payload, expected_version: version } : payload),
      });
      navigate(`/intervenants/${row.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        eyebrow="Vivier & relations"
        title={id ? "Modifier la fiche" : "Nouvel intervenant"}
        subtitle="Une fiche peut être conservée sans épisode ni date."
        actions={
          <Link
            className="lot2-button"
            to={id ? `/intervenants/${id}` : "/intervenants"}
          >
            <ArrowLeft size={16} /> Retour
          </Link>
        }
      />
      {loading ? (
        <Loading />
      ) : (
        <form onSubmit={submit} className="card lot2-form">
          <div className="lot2-form-grid">
            <label>
              Nom et prénom *
              <input
                required
                minLength={2}
                maxLength={180}
                value={form.full_name}
                onChange={(e) => change("full_name", e.target.value)}
              />
            </label>
            <label>
              Promotion
              <input
                inputMode="numeric"
                pattern="[0-9]{4}"
                placeholder="2018"
                value={form.promotion_year}
                onChange={(e) => change("promotion_year", e.target.value)}
              />
            </label>
            <label>
              Poste
              <input
                value={form.job_title}
                onChange={(e) => change("job_title", e.target.value)}
              />
            </label>
            <label>
              Entreprise
              <input
                value={form.company}
                onChange={(e) => change("company", e.target.value)}
              />
            </label>
            <label>
              Lien LinkedIn
              <input
                type="url"
                placeholder="https://www.linkedin.com/in/…"
                value={form.linkedin_url}
                onChange={(e) => change("linkedin_url", e.target.value)}
              />
            </label>
            <label>
              Provenance de l’information
              <input
                value={form.source_ref}
                onChange={(e) => change("source_ref", e.target.value)}
              />
            </label>
            <label className="wide">
              Biographie
              <textarea
                rows={4}
                value={form.biography}
                onChange={(e) => change("biography", e.target.value)}
              />
            </label>
            {organizer.role === "RESPONSABLE" && (
              <label className="wide">
                Notes de relation internes
                <textarea
                  rows={4}
                  value={form.contact_notes}
                  onChange={(e) => change("contact_notes", e.target.value)}
                />
              </label>
            )}
          </div>
          {duplicates.length > 0 && (
            <div className="lot2-warning">
              <strong>Doublon potentiel</strong>
              <p>
                Une fiche proche existe déjà. Vérifiez-la avant de poursuivre ;
                l’enregistrement reste possible.
              </p>
              {duplicates.map((item) => (
                <Link key={item.id} to={`/intervenants/${item.id}`}>
                  {item.full_name} ↗
                </Link>
              ))}
            </div>
          )}
          <Feedback error={error} />
          <div className="lot2-actions">
            <button
              className="lot2-button primary"
              disabled={busy}
              type="submit"
            >
              {busy
                ? "Enregistrement…"
                : id
                  ? "Enregistrer les modifications"
                  : "Créer la fiche"}
            </button>
          </div>
        </form>
      )}
      <p className="lot2-tip">
        Portrait : le stockage privé R2 n’est pas encore configuré. Aucun
        téléversement n’est proposé ni simulé.
      </p>
    </>
  );
}

export function AlumniPage({ organizer }: { organizer: Organizer }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<AlumniDetail | null>(null);
  const [events, setEvents] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [contactStatus, setContactStatus] = useState("contacte");
  const [channel, setChannel] = useState("email");
  const refresh = () => {
    if (!id) return;
    setLoading(true);
    void Promise.all([
      api<AlumniDetail>(`/alumni/${id}`),
      api<{ items: Audit[] }>(`/audit?entity_type=alumni&entity_id=${id}`),
    ])
      .then(([person, audit]) => {
        setItem(person);
        setEvents(audit.items);
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [id]);
  async function contact() {
    if (!item) return;
    setError("");
    setSuccess("");
    try {
      await api(`/alumni/${item.id}/contact-events`, {
        method: "POST",
        body: json({
          status: contactStatus,
          channel,
          expected_version: item.version,
        }),
      });
      setSuccess("Contact enregistré dans l’historique.");
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function archive() {
    if (
      !item ||
      !window.confirm("Archiver cette fiche ? Elle restera dans l’historique.")
    )
      return;
    try {
      await api(`/alumni/${item.id}/archive`, {
        method: "POST",
        body: json({
          expected_version: item.version,
          reason: "Archivage manuel",
        }),
      });
      navigate("/intervenants");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (loading) return <Loading />;
  if (!item)
    return (
      <Empty
        title="Fiche introuvable"
        text={error || "Cette fiche n’existe plus."}
      />
    );
  return (
    <>
      <Header
        eyebrow="Fiche intervenant"
        title={item.full_name}
        subtitle={
          [
            item.promotion_year && `Promotion ${item.promotion_year}`,
            item.job_title,
            item.company,
          ]
            .filter(Boolean)
            .join(" · ") || "Profil à compléter"
        }
        actions={
          <Link className="lot2-button" to="/intervenants">
            <ArrowLeft size={16} /> Vivier
          </Link>
        }
      />
      <Feedback error={error} value={success} />
      <div className="lot2-columns">
        <section className="card lot2-panel">
          <div className="lot2-spaced">
            <h2>Profil</h2>
            <Status
              text={relationNames[item.relation_status] ?? item.relation_status}
            />
          </div>
          <dl className="lot2-details">
            <div>
              <dt>Poste</dt>
              <dd>{item.job_title || "À renseigner"}</dd>
            </div>
            <div>
              <dt>Entreprise</dt>
              <dd>{item.company || "À renseigner"}</dd>
            </div>
            <div>
              <dt>Promotion</dt>
              <dd>{item.promotion_year || "À renseigner"}</dd>
            </div>
            <div>
              <dt>Dernier contact</dt>
              <dd>
                {item.last_contact_at
                  ? formatDate(item.last_contact_at)
                  : "Aucun contact constaté"}
              </dd>
            </div>
            <div>
              <dt>LinkedIn</dt>
              <dd>
                {item.linkedin_url ? (
                  <a target="_blank" rel="noreferrer" href={item.linkedin_url}>
                    Consulter le profil ↗
                  </a>
                ) : (
                  "Non renseigné"
                )}
              </dd>
            </div>
          </dl>
          {item.biography && <p>{item.biography}</p>}
          {organizer.role === "RESPONSABLE" && item.contact_notes && (
            <p className="lot2-private-note">
              Notes internes : {item.contact_notes}
            </p>
          )}
          <div className="lot2-actions">
            <Link
              className="lot2-button"
              to={`/intervenants/${item.id}/modifier`}
            >
              Modifier
            </Link>
            {organizer.role === "RESPONSABLE" && !item.archived_at && (
              <button
                className="lot2-button subtle"
                onClick={() => void archive()}
              >
                Archiver
              </button>
            )}
          </div>
        </section>
        <section className="card lot2-panel">
          <h2>Épisodes associés</h2>
          {item.episodes.length ? (
            item.episodes.map((episode) => (
              <Link
                className="lot2-related"
                key={episode.id}
                to={`/episodes/${episode.id}`}
              >
                <span>
                  #{episode.public_number ?? "—"} ·{" "}
                  {episode.title || "Session à préciser"}
                  <small>
                    {episodeNames[episode.status]} ·{" "}
                    {formatDate(
                      episode.start_at_utc || episode.tentative_start_at,
                      episode.event_timezone,
                    )}
                  </small>
                </span>
                <ArrowRight size={16} />
              </Link>
            ))
          ) : (
            <p className="muted">
              Aucun épisode. Ce profil reste disponible dans le vivier.
            </p>
          )}
          {organizer.role === "RESPONSABLE" && !item.archived_at && (
            <Link
              className="lot2-button primary"
              to={`/episodes/nouveau?alumni=${item.id}`}
            >
              <Plus size={16} /> Prévoir un épisode
            </Link>
          )}
          <div className="lot2-warning">
            <strong>Portrait privé</strong>
            <p>
              Pièce jointe prévue ; l’upload attend un bucket R2 privé
              configuré. Aucun fichier n’a été envoyé.
            </p>
          </div>
        </section>
      </div>
      {organizer.role === "RESPONSABLE" && !item.archived_at && (
        <section className="card lot2-panel lot2-section">
          <h2>Suivi du contact</h2>
          <p>
            Seule la Responsable peut constater un contact ou un accord. Cette
            action n’envoie aucun message.
          </p>
          <div className="lot2-inline">
            <select
              aria-label="Nouveau statut de relation"
              value={contactStatus}
              onChange={(e) => setContactStatus(e.target.value)}
            >
              {Object.entries(relationNames)
                .filter(([key]) => !["brouillon", "archive"].includes(key))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
            <select
              aria-label="Canal du contact"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="email">Email</option>
              <option value="telephone">Téléphone</option>
              <option value="linkedin">LinkedIn</option>
              <option value="autre">Autre</option>
            </select>
            <button
              className="lot2-button primary"
              onClick={() => void contact()}
            >
              Enregistrer le constat
            </button>
          </div>
        </section>
      )}
      <div className="lot2-section">
        <Timeline items={events} />
      </div>
    </>
  );
}

export function EpisodeList({ organizer }: { organizer: Organizer }) {
  const [items, setItems] = useState<Episode[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status, q });
    const timer = setTimeout(
      () =>
        void Promise.all([
          api<{ items: Episode[]; next_offset: number | null }>(
            `/episodes?${params}`,
          ),
          organizer.role === "PRODUCTION"
            ? api<{ items: Notification[] }>("/notifications")
            : Promise.resolve({ items: [] }),
        ])
          .then(([data, notices]) => {
            if (active) {
              setItems(data.items);
              setNextOffset(data.next_offset);
              setNotifications(notices.items);
            }
          })
          .catch((cause) => active && setError(cause.message))
          .finally(() => active && setLoading(false)),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [status, q, organizer.role]);
  async function loadMore() {
    if (nextOffset === null) return;
    setMoreBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        status,
        q,
        offset: String(nextOffset),
      });
      const data = await api<{ items: Episode[]; next_offset: number | null }>(
        `/episodes?${params}`,
      );
      setItems((current) => [...current, ...data.items]);
      setNextOffset(data.next_offset);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setMoreBusy(false);
    }
  }
  return (
    <>
      <Header
        eyebrow="Calendrier et historique"
        title="Épisodes"
        subtitle="Chaque session conserve sa date, son fuseau et son historique propres."
        actions={
          organizer.role === "RESPONSABLE" && (
            <Link className="lot2-button primary" to="/episodes/nouveau">
              <Plus size={16} /> Nouvel épisode
            </Link>
          )
        }
      />
      {organizer.role === "PRODUCTION" && notifications.length > 0 && (
        <section className="card lot2-panel lot2-inbox">
          <h2>Dossiers transmis à la Production</h2>
          {notifications.map((item) => (
            <Link
              key={item.id}
              className="lot2-related"
              to={`/episodes/${item.episode_id}`}
            >
              {item.alumni_name} · épisode #{item.public_number ?? "—"}
              {!item.read_at && <Status text="Nouveau" />}
            </Link>
          ))}
        </section>
      )}
      <section className="card lot2-toolbar">
        <label className="lot2-search">
          <Search size={17} />
          <input
            aria-label="Rechercher un épisode"
            placeholder="Intervenant, titre, numéro"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Filtrer les épisodes"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(episodeNames).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </section>
      <Feedback error={error} />
      {loading ? (
        <Loading />
      ) : items.length ? (
        <div className="lot2-episode-grid">
          {items.map((item) => (
            <Link
              className="card lot2-episode-card"
              key={item.id}
              to={`/episodes/${item.id}`}
            >
              <div className="lot2-spaced">
                <span className="eyebrow">
                  {item.public_number
                    ? `Épisode n° ${item.public_number}`
                    : "Dossier d’épisode"}
                </span>
                <Status text={episodeNames[item.status] ?? item.status} />
              </div>
              <h2>{item.alumni_name}</h2>
              <p>{item.title || "Titre à préciser"}</p>
              <div className="lot2-date">
                <CalendarDays size={19} />
                <span>
                  {formatDate(
                    item.start_at_utc || item.tentative_start_at,
                    item.event_timezone,
                  )}
                </span>
              </div>
              <span className="lot2-card-link">
                Ouvrir le dossier <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="Aucun épisode trouvé"
          text={
            q || status
              ? "Modifiez les filtres ou la recherche."
              : "Créez un épisode depuis une fiche intervenant existante."
          }
          action={
            organizer.role === "RESPONSABLE" &&
            !q &&
            !status && (
              <Link className="lot2-button primary" to="/intervenants">
                Voir le vivier
              </Link>
            )
          }
        />
      )}
      {nextOffset !== null && !loading && (
        <button
          className="lot2-button"
          type="button"
          onClick={() => void loadMore()}
          disabled={moreBusy}
        >
          {moreBusy ? "Chargement…" : "Charger plus d’épisodes"}
        </button>
      )}
    </>
  );
}

export function EpisodeNew({ organizer }: { organizer: Organizer }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [people, setPeople] = useState<Alumni[]>([]);
  const [alumniId, setAlumniId] = useState(params.get("alumni") ?? "");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Alumni | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [local, setLocal] = useState("");
  const [zone, setZone] = useState("Europe/Paris");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        q: peopleQuery,
        limit: "100",
        sort: "name",
      });
      void api<{ items: Alumni[] }>(`/alumni?${query}`)
        .then((data) => active && setPeople(data.items))
        .catch((cause) => active && setError(cause.message));
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [peopleQuery]);
  useEffect(() => {
    const selectedId = params.get("alumni");
    if (!selectedId) return;
    void api<Alumni>(`/alumni/${selectedId}`)
      .then(setSelectedPerson)
      .catch((cause) => setError(cause.message));
  }, [params]);
  const choices =
    selectedPerson && !people.some((person) => person.id === selectedPerson.id)
      ? [selectedPerson, ...people]
      : people;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const parsedLocal = localToApi(local);
      if (local && !parsedLocal)
        throw new Error(
          "Saisissez une date valide au format jj/mm/aaaa HH:mm.",
        );
      const row = await api<Episode>("/episodes", {
        method: "POST",
        body: json({
          alumni_id: alumniId,
          title: title || null,
          topic: topic || null,
          tentative_start_local: parsedLocal,
          event_timezone: local ? zone : null,
        }),
      });
      navigate(`/episodes/${row.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (organizer.role !== "RESPONSABLE")
    return (
      <Empty
        title="Action réservée"
        text="La Responsable programme les nouveaux épisodes."
      />
    );
  return (
    <>
      <Header
        eyebrow="Nouvelle proposition"
        title="Prévoir un épisode"
        subtitle="Choisissez un intervenant du vivier. La date et le numéro peuvent rester provisoires."
        actions={
          <Link className="lot2-button" to="/episodes">
            <ArrowLeft size={16} /> Retour
          </Link>
        }
      />
      <form className="card lot2-form" onSubmit={submit}>
        <div className="lot2-form-grid">
          <label className="wide">
            Rechercher un intervenant
            <input
              value={peopleQuery}
              onChange={(event) => setPeopleQuery(event.target.value)}
              placeholder="Nom, promotion, poste ou entreprise"
            />
          </label>
          <label className="wide">
            Intervenant *
            <select
              required
              value={alumniId}
              onChange={(e) => setAlumniId(e.target.value)}
            >
              <option value="">Choisir une fiche existante</option>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                  {item.promotion_year ? ` · ${item.promotion_year}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Titre
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Thème
            <input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label>
            Date envisagée
            <input
              type="text"
              inputMode="numeric"
              placeholder="jj/mm/aaaa HH:mm"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
          </label>
          <label>
            Fuseau IANA
            <input
              list="lot2-timezones"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          </label>
        </div>
        <datalist id="lot2-timezones">
          <option value="Europe/Paris" />
          <option value="Africa/Dakar" />
        </datalist>
        <p className="muted">
          Une date envisagée n’est pas une confirmation. Les heures ambiguës au
          changement d’heure sont refusées.
        </p>
        <Feedback error={error} />
        <div className="lot2-actions">
          <button
            className="lot2-button primary"
            type="submit"
            disabled={busy || !alumniId}
          >
            {busy ? "Création…" : "Créer la proposition"}
          </button>
        </div>
      </form>
    </>
  );
}

const journey = [
  "Repérage et contact",
  "Confirmation et passage de relais",
  "Dossier et questions",
  "Affiche et annonce",
  "Réunion et rappels",
  "Jour J",
  "Remerciements et feedback",
  "Replay et clôture",
];
const workflowActionNames: Record<string, string> = {
  "task.created": "Tâche ajoutée",
  "task.updated": "Tâche modifiée",
  "task.synchronized": "Tâche terminée depuis un événement métier",
  "stage.validated": "Étape validée",
  "request.created": "Demande créée",
  "request.take": "Demande prise en charge",
  "request.respond": "Réponse apportée",
  "request.resolve": "Demande résolue",
  "request.reopen": "Demande rouverte",
  "request.cancel": "Demande annulée",
};
const stageStateNames: Record<Workflow["stages"][number]["state"], string> = {
  a_venir: "À venir",
  en_cours: "En cours",
  taches_terminees: "Tâches terminées",
  validee: "Étape validée",
};
function EpisodeWorkflow({
  id,
  role,
  zone,
  enabled,
}: {
  id: string;
  role: Organizer["role"];
  zone: string | null;
  enabled: boolean;
}) {
  const [data, setData] = useState<Workflow | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStage, setDraftStage] = useState(3);
  const [expandedStages, setExpandedStages] = useState<Record<number, boolean>>(
    {},
  );
  const [requestsOpen, setRequestsOpen] = useState<boolean | null>(null);
  const load = () => {
    if (enabled)
      void api<Workflow>(`/episodes/${id}/workflow`)
        .then(setData)
        .catch((e) => setError(e.message));
  };
  useEffect(load, [id, enabled]);
  async function run(path: string, method: string, payload: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: json(payload) });
      if (path.includes("/requests")) setRequestsOpen(true);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!enabled)
    return (
      <section className="card lot2-panel">
        <h2>Parcours de l’épisode</h2>
        <p>La Production y accède après transmission du dossier.</p>
      </section>
    );
  return (
    <section className="card lot2-panel lot3-workflow">
      <h2>Parcours de l’épisode</h2>
      {error && (
        <p role="alert" className="lot2-warning">
          {error}
        </p>
      )}
      {!data ? (
        <p>Chargement du parcours…</p>
      ) : (
        <>
          <div className="lot3-overview" role="status">
            <strong>
              {data.progress.done}/{data.progress.total} tâches terminées
            </strong>
            <span>
              {data.progress.remaining} obligatoires restantes ·{" "}
              {data.progress.pending_requests} demandes en attente
            </span>
            <small>
              {data.progress.attention_stage
                ? `À suivre : ${data.progress.attention_stage}. ${journey[data.progress.attention_stage - 1]}`
                : "Aucune action attribuée en attente"}
            </small>
            <progress
              max={data.progress.total}
              value={data.progress.done}
              aria-label="Progression des tâches"
            />
          </div>
          <div className="lot3-stages">
            {journey.map((name, index) => (
              <details
                key={name}
                open={
                  expandedStages[index + 1] ??
                  index + 1 === data.progress.attention_stage
                }
              >
                <summary
                  onClick={(e) => {
                    e.preventDefault();
                    setExpandedStages((current) => ({
                      ...current,
                      [index + 1]: !(
                        current[index + 1] ??
                        index + 1 === data.progress.attention_stage
                      ),
                    }));
                  }}
                >
                  <strong>
                    {index + 1}. {name}
                  </strong>
                  <span>
                    {data.stages[index]?.done}/{data.stages[index]?.total}{" "}
                    tâches · {stageStateNames[data.stages[index]?.state]}
                  </span>
                </summary>
                {data.stages[index]?.ready &&
                  !data.stages[index]?.completed &&
                  role ===
                    ([1, 2, 6].includes(index + 1)
                      ? "RESPONSABLE"
                      : "PRODUCTION") && (
                    <button
                      className="lot2-button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          `/episodes/${id}/stages/${index + 1}/validate`,
                          "POST",
                          { expected_version: data.stages[index].version },
                        )
                      }
                    >
                      Valider l’étape
                    </button>
                  )}
                <div className="lot3-task-list">
                  {data.tasks
                    .filter((t) => t.stage === index + 1)
                    .map((task) => (
                      <article key={task.id} className="lot3-task">
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            {task.required ? "Obligatoire" : "Facultative"} ·{" "}
                            {task.owner_role === "RESPONSABLE"
                              ? "Responsable"
                              : "Production"}{" "}
                            · {task.status.replaceAll("_", " ")}
                            {task.due_at
                              ? ` · ${formatDate(task.due_at, zone)}`
                              : ""}
                          </small>
                          {task.comment && <p>{task.comment}</p>}
                        </div>
                        {task.owner_role === role && (
                          <div className="lot3-actions">
                            <select
                              aria-label={`Statut de ${task.title}`}
                              disabled={busy}
                              value={task.status}
                              onChange={(e) =>
                                void run(
                                  `/episodes/${id}/tasks/${task.id}`,
                                  "PATCH",
                                  {
                                    expected_version: task.version,
                                    status: e.target.value,
                                  },
                                )
                              }
                            >
                              <option value="a_faire">À faire</option>
                              <option value="en_cours">En cours</option>
                              <option value="bloquee">Bloquée</option>
                              <option value="terminee">Terminée</option>
                            </select>
                            <button
                              className="lot2-button subtle"
                              disabled={busy}
                              onClick={() => {
                                const comment = window.prompt(
                                  "Commentaire interne",
                                  task.comment ?? "",
                                );
                                if (comment !== null)
                                  void run(
                                    `/episodes/${id}/tasks/${task.id}`,
                                    "PATCH",
                                    { expected_version: task.version, comment },
                                  );
                              }}
                            >
                              Commenter
                            </button>
                          </div>
                        )}
                        {task.owner_role === role && (
                          <details className="lot3-task-edit">
                            <summary>Adapter la tâche</summary>
                            <form
                              className="lot3-inline-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const fields = new FormData(e.currentTarget);
                                const localDue = String(
                                  fields.get("due") ?? "",
                                ).trim();
                                const parsedDue = localDue
                                  ? localToApi(localDue)
                                  : null;
                                if (localDue && !parsedDue) {
                                  setError(
                                    "Échéance invalide. Utilisez jj/mm/aaaa HH:mm.",
                                  );
                                  return;
                                }
                                void run(
                                  `/episodes/${id}/tasks/${task.id}`,
                                  "PATCH",
                                  {
                                    expected_version: task.version,
                                    title: String(fields.get("title")),
                                    owner_role: String(fields.get("owner")),
                                    required: fields.get("required") === "on",
                                    due_local: parsedDue,
                                  },
                                );
                              }}
                            >
                              <label>
                                Intitulé
                                <input
                                  name="title"
                                  required
                                  minLength={3}
                                  defaultValue={task.title}
                                />
                              </label>
                              <label>
                                Responsable
                                <select
                                  name="owner"
                                  defaultValue={task.owner_role}
                                >
                                  <option value="RESPONSABLE">
                                    Responsable
                                  </option>
                                  <option value="PRODUCTION">Production</option>
                                </select>
                              </label>
                              <label className="lot3-checkbox">
                                <input
                                  type="checkbox"
                                  name="required"
                                  defaultChecked={task.required}
                                />{" "}
                                Tâche obligatoire
                              </label>
                              <label>
                                Échéance ({zone ?? "Europe/Paris"})
                                <input
                                  name="due"
                                  placeholder="jj/mm/aaaa HH:mm"
                                  defaultValue={localInput(
                                    task.due_at,
                                    zone ?? "Europe/Paris",
                                  )}
                                />
                              </label>
                              <button className="lot2-button" disabled={busy}>
                                Enregistrer la tâche
                              </button>
                            </form>
                          </details>
                        )}
                      </article>
                    ))}
                </div>
              </details>
            ))}
          </div>
          <details className="lot3-extra">
            <summary>Ajouter une tâche propre à cet épisode</summary>
            <form
              className="lot3-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(`/episodes/${id}/tasks`, "POST", {
                  stage: draftStage,
                  title: draftTitle,
                  required: false,
                  owner_role: role,
                }).then(() => setDraftTitle(""));
              }}
            >
              <label>
                Étape
                <select
                  value={draftStage}
                  onChange={(e) => setDraftStage(Number(e.target.value))}
                >
                  {journey.map((name, i) => (
                    <option value={i + 1} key={name}>
                      {i + 1}. {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Intitulé
                <input
                  required
                  minLength={3}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />
              </label>
              <button className="lot2-button" disabled={busy}>
                Ajouter
              </button>
            </form>
          </details>
          <div className="lot3-columns">
            <details
              className="lot3-extra"
              open={requestsOpen ?? data.progress.pending_requests > 0}
            >
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  setRequestsOpen(
                    (current) =>
                      !(current ?? data.progress.pending_requests > 0),
                  );
                }}
              >
                Demandes internes · {data.progress.pending_requests} en attente
              </summary>
              <p className="muted">
                La Responsable reste l’unique interlocutrice de l’intervenant.
              </p>
              {data.requests.length === 0 && <p>Aucune demande.</p>}
              {data.requests.map((request) => (
                <article className="lot3-request" key={request.id}>
                  <strong>{request.subject}</strong>
                  <small>
                    {request.status}
                    {request.due_at
                      ? ` · ${formatDate(request.due_at, zone)}`
                      : ""}
                  </small>
                  <p>{request.question}</p>
                  {request.response && (
                    <p>
                      <strong>Réponse :</strong> {request.response}
                    </p>
                  )}
                  {role === "RESPONSABLE" &&
                    ["ouverte", "prise_en_charge", "répondue"].includes(
                      request.status,
                    ) && (
                      <>
                        <textarea
                          aria-label={`Réponse à ${request.subject}`}
                          value={responses[request.id] ?? ""}
                          onChange={(e) =>
                            setResponses({
                              ...responses,
                              [request.id]: e.target.value,
                            })
                          }
                        />
                        <button
                          className="lot2-button"
                          disabled={busy || !responses[request.id]?.trim()}
                          onClick={() =>
                            void run(
                              `/requests/${request.id}/respond`,
                              "POST",
                              {
                                expected_version: request.version,
                                response: responses[request.id],
                              },
                            )
                          }
                        >
                          Répondre
                        </button>
                      </>
                    )}
                  {role === "PRODUCTION" && request.status === "répondue" && (
                    <button
                      className="lot2-button"
                      disabled={busy}
                      onClick={() =>
                        void run(`/requests/${request.id}/resolve`, "POST", {
                          expected_version: request.version,
                        })
                      }
                    >
                      Résoudre
                    </button>
                  )}
                </article>
              ))}
              <form
                className="lot3-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(`/episodes/${id}/requests`, "POST", {
                    subject,
                    question,
                  }).then(() => {
                    setSubject("");
                    setQuestion("");
                  });
                }}
              >
                <h3>Demander une précision</h3>
                <label>
                  Objet
                  <input
                    required
                    minLength={3}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </label>
                <label>
                  Question
                  <textarea
                    required
                    minLength={3}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                </label>
                <button className="lot2-button" disabled={busy}>
                  Envoyer à la Responsable
                </button>
              </form>
            </details>
            <details className="lot3-extra">
              <summary>
                Historique du parcours · {data.history.length} actions
              </summary>
              <ol className="lot3-history">
                {data.history.map((entry) => (
                  <li key={entry.id}>
                    <strong>
                      {workflowActionNames[entry.action] ??
                        "Action sur le parcours"}
                    </strong>
                    <small>
                      {entry.actor_name ?? "Organisateur"} ·{" "}
                      {formatDate(entry.occurred_at, zone)}
                    </small>
                    {entry.subject_type === "task" && (
                      <span>
                        {data.tasks.find((task) => task.id === entry.subject_id)
                          ?.title ?? "Tâche"}
                      </span>
                    )}
                    {entry.subject_type === "request" && (
                      <span>
                        {data.requests.find(
                          (request) => request.id === entry.subject_id,
                        )?.subject ?? "Demande"}
                      </span>
                    )}
                    {entry.subject_type === "stage" && (
                      <span>Étape du parcours</span>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        </>
      )}
    </section>
  );
}

export function EpisodePage({ organizer }: { organizer: Organizer }) {
  const { id } = useParams();
  const [item, setItem] = useState<EpisodeDetail | null>(null);
  const [events, setEvents] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [local, setLocal] = useState("");
  const [zone, setZone] = useState("Europe/Paris");
  const [reason, setReason] = useState("");
  const refresh = () => {
    if (!id) return;
    setLoading(true);
    void Promise.all([
      api<EpisodeDetail>(`/episodes/${id}`),
      api<{ items: Audit[] }>(`/audit?entity_type=episode&entity_id=${id}`),
    ])
      .then(([episode, audit]) => {
        setItem(episode);
        setEvents(audit.items);
        setTitle(episode.title ?? "");
        setTopic(episode.topic ?? "");
        setLocal(
          localInput(
            episode.tentative_start_at || episode.start_at_utc,
            episode.event_timezone,
          ),
        );
        setZone(episode.event_timezone ?? "Europe/Paris");
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [id]);
  useEffect(() => {
    if (!id || organizer.role !== "PRODUCTION") return;
    void api<{ items: Notification[] }>("/notifications")
      .then((data) => {
        const notice = data.items.find(
          (item) => item.episode_id === id && !item.read_at,
        );
        if (notice)
          void api(`/notifications/${notice.id}/read`, { method: "POST" });
      })
      .catch(() => undefined);
  }, [id, organizer.role]);
  async function action(path: string, payload: unknown, message: string) {
    setError("");
    setSuccess("");
    try {
      if ((path === "/confirm" || path === "/reschedule") && !localToApi(local))
        throw new Error(
          "Saisissez une date valide au format jj/mm/aaaa HH:mm.",
        );
      await api(`/episodes/${id}${path}`, {
        method: "POST",
        body: json(payload),
      });
      setSuccess(message);
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function save() {
    if (!item) return;
    setError("");
    try {
      const parsedLocal = localToApi(local);
      if (local && !parsedLocal)
        throw new Error(
          "Saisissez une date valide au format jj/mm/aaaa HH:mm.",
        );
      await api(`/episodes/${item.id}`, {
        method: "PATCH",
        body: json({
          title: title || null,
          topic: topic || null,
          ...(["proposition", "a_confirmer", "reporte"].includes(item.status)
            ? { tentative_start_local: parsedLocal, event_timezone: zone }
            : {}),
          expected_version: item.version,
        }),
      });
      setSuccess("Dossier enregistré.");
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (loading) return <Loading />;
  if (!item)
    return (
      <Empty
        title="Épisode introuvable"
        text={error || "Cette session n’existe pas."}
      />
    );
  const canEdit = !["annule", "realise", "postproduction", "cloture"].includes(
    item.status,
  );
  const canConfirm =
    organizer.role === "RESPONSABLE" &&
    ["proposition", "a_confirmer", "reporte"].includes(item.status);
  const canHandoff =
    organizer.role === "RESPONSABLE" &&
    item.status === "confirme" &&
    !item.handed_off_at;
  return (
    <>
      <Header
        eyebrow={
          item.public_number
            ? `Épisode n° ${item.public_number}`
            : "Dossier d’épisode"
        }
        title={item.alumni_name || "Intervenant"}
        subtitle={item.title || "Titre à préciser"}
        actions={
          <Link className="lot2-button" to="/episodes">
            <ArrowLeft size={16} /> Tous les épisodes
          </Link>
        }
      />
      <div className="lot2-summary card">
        <Status text={episodeNames[item.status] ?? item.status} />
        <span>
          <Clock3 size={17} />
          {formatDate(
            item.start_at_utc || item.tentative_start_at,
            item.event_timezone,
          )}
        </span>
        <Link to={`/intervenants/${item.alumni_id}`}>
          Voir la fiche intervenant ↗
        </Link>
        {(organizer.role === "RESPONSABLE" || item.handed_off_at) && (
          <>
            <Link to={`/studio?episode=${item.id}`}>Studio créatif ↗</Link>
            <Link to={`/communications?episode=${item.id}`}>
              Communications ↗
            </Link>
            <Link to={`/episodes/${item.id}/session`}>Réunion et jour J ↗</Link>
            <Link to={`/episodes/${item.id}/feedback`}>
              Feedback et résultats ↗
            </Link>
          </>
        )}
      </div>
      <Feedback error={error} value={success} />
      <div className="lot2-columns">
        <section className="card lot2-panel">
          <h2>Planification</h2>
          <p className="muted">
            La date envisagée et la date confirmée sont enregistrées séparément.
          </p>
          <dl className="lot2-details">
            <div>
              <dt>Envisagée</dt>
              <dd>
                {formatDate(item.tentative_start_at, item.event_timezone)}
              </dd>
            </div>
            <div>
              <dt>Confirmée</dt>
              <dd>{formatDate(item.start_at_utc, item.event_timezone)}</dd>
            </div>
            <div>
              <dt>Reports enregistrés</dt>
              <dd>{Math.max(0, item.schedule_version - 1)}</dd>
            </div>
          </dl>
          {canEdit && (
            <div className="lot2-form-grid">
              <label>
                Titre
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Thème
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </label>
              {canConfirm && (
                <>
                  <label>
                    Heure locale
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="jj/mm/aaaa HH:mm"
                      value={local}
                      onChange={(e) => setLocal(e.target.value)}
                    />
                  </label>
                  <label>
                    Fuseau IANA
                    <input
                      list="lot2-timezones-detail"
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                    />
                  </label>
                  <datalist id="lot2-timezones-detail">
                    <option value="Europe/Paris" />
                    <option value="Africa/Dakar" />
                  </datalist>
                </>
              )}
            </div>
          )}
          {canEdit && (
            <div className="lot2-actions">
              <button className="lot2-button" onClick={() => void save()}>
                Enregistrer le dossier
              </button>
              {canConfirm && (
                <button
                  className="lot2-button primary"
                  onClick={() =>
                    void action(
                      "/confirm",
                      {
                        start_at_local: localToApi(local),
                        event_timezone: zone,
                        expected_version: item.version,
                      },
                      "Participation et horaire confirmés par la Responsable.",
                    )
                  }
                >
                  Confirmer la session
                </button>
              )}
            </div>
          )}
          {organizer.role === "RESPONSABLE" &&
            ["confirme", "en_preparation"].includes(item.status) && (
              <div className="lot2-management">
                <h3>Reporter ou annuler</h3>
                <div className="lot2-form-grid">
                  <label>
                    Nouvelle date et heure locales
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="jj/mm/aaaa HH:mm"
                      value={local}
                      onChange={(e) => setLocal(e.target.value)}
                    />
                  </label>
                  <label>
                    Fuseau IANA
                    <input
                      list="lot2-timezones-report"
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                    />
                  </label>
                  <datalist id="lot2-timezones-report">
                    <option value="Europe/Paris" />
                    <option value="Africa/Dakar" />
                  </datalist>
                </div>
                <label>
                  Motif *
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Motif interne du changement"
                  />
                </label>
                <div className="lot2-actions">
                  <button
                    className="lot2-button"
                    disabled={reason.trim().length < 3 || !local}
                    onClick={() =>
                      void action(
                        "/reschedule",
                        {
                          start_at_local: localToApi(local),
                          event_timezone: zone,
                          expected_version: item.version,
                          reason,
                        },
                        "Épisode reporté ; ancienne date conservée dans l’historique.",
                      )
                    }
                  >
                    Reporter à l’heure saisie
                  </button>
                  <button
                    className="lot2-button subtle"
                    disabled={reason.trim().length < 3}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Annuler cet épisode ? L’historique sera conservé.",
                        )
                      )
                        void action(
                          "/cancel",
                          { expected_version: item.version, reason },
                          "Épisode annulé, historique conservé.",
                        );
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
        </section>
        <section className="card lot2-panel">
          <h2>Passage à la Production</h2>
          <p>
            La Responsable conserve l’unique relation avec l’intervenant. Le
            relais est une notification interne, sans envoi externe.
          </p>
          <dl className="lot2-details">
            <div>
              <dt>Intervenant</dt>
              <dd>{item.alumni.full_name}</dd>
            </div>
            <div>
              <dt>Poste</dt>
              <dd>{item.alumni.job_title || "À compléter"}</dd>
            </div>
            <div>
              <dt>Entreprise</dt>
              <dd>{item.alumni.company || "À compléter"}</dd>
            </div>
            <div>
              <dt>État</dt>
              <dd>
                {item.handed_off_at
                  ? `Transmis le ${formatDate(item.handed_off_at)}`
                  : "Non transmis"}
              </dd>
            </div>
          </dl>
          {item.missing_information.length > 0 && (
            <div className="lot2-warning">
              <strong>À compléter / vérifier</strong>
              <ul>
                {item.missing_information.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {canHandoff && (
            <button
              className="lot2-button primary"
              onClick={() => {
                if (window.confirm("Transmettre ce dossier à la Production ?"))
                  void action(
                    "/handoff",
                    { expected_version: item.version },
                    "Dossier transmis à la Production.",
                  );
              }}
            >
              <Send size={16} /> Transmettre à la Production
            </button>
          )}
          {organizer.role === "PRODUCTION" && item.handed_off_at && (
            <p className="lot2-success">
              Dossier reçu. Le parcours et les demandes internes sont
              accessibles ci-dessous.
            </p>
          )}
        </section>
      </div>
      <div className="lot2-section">
        <EpisodeWorkflow
          id={item.id}
          role={organizer.role}
          zone={item.event_timezone}
          enabled={
            organizer.role === "RESPONSABLE" || Boolean(item.handed_off_at)
          }
        />
      </div>
      <details className="lot3-extra lot3-dossier-history">
        <summary>Historique du dossier · {events.length} actions</summary>
        <Timeline items={events} />
      </details>
    </>
  );
}

export function ProductionInbox() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<{ items: Notification[] }>("/notifications")
      .then((data) => setItems(data.items))
      .catch((cause) => setError(cause.message));
  }, []);
  return (
    <section className="card lot2-panel lot2-section">
      <div className="lot2-spaced">
        <h2>Dossiers transmis</h2>
        <Link to="/episodes">Voir les épisodes →</Link>
      </div>
      <Feedback error={error} />
      {items.length ? (
        items.slice(0, 4).map((item) => (
          <Link
            className="lot2-related"
            key={item.id}
            to={`/episodes/${item.episode_id}`}
          >
            {item.alumni_name} · épisode #{item.public_number ?? "—"}
            {!item.read_at && <Status text="Nouveau" />}
          </Link>
        ))
      ) : (
        <p className="muted">Aucun dossier transmis pour le moment.</p>
      )}
    </section>
  );
}

export function WorkflowInbox() {
  const [items, setItems] = useState<
    { id: string; episode_id: string; kind: string; read_at: string | null }[]
  >([]);
  const [error, setError] = useState("");
  const load = () => {
    void api<{ items: typeof items }>("/workflow-notifications")
      .then((data) => setItems(data.items))
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  if (!items.length && !error) return null;
  const labels: Record<string, string> = {
    REQUEST_CREATED: "Nouvelle demande de précision",
    REQUEST_RESPOND: "Réponse à une demande",
    REQUEST_REOPEN: "Demande rouverte",
    TASK_ASSIGNED: "Tâche attribuée",
  };
  return (
    <section className="card lot2-panel lot2-section">
      <h2>Notifications internes</h2>
      <Feedback error={error} />
      {items.slice(0, 6).map((item) => (
        <div className="lot2-related" key={item.id}>
          <Link to={`/episodes/${item.episode_id}`}>
            {labels[item.kind] ?? item.kind} · voir l’épisode
          </Link>
          {!item.read_at && (
            <button
              className="lot2-button subtle"
              onClick={() =>
                void api(`/workflow-notifications/${item.id}/read`, {
                  method: "POST",
                })
                  .then(load)
                  .catch((e) => setError(e.message))
              }
            >
              Marquer comme lu
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
