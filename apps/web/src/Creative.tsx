import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Organizer } from "@voix-alumni/contracts";
import { drawPoster, loadPosterImage, type PosterKind } from "./PosterCanvas";

type Content = {
  id: string;
  kind: string;
  status: string;
  version: number;
  body: string;
  fields: Record<string, string>;
  portrait_asset_id: string | null;
  exported_asset_id: string | null;
  approved_at: string | null;
  exported_at: string | null;
  published_at: string | null;
  updated_at: string;
  schedule_version: number;
  source_stale: boolean;
};
type Asset = {
  id: string;
  kind: string;
  filename: string;
  mime_type: string;
  rights_status: string;
  rights_evidence_ref: string | null;
  version: number;
  byte_size: string;
  uploaded_at: string;
};
type Consent = {
  id: string;
  asset_id: string;
  purpose: string;
  status: string;
  scope: string;
  evidence_ref: string | null;
  version: number;
};
type CreativeData = {
  episode: {
    id: string;
    public_number: number | null;
    start_at_utc: string | null;
    event_timezone: string | null;
    schedule_version: number;
  };
  alumni: {
    id: string;
    full_name: string;
    promotion_year: string | null;
    job_title: string | null;
    company: string | null;
  };
  contents: Content[];
  assets: Asset[];
  consents: Consent[];
};
type EpisodeOption = {
  id: string;
  alumni_name: string | null;
  public_number: number | null;
  status: string;
};
const posterKinds = [
  { key: "announcement_poster", label: "Affiche d’annonce" },
  { key: "thank_you_poster", label: "Affiche de remerciement" },
];
const messageKinds = [
  { key: "announcement_message", label: "Annonce de session" },
  { key: "meeting_reminder", label: "Rappel J-1" },
  { key: "meeting_link", label: "Lien de réunion" },
  { key: "hot_thanks", label: "Merci immédiat et feedback" },
  { key: "final_thanks", label: "Remerciement final et replay" },
  { key: "schedule_change", label: "Report ou annulation" },
];
const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  a_relire: "À relire",
  valide: "Validé",
  pret_a_publier: "Exporté / prêt à publier",
  publie: "Publié manuellement",
};
const fieldLabels: Record<string, string> = {
  name: "Nom",
  promotion: "Promotion",
  job: "Fonction",
  company: "Entreprise",
  date: "Date",
  time: "Heure",
  timezone: "Fuseau IANA",
  meeting_url: "Lien de réunion",
  feedback_url: "Lien de feedback",
  replay_url: "Lien replay confirmé",
  quote: "Citation",
  crop_x: "Cadrage horizontal",
  crop_y: "Cadrage vertical",
};
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
const json = () => ({ "content-type": "application/json" });
function errorText(value: string) {
  const labels: Record<string, string> = {
    STORAGE_NOT_CONFIGURED:
      "Stockage privé non configuré. Les fichiers ne peuvent pas encore être enregistrés.",
    PORTRAIT_OR_LOGO_RIGHTS_MISSING:
      "Portrait, consentement de finalité ou logos officiels avec preuves de droits manquants.",
    SOURCE_CHANGED:
      "La fiche ou la date de l’épisode a changé. Créez une nouvelle version à partir des données actuelles.",
    VERSION_CONFLICT: "Ce contenu a été modifié ailleurs. Rechargez-le.",
    MISSING_VARIABLES:
      "Renseignez les variables obligatoires avant validation.",
    INVALID_PNG_SIZE: "Le PNG doit mesurer exactement 1080 × 1350 px.",
    QUOTE_NOT_APPROVED: "La citation doit être explicitement validée.",
    INVALID_FILE: "Fichier non accepté : PNG, JPEG ou WebP de 10 Mo maximum.",
    INVALID_IMAGE:
      "Le contenu du fichier ne correspond pas à une image autorisée.",
  };
  return labels[value] ?? value;
}
function interpolate(body: string, fields: Record<string, string>) {
  return body.replace(
    /\{\{([a-z_]+)\}\}/g,
    (_, key: string) =>
      fields[key]?.trim() || `⟦${fieldLabels[key] ?? key} manquant⟧`,
  );
}
function selectorData(data: CreativeData, kind: string) {
  return data.assets
    .filter((asset) => asset.kind === kind)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}
