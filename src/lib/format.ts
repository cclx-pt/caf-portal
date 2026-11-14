// Formato português usado nos relatórios do CAF: 1.234,56 (ponto nos milhares, vírgula nas décimas).
function grupo(v: number, casas: number) {
  const [int, dec] = Math.abs(v).toFixed(casas).split('.');
  const milhares = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 && Number(Math.abs(v).toFixed(casas)) !== 0 ? '-' : '') + milhares + (dec ? ',' + dec : '');
}

/** Valores sempre em euros, com duas casas decimais. */
export const eur = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '—' : `${grupo(v, 2)} €`);
export const eurK = (v: number) => `${grupo(v, 0)} €`;
/** Números sem moeda (ex.: pessoas). Por defeito sem casas decimais. */
export const num = (v: number | null | undefined, casas = 0) => (v == null || !Number.isFinite(v) ? '—' : grupo(v, casas));
export const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const periodo = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** Converte "1.234,56", "1234.56", "-12,5 €", "(12,50)" em número. */
export function parseNumero(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/\s|€|EUR/gi, '');
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');
  else if (lastComma >= 0 && lastDot < 0) s = s.replace(',', '.');
  const n = Number(s);
  return neg ? -n : n;
}

/** Converte datas comuns (dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, "Nov 3, 2026", objeto Date, nº Excel) em AAAA-MM-DD. */
export function parseData(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const slug = (s: string) => norm(s).replace(/ /g, '-');

export const hoje = () => new Date().toISOString().slice(0, 10);
export const agoraISO = () => new Date().toISOString();
