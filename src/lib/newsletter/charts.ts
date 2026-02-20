import "server-only";

type ChartOptions = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  background: string;
  lineColor: string;
  axisColor: string;
  labelColor: string;
  tickCount: number;
  xTickCount: number;
  label: string;
};

type Point = { x: number; y: number };

const defaultOptions: ChartOptions = {
  width: 560,
  height: 220,
  padding: { top: 16, right: 18, bottom: 42, left: 64 },
  background: "#fff7f5",
  lineColor: "#c52127",
  axisColor: "#cdb7af",
  labelColor: "#5c1116",
  tickCount: 4,
  xTickCount: 3,
  label: "Index score"
};

function escapeText(input: string) {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatShortLabel(label: string) {
  const match = label.match(/([A-Za-z]{3})\s+(\d{4})/);
  if (!match) return "";
  const monthName = match[1];
  const year = match[2].slice(-2);
  return `${monthName} ${year}`;
}

function buildLineChartSvg(values: number[], labels: string[], options?: Partial<ChartOptions>) {
  const opts: ChartOptions = { ...defaultOptions, ...options };
  const { width, height, padding, background, lineColor, axisColor, labelColor, tickCount, xTickCount } = opts;
  const fontFamily = "EB Garamond, Georgia, 'Times New Roman', serif";
  const yLabelSize = 12;
  const xLabelSize = 11;

  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yPad = range * 0.1;
  const yMin = min - yPad;
  const yMax = max + yPad;
  const yRange = yMax - yMin || 1;

  const stepX = values.length > 1 ? usableWidth / (values.length - 1) : 0;
  const points: Point[] = values.map((value, idx) => ({
    x: padding.left + idx * stepX,
    y: padding.top + (1 - (value - yMin) / yRange) * usableHeight
  }));

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const yTicks = Array.from({ length: tickCount }, (_, idx) => {
    const t = idx / (tickCount - 1);
    const value = yMax - t * yRange;
    const y = padding.top + t * usableHeight;
    return { value, y };
  });

  const xTickIndices =
    values.length <= xTickCount
      ? values.map((_, idx) => idx)
      : [0, Math.floor((values.length - 1) / 2), values.length - 1];

  const xTicks = xTickIndices.map((idx) => ({
    x: padding.left + idx * stepX,
    label: formatShortLabel(labels[idx] ?? "")
  }));

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeText(opts.label)} chart">
  <rect width="${width}" height="${height}" fill="${background}" />
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="${axisColor}" stroke-width="1.2" />
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="${axisColor}" stroke-width="1.2" />
  ${yTicks
    .map((tick) => {
      const label = tick.value.toFixed(1);
      const y = tick.y;
      return `
  <line x1="${padding.left - 4}" y1="${tick.y}" x2="${padding.left}" y2="${tick.y}" stroke="${axisColor}" stroke-width="1" />
  <text x="${padding.left - 8}" y="${y}" fill="${labelColor}" font-family="${fontFamily}" font-size="${yLabelSize}" text-anchor="end" dominant-baseline="middle">${escapeText(
        label
      )}</text>
      `;
    })
    .join("")}
  ${xTicks
    .map((tick) => {
      const y = height - padding.bottom + 16;
      const label = tick.label || "";
      return `
  <line x1="${tick.x}" y1="${height - padding.bottom}" x2="${tick.x}" y2="${height - padding.bottom + 4}" stroke="${axisColor}" stroke-width="1" />
  ${
    label
      ? `<text x="${tick.x}" y="${y}" fill="${labelColor}" font-family="${fontFamily}" font-size="${xLabelSize}" text-anchor="middle" dominant-baseline="hanging">${escapeText(
          label
        )}</text>`
      : ""
  }
      `;
    })
    .join("")}
  <polyline fill="none" stroke="${lineColor}" stroke-width="2.5" points="${linePoints}" />
</svg>`;
}

export function buildTrendChartSvg(values: number[], labels: string[]) {
  return buildLineChartSvg(values, labels, { width: 560, height: 220, label: "Index score trend" });
}

export function buildSparklineChartSvg(values: number[], labels: string[]) {
  return buildLineChartSvg(values, labels, {
    width: 420,
    height: 140,
    padding: { top: 12, right: 16, bottom: 34, left: 54 },
    tickCount: 3,
    xTickCount: 3,
    label: "3-month trend"
  });
}
