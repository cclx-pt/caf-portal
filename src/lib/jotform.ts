import type { Linha } from './fontes';

interface JotAnswer {
  text?: string;
  type?: string;
  answer?: unknown;
  prettyFormat?: string;
}
interface JotSubmission {
  id: string;
  created_at: string;
  status: string;
  answers: Record<string, JotAnswer>;
}

const IGNORAR = new Set(['control_head', 'control_button', 'control_text', 'control_divider', 'control_image', 'control_pagebreak']);

function valorResposta(a: JotAnswer): unknown {
  const v = a.answer;
  if (v == null || v === '') return undefined;
  if (typeof v === 'object') {
    const o = v as Record<string, string>;
    if ('year' in o && 'month' in o && 'day' in o) return `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`;
    if (a.prettyFormat) return a.prettyFormat;
    return Object.values(o).filter((x) => typeof x === 'string' || typeof x === 'number').join(' ');
  }
  return v;
}

/** Converte uma submissão da API numa linha igual à de uma exportação CSV. */
export function achatar(s: JotSubmission): Linha {
  const linha: Linha = { 'Submission ID': s.id, 'Submission Date': s.created_at };
  const ordem = Object.entries(s.answers ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [, a] of ordem) {
    if (!a.text || (a.type && IGNORAR.has(a.type))) continue;
    const v = valorResposta(a);
    if (v === undefined) continue;
    let k = a.text.replace(/<[^>]+>/g, '').trim();
    let i = 2;
    while (k in linha) k = `${a.text.trim()} (${i++})`;
    linha[k] = v;
  }
  return linha;
}

export interface JotConfig {
  apiKey: string;
  base: string; // https://eu-api.jotform.com ou https://api.jotform.com
}

/** Lê todas as submissões ativas de um formulário desde uma data (só leitura). */
export async function lerSubmissoes(cfg: JotConfig, formId: string, desde: string, onProgresso?: (n: number) => void): Promise<Linha[]> {
  const out: Linha[] = [];
  const limit = 1000;
  for (let offset = 0; offset < 200000; offset += limit) {
    const params = new URLSearchParams({
      apiKey: cfg.apiKey,
      limit: String(limit),
      offset: String(offset),
      orderby: 'created_at',
      filter: JSON.stringify({ 'created_at:gt': `${desde} 00:00:00` }),
    });
    const res = await fetch(`${cfg.base.replace(/\/$/, '')}/form/${formId}/submissions?${params}`);
    if (!res.ok) throw new Error(`Jotform respondeu ${res.status}. Verifique a chave e o servidor (EU ou global).`);
    const json = (await res.json()) as { responseCode: number; message?: string; content: JotSubmission[] };
    if (json.responseCode !== 200) throw new Error(`Jotform: ${json.message ?? json.responseCode}`);
    for (const s of json.content) if (s.status !== 'DELETED') out.push(achatar(s));
    onProgresso?.(out.length);
    if (json.content.length < limit) break;
  }
  return out;
}
