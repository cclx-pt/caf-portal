import Papa from 'papaparse';
import { norm } from './format';
import type { Linha } from './fontes';

export interface Tabela {
  colunas: string[];
  linhas: Linha[];
}

function encontrarCabecalho(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map((c) => norm(c)).filter(Boolean);
    if (cells.length < 2) continue;
    const temData = cells.some((c) => c.includes('data') || c.includes('date') || c === 'dia');
    const temOutro = cells.some((c) => /valor|montante|descri|debito|credito|comunidade|nome|amount/.test(c));
    if (temData && temOutro) return i;
  }
  return 0;
}

function paraTabela(rows: unknown[][]): Tabela {
  const limpas = rows.filter((r) => r.some((c) => c != null && String(c).trim() !== ''));
  if (!limpas.length) return { colunas: [], linhas: [] };
  const h = encontrarCabecalho(limpas);
  const vistos = new Map<string, number>();
  const colunas = limpas[h].map((c, i) => {
    let nome = String(c ?? '').trim() || `Coluna ${i + 1}`;
    const k = vistos.get(nome) ?? 0;
    vistos.set(nome, k + 1);
    if (k) nome = `${nome} (${k + 1})`;
    return nome;
  });
  const linhas = limpas.slice(h + 1).map((r) => {
    const o: Linha = {};
    colunas.forEach((c, i) => { o[c] = r[i] ?? ''; });
    return o;
  });
  return { colunas, linhas };
}

async function lerXlsx(file: File): Promise<Tabela> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        if (o.result !== undefined) return o.result;
        if (o.text !== undefined) return o.text;
        if (o.richText) return o.richText.map((t) => t.text).join('');
      }
      return v;
    });
    rows.push(vals);
  });
  return paraTabela(rows);
}

async function lerCsv(file: File): Promise<Tabela> {
  let texto = await file.text();
  // Extratos bancários portugueses vêm muitas vezes em Windows-1252.
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
  const res = Papa.parse<unknown[]>(texto, { skipEmptyLines: true });
  return paraTabela(res.data as unknown[][]);
}

/** Lê um ficheiro CSV ou Excel exportado do Jotform ou do homebanking. */
export async function lerFicheiro(file: File): Promise<Tabela> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.xlsx') || nome.endsWith('.xlsm')) return lerXlsx(file);
  if (nome.endsWith('.xls')) throw new Error('Formato .xls antigo: abra no Excel e guarde como .xlsx ou .csv.');
  return lerCsv(file);
}
