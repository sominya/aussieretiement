export const audFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export const compactAudFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatAUD(value: number) {
  return audFormatter.format(Math.round(value || 0));
}

export function formatCompactAUD(value: number) {
  return compactAudFormatter.format(value || 0);
}

export function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}
