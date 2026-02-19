import { NextResponse } from "next/server";
import { getOverviewData } from "@/lib/sheets";
import { buildSparklineChartSvg, buildTrendChartSvg } from "@/lib/newsletter/charts";
import { parse, isValid } from "date-fns";
import path from "path";
import { promises as fs } from "fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cachedFontBuffer: Uint8Array | null = null;

async function loadFontBuffer() {
  if (cachedFontBuffer) return cachedFontBuffer;
  const fontPath = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "eb-garamond",
    "files",
    "eb-garamond-latin-400-normal.woff2"
  );
  const data = await fs.readFile(fontPath);
  cachedFontBuffer = new Uint8Array(data);
  return cachedFontBuffer;
}

function parseMonthLabel(label: string | null) {
  if (!label) return null;
  const trimmed = label.toString().trim();
  if (!trimmed) return null;
  const parsed = parse(trimmed, "MMM yyyy", new Date());
  if (isValid(parsed)) return parsed;
  const fallback = new Date(trimmed);
  return isValid(fallback) ? fallback : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const monthLabel = searchParams.get("month");
  const format = searchParams.get("format") ?? "svg";
  if (!type || (type !== "trend" && type !== "sparkline")) {
    return NextResponse.json({ error: "Invalid chart type" }, { status: 400 });
  }

  const overview = await getOverviewData();
  let series = overview.indexSeries?.filter((point) => point.indexScore !== null) ?? [];
  const cutoff = parseMonthLabel(monthLabel);
  if (cutoff) {
    series = series.filter((point) => {
      const pointDate = parseMonthLabel(point.date);
      return pointDate ? pointDate.getTime() <= cutoff.getTime() : true;
    });
  }

  const sorted = series.sort((a, b) => {
    const aDate = parseMonthLabel(a.date);
    const bDate = parseMonthLabel(b.date);
    if (aDate && bDate) return aDate.getTime() - bDate.getTime();
    return a.date.localeCompare(b.date);
  });

  const points = type === "trend" ? sorted.slice(-12) : sorted.slice(-3);
  const values = points
    .map((point) => point.indexScore)
    .filter((value): value is number => value !== null && value !== undefined);
  const labels = points.map((point) => point.date);

  if (values.length < 2) {
    return NextResponse.json({ error: "Not enough data" }, { status: 404 });
  }

  const svg = type === "trend" ? buildTrendChartSvg(values, labels) : buildSparklineChartSvg(values, labels);

  if (format === "png") {
    const { Resvg } = await import("@resvg/resvg-js");
    const fontBuffer = await loadFontBuffer();
    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [fontBuffer],
        loadSystemFonts: false,
        defaultFontFamily: "EB Garamond"
      }
    });
    const pngData = resvg.render().asPng();
    const pngBuffer = new Uint8Array(pngData);
    return new NextResponse(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600"
      }
    });
  }

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
