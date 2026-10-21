export type PosterFields = Record<string, string>;
export type PosterImages = {
  portrait?: HTMLImageElement;
  esmt?: HTMLImageElement;
  cps?: HTMLImageElement;
  voix?: HTMLImageElement;
};
export type PosterKind = "announcement_poster" | "thank_you_poster";
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

const IVORY = "#fffdf9";
const INK = "#181817";
const COPPER = "#ba9270";
const MUTED = "#5c5149";
const serif = "Georgia, 'Times New Roman', serif";
const sans = "Arial, sans-serif";

export async function loadPosterImage(
  assetId?: string | null,
): Promise<HTMLImageElement | undefined> {
  if (!assetId) return undefined;
  const response = await fetch(`/api/v1/assets/${assetId}/content`, {
    credentials: "include",
  });
  if (!response.ok) return undefined;
  const url = URL.createObjectURL(await response.blob());
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function contain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  cropX: number,
  cropY: number,
) {
  const scale = Math.max(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const x =
    Math.max(0, Math.min(1, cropX)) * (image.naturalWidth - sourceWidth);
  const y =
    Math.max(0, Math.min(1, cropY)) * (image.naturalHeight - sourceHeight);
  ctx.drawImage(image, x, y, sourceWidth, sourceHeight, 0, 0, width, height);
}

function graphemes(value: string) {
  return Array.from(
    new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(value),
    (item) => item.segment,
  );
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap((word) => word.match(/[^-]+-?|-/gu) ?? [word]);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line
      ? `${line}${line.endsWith("-") ? "" : " "}${word}`
      : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    // A very long unbroken name is split only at Unicode grapheme boundaries.
    let chunk = "";
    for (const part of graphemes(word)) {
      if (chunk && ctx.measureText(chunk + part).width > maxWidth) {
        lines.push(chunk);
        chunk = part;
      } else chunk += part;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

type TextStyle = {
  maxWidth: number;
  maxLines: number;
  maxHeight?: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  family: string;
  italic?: boolean;
  weight?: string;
  color?: string;
  align?: "center" | "left";
};

/** Returns the next baseline. Overlong text is never drawn or silently clipped. */
function block(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  errors: string[],
  label: string,
) {
  if (!text.trim()) return y;
  let lines: string[] = [];
  let size = style.maxSize;
  let fitted = false;
  for (; size >= style.minSize; size -= 2) {
    ctx.font = `${style.italic ? "italic " : ""}${style.weight ?? "normal"} ${size}px ${style.family}`;
    lines = wrap(ctx, text, style.maxWidth);
    if (
      lines.length <= style.maxLines &&
      (!style.maxHeight ||
        lines.length * size * style.lineHeight <= style.maxHeight)
    ) {
      fitted = true;
      break;
    }
  }
  if (!fitted) {
    errors.push(`${label} trop long pour l’affiche : raccourcissez le texte`);
    return y;
  }
  ctx.fillStyle = style.color ?? INK;
  ctx.textAlign = style.align ?? "center";
  ctx.textBaseline = "top";
  lines.forEach((line, index) =>
    ctx.fillText(line, x, y + index * size * style.lineHeight),
  );
  return y + lines.length * size * style.lineHeight;
}

function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  size: number,
  spacing: number,
  color = INK,
) {
  const parts = graphemes(text);
  ctx.font = `${size}px ${sans}`;
  const width =
    parts.reduce((sum, part) => sum + ctx.measureText(part).width, 0) +
    Math.max(0, parts.length - 1) * spacing;
  let x = centerX - width / 2;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const part of parts) {
    ctx.fillText(part, x, y);
    x += ctx.measureText(part).width + spacing;
  }
}

function rule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
) {
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  ctx.fillStyle = COPPER;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.quadraticCurveTo(x + radius * 0.18, y - radius * 0.18, x + radius, y);
  ctx.quadraticCurveTo(x + radius * 0.18, y + radius * 0.18, x, y + radius);
  ctx.quadraticCurveTo(x - radius * 0.18, y + radius * 0.18, x - radius, y);
  ctx.quadraticCurveTo(x - radius * 0.18, y - radius * 0.18, x, y - radius);
  ctx.fill();
}

function ornament(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "#d8b99d";
  ctx.lineWidth = 1.2;
  for (const inset of [21, 30])
    ctx.strokeRect(inset, inset, 1080 - inset * 2, 1350 - inset * 2);
  for (const [x, y] of [
    [37, 37],
    [1043, 37],
    [37, 1313],
    [1043, 1313],
  ])
    star(ctx, x, y, 15);
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let offset = 0; offset < 4; offset++) {
    ctx.beginPath();
    ctx.ellipse(205, 805, 365 + offset * 16, 510 + offset * 16, 0, -1.6, 1.4);
    ctx.stroke();
  }
  ctx.restore();
  rule(ctx, 185, 895, 1276);
  star(ctx, 540, 1276, 10);
  tracked(
    ctx,
    "S’INSPIRER · PARTAGER · RÉUSSIR ENSEMBLE",
    540,
    1292,
    18,
    2.2,
    MUTED,
  );
}

