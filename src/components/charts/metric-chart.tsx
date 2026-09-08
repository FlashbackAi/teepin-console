"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

import { useTheme } from "@/components/theme-provider";
import { fullTime } from "@/lib/utils";

/**
 * Chart palette, keyed by resolved theme.
 *
 * ECharts renders to canvas, not DOM/SVG — it cannot resolve `var(--x)`
 * CSS custom properties at draw time the way an SVG-based chart could,
 * so the exact HSL values from globals.css are duplicated here as
 * literal colour strings. Keep these in sync with :root/.dark in
 * globals.css if that palette ever changes.
 */
const CHART_COLORS = {
  light: {
    border: "hsl(0 0% 90%)",
    mutedForeground: "hsl(0 0% 45%)",
    foreground: "hsl(0 0% 7%)",
    tooltipBg: "hsl(0 0% 100%)",
    info: "hsl(217 91% 60%)",
    success: "hsl(142 71% 45%)",
    warning: "hsl(38 92% 50%)",
  },
  dark: {
    border: "hsl(0 0% 18%)",
    mutedForeground: "hsl(0 0% 63%)",
    foreground: "hsl(0 0% 96%)",
    tooltipBg: "hsl(0 0% 9%)",
    info: "hsl(217 91% 68%)",
    success: "hsl(142 69% 52%)",
    warning: "hsl(38 92% 58%)",
  },
} as const;

export type SeriesColor = "info" | "success" | "warning";

/**
 * One entity's utilization series, oldest first, rendered with ECharts —
 * multi-series lines, an axis-crosshair tooltip, and a slider + inside
 * zoom (the brush/mini-timeline pattern operators expect from
 * CloudWatch/Grafana-style dashboards) rather than a static line.
 *
 * Generic over the sample shape (`NodeMetricSample` for the control
 * centre's per-node view, `InstanceMetricSample` for the console's
 * per-instance view) — both are "a recorded_at timestamp plus a handful
 * of numeric readings", and the chart itself does not care which entity
 * they describe. `series` carries 1-2 lines: one for a single-value
 * metric (CPU, memory), two for a rate PAIR sharing one chart (network
 * rx/tx) so up/down is visually comparable rather than stacked in
 * separate charts.
 */
export function MetricChart<T extends { recorded_at: string }>({
  samples,
  series,
  unit,
  height = 224,
}: {
  samples: T[];
  series: { key: keyof T; label: string; color: SeriesColor }[];
  unit: string;
  /** Chart canvas height in pixels — 224 (the old fixed h-56) by default,
   *  larger when rendered inside MetricTile's expanded view. Title/chrome
   *  is MetricTile's responsibility, not this component's — this is the
   *  chart canvas alone, reused unchanged at both sizes. */
  height?: number;
}) {
  const { resolved } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Re-created (not merely re-optioned) whenever the resolved theme
  // flips: axis/grid/tooltip colours are baked into the instance at
  // init, and setOption alone does not repaint those.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [resolved]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const colors = CHART_COLORS[resolved];

    const option: EChartsOption = {
      animation: false,
      grid: {
        left: 48,
        right: 16,
        top: series.length > 1 ? 28 : 12,
        bottom: 56,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.tooltipBg,
        borderColor: colors.border,
        textStyle: { color: colors.foreground, fontSize: 12 },
        axisPointer: { type: "line", lineStyle: { color: colors.border } },
        formatter: (params) => {
          const rows = Array.isArray(params) ? params : [params];
          const first = rows[0];
          const time =
            first && Array.isArray(first.value)
              ? fullTime(String(first.value[0]))
              : "";
          const lines = rows
            .map((p) => {
              const v = Array.isArray(p.value) ? p.value[1] : p.value;
              const num = typeof v === "number" ? v : Number(v);
              return `${p.marker ?? ""}${num.toFixed(2)} ${unit}${
                series.length > 1 ? ` &middot; ${p.seriesName}` : ""
              }`;
            })
            .join("<br/>");
          return `<div style="margin-bottom:2px;color:${colors.mutedForeground}">${time}</div>${lines}`;
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
        splitLine: { lineStyle: { color: colors.border, type: "dashed" } },
      },
      dataZoom: [
        { type: "inside" },
        {
          type: "slider",
          height: 20,
          bottom: 8,
          borderColor: colors.border,
          fillerColor:
            resolved === "dark" ? "hsla(0,0%,100%,0.06)" : "hsla(0,0%,0%,0.04)",
          handleStyle: { color: colors.mutedForeground },
          textStyle: { color: colors.mutedForeground, fontSize: 10 },
          dataBackground: {
            lineStyle: { color: colors.mutedForeground },
            areaStyle: { color: colors.mutedForeground, opacity: 0.1 },
          },
        },
      ],
      legend:
        series.length > 1
          ? {
              data: series.map((s) => s.label),
              top: 0,
              right: 0,
              itemWidth: 10,
              itemHeight: 10,
              textStyle: { color: colors.mutedForeground, fontSize: 11 },
            }
          : undefined,
      series: series.map((s) => ({
        name: s.label,
        type: "line",
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1.5, color: colors[s.color] },
        itemStyle: { color: colors[s.color] },
        data: samples.map((sample) => [sample.recorded_at, sample[s.key] as number]),
      })),
    };

    chart.setOption(option, true);
  }, [samples, series, unit, resolved]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
