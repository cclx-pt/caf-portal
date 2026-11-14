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

/** Lê as submissões ativas de um formulário criadas depois de `desde` (AAAA-MM-DD ou AAAA-MM-DD hh:mm:ss). Só leitura. */
export async function lerSubmissoes(cfg: JotConfig, formId: string, desde: string, onProgresso?: (n: number) => void): Promise<Linha[]> {
  const out: Linha[] = [];
  const limit = 1000;
  for (let offset = 0; offset < 200000; offset += limit) {
    const params = new URLSearchParams({
      apiKey: cfg.apiKey,
      limit: String(limit),
      offset: String(offset),
      orderby: 'created_at',
      filter: JSON.stringify({ 'created_at:gt': desde.length === 10 ? `${desde} 00:00:00` : desde }),
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

export interface ResultadoTeste {
  ok: boolean;
  conta?: { utilizador: string; nome?: string; plano?: string };
  formularios: { id: string; nome: string; ok: boolean; titulo?: string; submissoes?: number; erro?: string }[];
  erro?: string;
  sugestaoServidor?: string;
}

async function pedir(base: string, caminho: string, apiKey: string): Promise<{ code: number; message?: string; content?: unknown }> {
  const res = await fetch(`${base.replace(/\/$/, '')}${caminho}?apiKey=${encodeURIComponent(apiKey)}`);
  try {
    const j = (await res.json()) as { responseCode: number; message?: string; content?: unknown };
    return { code: j.responseCode ?? res.status, message: j.message, content: j.content };
  } catch {
    return { code: res.status, message: res.statusText };
  }
}

/**
 * Testa a chave sem gravar nada: confirma a conta (GET /user) e o acesso a cada formulário (GET /form/{id}).
 * Se falhar num servidor, experimenta o outro (EU/global) para sugerir a troca.
 */
export async function testarChave(cfg: JotConfig, forms: { id: string; nome: string }[]): Promise<ResultadoTeste> {
  const outro = cfg.base.includes('eu-api') ? 'https://api.jotform.com' : 'https://eu-api.jotform.com';
  let u: Awaited<ReturnType<typeof pedir>>;
  try {
    u = await pedir(cfg.base, '/user', cfg.apiKey);
  } catch {
    return { ok: false, formularios: [], erro: 'Não foi possível contactar o Jotform. Verifique a ligação à internet.' };
  }
  if (u.code !== 200) {
    let sugestaoServidor: string | undefined;
    try {
      if ((await pedir(outro, '/user', cfg.apiKey)).code === 200) sugestaoServidor = outro;
    } catch { /* ignora */ }
    return {
      ok: false,
      formularios: [],
      erro: u.code === 401 ? 'O Jotform recusou a chave (não autorizada ou inválida).' : `O Jotform respondeu ${u.code}: ${u.message ?? ''}`,
      sugestaoServidor,
    };
  }
  const c = (u.content ?? {}) as Record<string, string>;
  const conta = { utilizador: c.username, nome: c.name, plano: c.account_type?.split('/').pop() };
  const formularios = await Promise.all(forms.map(async (f) => {
    try {
      const r = await pedir(cfg.base, `/form/${f.id}`, cfg.apiKey);
      if (r.code !== 200) return { ...f, ok: false, erro: r.code === 401 || r.code === 403 ? 'sem acesso com esta chave' : `erro ${r.code}` };
      const fc = (r.content ?? {}) as Record<string, string>;
      if (fc.status === 'DELETED') return { ...f, ok: false, titulo: fc.title, erro: 'formulário apagado no Jotform' };
      return { ...f, ok: true, titulo: fc.title, submissoes: Number(fc.count ?? 0) };
    } catch {
      return { ...f, ok: false, erro: 'sem resposta' };
    }
  }));
  return { ok: formularios.every((f) => f.ok), conta, formularios };
}