function portrait(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  fields: PosterFields,
  errors: string[],
  top: number,
) {
  if (!image) {
    errors.push("Portrait autorisé manquant");
    return;
  }
  const width = 640;
  const height = 970;
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const photo = layer.getContext("2d");
  if (!photo) {
    errors.push("Portrait indisponible");
    return;
  }
  photo.save();
  photo.filter = fields.grayscale === "false" ? "none" : "grayscale(100%)";
  cover(
    photo,
    image,
    width,
    height,
    Number(fields.crop_x ?? "0.5"),
    Number(fields.crop_y ?? "0.5"),
  );
  photo.restore();
  photo.globalCompositeOperation = "destination-in";
  const horizontal = photo.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0, "#000");
  horizontal.addColorStop(0.79, "#000");
  horizontal.addColorStop(1, "transparent");
  photo.fillStyle = horizontal;
  photo.fillRect(0, 0, width, height);
  const vertical = photo.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, "#000");
  vertical.addColorStop(0.84, "#000");
  vertical.addColorStop(1, "transparent");
  photo.fillStyle = vertical;
  photo.fillRect(0, 0, width, height);
  ctx.drawImage(layer, 0, top);
}

function logos(
  ctx: CanvasRenderingContext2D,
  images: PosterImages,
  errors: string[],
) {
  if (images.esmt) contain(ctx, images.esmt, 95, 46, 285, 105);
  else errors.push("Logo ESMT officiel manquant");
  if (images.cps) contain(ctx, images.cps, 765, 46, 220, 105);
  else errors.push("Logo CPS officiel manquant");
  rule(ctx, 42, 1038, 177);
  if (images.voix) contain(ctx, images.voix, 398, 188, 284, 135);
  else errors.push("Logo Voix d’Alumni officiel manquant");
  star(ctx, 350, 255, 10);
  star(ctx, 730, 255, 10);
  rule(ctx, 435, 645, 326);
}

function announcement(
  ctx: CanvasRenderingContext2D,
  fields: PosterFields,
  errors: string[],
) {
  const x = 790;
  const width = 480;
  if (!fields.name?.trim()) errors.push("Nom manquant");
  if (!fields.job?.trim()) errors.push("Fonction manquante");
  let y =
    block(
      ctx,
      fields.name ?? "",
      x,
      370,
      {
        maxWidth: width,
        maxLines: 3,
        maxHeight: 190,
        maxSize: 94,
        minSize: 50,
        lineHeight: 1.01,
        family: serif,
      },
      errors,
      "Nom",
    ) + 20;
  rule(ctx, 560, 1020, y);
  y += 25;
  y =
    block(
      ctx,
      fields.job ?? "",
      x,
      y,
      {
        maxWidth: width,
        maxLines: 3,
        maxHeight: 100,
        maxSize: 28,
        minSize: 21,
        lineHeight: 1.2,
        family: sans,
        color: INK,
      },
      errors,
      "Fonction",
    ) + 10;
  if (fields.company?.trim())
    y =
      block(
        ctx,
        fields.company,
        x,
        y,
        {
          maxWidth: width,
          maxLines: 2,
          maxHeight: 60,
          maxSize: 23,
          minSize: 19,
          lineHeight: 1.2,
          family: sans,
          color: MUTED,
        },
        errors,
        "Entreprise",
      ) + 15;
  if (fields.promotion?.trim()) {
    rule(ctx, 645, 935, y);
    tracked(ctx, `PROMO ${fields.promotion}`, x, y + 20, 22, 2.6, MUTED);
    y += 65;
  }
  const panelTop = Math.max(840, y + 30);
  if (panelTop + 285 > 1200)
    errors.push("Identité trop longue : la date ne tient plus dans l’affiche");
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(556, panelTop, 468, 280);
  star(ctx, x, panelTop, 10);
  tracked(ctx, "WEBINAIRE", x, panelTop + 22, 21, 4.5, INK);
  if (!fields.date?.trim() || !fields.time?.trim() || !fields.timezone?.trim())
    errors.push("Date, heure ou fuseau manquant");
  block(
    ctx,
    fields.date ?? "",
    x,
    panelTop + 74,
    {
      maxWidth: width - 40,
      maxLines: 2,
      maxSize: 41,
      minSize: 27,
      lineHeight: 1.05,
      family: serif,
    },
    errors,
    "Date",
  );
  block(
    ctx,
    `${fields.time ?? ""} · ${fields.timezone ?? ""}`,
    x,
    panelTop + 180,
    {
      maxWidth: width - 40,
      maxLines: 2,
      maxSize: 22,
      minSize: 17,
      lineHeight: 1.16,
      family: sans,
      color: MUTED,
    },
    errors,
    "Heure et fuseau",
  );
}

