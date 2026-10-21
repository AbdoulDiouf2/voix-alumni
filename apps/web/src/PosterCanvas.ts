export type PosterFields = Record<string, string>;
export type PosterImages = {
  portrait?: HTMLImageElement;
  esmt?: HTMLImageElement;
  cps?: HTMLImageElement;
};
export type PosterKind = "announcement_poster" | "thank_you_poster";
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

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

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  cx: number,
  cy: number,
  grayscale: boolean,
) {
  const scale = Math.max(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const sw = width / scale;
  const sh = height / scale;
  const sx = Math.max(
    0,
    Math.min(image.naturalWidth - sw, cx * (image.naturalWidth - sw)),
  );
  const sy = Math.max(
    0,
    Math.min(image.naturalHeight - sh, cy * (image.naturalHeight - sh)),
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.filter = grayscale ? "grayscale(100%)" : "none";
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
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
function linesFor(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
    }
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      if (chunk && ctx.measureText(chunk + char).width > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}
function textBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  maxFont: number,
  minFont: number,
  family: string,
  lineHeight: number,
  color: string,
  errors: string[],
  label: string,
) {
  let lines: string[] = [];
  let size = maxFont;
  for (; size >= minFont; size -= 2) {
    ctx.font = `${size}px ${family}`;
    lines = linesFor(ctx, text, maxWidth);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) errors.push(`${label} trop long pour l’affiche`);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((line, index) =>
    ctx.fillText(line, x, y + index * size * lineHeight),
  );
  return y + lines.length * size * lineHeight;
}

/** Preview and PNG use the same 1080 × 1350 canvas and source images. */
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
  const copper = "#c59b76";
  const ink = "#171511";
  const ivory = "#fffcf8";
  const brown = "#76553f";
  const thanks = kind === "thank_you_poster";
  ctx.fillStyle = ivory;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = copper;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 1040, 1310);
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, 1020, 1290);
  for (const [x, y] of [
    [37, 38],
    [1043, 38],
    [37, 1312],
    [1043, 1312],
  ]) {
    ctx.fillStyle = copper;
    ctx.font = "30px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("✦", x, y);
  }
  const rule = (x1: number, x2: number, y: number) => {
    ctx.strokeStyle = copper;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  };
  if (images.esmt) contain(ctx, images.esmt, 140, 50, 300, 115);
  else errors.push("Logo ESMT officiel manquant");
  if (images.cps) contain(ctx, images.cps, 730, 50, 180, 115);
  else errors.push("Logo CPS officiel manquant");
  rule(45, 1035, 188);
  ctx.fillStyle = copper;
  ctx.beginPath();
  ctx.arc(540, 235, 31, 0, Math.PI * 2);
  ctx.strokeStyle = copper;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "36px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("♩", 540, 248);
  ctx.fillStyle = ink;
  ctx.font = "bold 42px Georgia, serif";
  ctx.fillText("V O I X   D ’ A L U M N I", 540, 310);
  rule(225, 855, 333);

  const photoY = 365;
  const photoHeight = thanks ? 790 : 810;
  if (images.portrait) {
    cover(
      ctx,
      images.portrait,
      46,
      photoY,
      475,
      photoHeight,
      Number(fields.crop_x ?? "0.5"),
      Number(fields.crop_y ?? "0.5"),
      fields.grayscale !== "false",
    );
    const fade = ctx.createLinearGradient(0, 1020, 0, 1175);
    fade.addColorStop(0, "rgba(255,252,248,0)");
    fade.addColorStop(1, ivory);
    ctx.fillStyle = fade;
    ctx.fillRect(46, 1020, 475, 155);
  } else {
    errors.push("Portrait manquant");
    ctx.fillStyle = "#eee2d4";
    ctx.fillRect(46, photoY, 475, photoHeight);
  }
  const rightX = 782;
  const rightWidth = 490;
  if (thanks) {
    let y =
      textBlock(
        ctx,
        "MERCI !",
        rightX,
        390,
        rightWidth,
        1,
        112,
        76,
        "Georgia, serif",
        1.08,
        ink,
        errors,
        "Titre",
      ) + 14;
    y =
      textBlock(
        ctx,
        "POUR CE MOMENT DE PARTAGE",
        rightX,
        y,
        rightWidth,
        2,
        25,
        20,
        "Arial, sans-serif",
        1.25,
        brown,
        errors,
        "Remerciement",
      ) + 22;
    y =
      textBlock(
        ctx,
        fields.name ?? "",
        rightX,
        y,
        rightWidth,
        3,
        72,
        40,
        "Georgia, serif",
        1.04,
        ink,
        errors,
        "Nom",
      ) + 10;
    y =
      textBlock(
        ctx,
        [fields.promotion && `PROMO ${fields.promotion}`, fields.job]
          .filter(Boolean)
          .join(" · "),
        rightX,
        y,
        rightWidth,
        3,
        24,
        18,
        "Arial, sans-serif",
        1.18,
        brown,
        errors,
        "Fonction",
      ) + 24;
    if (fields.quote) {
      if (fields.quote_approved !== "true") errors.push("Citation non validée");
      const quoteY = Math.max(y, 795);
      ctx.strokeStyle = copper;
      ctx.strokeRect(545, quoteY - 13, 475, 265);
      textBlock(
        ctx,
        `« ${fields.quote} »`,
        rightX,
        quoteY + 24,
        425,
        4,
        30,
        20,
        "Georgia, serif",
        1.16,
        ink,
        errors,
        "Citation",
      );
      if (quoteY + 252 > 1120)
        errors.push("Citation trop longue pour l’affiche");
    }
    if (fields.replay_url) {
      if (fields.replay_confirmed !== "true")
        errors.push("Replay non confirmé");
      rule(160, 920, 1190);
      textBlock(
        ctx,
        "SESSION DISPONIBLE EN REPLAY",
        540,
        1208,
        850,
        1,
        24,
        20,
        "Arial, sans-serif",
        1.1,
        brown,
        errors,
        "Replay",
      );
    }
  } else {
    let y =
      textBlock(
        ctx,
        fields.name ?? "",
        rightX,
        390,
        rightWidth,
        3,
        82,
        43,
        "Georgia, serif",
        1.04,
        ink,
        errors,
        "Nom",
      ) + 15;
    rule(560, 1000, y);
    y =
      textBlock(
        ctx,
        [fields.job, fields.company].filter(Boolean).join(" · "),
        rightX,
        y + 19,
        rightWidth,
        4,
        27,
        19,
        "Arial, sans-serif",
        1.22,
        ink,
        errors,
        "Fonction",
      ) + 16;
    y =
      textBlock(
        ctx,
        fields.promotion ? `PROMO ${fields.promotion}` : "",
        rightX,
        y,
        rightWidth,
        1,
        27,
        21,
        "Arial, sans-serif",
        1.1,
        brown,
        errors,
        "Promotion",
      ) + 28;
    const panelY = Math.max(y, 870);
    if (panelY > 1000) errors.push("Identité trop longue pour l’affiche");
    ctx.strokeStyle = copper;
    ctx.strokeRect(545, panelY, 475, 245);
    textBlock(
      ctx,
      "WEBINAIRE",
      rightX,
      panelY + 20,
      rightWidth,
      1,
      27,
      22,
      "Arial, sans-serif",
      1.1,
      ink,
      errors,
      "Événement",
    );
    textBlock(
      ctx,
      `${fields.date ?? ""} · ${fields.time ?? ""}`,
      rightX,
      panelY + 78,
      rightWidth,
      2,
      38,
      25,
      "Georgia, serif",
      1.15,
      ink,
      errors,
      "Date",
    );
    textBlock(
      ctx,
      fields.timezone ?? "",
      rightX,
      panelY + 168,
      rightWidth,
      2,
      22,
      17,
      "Arial, sans-serif",
      1.15,
      brown,
      errors,
      "Fuseau",
    );
  }
  rule(190, 890, 1273);
  ctx.fillStyle = brown;
  ctx.font = "20px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("S’INSPIRER · PARTAGER · RÉUSSIR ENSEMBLE", 540, 1303);
  return [...new Set(errors)];
}
