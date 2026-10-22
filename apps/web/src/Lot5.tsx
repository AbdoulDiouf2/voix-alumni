import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Organizer } from "@voix-alumni/contracts";

type Question = {
  id: string;
  label: string;
  type: "rating" | "single" | "multiple" | "text";
  required: boolean;
  options?: string[];
};
type FormVersion = {
  id: string;
  number: number;
  questions: Question[];
  notice_text: string;
  notice_version: number;
  approved_at: string | null;
  standard_unchanged: boolean;
};
type Feedback = {
  form: {
    status: string;
    version: number;
    public_url: string | null;
    retention_days: number | null;
  } | null;
  versions: FormVersion[];
  summary: {
    count: number;
    native: number;
    legacy: number;
    mean: number | null;
    distribution: number[];
    relevance: Record<string, number>;
    attendance: Record<string, number>;
  } | null;
};
type Operations = {
  episode: {
    id: string;
    alumni_id: string;
    alumni_name: string;
    status: string;
    start_at_utc: string | null;
    event_timezone: string | null;
    version: number;
    schedule_version: number;
  };
  plan: {
    teams_url: string | null;
    fallback_url: string | null;
    access_status: string;
    conductor_version: number;
    conductor_approved_version: number | null;
    version: number;
  } | null;
  library: { key: string; text: string }[];
  questions: {
    id: string;
    text: string;
    priority: string;
    sort_order: number;
    duration_minutes: number | null;
    private_note: string | null;
    version: number;
  }[];
  reminders: {
    key: string;
    due_at: string;
    status: string;
    version: number;
    schedule_version: number;
  }[];
  replay: {
    youtube_url: string | null;
    status: string;
    visibility: string;
    recording_rights: string;
    diffusion_rights: string;
    rights_evidence_ref: string | null;
    version: number;
  } | null;
  transcripts: {
    id: string;
    version: number;
    filename: string;
    reviewed_at: string | null;
  }[];
  quotes: {
    id: string;
    exact_text: string;
    source_ref: string;
    status: string;
    version: number;
  }[];
  closure: { status: string; version: number; exceptions_json: string } | null;
  checklist: Record<string, boolean>;
  stale_communications: string[];
  history: { action: string; author: string; occurred_at: string }[];
};
const headers = { "content-type": "application/json" };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new Error(data?.error?.code ?? `Erreur ${response.status}`);
  }
  return response.json() as Promise<T>;
}
const send = <T,>(path: string, payload: unknown, method = "POST") =>
  api<T>(path, { method, headers, body: JSON.stringify(payload) });
const fmt = (value: string | null | undefined, zone?: string | null) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone ?? "Europe/Paris",
      }).format(new Date(value))
    : "À définir";
const actionLabels: Record<string, string> = {
  "session.link_updated": "Lien de réunion modifié",
  "session.access_checked": "Accès vérifié manuellement",
  "session.access_recheck_required":
    "Nouvelle vérification d’accès nécessaire après report",
  "conductor.initialized": "Questions communes ajoutées",
  "question.created": "Question ajoutée",
  "question.updated": "Question modifiée",
  "conductor.approved": "Conducteur validé",
  "reminder.completed": "Rappel préparé",
  "reminder.date_invalidated": "Échéance suspendue après report",
  "reminder.date_recalculated": "Échéance recalculée",
  "session.held_confirmed": "Session tenue confirmée",
  "feedback.created": "Questionnaire créé",
  "feedback.version_created": "Nouvelle version du questionnaire",
  "feedback.approved": "Questionnaire validé",
  "feedback.opened": "Questionnaire ouvert",
  "feedback.closed": "Questionnaire fermé",
  "feedback.revoked": "Lien du questionnaire révoqué",
  "feedback.imported": "Réponses historiques importées",
  "feedback.response_deleted": "Réponse supprimée",
  "feedback.retention_purged": "Rétention appliquée aux réponses",
  "replay.updated": "Replay vérifié",
  "transcript.uploaded": "Transcription importée",
  "transcript.reviewed": "Transcription relue",
  "quote.created": "Citation proposée",
  "quote.approved": "Citation validée",
  "closure.prepared": "Clôture préparée",
  "closure.approved": "Épisode archivé",
};
const stateLabels: Record<string, string> = {
  a_preparer: "à préparer",
  termine: "terminé",
  a_verifier: "à vérifier",
  accessible: "vérifié manuellement",
  echec: "échec signalé",
  unknown: "non vérifiés",
  granted: "accordés",
  refused: "refusés",
  revoked: "révoqués",
  pending: "à vérifier",
  available: "disponible",
  unavailable: "indisponible",
  approved: "clôturée",
  prepared: "préparée",
  open: "ouvert",
  closed: "fermé",
  brouillon: "brouillon",
  realise: "tenue",
  cloture: "clôturé",
};
const labelState = (value: string | null | undefined) =>
  value ? (stateLabels[value] ?? value) : "à vérifier";
const exceptionLabels: Record<string, string> = {
  feedback: "Feedback",
  replay: "Replay",
  transcript: "Transcription",
  final_poster: "Affiche finale",
  replay_message: "Message replay",
};