function thankYou(
  ctx: CanvasRenderingContext2D,
  fields: PosterFields,
  errors: string[],
) {
  const x = 790;
  const width = 480;
  block(
    ctx,
    "MERCI !",
    x,
    360,
    {
      maxWidth: width,
      maxLines: 1,
      maxSize: 105,
      minSize: 90,
      lineHeight: 1.05,
      family: serif,
    },
    errors,
    "Titre",
  );
  rule(ctx, 565, 1015, 470);
  tracked(ctx, "POUR CE MOMENT DE PARTAGE", x, 492, 17, 1.9, MUTED);
  if (!fields.name?.trim()) errors.push("Nom manquant");
  if (!fields.job?.trim()) errors.push("Fonction manquante");
  let y =
    block(
      ctx,
      fields.name ?? "",
      x,
      555,
      {
        maxWidth: width,
        maxLines: 3,
        maxHeight: 165,
        maxSize: 71,
        minSize: 44,
        lineHeight: 1.04,
        family: serif,
      },
      errors,
      "Nom",
    ) + 12;
  y =
    block(
      ctx,
      fields.job ?? "",
      x,
      y,
      {
        maxWidth: width,
        maxLines: 2,
        maxHeight: 58,
        maxSize: 23,
        minSize: 19,
        lineHeight: 1.15,
        family: sans,
        color: MUTED,
      },
      errors,
      "Fonction",
    ) + 7;
  if (fields.promotion?.trim()) {
    tracked(ctx, `PROMO ${fields.promotion}`, x, y, 19, 2.2, MUTED);
    y += 32;
  }
  const quoteTop = Math.max(825, y + 22);
  if (quoteTop + 320 > 1170)
    errors.push(
      "Identité trop longue : la citation ne tient plus dans l’affiche",
    );
  ctx.strokeStyle = COPPER;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(552, quoteTop, 476, 320);
  ctx.fillStyle = COPPER;
  ctx.font = `100px ${serif}`;
  ctx.textAlign = "center";
  ctx.fillText("“", x, quoteTop + 20);
  if (fields.quote?.trim()) {
    if (fields.quote_approved !== "true") errors.push("Citation non validée");
    let quoteLineCount = 5;
    for (let size = 31; size >= 22; size -= 2) {
      ctx.font = `italic ${size}px ${serif}`;
      quoteLineCount = wrap(ctx, `« ${fields.quote} »`, width - 65).length;
      if (quoteLineCount <= 4) break;
    }
    const quoteY =
      quoteTop + (quoteLineCount <= 2 ? 137 : quoteLineCount === 3 ? 119 : 99);
    const quoteBottom = block(
      ctx,
      `« ${fields.quote} »`,
      x,
      quoteY,
      {
        maxWidth: width - 65,
        maxLines: 4,
        maxSize: 31,
        minSize: 22,
        lineHeight: 1.15,
        family: serif,
        italic: true,
      },
      errors,
      "Citation",
    );
    if (quoteBottom > quoteTop + 275)
      errors.push("Citation trop longue pour le cadre");
    block(
      ctx,
      `— ${fields.name ?? ""}`,
      x,
      quoteTop + 275,
      {
        maxWidth: width - 70,
        maxLines: 1,
        maxSize: 18,
        minSize: 15,
        lineHeight: 1.1,
        family: sans,
        color: MUTED,
      },
      errors,
      "Attribution",
    );
  } else {
    block(
      ctx,
      "Merci pour votre partage et votre inspiration.",
      x,
      quoteTop + 135,
      {
        maxWidth: width - 75,
        maxLines: 3,
        maxSize: 29,
        minSize: 23,
        lineHeight: 1.15,
        family: serif,
      },
      errors,
      "Remerciement",
    );
  }
  if (fields.replay_url?.trim()) {
    if (fields.replay_confirmed !== "true") errors.push("Replay non confirmé");
    tracked(ctx, "SESSION DISPONIBLE EN REPLAY", 790, 1192, 19, 2, MUTED);
  }
}

/** The exported PNG is generated from this same 1080 × 1350 canvas. */
export function drawPoster(
  canvas: HTMLCanvasElement,
  kind: PosterKind,
  fields: PosterFields,
  images: PosterImages,
): string[] {
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return ["Canvas indisponible"];
  const errors: string[] = [];
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  const glow = ctx.createRadialGradient(230, 715, 120, 230, 715, 630);
  glow.addColorStop(0, "#f1e4d7");
  glow.addColorStop(1, IVORY);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 280, 680, 980);
  ornament(ctx);
  logos(ctx, images, errors);
  portrait(
    ctx,
    images.portrait,
    fields,
    errors,
    kind === "thank_you_poster" ? 315 : 335,
  );
  if (kind === "thank_you_poster") thankYou(ctx, fields, errors);
  else announcement(ctx, fields, errors);
  return [...new Set(errors)];
}