function PageTitle({ mode }: { mode: "poster" | "message" | "media" }) {
  const headings = {
    poster: [
      "Production visuelle",
      "Studio créatif",
      "Affiches d’annonce et de remerciement, versions et validations.",
    ],
    message: [
      "Diffusion",
      "Communications",
      "Préparer, relire et constater une publication faite hors de l’application.",
    ],
    media: [
      "Ressources privées",
      "Médiathèque",
      "Portraits, logos officiels et affiches liés à chaque épisode.",
    ],
  } as const;
  return (
    <header className="page-header">
      <span className="eyebrow">{headings[mode][0]}</span>
      <h1>{headings[mode][1]}</h1>
      <p>{headings[mode][2]}</p>
    </header>
  );
}
export function CreativeWorkspace({
  organizer,
  mode,
}: {
  organizer: Organizer;
  mode: "poster" | "message" | "media";
}) {
  const [params, setParams] = useSearchParams();
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([]);
  const [episodeId, setEpisodeId] = useState(params.get("episode") ?? "");
  const [data, setData] = useState<CreativeData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [kind, setKind] = useState(
    mode === "poster" ? posterKinds[0].key : messageKinds[0].key,
  );
  const [draft, setDraft] = useState<Content | null>(null);
  const [fileKind, setFileKind] = useState("portrait");
  const [file, setFile] = useState<File | null>(null);
  const [rightsAsset, setRightsAsset] = useState("");
  const [rightsStatus, setRightsStatus] = useState("granted");
  const [rightsEvidence, setRightsEvidence] = useState("");
  const [consentPurpose, setConsentPurpose] = useState("portrait_announcement");
  const [consentEvidence, setConsentEvidence] = useState("");
  const [consentScope, setConsentScope] = useState(
    "Affiche de l’épisode et diffusion dans la communauté",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawErrors, setDrawErrors] = useState<string[]>([]);
  const [textSettingsOpen, setTextSettingsOpen] = useState(true);
  const [assetSettingsOpen, setAssetSettingsOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth > 850,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const load = useCallback(async () => {
    if (!episodeId) {
      setData(null);
      return;
    }
    const response = await api<CreativeData>(`/episodes/${episodeId}/creative`);
    setData(response);
  }, [episodeId]);
  useEffect(() => {
    void api<{ items: EpisodeOption[] }>("/episodes?limit=100")
      .then((value) => setEpisodes(value.items))
      .catch((cause) => setError(errorText((cause as Error).message)));
  }, []);
  useEffect(() => {
    void load().catch((cause) => setError(errorText((cause as Error).message)));
  }, [load]);
  useEffect(() => {
    const match = data?.contents.find((item) => item.id === selectedId) ?? null;
    setDraft(match ? { ...match, fields: { ...match.fields } } : null);
  }, [data, selectedId]);
  useEffect(() => {
    if (
      !data ||
      !draft ||
      !canvasRef.current ||
      !posterKinds.some((item) => item.key === draft.kind)
    )
      return;
    let active = true;
    canvasRef.current.dataset.ready = "pending";
    void Promise.all([
      loadPosterImage(draft.portrait_asset_id),
      loadPosterImage(draft.fields.logo_esmt_asset_id),
      loadPosterImage(draft.fields.logo_cps_asset_id),
      loadPosterImage(draft.fields.logo_voix_asset_id),
    ])
      .then(([portrait, esmt, cps, voix]) => {
        if (active && canvasRef.current) {
          setDrawErrors(
            drawPoster(
              canvasRef.current,
              draft.kind as PosterKind,
              draft.fields,
              { portrait, esmt, cps, voix },
            ),
          );
          canvasRef.current.dataset.ready = "ready";
        }
      })
      .catch(() => setDrawErrors(["Ressources indisponibles"]));
    return () => {
      active = false;
    };
  }, [data, draft]);
  async function perform(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      await load();
    } catch (cause) {
      setError(errorText((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!episodeId) return;
    await perform(async () => {
      const item = await api<Content>(`/episodes/${episodeId}/contents`, {
        method: "POST",
        headers: json(),
        body: JSON.stringify({ kind }),
      });
      setSelectedId(item.id);
      setMessage("Brouillon créé pour cet épisode.");
    });
  }
  async function save() {
    if (!draft) return;
    await perform(async () => {
      const next = await api<Content>(`/contents/${draft.id}`, {
        method: "PATCH",
        headers: json(),
        body: JSON.stringify({
          expected_version: draft.version,
          body: draft.body,
          fields: draft.fields,
          portrait_asset_id: draft.portrait_asset_id,
        }),
      });
      setSelectedId(next.id);
      setMessage("Nouvelle version enregistrée.");
    });
  }
  async function action(step: "submit" | "approve" | "export" | "publish") {
    if (!draft) return;
    await perform(async () => {
      let response: Content;
      if (step === "export") {
        const form = new FormData();
        form.append("expected_version", String(draft.version));
        if (posterKinds.some((item) => item.key === draft.kind)) {
          if (drawErrors.length) throw new Error(drawErrors.join(" · "));
          const canvas = canvasRef.current;
          if (!canvas || canvas.dataset.ready !== "ready")
            throw new Error(
              "Aperçu indisponible : attendez la fin du chargement des images.",
            );
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (!blob) throw new Error("Export PNG indisponible");
          form.append("file", blob, `${draft.kind}-v${draft.version}.png`);
          response = await api<Content>(`/contents/${draft.id}/export`, {
            method: "POST",
            body: form,
          });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `voix-alumni-${draft.kind}-v${draft.version}.png`;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else
          response = await api<Content>(`/contents/${draft.id}/export`, {
            method: "POST",
            body: form,
          });
      } else if (step === "publish") {
        const channel = window.prompt(
          "Canal réel de publication : whatsapp_community, whatsapp_group, email ou other",
          "whatsapp_community",
        );
        if (
          !channel ||
          !["whatsapp_community", "whatsapp_group", "email", "other"].includes(
            channel,
          )
        )
          return;
        if (
          !window.confirm(
            "Confirmer que la diffusion a réellement eu lieu hors de l’application ?",
          )
        )
          return;
        response = await api<Content>(`/contents/${draft.id}/publish`, {
          method: "POST",
          headers: json(),
          body: JSON.stringify({
            expected_version: draft.version,
            channel,
            confirmed_external_publication: true,
          }),
        });
      } else
        response = await api<Content>(`/contents/${draft.id}/${step}`, {
          method: "POST",
          headers: json(),
          body: JSON.stringify({ expected_version: draft.version }),
        });
      setSelectedId(response.id);
      setMessage(
        step === "publish"
          ? "Publication externe constatée. Aucun message n’a été envoyé par le Studio."
          : "Étape éditoriale enregistrée.",
      );
    });
  }
  async function upload() {
    if (!file || !episodeId) return;
    await perform(async () => {
      const form = new FormData();
      form.append("kind", fileKind);
      form.append("file", file);
      await api(`/episodes/${episodeId}/assets`, {
        method: "POST",
        body: form,
      });
      setFile(null);
      setMessage("Ressource privée enregistrée, droits encore à vérifier.");
    });
  }
  async function setRights() {
    if (!data || !rightsAsset) return;
    const asset = data.assets.find((item) => item.id === rightsAsset);
    if (!asset) return;
    await perform(async () => {
      await api(`/assets/${asset.id}/rights`, {
        method: "PATCH",
        headers: json(),
        body: JSON.stringify({
          expected_version: asset.version,
          status: rightsStatus,
          evidence_ref: rightsEvidence.trim() || null,
        }),
      });
      setMessage("Statut des droits enregistré.");
    });
  }
  async function setConsent() {
    if (!data || !rightsAsset) return;
    const existing = data.consents.find(
      (item) =>
        item.asset_id === rightsAsset && item.purpose === consentPurpose,
    );
    await perform(async () => {
      await api(`/episodes/${episodeId}/consents`, {
        method: "POST",
        headers: json(),
        body: JSON.stringify({
          asset_id: rightsAsset,
          purpose: consentPurpose,
          status: rightsStatus,
          scope: consentScope,
          evidence_ref: consentEvidence.trim() || null,
          expected_version: existing?.version,
        }),
      });
      setMessage("Consentement de finalité enregistré.");
    });
  }
  async function copyMessage() {
    if (!draft) return;
    if (missing.length) {
      setError(
        `Complétez les variables obligatoires : ${missing.map((key) => fieldLabels[key] ?? key).join(", ")}.`,
      );
      return;
    }
    const text = interpolate(draft.body, draft.fields);
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {
          /* Some browser contexts deny this API; use selection fallback. */
        }
      }
      if (!copied) {
        const field = document.createElement("textarea");
        field.value = text;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("COPY_FAILED");
      }
      setMessage("Texte copié. La publication n’a pas changé d’état.");
    } catch {
      setError("Copie indisponible dans ce navigateur.");
    }
  }
  const choices = mode === "poster" ? posterKinds : messageKinds;
  const contents =
    data?.contents.filter((item) =>
      mode === "poster"
        ? posterKinds.some((choice) => choice.key === item.kind)
        : messageKinds.some((choice) => choice.key === item.kind),
    ) ?? [];
  const selected = contents.find((item) => item.id === selectedId);
  const dirty = Boolean(
    draft &&
    selected &&
    (draft.body !== selected.body ||
      draft.portrait_asset_id !== selected.portrait_asset_id ||
      JSON.stringify(draft.fields) !== JSON.stringify(selected.fields)),
  );
  const missing = draft
    ? [
        ...new Set(
          [...draft.body.matchAll(/\{\{([a-z_]+)\}\}/g)]
            .map((match) => match[1])
            .filter((key) => !draft.fields[key]?.trim()),
        ),
      ]
    : [];
  const mediaIssues: string[] = [];
  if (mode === "poster" && draft && data) {
    const portrait = data.assets.find(
      (asset) => asset.id === draft.portrait_asset_id,
    );
    if (!portrait) mediaIssues.push("portrait manquant");
    else {
      if (portrait.rights_status !== "granted" || !portrait.rights_evidence_ref)
        mediaIssues.push("droits du portrait non confirmés");
      const purpose =
        draft.kind === "announcement_poster"
          ? "portrait_announcement"
          : "portrait_thank_you";
      const consent = data.consents.find(
        (item) => item.asset_id === portrait.id && item.purpose === purpose,
      );
      if (
        consent?.status !== "granted" ||
        !consent.evidence_ref ||
        !consent.scope
      )
        mediaIssues.push(
          "consentement du portrait pour cette affiche manquant",
        );
    }
    for (const logoKind of ["logo_esmt", "logo_cps", "logo_voix"] as const) {
      const asset = data.assets.find(
        (item) => item.id === draft.fields[`${logoKind}_asset_id`],
      );
      if (
        !asset ||
        asset.kind !== logoKind ||
        asset.rights_status !== "granted" ||
        !asset.rights_evidence_ref
      )
        mediaIssues.push(
          `logo ${logoKind === "logo_voix" ? "Voix d’Alumni" : logoKind.slice(5).toUpperCase()} autorisé manquant`,
        );
    }
  }
  const resolvedMessage = draft ? interpolate(draft.body, draft.fields) : "";
  const actionHint = !selected
    ? "Choisissez un contenu ou créez un brouillon."
    : selected.source_stale
      ? "La fiche ou la date a changé : créez un nouveau brouillon avant toute validation."
      : dirty
        ? "Modifications non enregistrées : enregistrez une version avant de poursuivre."
        : selected.status === "brouillon"
          ? "La Production prépare puis soumet à la Responsable pour relecture."
          : selected.status === "a_relire"
            ? mediaIssues.length
              ? `Validation en attente : ${mediaIssues.join(" ; ")}.`
              : "La Responsable vérifie les informations et les droits avant de valider."
            : selected.status === "valide"
              ? "La Production peut exporter l’affiche ou préparer le message à publier."
              : selected.status === "pret_a_publier"
                ? "Après diffusion réelle hors de l’application, constatez la publication avec son canal."
                : "Publication constatée : consultez les versions et l’historique.";
  return (
    <>
      <PageTitle mode={mode} />
      <div className="creative-page">
        <section className="card creative-toolbar">
          <label>
            Épisode
            <select
              aria-label="Épisode de travail"
              value={episodeId}
              onChange={(event) => {
                setEpisodeId(event.target.value);
                setSelectedId("");
                setParams(
                  event.target.value ? { episode: event.target.value } : {},
                );
              }}
            >
              <option value="">Choisir un épisode transmis</option>
              {episodes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.public_number ? `#${item.public_number} · ` : ""}
                  {item.alumni_name ?? "Intervenant"}
                </option>
              ))}
            </select>
          </label>
          {episodeId && (
            <Link to={`/episodes/${episodeId}`} className="btn">
              Voir la fiche épisode
            </Link>
          )}
        </section>
        {!episodeId ? (
          <section className="card content-card">
            <p>
              Choisissez un épisode pour retrouver ses versions, ressources et
              validations.
            </p>
          </section>
        ) : !data ? (
          <section className="card content-card" role="status">
            Chargement du dossier…
          </section>
        ) : (
          <>
            <section className="card creative-info">
              <strong>{data.alumni.full_name}</strong>
              <span>
                {data.episode.public_number
                  ? `Épisode n° ${data.episode.public_number}`
                  : "Dossier d’épisode"}{" "}
                · {data.episode.event_timezone ?? "Fuseau à confirmer"}
              </span>
              <small>
                Aucun contenu n’est envoyé automatiquement. Une publication doit
                être constatée après diffusion réelle.
              </small>
            </section>
            {mode === "media" ? (
              <section className="card creative-panel">
                <h2>Ressources de l’épisode</h2>
                <AssetPanel
                  assets={data.assets}
                  organizer={organizer}
                  fileKind={fileKind}
                  setFileKind={setFileKind}
                  file={file}
                  setFile={setFile}
                  upload={() => void upload()}
                  busy={busy}
                  rightsAsset={rightsAsset}
                  setRightsAsset={setRightsAsset}
                  rightsStatus={rightsStatus}
                  setRightsStatus={setRightsStatus}
                  rightsEvidence={rightsEvidence}
                  setRightsEvidence={setRightsEvidence}
                  setRights={() => void setRights()}
                  consentPurpose={consentPurpose}
                  setConsentPurpose={setConsentPurpose}
                  consentEvidence={consentEvidence}
                  setConsentEvidence={setConsentEvidence}
                  consentScope={consentScope}
                  setConsentScope={setConsentScope}
                  setConsent={() => void setConsent()}
                  consents={data.consents}
                />
              </section>
            ) : (
              <>
                <section className="card creative-toolbar">
                  <label>
                    Nouveau contenu
                    <select
                      value={kind}
                      onChange={(event) => setKind(event.target.value)}
                    >
                      {choices.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => void create()}
                    disabled={organizer.role !== "PRODUCTION" || busy}
                  >
                    Créer un brouillon
                  </button>
                  <label>
                    Versions de cet épisode
                    <select
                      value={selectedId}
                      onChange={(event) => setSelectedId(event.target.value)}
                    >
                      <option value="">Choisir une version</option>
                      {contents.map((item) => (
                        <option key={item.id} value={item.id}>
                          {
                            choices.find((choice) => choice.key === item.kind)
                              ?.label
                          }{" "}
                          · v{item.version} · {statusLabels[item.status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
                {draft && selected && (
                  <div className="creative-grid">
                    <section className="card creative-panel">
                      <h2>
                        {choices.find((item) => item.key === draft.kind)?.label}
                      </h2>
                      <p className="muted">
                        Version {draft.version} ·{" "}
                        <strong>
                          {statusLabels[selected.status] ?? selected.status}
                        </strong>
                      </p>
                      {selected.source_stale && (
                        <p className="form-error">
                          La fiche de l’intervenant ou la date de l’épisode a
                          changé depuis cette version. Créez un nouveau
                          brouillon à partir des informations actuelles.
                        </p>
                      )}
                      {mode === "poster" ? (
                        <>
                          <details
                            className="creative-editor-section"
                            open={textSettingsOpen}
                            onToggle={(event) =>
                              setTextSettingsOpen(event.currentTarget.open)
                            }
                          >
                            <summary>Textes et informations</summary>
                            <div className="creative-fields">
                              {[
                                "name",
                                "promotion",
                                "job",
                                "company",
                                "date",
                                "time",
                                "timezone",
                                ...(draft.kind === "thank_you_poster"
                                  ? ["quote", "replay_url"]
                                  : []),
                              ].map((key) => (
                                <label key={key}>
                                  {fieldLabels[key] ?? key}
                                  <input
                                    value={draft.fields[key] ?? ""}
                                    onChange={(event) =>
                                      setDraft({
                                        ...draft,
                                        fields: {
                                          ...draft.fields,
                                          [key]: event.target.value,
                                        },
                                      })
                                    }
                                    disabled={
                                      organizer.role !== "PRODUCTION" ||
                                      selected.status === "publie"
                                    }
                                  />
                                </label>
                              ))}
                              {draft.kind === "thank_you_poster" && (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={
                                      draft.fields.quote_approved === "true"
                                    }
                                    onChange={(event) =>
                                      setDraft({
                                        ...draft,
                                        fields: {
                                          ...draft.fields,
                                          quote_approved: event.target.checked
                                            ? "true"
                                            : "false",
                                        },
                                      })
                                    }
                                  />{" "}
                                  Citation explicitement validée
                                </label>
                              )}
                              {draft.kind === "thank_you_poster" && (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={
                                      draft.fields.replay_confirmed === "true"
                                    }
                                    onChange={(event) =>
                                      setDraft({
                                        ...draft,
                                        fields: {
                                          ...draft.fields,
                                          replay_confirmed: event.target.checked
                                            ? "true"
                                            : "false",
                                        },
                                      })
                                    }
                                  />
                                  Disponibilité du replay confirmée
                                </label>
                              )}
                            </div>
                          </details>
                          <details
                            className="creative-editor-section"
                            open={assetSettingsOpen}
                            onToggle={(event) =>
                              setAssetSettingsOpen(event.currentTarget.open)
                            }
                          >
                            <summary>Portrait, logos et cadrage</summary>
                            <div className="creative-fields">
                              <label>
                                Portrait de cet épisode
                                <select
                                  value={draft.portrait_asset_id ?? ""}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      portrait_asset_id:
                                        event.target.value || null,
                                    })
                                  }
                                  disabled={organizer.role !== "PRODUCTION"}
                                >
                                  <option value="">
                                    Choisir un portrait importé
                                  </option>
                                  {selectorData(data, "portrait").map(
                                    (asset) => (
                                      <option value={asset.id} key={asset.id}>
                                        {asset.filename} · {asset.rights_status}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>
                              {(
                                ["logo_esmt", "logo_cps", "logo_voix"] as const
                              ).map((logoKind) => (
                                <label key={logoKind}>
                                  {logoKind === "logo_esmt"
                                    ? "Logo officiel ESMT"
                                    : logoKind === "logo_cps"
                                      ? "Logo officiel CPS"
                                      : "Logo officiel Voix d’Alumni"}
                                  <select
                                    value={
                                      draft.fields[`${logoKind}_asset_id`] ?? ""
                                    }
                                    onChange={(event) =>
                                      setDraft({
                                        ...draft,
                                        fields: {
                                          ...draft.fields,
                                          [`${logoKind}_asset_id`]:
                                            event.target.value,
                                        },
                                      })
                                    }
                                    disabled={organizer.role !== "PRODUCTION"}
                                  >
                                    <option value="">
                                      Choisir un original importé
                                    </option>
                                    {selectorData(data, logoKind).map(
                                      (asset) => (
                                        <option value={asset.id} key={asset.id}>
                                          {asset.filename} ·{" "}
                                          {asset.rights_status}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                              ))}
                              {["crop_x", "crop_y"].map((key) => (
                                <label key={key}>
                                  {fieldLabels[key]} ·{" "}
                                  {Math.round(
                                    Number(draft.fields[key] ?? "0.5") * 100,
                                  )}{" "}
                                  %
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={draft.fields[key] ?? "0.5"}
                                    onChange={(event) =>
                                      setDraft({
                                        ...draft,
                                        fields: {
                                          ...draft.fields,
                                          [key]: event.target.value,
                                        },
                                      })
                                    }
                                  />
                                </label>
                              ))}
                              <label>
                                <input
                                  type="checkbox"
                                  checked={draft.fields.grayscale !== "false"}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      fields: {
                                        ...draft.fields,
                                        grayscale: event.target.checked
                                          ? "true"
                                          : "false",
                                      },
                                    })
                                  }
                                />{" "}
                                Portrait en noir et blanc
                              </label>
                            </div>
                          </details>
                        </>
                      ) : (
                        <>
                          <label>
                            Texte modifiable
                            <textarea
                              rows={16}
                              value={draft.body}
                              onChange={(event) =>
                                setDraft({ ...draft, body: event.target.value })
                              }
                              disabled={
                                organizer.role !== "PRODUCTION" ||
                                selected.status === "publie"
                              }
                            />
                          </label>
                          <div className="creative-fields">
                            {Object.entries(draft.fields)
                              .filter(([key]) =>
                                [
                                  "meeting_url",
                                  "feedback_url",
                                  "replay_url",
                                ].includes(key),
                              )
                              .map(([key, value]) => (
                                <label key={key}>
                                  {fieldLabels[key]}
                                  <input
                                    value={value}
                                    onChange={(event) =>
                                      setDraft({
                                        ...draft,
                                        fields: {
                                          ...draft.fields,
                                          [key]: event.target.value,
                                        },
                                      })
                                    }
                                  />
                                </label>
                              ))}
                          </div>
                          {draft.kind === "final_thanks" && (
                            <label>
                              <input
                                type="checkbox"
                                checked={
                                  draft.fields.replay_confirmed === "true"
                                }
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    fields: {
                                      ...draft.fields,
                                      replay_confirmed: event.target.checked
                                        ? "true"
                                        : "false",
                                    },
                                  })
                                }
                              />{" "}
                              Disponibilité du replay confirmée
                            </label>
                          )}
                          {missing.length > 0 && (
                            <p className="form-error">
                              Variables manquantes :{" "}
                              {missing
                                .map((key) => fieldLabels[key] ?? key)
                                .join(", ")}
                            </p>
                          )}
                        </>
                      )}
                      <div
                        className="creative-actions"
                        aria-label="Actions éditoriales"
                      >
                        <button
                          className="btn creative-action-save"
                          type="button"
                          onClick={() => void save()}
                          title={
                            dirty
                              ? "Enregistrer les modifications"
                              : "Aucune modification à enregistrer"
                          }
                          disabled={
                            organizer.role !== "PRODUCTION" ||
                            busy ||
                            !dirty ||
                            selected.status === "publie"
                          }
                        >
                          Enregistrer une version
                        </button>
                        <button
                          className="btn creative-action-review"
                          type="button"
                          onClick={() => void action("submit")}
                          title={actionHint}
                          disabled={
                            organizer.role !== "PRODUCTION" ||
                            busy ||
                            dirty ||
                            selected.source_stale ||
                            missing.length > 0 ||
                            !["brouillon", "a_relire"].includes(selected.status)
                          }
                        >
                          Soumettre à relecture
                        </button>
                        <button
                          className="btn creative-action-approve"
                          type="button"
                          onClick={() => void action("approve")}
                          title={actionHint}
                          disabled={
                            organizer.role !== "RESPONSABLE" ||
                            busy ||
                            selected.source_stale ||
                            mediaIssues.length > 0 ||
                            selected.status !== "a_relire"
                          }
                        >
                          Valider
                        </button>
                        <button
                          className="btn creative-action-export"
                          type="button"
                          onClick={() => void action("export")}
                          title={
                            drawErrors.length
                              ? drawErrors.join(" · ")
                              : actionHint
                          }
                          disabled={
                            organizer.role !== "PRODUCTION" ||
                            busy ||
                            dirty ||
                            selected.source_stale ||
                            mediaIssues.length > 0 ||
                            (mode === "poster" && drawErrors.length > 0) ||
                            (mode === "message" && missing.length > 0) ||
                            selected.status !== "valide"
                          }
                        >
                          {mode === "poster"
                            ? "Exporter PNG 1080 × 1350"
                            : "Marquer prêt à publier"}
                        </button>
                        <button
                          className="btn creative-action-publish"
                          type="button"
                          onClick={() => void action("publish")}
                          title={actionHint}
                          disabled={
                            organizer.role !== "PRODUCTION" ||
                            busy ||
                            dirty ||
                            selected.source_stale ||
                            mediaIssues.length > 0 ||
                            selected.status !== "pret_a_publier"
                          }
                        >
                          Marquer comme publié
                        </button>
                      </div>
                      <p className="creative-action-hint" role="status">
                        {actionHint}
                        {mode === "poster" && drawErrors.length > 0 && (
                          <>
                            {" "}
                            L’export attend aussi : {drawErrors.join(" · ")}.
                          </>
                        )}
                      </p>
                      <History contentId={draft.id} />
                    </section>
                    <section className="card creative-panel creative-preview">
                      <h2>
                        {mode === "poster"
                          ? "Aperçu de l’affiche"
                          : "Aperçu WhatsApp"}
                      </h2>
                      {mode === "poster" ? (
                        <>
                          <canvas
                            ref={canvasRef}
                            width={1080}
                            height={1350}
                            aria-label="Aperçu de l’affiche 4:5"
                          />
                          {drawErrors.length > 0 && (
                            <p className="form-error">
                              {drawErrors.join(" · ")}
                            </p>
                          )}
                          <p className="muted">
                            L’aperçu et le PNG utilisent exactement ce canvas.
                            L’export officiel exige photo, droits et logos
                            autorisés.
                          </p>
                        </>
                      ) : (
                        <>
                          <pre className="message-preview">
                            {resolvedMessage}
                          </pre>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => void copyMessage()}
                            disabled={missing.length > 0}
                            title={
                              missing.length
                                ? "Complétez les variables obligatoires avant copie"
                                : "Copier exactement l’aperçu"
                            }
                          >
                            Copier le texte
                          </button>
                          <p className="muted">
                            La copie ne marque jamais le message comme publié.
                          </p>
                        </>
                      )}
                    </section>
                  </div>
                )}
                <details className="card creative-panel">
                  <summary>Ressources et droits de cet épisode</summary>
                  <AssetPanel
                    assets={data.assets}
                    organizer={organizer}
                    fileKind={fileKind}
                    setFileKind={setFileKind}
                    file={file}
                    setFile={setFile}
                    upload={() => void upload()}
                    busy={busy}
                    rightsAsset={rightsAsset}
                    setRightsAsset={setRightsAsset}
                    rightsStatus={rightsStatus}
                    setRightsStatus={setRightsStatus}
                    rightsEvidence={rightsEvidence}
                    setRightsEvidence={setRightsEvidence}
                    setRights={() => void setRights()}
                    consentPurpose={consentPurpose}
                    setConsentPurpose={setConsentPurpose}
                    consentEvidence={consentEvidence}
                    setConsentEvidence={setConsentEvidence}
                    consentScope={consentScope}
                    setConsentScope={setConsentScope}
                    setConsent={() => void setConsent()}
                    consents={data.consents}
                  />
                </details>
              </>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
      </div>
    </>
  );
}
function AssetPanel({
  assets,
  organizer,
  fileKind,
  setFileKind,
  file,
  setFile,
  upload,
  busy,
  rightsAsset,
  setRightsAsset,
  rightsStatus,
  setRightsStatus,
  rightsEvidence,
  setRightsEvidence,
  setRights,
  consentPurpose,
  setConsentPurpose,
  consentEvidence,
  setConsentEvidence,
  consentScope,
  setConsentScope,
  setConsent,
  consents,
}: {
  assets: Asset[];
  organizer: Organizer;
  fileKind: string;
  setFileKind: (value: string) => void;
  file: File | null;
  setFile: (value: File | null) => void;
  upload: () => void;
  busy: boolean;
  rightsAsset: string;
  setRightsAsset: (value: string) => void;
  rightsStatus: string;
  setRightsStatus: (value: string) => void;
  rightsEvidence: string;
  setRightsEvidence: (value: string) => void;
  setRights: () => void;
  consentPurpose: string;
  setConsentPurpose: (value: string) => void;
  consentEvidence: string;
  setConsentEvidence: (value: string) => void;
  consentScope: string;
  setConsentScope: (value: string) => void;
  setConsent: () => void;
  consents: Consent[];
}) {
  const selected = assets.find((item) => item.id === rightsAsset);
  return (
    <div className="creative-assets">
      <p className="muted">
        Importez uniquement des fichiers réellement fournis et autorisés. Aucun
        logo ou portrait illustratif n’est proposé.
      </p>
      <div className="creative-fields">
        <label>
          Type de ressource
          <select
            value={fileKind}
            onChange={(event) => setFileKind(event.target.value)}
          >
            <option value="portrait">Portrait</option>
            <option value="logo_esmt">Logo officiel ESMT</option>
            <option value="logo_cps">Logo officiel CPS</option>
            <option value="logo_voix">Logo officiel Voix d’Alumni</option>
          </select>
        </label>
        <label>
          Fichier PNG, JPEG ou WebP
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <button
        className="btn"
        type="button"
        onClick={upload}
        disabled={!file || busy}
      >
        Importer en stockage privé
      </button>
      <div className="creative-asset-list">
        {assets.length ? (
          assets.map((asset) => (
            <div key={asset.id}>
              <span>
                <strong>{asset.filename}</strong>
                <small>
                  {asset.kind} · {asset.rights_status} · {asset.byte_size}{" "}
                  octets
                </small>
              </span>
              <a
                href={`/api/v1/assets/${asset.id}/download`}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir
              </a>
            </div>
          ))
        ) : (
          <p>Aucune ressource associée à cet épisode.</p>
        )}
      </div>
      {organizer.role === "RESPONSABLE" && (
        <div className="creative-rights">
          <h3>Droits et consentement</h3>
          <label>
            Ressource
            <select
              value={rightsAsset}
              onChange={(event) => setRightsAsset(event.target.value)}
            >
              <option value="">Choisir une ressource</option>
              {assets
                .filter((item) =>
                  ["portrait", "logo_esmt", "logo_cps", "logo_voix"].includes(
                    item.kind,
                  ),
                )
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.filename} · {asset.kind}
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <>
              <label>
                Statut des droits
                <select
                  value={rightsStatus}
                  onChange={(event) => setRightsStatus(event.target.value)}
                >
                  {[
                    "unknown",
                    "requested",
                    "granted",
                    "refused",
                    "revoked",
                  ].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Référence de preuve des droits
                <input
                  value={rightsEvidence}
                  onChange={(event) => setRightsEvidence(event.target.value)}
                  placeholder="Référence du document conservé hors de ce champ"
                />
              </label>
              <button
                className="btn"
                type="button"
                onClick={setRights}
                disabled={busy}
              >
                Enregistrer les droits
              </button>
              {selected.kind === "portrait" && (
                <>
                  <label>
                    Finalité
                    <select
                      value={consentPurpose}
                      onChange={(event) =>
                        setConsentPurpose(event.target.value)
                      }
                    >
                      <option value="portrait_announcement">
                        Affiche d’annonce
                      </option>
                      <option value="portrait_thank_you">
                        Affiche de remerciement
                      </option>
                    </select>
                  </label>
                  <label>
                    Portée
                    <input
                      value={consentScope}
                      onChange={(event) => setConsentScope(event.target.value)}
                    />
                  </label>
                  <label>
                    Référence de consentement
                    <input
                      value={consentEvidence}
                      onChange={(event) =>
                        setConsentEvidence(event.target.value)
                      }
                    />
                  </label>
                  <button
                    className="btn"
                    type="button"
                    onClick={setConsent}
                    disabled={busy}
                  >
                    Enregistrer le consentement
                  </button>
                </>
              )}
            </>
          )}
          {consents.length > 0 && (
            <p className="muted">
              Consentements enregistrés :{" "}
              {consents
                .map((item) => `${item.purpose} (${item.status})`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
function History({ contentId }: { contentId: string }) {
  const [history, setHistory] = useState<{
    revisions: {
      version: number;
      action: string;
      author: string;
      occurred_at: string;
    }[];
    publications: {
      version: number;
      channel: string;
      author: string;
      published_at: string;
    }[];
  } | null>(null);
  useEffect(() => {
    void api<typeof history>(`/contents/${contentId}/history`)
      .then(setHistory)
      .catch(() => setHistory(null));
  }, [contentId]);
  const labels: Record<string, string> = {
    "content.created": "Brouillon créé",
    "content.updated": "Contenu modifié",
    "content.submitted": "Soumis à relecture",
    "content.approved": "Validé par la Responsable",
    "content.exported": "Exporté ou prêt à publier",
    "publication.confirmed": "Publication externe constatée",
  };
  return (
    <details className="creative-history">
      <summary>Versions et historique</summary>
      {history?.revisions.map((item) => (
        <p key={item.version}>
          v{item.version} · {labels[item.action] ?? "Action enregistrée"} ·{" "}
          {item.author} · {new Date(item.occurred_at).toLocaleString("fr-FR")}
        </p>
      ))}
      {history?.publications.map((item) => (
        <p key={`${item.version}-${item.channel}`}>
          Version v{item.version} · Canal : {item.channel} · {item.author} ·{" "}
          {new Date(item.published_at).toLocaleString("fr-FR")}
        </p>
      ))}
    </details>
  );
}