export function PublicFeedback() {
  const { token } = useParams();
  const [form, setForm] = useState<{
    questions: Question[];
    notice: string;
    notice_version: number;
  } | null>(null);
  const [state, setState] = useState("Chargement du questionnaire…");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sending, setSending] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    void fetch(`/api/public/feedback/${token}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 410
              ? "Ce questionnaire est fermé, expiré ou révoqué."
              : "Questionnaire indisponible.",
          );
        setForm(await response.json());
        setState("");
      })
      .catch((error: Error) => setState(error.message));
  }, [token]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || sending) return;
    setSending(true);
    setState("");
    try {
      const response = await fetch(`/api/public/feedback/${token}/responses`, {
        method: "POST",
        headers: { ...headers, "idempotency-key": requestKey },
        body: JSON.stringify({
          answers,
          notice_version: form.notice_version,
          website: "",
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 410
            ? "Le questionnaire a été fermé."
            : "Réponse non enregistrée. Vérifiez les champs et réessayez.",
        );
      setState("Merci, votre réponse a été enregistrée.");
      setForm(null);
    } catch (error) {
      setState((error as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <main className="lot5-public">
      <div className="lot5-public-head">
        <img
          className="lot5-public-logo"
          src="/brand/voix-alumni-horizontal.png"
          alt="Voix d’Alumni"
          width="882"
          height="254"
        />
        <h1>Votre retour sur la session</h1>
        <p>Quelques minutes pour partager votre expérience.</p>
      </div>
      <div className="card lot5-public-card" aria-live="polite">
        {state && (
          <p role={state.startsWith("Merci") ? "status" : "alert"}>{state}</p>
        )}
        {form && (
          <form onSubmit={(event) => void submit(event)}>
            <p className="lot5-notice">{form.notice}</p>
            {form.questions.map((question) => (
              <fieldset key={question.id}>
                <legend>
                  {question.label}{" "}
                  {question.required && <span aria-label="obligatoire">*</span>}
                </legend>
                {question.type === "text" ? (
                  <textarea
                    required={question.required}
                    maxLength={2000}
                    value={String(answers[question.id] ?? "")}
                    onChange={(event) =>
                      setAnswers({
                        ...answers,
                        [question.id]: event.target.value,
                      })
                    }
                  />
                ) : question.type === "rating" ? (
                  <div className="lot5-options">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <label key={value}>
                        <input
                          type="radio"
                          required={question.required}
                          name={question.id}
                          checked={answers[question.id] === value}
                          onChange={() =>
                            setAnswers({ ...answers, [question.id]: value })
                          }
                        />{" "}
                        {value}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="lot5-options">
                    {question.options?.map((option) => (
                      <label key={option}>
                        <input
                          type={
                            question.type === "multiple" ? "checkbox" : "radio"
                          }
                          name={question.id}
                          checked={
                            question.type === "multiple"
                              ? ((
                                  answers[question.id] as string[] | undefined
                                )?.includes(option) ?? false)
                              : answers[question.id] === option
                          }
                          onChange={(event) =>
                            setAnswers({
                              ...answers,
                              [question.id]:
                                question.type === "multiple"
                                  ? event.target.checked
                                    ? [
                                        ...((answers[
                                          question.id
                                        ] as string[]) ?? []),
                                        option,
                                      ]
                                    : (
                                        (answers[question.id] as string[]) ?? []
                                      ).filter((value) => value !== option)
                                  : option,
                            })
                          }
                        />{" "}
                        {option}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            ))}
            <input
              className="lot5-honeypot"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <button className="lot2-button primary" disabled={sending}>
              Envoyer mon retour
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function QuestionEditor({
  item,
  onSave,
}: {
  item: Operations["questions"][number];
  onSave: (value: {
    text: string;
    sort_order: number;
    priority: string;
    duration_minutes: number | null;
    private_note: string | null;
    expected_version: number;
  }) => void;
}) {
  const [text, setText] = useState(item.text),
    [order, setOrder] = useState(item.sort_order),
    [priority, setPriority] = useState(item.priority),
    [duration, setDuration] = useState(item.duration_minutes ?? 0),
    [note, setNote] = useState(item.private_note ?? "");
  return (
    <div className="lot5-editor">
      <label>
        Formulation
        <input value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <label>
        Ordre
        <input
          type="number"
          min={1}
          max={100}
          value={order}
          onChange={(event) => setOrder(Number(event.target.value))}
        />
      </label>
      <label>
        Priorité
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="haute">Haute</option>
          <option value="normale">Normale</option>
          <option value="facultative">Facultative</option>
        </select>
      </label>
      <label>
        Durée prévue (minutes)
        <input
          type="number"
          min={0}
          max={120}
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
        />
      </label>
      <label>
        Note privée
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button
        className="lot2-button"
        disabled={!text.trim()}
        onClick={() =>
          onSave({
            text,
            sort_order: order,
            priority,
            duration_minutes: duration || null,
            private_note: note || null,
            expected_version: item.version,
          })
        }
      >
        Enregistrer la question
      </button>
    </div>
  );
}

export function EpisodeOperations({ organizer }: { organizer: Organizer }) {
  const { id } = useParams();
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [teams, setTeams] = useState("");
  const [fallback, setFallback] = useState("");
  const [question, setQuestion] = useState("");
  const [quote, setQuote] = useState("");
  const [source, setSource] = useState("");
  const [replayUrl, setReplayUrl] = useState("");
  const [replayStatus, setReplayStatus] = useState("pending");
  const [visibility, setVisibility] = useState("unlisted");
  const [recordingRights, setRecordingRights] = useState("unknown");
  const [diffusionRights, setDiffusionRights] = useState("unknown");
  const [rightsEvidence, setRightsEvidence] = useState("");
  const [exceptions, setExceptions] = useState<Record<string, string>>({});
  const [transcriptText, setTranscriptText] = useState("");
  const refresh = useCallback(async () => {
    if (!id) return;
    const next = await api<Operations>(`/episodes/${id}/operations`);
    setData(next);
    setTeams(next.plan?.teams_url ?? "");
    setFallback(next.plan?.fallback_url ?? "");
    setReplayUrl(next.replay?.youtube_url ?? "");
    setReplayStatus(next.replay?.status ?? "pending");
    setVisibility(next.replay?.visibility ?? "unlisted");
    setRecordingRights(next.replay?.recording_rights ?? "unknown");
    setDiffusionRights(next.replay?.diffusion_rights ?? "unknown");
    setRightsEvidence(next.replay?.rights_evidence_ref ?? "");
    setExceptions(
      next.closure
        ? (JSON.parse(next.closure.exceptions_json) as Record<string, string>)
        : {},
    );
  }, [id]);
  useEffect(() => {
    void refresh().catch((cause: Error) => setError(cause.message));
  }, [refresh]);
  async function act(
    path: string,
    payload: unknown,
    message: string,
    method = "POST",
  ) {
    setError("");
    setSuccess("");
    try {
      await send(`/episodes/${id}${path}`, payload, method);
      await refresh();
      setSuccess(message);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!data)
    return (
      <div className="card lot5-panel">
        {error || "Chargement de la conduite de session…"}
      </div>
    );
  const prod = organizer.role === "PRODUCTION",
    resp = organizer.role === "RESPONSABLE";
  const closureExceptions = data.closure
    ? (JSON.parse(data.closure.exceptions_json) as Record<string, string>)
    : {};
  return (
    <div className="lot5-page">
      <header className="page-header">
        <span className="eyebrow">SESSION · JOUR J · ARCHIVES</span>
        <h1>Conduite de l’épisode</h1>
        <p>
          {data.episode.alumni_name} ·{" "}
          {fmt(data.episode.start_at_utc, data.episode.event_timezone)} ·{" "}
          {labelState(data.episode.status)}
        </p>
        <Link to={`/episodes/${id}`}>← Fiche épisode</Link>
      </header>
      {error && (
        <p role="alert" className="lot5-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="lot5-success">
          {success}
        </p>
      )}
      {data.stale_communications.length > 0 && (
        <p role="alert" className="lot5-error">
          Le report a rendu obsolètes {data.stale_communications.length}{" "}
          communication(s). Vérifiez leurs nouvelles versions avant diffusion.
        </p>
      )}
      <div className="lot5-grid">
        <section className="card lot5-panel">
          <h2>Réunion et accès</h2>
          <p>Les liens sont saisis et vérifiés manuellement.</p>
          <label>
            Lien Microsoft Teams
            <input
              type="url"
              value={teams}
              onChange={(event) => setTeams(event.target.value)}
              disabled={!prod}
              placeholder="https://teams.microsoft.com/…"
            />
          </label>
          <label>
            Lien de secours
            <input
              type="url"
              value={fallback}
              onChange={(event) => setFallback(event.target.value)}
              disabled={!prod}
            />
          </label>
          <div className="lot5-actions">
            {prod && (
              <button
                className="lot2-button"
                onClick={() =>
                  void act(
                    "/session-plan",
                    {
                      teams_url: teams,
                      fallback_url: fallback,
                      expected_version: data.plan?.version ?? null,
                    },
                    "Lien enregistré.",
                    "PUT",
                  )
                }
              >
                Enregistrer les liens
              </button>
            )}
            {data.plan?.teams_url && (
              <a
                className="lot2-button primary"
                href={data.plan.teams_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir Teams ↗
              </a>
            )}
            {prod && data.plan?.teams_url && (
              <button
                className="lot2-button"
                onClick={() =>
                  void act(
                    "/session-plan/check-access",
                    {
                      expected_version: data.plan?.version,
                      status: "accessible",
                      confirmed_manual_check: true,
                    },
                    "Vérification manuelle enregistrée.",
                  )
                }
              >
                Accès vérifié manuellement
              </button>
            )}
          </div>
          <p>
            Accès : {labelState(data.plan?.access_status)} · calendrier v
            {data.episode.schedule_version}
          </p>
        </section>
        <section className="card lot5-panel">
          <h2>Conducteur d’animation</h2>
          <p>
            Validation finale : Responsable. Notes réservées aux organisateurs.
          </p>
          {data.questions.length ? (
            <ol className="lot5-questions">
              {data.questions.map((item) => (
                <li key={item.id}>
                  <strong>{item.text}</strong>
                  <small>
                    {item.priority}
                    {item.duration_minutes
                      ? ` · ${item.duration_minutes} min`
                      : ""}
                  </small>
                  {item.private_note && <p>{item.private_note}</p>}
                  {prod && (
                    <details>
                      <summary>Modifier la question</summary>
                      <QuestionEditor
                        item={item}
                        onSave={(value) =>
                          void act(
                            `/questions/${item.id}`,
                            value,
                            "Question modifiée ; conducteur à revalider.",
                            "PATCH",
                          )
                        }
                      />
                    </details>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p>Les six questions communes sont prêtes à être ajoutées.</p>
          )}
          <div className="lot5-actions">
            {prod && !data.questions.length && (
              <button
                className="lot2-button"
                onClick={() =>
                  void act(
                    "/questions/initialize",
                    {},
                    "Questions communes ajoutées.",
                  )
                }
              >
                Ajouter les questions communes
              </button>
            )}
            {resp &&
              data.questions.length > 0 &&
              data.plan?.conductor_approved_version !==
                data.plan?.conductor_version && (
                <button
                  className="lot2-button primary"
                  onClick={() =>
                    void act(
                      "/conductor/approve",
                      { expected_version: data.plan?.version },
                      "Conducteur validé.",
                    )
                  }
                >
                  Valider le conducteur
                </button>
              )}
          </div>
          {prod && data.questions.length > 0 && (
            <div className="lot5-inline">
              <label>
                Question spécifique
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                />
              </label>
              <button
                className="lot2-button"
                disabled={!question.trim()}
                onClick={() =>
                  void act(
                    "/questions",
                    {
                      text: question,
                      sort_order: data.questions.length + 1,
                      priority: "normale",
                      duration_minutes: null,
                      private_note: null,
                    },
                    "Question ajoutée.",
                  ).then(() => setQuestion(""))
                }
              >
                Ajouter
              </button>
            </div>
          )}
          <p>
            État :{" "}
            {data.plan?.conductor_approved_version ===
              data.plan?.conductor_version && data.plan
              ? "validé"
              : "à valider"}
          </p>
        </section>
        <section className="card lot5-panel">
          <h2>Rappels internes</h2>
          <p>
            Le report recalcule les rappels encore à préparer. Aucun envoi
            externe automatique.
          </p>
          <ul>
            {data.reminders.map((item) => (
              <li key={item.key}>
                <strong>{item.key.replaceAll("_", " ").toUpperCase()}</strong> ·{" "}
                {fmt(item.due_at, data.episode.event_timezone)} ·{" "}
                {labelState(item.status)}{" "}
                {prod && item.status === "a_preparer" && (
                  <button
                    className="lot2-button"
                    onClick={() =>
                      void act(
                        `/reminders/${item.key}/complete`,
                        { expected_version: item.version },
                        "Rappel préparé.",
                      )
                    }
                  >
                    Marquer préparé
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="card lot5-panel">
          <h2>Jour J</h2>
          <p>
            La session n’est tenue qu’après constat explicite de la Responsable.
          </p>
          <p>
            Intervenant :{" "}
            <Link to={`/intervenants/${data.episode.alumni_id}`}>
              {data.episode.alumni_name}
            </Link>
          </p>
          {resp &&
            data.episode.status !== "realise" &&
            data.episode.status !== "cloture" && (
              <button
                className="lot2-button primary"
                onClick={() => {
                  if (
                    window.confirm(
                      "Confirmer que la session s’est réellement tenue ?",
                    )
                  )
                    void act(
                      "/mark-held",
                      {
                        expected_version: data.episode.version,
                        confirmed_held: true,
                      },
                      "Tenue de la session constatée.",
                    );
                }}
              >
                Confirmer la tenue de la session
              </button>
            )}
        </section>
        <section className="card lot5-panel">
          <h2>Replay YouTube</h2>
          <p>Référence manuelle ; aucune mise en ligne automatique.</p>
          <label>
            URL YouTube
            <input
              value={replayUrl}
              onChange={(event) => setReplayUrl(event.target.value)}
              disabled={!prod}
            />
          </label>
          <p>
            Droits d’enregistrement :{" "}
            {labelState(data.replay?.recording_rights)} · diffusion :{" "}
            {labelState(data.replay?.diffusion_rights)}
          </p>
          {prod && (
            <>
              <label>
                Visibilité
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value)}
                >
                  <option value="unlisted">Non répertoriée</option>
                  <option value="public">Publique</option>
                  <option value="private">Privée</option>
                </select>
              </label>
              <label>
                Disponibilité
                <select
                  value={replayStatus}
                  onChange={(event) => setReplayStatus(event.target.value)}
                >
                  <option value="pending">À vérifier</option>
                  <option value="available">Disponible</option>
                  <option value="unavailable">Indisponible</option>
                </select>
              </label>
              <label>
                Droits d’enregistrement
                <select
                  value={recordingRights}
                  onChange={(event) => setRecordingRights(event.target.value)}
                >
                  {["unknown", "granted", "refused", "revoked"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Droits de diffusion
                <select
                  value={diffusionRights}
                  onChange={(event) => setDiffusionRights(event.target.value)}
                >
                  {["unknown", "granted", "refused", "revoked"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Référence de preuve
                <input
                  value={rightsEvidence}
                  onChange={(event) => setRightsEvidence(event.target.value)}
                />
              </label>
              <button
                className="lot2-button"
                onClick={() =>
                  void act(
                    "/replay",
                    {
                      youtube_url: replayUrl,
                      visibility,
                      status: replayStatus,
                      recording_rights: recordingRights,
                      diffusion_rights: diffusionRights,
                      rights_evidence_ref: rightsEvidence,
                      expected_version: data.replay?.version ?? null,
                    },
                    "Référence du replay enregistrée.",
                    "PUT",
                  )
                }
              >
                Enregistrer la référence
              </button>
            </>
          )}
        </section>
        <section className="card lot5-panel">
          <h2>Transcription et citations</h2>
          <ul>
            {data.transcripts.map((item) => (
              <li key={item.id}>
                <button
                  className="lot5-text-button"
                  onClick={() =>
                    void api<{ text: string }>(
                      `/episodes/${id}/transcripts/${item.id}`,
                    )
                      .then((result) => setTranscriptText(result.text))
                      .catch((cause: Error) => setError(cause.message))
                  }
                >
                  v{item.version} · {item.filename}
                </button>{" "}
                · {item.reviewed_at ? "relue" : "à relire"}
                {prod && !item.reviewed_at && (
                  <button
                    className="lot2-button"
                    disabled={!transcriptText.trim()}
                    onClick={() =>
                      void act(
                        `/transcripts/${item.id}/review`,
                        {
                          corrected_text: transcriptText,
                          confirmed_review: true,
                        },
                        "Transcription relue.",
                      )
                    }
                  >
                    Valider la relecture
                  </button>
                )}
              </li>
            ))}
          </ul>
          {transcriptText && (
            <textarea
              aria-label="Texte de transcription"
              value={transcriptText}
              onChange={(event) => setTranscriptText(event.target.value)}
            />
          )}
          {prod && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void fetch(`/api/v1/episodes/${id}/transcripts`, {
                  method: "POST",
                  credentials: "include",
                  body: form,
                })
                  .then(async (response) => {
                    if (!response.ok)
                      throw new Error(
                        ((await response.json()) as { error: { code: string } })
                          .error.code,
                      );
                    await refresh();
                    setSuccess("Transcription importée.");
                  })
                  .catch((cause: Error) => setError(cause.message));
              }}
            >
              <label>
                Fichier TXT, VTT ou SRT
                <input
                  type="file"
                  name="file"
                  accept=".txt,.vtt,.srt"
                  required
                />
              </label>
              <input type="hidden" name="language" value="fr" />
              <label>
                Provenance
                <input
                  name="provenance"
                  required
                  placeholder="Source de la transcription"
                />
              </label>
              <button className="lot2-button">Importer</button>
            </form>
          )}
          <ul>
            {data.quotes.map((item) => (
              <li key={item.id}>
                « {item.exact_text} » · {item.source_ref} · {item.status}{" "}
                {resp && item.status !== "approved" && (
                  <button
                    className="lot2-button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Avez-vous vérifié le texte exact et sa provenance ?",
                        )
                      )
                        void act(
                          `/quotes/${item.id}/approve`,
                          {
                            expected_version: item.version,
                            confirmed_exact: true,
                          },
                          "Citation validée.",
                        );
                    }}
                  >
                    Valider
                  </button>
                )}
              </li>
            ))}
          </ul>
          {prod && (
            <div className="lot5-inline">
              <label>
                Citation exacte
                <input
                  value={quote}
                  onChange={(event) => setQuote(event.target.value)}
                />
              </label>
              <label>
                Référence précise
                <input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                />
              </label>
              <button
                className="lot2-button"
                disabled={!quote.trim() || source.trim().length < 3}
                onClick={() =>
                  void act(
                    "/quotes",
                    { exact_text: quote, source_ref: source },
                    "Citation proposée.",
                  ).then(() => {
                    setQuote("");
                    setSource("");
                  })
                }
              >
                Proposer
              </button>
            </div>
          )}
        </section>
        <section className="card lot5-panel">
          <h2>Clôture</h2>
          <ul className="lot5-checklist">
            {Object.entries(data.checklist).map(([key, ok]) => (
              <li key={key}>
                {ok ? "✓" : "○"}{" "}
                {
                  (
                    {
                      held: "Session tenue",
                      conductor: "Conducteur validé",
                      hotThanks: "Remerciement diffusé",
                      feedback: "Feedback disponible",
                      replay: "Replay autorisé",
                      transcript: "Transcription relue",
                      quotes: "Citations validées",
                      finalPoster: "Affiche finale préparée",
                      replayMessage: "Message replay diffusé",
                    } as Record<string, string>
                  )[key]
                }
                {!ok &&
                  ((key === "finalPoster" && closureExceptions.final_poster) ||
                    (key === "replayMessage" &&
                      closureExceptions.replay_message) ||
                    (key === "transcript" && closureExceptions.transcript) ||
                    (key === "replay" && closureExceptions.replay) ||
                    (key === "feedback" && closureExceptions.feedback)) &&
                  " · exception motivée"}
              </li>
            ))}
          </ul>
          {prod && (
            <details>
              <summary>Exceptions motivées</summary>
              {[
                "feedback",
                "replay",
                "transcript",
                "final_poster",
                "replay_message",
              ].map((key) => (
                <label key={key}>
                  {key}
                  <textarea
                    value={exceptions[key] ?? ""}
                    onChange={(event) =>
                      setExceptions({
                        ...exceptions,
                        [key]: event.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </details>
          )}
          {prod && (
            <button
              className="lot2-button"
              onClick={() =>
                void act(
                  "/closure/prepare",
                  {
                    expected_version: data.closure?.version ?? null,
                    exceptions: Object.fromEntries(
                      Object.entries(exceptions).filter(([, value]) =>
                        value.trim(),
                      ),
                    ),
                  },
                  "Clôture préparée.",
                )
              }
            >
              Préparer la clôture
            </button>
          )}
          {resp && data.closure?.status === "prepared" && (
            <button
              className="lot2-button primary"
              onClick={() => {
                if (
                  window.confirm(
                    "Approuver définitivement la clôture de cet épisode ?",
                  )
                )
                  void act(
                    "/closure/approve",
                    {
                      expected_version: data.closure?.version,
                      confirmed_archive: true,
                    },
                    "Épisode archivé.",
                  );
              }}
            >
              Approuver la clôture
            </button>
          )}
          {Object.keys(closureExceptions).length > 0 && (
            <div className="lot5-exceptions">
              <strong>Dérogations consignées</strong>
              <ul>
                {Object.entries(closureExceptions).map(([key, reason]) => (
                  <li key={key}>
                    <strong>{exceptionLabels[key] ?? key} :</strong> {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p>
            État :{" "}
            {data.closure ? labelState(data.closure.status) : "à préparer"}
          </p>
        </section>
        <section className="card lot5-panel">
          <details>
            <summary>Historique de la session</summary>
            <ol>
              {data.history.map((item, index) => (
                <li key={`${item.action}-${index}`}>
                  {actionLabels[item.action] ?? "Action enregistrée"} ·{" "}
                  {item.author} · {fmt(item.occurred_at)}
                </li>
              ))}
            </ol>
          </details>
        </section>
      </div>
      <div className="lot5-actions">
        <Link className="lot2-button" to={`/episodes/${id}/feedback`}>
          Questionnaire et résultats →
        </Link>
        <Link className="lot2-button" to={`/studio?episode=${id}`}>
          Affiches →
        </Link>
        <Link className="lot2-button" to={`/communications?episode=${id}`}>
          Communications →
        </Link>
      </div>
    </div>
  );
}

export function EpisodeFeedback({ organizer }: { organizer: Organizer }) {
  const { id } = useParams();
  const [data, setData] = useState<Feedback | null>(null);
  const [responses, setResponses] = useState<
    {
      id: string;
      source: string;
      answers: Record<string, unknown>;
      submitted_at: string;
    }[]
  >([]);
  const [policy, setPolicy] = useState<{
    notice_text: string;
    retention_days: number;
  } | null>(null);
  const [realOpenReady, setRealOpenReady] = useState(false);
  const [fixtureMode, setFixtureMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [days, setDays] = useState(180);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
    columns: string[];
    rows: number;
    valid: number;
    anomalies: number[];
    duplicates_in_file: number;
  } | null>(null);
  const refresh = useCallback(async () => {
    const [feedback, answerData, policyData] = await Promise.all([
      api<Feedback>(`/episodes/${id}/feedback`),
      api<{ items: typeof responses }>(`/episodes/${id}/feedback/responses`),
      api<{
        policy: typeof policy;
        real_open_ready: boolean;
        fixture_mode: boolean;
      }>("/feedback/policy"),
    ]);
    setData(feedback);
    setResponses(answerData.items);
    setPolicy(policyData.policy);
    setRealOpenReady(policyData.real_open_ready);
    setFixtureMode(policyData.fixture_mode);
    setNotice(
      feedback.versions[0]?.notice_text ?? policyData.policy?.notice_text ?? "",
    );
    setQuestions(feedback.versions[0]?.questions ?? []);
  }, [id]);
  useEffect(() => {
    void refresh().catch((cause: Error) => setError(cause.message));
  }, [refresh]);
  async function act(
    path: string,
    payload: unknown,
    message: string,
    method = "POST",
  ) {
    setError("");
    setSuccess("");
    try {
      await send(path, payload, method);
      await refresh();
      setSuccess(message);
      setEditing(false);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function importCsv(mode: "preview" | "commit") {
    setError("");
    try {
      const result = await send<{
        columns: string[];
        rows: number;
        valid: number;
        anomalies: number[];
        duplicates_in_file: number;
        status?: string;
        inserted?: number;
      }>(`/episodes/${id}/feedback/import/${mode}`, {
        csv,
        mapping,
        confirmed: mode === "commit",
      });
      if (mode === "preview") setPreview(result);
      else {
        await refresh();
        setSuccess(
          `Import terminé : ${result.inserted ?? 0} réponse(s) ajoutée(s).`,
        );
      }
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const copy = [...questions];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setQuestions(copy);
  }
  return (
    <div className="lot5-page">
      <header className="page-header">
        <span className="eyebrow">FEEDBACK NATIF</span>
        <h1>Questionnaire et résultats</h1>
        <p>
          Réponses sans identité demandée, versions conservées, ouverture
          distincte de la validation. Un commentaire libre peut identifier son
          auteur.
        </p>
        <Link to={`/episodes/${id}`}>← Fiche épisode</Link>
      </header>
      {error && (
        <p role="alert" className="lot5-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="lot5-success">
          {success}
        </p>
      )}
      {!data ? (
        <div className="card lot5-panel">Chargement…</div>
      ) : (
        <div className="lot5-grid">
          <section className="card lot5-panel">
            <h2>Modèle et confidentialité</h2>
            {policy ? (
              <p>
                {fixtureMode ? "Notice fictive de recette" : "Notice approuvée"}{" "}
                · conservation {policy.retention_days} jours
              </p>
            ) : (
              <p>
                Aucune notice approuvée. Le questionnaire public ne peut pas
                être ouvert.
              </p>
            )}
            {!realOpenReady && (
              <p>
                Ouverture réelle bloquée : identité et contact du responsable,
                base juridique, hébergement et notice complète restent à
                valider.
              </p>
            )}
            {organizer.role === "RESPONSABLE" && (
              <details>
                <summary>Approuver la notice et la rétention</summary>
                <label>
                  Notice de confidentialité
                  <textarea
                    value={notice}
                    onChange={(event) => setNotice(event.target.value)}
                  />
                </label>
                <label>
                  Conservation en jours
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value))}
                  />
                </label>
                <button
                  className="lot2-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Approuver cette notice et cette durée pour le modèle standard ?",
                      )
                    )
                      void act(
                        "/feedback/policy",
                        {
                          notice_text: notice,
                          retention_days: days,
                          confirmed: true,
                        },
                        "Politique approuvée.",
                      );
                  }}
                >
                  Approuver
                </button>
              </details>
            )}
            {organizer.role === "PRODUCTION" && !data.form && (
              <button
                className="lot2-button"
                onClick={() =>
                  void act(
                    `/episodes/${id}/feedback`,
                    {},
                    "Questionnaire standard créé.",
                  )
                }
              >
                Créer depuis le modèle standard
              </button>
            )}
            {data.form && (
              <>
                <p>
                  État : <strong>{labelState(data.form.status)}</strong> ·
                  version {data.versions[0]?.number}
                </p>
                {data.form.public_url && (
                  <a
                    href={data.form.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ouvrir le formulaire public ↗
                  </a>
                )}
                {organizer.role === "PRODUCTION" &&
                  data.form.status !== "open" && (
                    <label>
                      Expiration facultative du lien public
                      <input
                        type="datetime-local"
                        value={expiry}
                        onChange={(event) => setExpiry(event.target.value)}
                      />
                    </label>
                  )}
                <div className="lot5-actions">
                  {organizer.role === "RESPONSABLE" &&
                    !data.versions[0]?.approved_at && (
                      <button
                        className="lot2-button primary"
                        onClick={() =>
                          void act(
                            `/episodes/${id}/feedback/approve`,
                            { expected_version: data.form?.version },
                            "Questionnaire validé.",
                          )
                        }
                      >
                        Valider cette version
                      </button>
                    )}
                  {organizer.role === "PRODUCTION" &&
                    data.form.status !== "open" && (
                      <button
                        className="lot2-button primary"
                        disabled={
                          !realOpenReady ||
                          !data.versions[0]?.approved_at ||
                          !data.form.retention_days
                        }
                        title={
                          !realOpenReady
                            ? "Informations de confidentialité réelles non approuvées"
                            : !data.versions[0]?.approved_at
                              ? "Validation de la Responsable nécessaire"
                              : !data.form.retention_days
                                ? "Notice et rétention nécessaires"
                                : ""
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              "Ouvrir le questionnaire au public ? Aucun message ne sera envoyé automatiquement.",
                            )
                          )
                            void act(
                              `/episodes/${id}/feedback/open`,
                              {
                                expected_version: data.form?.version,
                                confirmed: true,
                                expires_at: expiry
                                  ? new Date(expiry).toISOString()
                                  : null,
                              },
                              "Questionnaire ouvert.",
                            );
                        }}
                      >
                        Ouvrir le formulaire
                      </button>
                    )}
                  {data.form.status === "open" && (
                    <>
                      <button
                        className="lot2-button"
                        onClick={() =>
                          void act(
                            `/episodes/${id}/feedback/closed`,
                            { expected_version: data.form?.version },
                            "Questionnaire fermé.",
                          )
                        }
                      >
                        Fermer
                      </button>
                      <button
                        className="lot2-button subtle"
                        onClick={() => {
                          if (window.confirm("Révoquer ce lien public ?"))
                            void act(
                              `/episodes/${id}/feedback/revoked`,
                              { expected_version: data.form?.version },
                              "Lien révoqué.",
                            );
                        }}
                      >
                        Révoquer
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
          {data.form && (
            <section className="card lot5-panel">
              <h2>Questions et versions</h2>
              <ol>
                {data.versions[0]?.questions.map((item) => (
                  <li key={item.id}>
                    {item.label} {item.required ? "*" : ""}{" "}
                    <small>({item.type})</small>
                  </li>
                ))}
              </ol>
              <details>
                <summary>Prévisualiser le formulaire public</summary>
                <p className="lot5-notice">
                  {editing ? notice : data.versions[0]?.notice_text}
                </p>
                <ol>
                  {(editing
                    ? questions
                    : (data.versions[0]?.questions ?? [])
                  ).map((item) => (
                    <li key={item.id}>
                      <strong>{item.label}</strong> {item.required && "*"}
                      {item.options && <p>{item.options.join(" · ")}</p>}
                    </li>
                  ))}
                </ol>
              </details>
              {organizer.role === "PRODUCTION" && (
                <button
                  className="lot2-button"
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? "Annuler" : "Adapter le questionnaire"}
                </button>
              )}
              {editing && (
                <div className="lot5-editor">
                  {questions.map((item, index) => (
                    <div key={item.id}>
                      <label>
                        Question {index + 1}
                        <input
                          value={item.label}
                          onChange={(event) =>
                            setQuestions(
                              questions.map((q, i) =>
                                i === index
                                  ? { ...q, label: event.target.value }
                                  : q,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(event) =>
                            setQuestions(
                              questions.map((q, i) =>
                                i === index
                                  ? { ...q, required: event.target.checked }
                                  : q,
                              ),
                            )
                          }
                        />{" "}
                        Obligatoire
                      </label>
                      <label>
                        Type
                        <select
                          value={item.type}
                          onChange={(event) =>
                            setQuestions(
                              questions.map((q, i) =>
                                i === index
                                  ? {
                                      ...q,
                                      type: event.target
                                        .value as Question["type"],
                                      options: ["single", "multiple"].includes(
                                        event.target.value,
                                      )
                                        ? (q.options ?? [
                                            "Option 1",
                                            "Option 2",
                                          ])
                                        : undefined,
                                    }
                                  : q,
                              ),
                            )
                          }
                        >
                          <option value="rating">Note de 1 à 5</option>
                          <option value="single">Choix unique</option>
                          <option value="multiple">Choix multiple</option>
                          <option value="text">Texte libre</option>
                        </select>
                      </label>
                      {(item.type === "single" || item.type === "multiple") && (
                        <label>
                          Options séparées par des virgules
                          <input
                            value={item.options?.join(", ") ?? ""}
                            onChange={(event) =>
                              setQuestions(
                                questions.map((q, i) =>
                                  i === index
                                    ? {
                                        ...q,
                                        options: event.target.value
                                          .split(",")
                                          .map((value) => value.trim())
                                          .filter(Boolean),
                                      }
                                    : q,
                                ),
                              )
                            }
                          />
                        </label>
                      )}
                      <div className="lot5-actions">
                        <button
                          className="lot2-button"
                          disabled={index === 0}
                          onClick={() => moveQuestion(index, -1)}
                        >
                          Monter
                        </button>
                        <button
                          className="lot2-button"
                          disabled={index === questions.length - 1}
                          onClick={() => moveQuestion(index, 1)}
                        >
                          Descendre
                        </button>
                        <button
                          className="lot2-button subtle"
                          disabled={questions.length <= 1}
                          onClick={() =>
                            setQuestions(
                              questions.filter((_, i) => i !== index),
                            )
                          }
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="lot2-button"
                    onClick={() =>
                      setQuestions([
                        ...questions,
                        {
                          id: `question_${crypto.randomUUID().slice(0, 8)}`,
                          label: "Nouvelle question",
                          type: "text",
                          required: false,
                        },
                      ])
                    }
                  >
                    Ajouter une question
                  </button>
                  <label>
                    Notice
                    <textarea
                      value={notice}
                      onChange={(event) => setNotice(event.target.value)}
                    />
                  </label>
                  <button
                    className="lot2-button primary"
                    onClick={() =>
                      void act(
                        `/episodes/${id}/feedback`,
                        {
                          expected_version: data.form?.version,
                          questions,
                          notice_text: notice,
                        },
                        "Nouvelle version à valider.",
                        "PATCH",
                      )
                    }
                  >
                    Enregistrer une nouvelle version
                  </button>
                </div>
              )}
              <details>
                <summary>Versions précédentes ({data.versions.length})</summary>
                {data.versions.map((item) => (
                  <p key={item.id}>
                    v{item.number} ·{" "}
                    {item.approved_at ? "validée" : "à valider"} · notice v
                    {item.notice_version}
                  </p>
                ))}
              </details>
            </section>
          )}
          {data.summary && (
            <section className="card lot5-panel">
              <h2>Résultats</h2>
              <p>
                <strong>{data.summary.count}</strong> réponse(s), dont{" "}
                {data.summary.native} natives et {data.summary.legacy}{" "}
                historiques.{" "}
                {data.summary.count < 5 &&
                  "Échantillon réduit : interprétation prudente."}
              </p>
              <p>Note moyenne : {data.summary.mean?.toFixed(1) ?? "—"} / 5</p>
              <div className="lot5-bars">
                {data.summary.distribution.map((count, index) => (
                  <div key={index}>
                    {index + 1}/5{" "}
                    <span
                      style={{
                        width: `${Math.max(4, (count / Math.max(1, data.summary?.count ?? 1)) * 100)}%`,
                      }}
                    />{" "}
                    {count}
                  </div>
                ))}
              </div>
              <p>
                Pertinence :{" "}
                {Object.entries(data.summary.relevance)
                  .map(([key, count]) => `${key} ${count}`)
                  .join(" · ") || "—"}
              </p>
              <p>
                Suivi :{" "}
                {Object.entries(data.summary.attendance)
                  .map(([key, count]) => `${key} ${count}`)
                  .join(" · ") || "—"}
              </p>
              <details>
                <summary>Réponses textuelles et suggestions</summary>
                {responses.map((item) => (
                  <div className="lot5-response" key={item.id}>
                    <p>
                      {item.source === "legacy" ? "Historique" : "Natif"} ·{" "}
                      {fmt(item.submitted_at)}
                    </p>
                    {Object.entries(item.answers)
                      .filter(
                        ([, value]) =>
                          typeof value === "string" && value.length > 0,
                      )
                      .map(([key, value]) => (
                        <p key={key}>
                          <strong>{key}</strong> : {String(value)}
                        </p>
                      ))}
                    {organizer.role === "RESPONSABLE" && (
                      <button
                        className="lot2-button subtle"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Supprimer définitivement le contenu de cette réponse ?",
                            )
                          )
                            void api(
                              `/episodes/${id}/feedback/responses/${item.id}`,
                              { method: "DELETE" },
                            )
                              .then(refresh)
                              .catch((cause: Error) => setError(cause.message));
                        }}
                      >
                        Supprimer la réponse
                      </button>
                    )}
                  </div>
                ))}
              </details>
              <a
                className="lot2-button"
                href={`/api/v1/episodes/${id}/feedback/export.csv`}
              >
                Exporter le CSV
              </a>
            </section>
          )}
          {organizer.role === "PRODUCTION" && data.form && (
            <section className="card lot5-panel">
              <h2>Import Google Forms historique</h2>
              <p>
                Choisissez un CSV fictif ou autorisé. Les colonnes sont reliées
                aux questions de la version courante ; l’aperçu précède
                l’import.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Fichier CSV historique"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000) {
                    setError("CSV trop volumineux.");
                    return;
                  }
                  void file.text().then((value) => {
                    setCsv(value);
                    setPreview(null);
                    const columns =
                      value
                        .split(/\r?\n/, 1)[0]
                        ?.replace(/^\uFEFF/, "")
                        .split(/[;,]/) ?? [];
                    setMapping(
                      Object.fromEntries(
                        columns
                          .filter((column) =>
                            questions.some((q) => q.id === column),
                          )
                          .map((column) => [column, column]),
                      ),
                    );
                  });
                }}
              />
              {csv && (
                <>
                  <p>Associer chaque colonne à une question :</p>
                  {(
                    csv
                      .split(/\r?\n/, 1)[0]
                      ?.replace(/^\uFEFF/, "")
                      .split(/[;,]/) ?? []
                  ).map((column) => (
                    <label key={column}>
                      {column}
                      <select
                        value={mapping[column] ?? ""}
                        onChange={(event) =>
                          setMapping({
                            ...mapping,
                            [column]: event.target.value,
                          })
                        }
                      >
                        <option value="">Ignorer</option>
                        {questions.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button
                    className="lot2-button"
                    onClick={() => void importCsv("preview")}
                  >
                    Prévisualiser l’import
                  </button>
                </>
              )}
              {preview && (
                <div>
                  <p>
                    {preview.valid}/{preview.rows} lignes valides ·{" "}
                    {preview.duplicates_in_file} doublon(s) · anomalies lignes{" "}
                    {preview.anomalies.join(", ") || "aucune"}
                  </p>
                  <button
                    className="lot2-button primary"
                    disabled={
                      preview.valid !== preview.rows ||
                      preview.duplicates_in_file > 0
                    }
                    onClick={() => {
                      if (window.confirm("Importer ces réponses historiques ?"))
                        void importCsv("commit");
                    }}
                  >
                    Confirmer l’import
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export function FeedbackComparison() {
  const [items, setItems] = useState<
    {
      episode_id: string;
      response_count: number;
      mean: number | null;
      comparable: boolean;
    }[]
  >([]);
  useEffect(() => {
    void api<{ items: typeof items }>("/feedback/comparison").then((data) =>
      setItems(data.items),
    );
  }, []);
  return (
    <div className="lot5-page">
      <header className="page-header">
        <span className="eyebrow">ANALYSE</span>
        <h1>Feedback des épisodes</h1>
        <p>
          Les moyennes ne se comparent que pour les versions standard réellement
          identiques.
        </p>
      </header>
      <div className="card lot5-panel">
        <table>
          <thead>
            <tr>
              <th>Épisode</th>
              <th>Réponses</th>
              <th>Note /5</th>
              <th>Comparabilité</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.episode_id}-${index}`}>
                <td>
                  <Link to={`/episodes/${item.episode_id}/feedback`}>
                    Consulter →
                  </Link>
                </td>
                <td>{item.response_count}</td>
                <td>{item.mean?.toFixed(1) ?? "—"}</td>
                <td>
                  {item.comparable ? "Modèle standard" : "Questions adaptées"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p>Aucun résultat enregistré.</p>}
      </div>
    </div>
  );
}
