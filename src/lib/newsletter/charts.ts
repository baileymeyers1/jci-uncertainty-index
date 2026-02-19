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

const digitSegments: Record<string, number[]> = {
  "0": [0, 1, 2, 4, 5, 6],
  "1": [2, 5],
  "2": [0, 2, 3, 4, 6],
  "3": [0, 2, 3, 5, 6],
  "4": [1, 2, 3, 5],
  "5": [0, 1, 3, 5, 6],
  "6": [0, 1, 3, 4, 5, 6],
  "7": [0, 2, 5],
  "8": [0, 1, 2, 3, 4, 5, 6],
  "9": [0, 1, 2, 3, 5, 6],
  "-": [3]
};

function renderDigitSegments(x: number, y: number, char: string, color: string, scale: number) {
  const width = 10 * scale;
  const height = 16 * scale;
  const stroke = 1.4 * scale;
  const segments = digitSegments[char] ?? [];

  if (char === ".") {
    const cx = x + width;
    const cy = y + height;
    const r = 1.6 * scale;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />`;
  }

  if (char === "/") {
    return `<line x1="${x}" y1="${y + height}" x2="${x + width}" y2="${y}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" />`;
  }

  const seg = (id: number) => {
    switch (id) {
      case 0:
        return `<line x1="${x + stroke}" y1="${y}" x2="${x + width - stroke}" y2="${y}" />`;
      case 1:
        return `<line x1="${x}" y1="${y + stroke}" x2="${x}" y2="${y + height / 2 - stroke}" />`;
      case 2:
        return `<line x1="${x + width}" y1="${y + stroke}" x2="${x + width}" y2="${y + height / 2 - stroke}" />`;
      case 3:
        return `<line x1="${x + stroke}" y1="${y + height / 2}" x2="${x + width - stroke}" y2="${y + height / 2}" />`;
      case 4:
        return `<line x1="${x}" y1="${y + height / 2 + stroke}" x2="${x}" y2="${y + height - stroke}" />`;
      case 5:
        return `<line x1="${x + width}" y1="${y + height / 2 + stroke}" x2="${x + width}" y2="${y + height - stroke}" />`;
      case 6:
        return `<line x1="${x + stroke}" y1="${y + height}" x2="${x + width - stroke}" y2="${y + height}" />`;
      default:
        return "";
    }
  };

  const lines = segments.map(seg).join("");
  return `<g stroke="${color}" stroke-width="${stroke}" stroke-linecap="round">${lines}</g>`;
}

function renderLabel(
  label: string,
  anchorX: number,
  anchorY: number,
  align: "start" | "middle" | "end",
  color: string,
  scale: number
) {
  const baseWidth = 10 * scale;
  const spacing = 2 * scale;
  const charWidth = (char: string) => {
    if (char === ".") return 3 * scale;
    if (char === "/") return 6 * scale;
    if (char === " ") return 4 * scale;
    return baseWidth;
  };

  const totalWidth = label.split("").reduce((sum, char, idx) => {
    const w = charWidth(char);
    return sum + w + (idx === label.length - 1 ? 0 : spacing);
  }, 0);

  let x = anchorX;
  if (align === "end") {
    x = anchorX - totalWidth;
  } else if (align === "middle") {
    x = anchorX - totalWidth / 2;
  }

  let currentX = x;
  const parts = label.split("").map((char) => {
    const part = renderDigitSegments(currentX, anchorY, char, color, scale);
    currentX += charWidth(char) + spacing;
    return part;
  });

  return parts.join("");
}

function formatShortLabel(label: string) {
  const match = label.match(/([A-Za-z]{3})\s+(\d{4})/);
  if (!match) return "";
  const monthName = match[1].toLowerCase();
  const year = match[2].slice(-2);
  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  const mm = monthMap[monthName];
  if (!mm) return "";
  return `${mm}/${year}`;
}

function buildLineChartSvg(values: number[], labels: string[], options?: Partial<ChartOptions>) {
  const opts: ChartOptions = { ...defaultOptions, ...options };
  const { width, height, padding, background, lineColor, axisColor, labelColor, tickCount, xTickCount } = opts;

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
      const y = tick.y - 6;
      return `
  <line x1="${padding.left - 4}" y1="${tick.y}" x2="${padding.left}" y2="${tick.y}" stroke="${axisColor}" stroke-width="1" />
  ${renderLabel(label, padding.left - 8, y, "end", labelColor, 0.9)}
      `;
    })
    .join("")}
  ${xTicks
    .map((tick) => {
      const y = height - padding.bottom + 10;
      const label = tick.label || "";
      return `
  <line x1="${tick.x}" y1="${height - padding.bottom}" x2="${tick.x}" y2="${height - padding.bottom + 4}" stroke="${axisColor}" stroke-width="1" />
  ${label ? renderLabel(label, tick.x, y, "middle", labelColor, 0.8) : ""}
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
