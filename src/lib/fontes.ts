import { ALIASES } from './seed';
import { norm, parseData, parseNumero, periodo, r2 } from './format';
import type { Lote, Origem, Registo } from './types';

export type Linha = Record<string, unknown>;

export interface CampoDef {
  key: string;
  label: string;
  padroes: string[]; // por ordem de preferência (normalizados)
  obrigatorio?: boolean;
  pessoal?: boolean; // removido no nível privado
}

export interface FonteDef {
  origem: Origem;
  titulo: string;
  campos: CampoDef[];
}

const DATA_SUB = ['submission date', 'data de submissao', 'created at'];

export const FONTES: Record<Origem, FonteDef> = {
  contribuir: {
    origem: 'contribuir',
    titulo: 'Entradas (CCLX - CONTRIBUIR)',
    campos: [
      { key: 'id', label: 'ID da submissão', padroes: ['submission id', 'id da submissao', 'id'] },
      { key: 'data', label: 'Data', padroes: [...DATA_SUB, 'data'], obrigatorio: true },
      { key: 'valor', label: 'Valor (€)', padroes: ['valor'], obrigatorio: true },
      { key: 'comunidade', label: 'Comunidade', padroes: ['comunidade'] },
      { key: 'categoria', label: 'Categoria', padroes: ['categoria'] },
      { key: 'pessoa', label: 'Nome', padroes: ['nome'], pessoal: true },
      { key: 'nif', label: 'NIF', padroes: ['contribuinte nif', 'nif', 'contribuinte'], pessoal: true },
      { key: 'email', label: 'E-mail', padroes: ['e mail', 'email'], pessoal: true },
      { key: 'telefone', label: 'Telemóvel', padroes: ['telemovel', 'telefone'], pessoal: true },
    ],
  },
  depositos: {
    origem: 'depositos',
    titulo: 'Depósitos de coletas (CCLX - REGISTO DE DEPÓSITOS)',
    campos: [
      { key: 'id', label: 'ID da submissão', padroes: ['submission id', 'id da submissao', 'id'] },
      { key: 'data', label: 'Data do talão', padroes: ['data presente no talao de deposito', 'data presente no talao', ...DATA_SUB, 'data'], obrigatorio: true },
      { key: 'valor', label: 'Valor depositado (€)', padroes: ['valor depositado', 'valor'], obrigatorio: true },
      { key: 'comunidade', label: 'Comunidade (Ministério/Área)', padroes: ['ministerio area', 'ministerio', 'area', 'comunidade'] },
      { key: 'conta', label: 'Conta do depósito', padroes: ['deposito em que conta', 'conta'] },
      { key: 'caixa', label: 'Mês/Ano da folha de caixa', padroes: ['mes ano relativo a folha de caixa', 'mes ano'] },
      { key: 'descricao', label: 'Descrição', padroes: ['descricao'] },
      { key: 'pessoa', label: 'Nome', padroes: ['nome'], pessoal: true },
      { key: 'email', label: 'E-mail', padroes: ['e mail', 'email'], pessoal: true },
    ],
  },
  despesas: {
    origem: 'despesas',
    titulo: 'Reembolsos e despesas (CCLX - REGISTO DE DESPESAS)',
    campos: [
      { key: 'id', label: 'ID da submissão', padroes: ['submission id', 'unique id', 'id da submissao', 'id'] },
      { key: 'data', label: 'Data da fatura', padroes: ['data fatura', ...DATA_SUB, 'data'], obrigatorio: true },
      { key: 'valor', label: 'Valor (€)', padroes: ['valor em euros', 'valor'], obrigatorio: true },
      { key: 'comunidade', label: 'Comunidade', padroes: ['comunidade'] },
      { key: 'categoria', label: 'Categoria', padroes: ['categoria'] },
      { key: 'evento', label: 'Evento', padroes: ['evento sempre que aplicavel', 'evento'] },
      { key: 'reembolso', label: 'Reembolso necessário?', padroes: ['reembolso do valor necessaro', 'reembolso do valor', 'reembolso'] },
      { key: 'descricao', label: 'Descrição/Notas', padroes: ['descricao notas', 'descricao'], pessoal: true },
      { key: 'pessoa', label: 'Nome', padroes: ['nome'], pessoal: true },
      { key: 'email', label: 'E-mail', padroes: ['e mail', 'email'], pessoal: true },
      { key: 'telefone', label: 'Telefone', padroes: ['telefone para pagamento', 'telefone'], pessoal: true },
      { key: 'iban', label: 'IBAN/NIB', padroes: ['iban nib', 'iban'], pessoal: true },
    ],
  },
  assistencia: {
    origem: 'assistencia',
    titulo: 'Assistência (CCLX : Registo de Presenças)',
    campos: [
      { key: 'id', label: 'ID da submissão', padroes: ['submission id', 'id da submissao', 'id'] },
      { key: 'data', label: 'Dia', padroes: ['dia', ...DATA_SUB, 'data'], obrigatorio: true },
      { key: 'comunidade', label: 'Comunidade', padroes: ['comunidade'] },
      { key: 'adultos', label: 'Jovens e Adultos', padroes: ['jovens e adultos', 'adultos'], obrigatorio: true },
      { key: 'jump', label: 'Jump (12-14)', padroes: ['jump'] },
      { key: 'criancas', label: 'Crianças (3-11)', padroes: ['criancas'] },
      { key: 'connects', label: "Connect's", padroes: ['connect'] },
      { key: 'evento', label: 'Evento', padroes: ['evento'] },
    ],
  },
};

/** Sugere, para cada campo, a coluna do ficheiro que lhe corresponde. */
export function sugerirMapa(def: FonteDef, colunas: string[]): Record<string, string> {
  const usadas = new Set<string>();
  const mapa: Record<string, string> = {};
  const cols = colunas.map((c) => ({ c, n: norm(c) }));
  for (const campo of def.campos) {
    let escolhida: string | undefined;
    for (const p of campo.padroes) {
      const exata = cols.find((x) => !usadas.has(x.c) && x.n === p);
      const comeca = cols.find((x) => !usadas.has(x.c) && x.n.startsWith(p));
      const contem = cols.find((x) => !usadas.has(x.c) && x.n.includes(p));
      escolhida = (exata ?? comeca ?? contem)?.c;
      if (escolhida) break;
    }
    if (escolhida) { mapa[campo.key] = escolhida; usadas.add(escolhida); }
  }
  return mapa;
}

/** Identifica a comunidade a partir do texto do formulário. Sem correspondência: bolsa geral. */
export function resolverComunidade(texto: unknown, data: string): { id: string; original?: string } {
  const n = norm(texto);
  let id: string | undefined = ALIASES[n];
  if (!id && n) {
    const chave = Object.keys(ALIASES).sort((a, b) => b.length - a.length).find((k) => n.includes(k));
    if (chave) id = ALIASES[chave];
  }
  if (!id) return { id: 'bolsa-geral', original: String(texto ?? '') };
  // Desde 01/11/2026 o Barreiro faz parte da Moita unificada.
  if (id === 'barreiro' && data >= '2026-11-01') return { id: 'moita', original: String(texto) };
  return { id };
}

const PESSOAIS = ['pessoa', 'nif', 'email', 'telefone', 'iban'] as const;

export interface ResultadoMapa {
  registos: (Registo & { comunidadeId: string })[];
  rejeitadas: { linha: number; motivo: string }[];
}

let seq = 0;
export function mapearLinhas(origem: Origem, linhas: Linha[], mapa: Record<string, string>): ResultadoMapa {
  const registos: ResultadoMapa['registos'] = [];
  const rejeitadas: ResultadoMapa['rejeitadas'] = [];
  const get = (l: Linha, k: string) => (mapa[k] ? l[mapa[k]] : undefined);
  linhas.forEach((l, i) => {
    const data = parseData(get(l, 'data'));
    if (!data) { rejeitadas.push({ linha: i + 2, motivo: 'data inválida' }); return; }
    const valorBruto = origem === 'assistencia' ? get(l, 'adultos') : get(l, 'valor');
    const valor = parseNumero(valorBruto);
    if (!Number.isFinite(valor)) { rejeitadas.push({ linha: i + 2, motivo: 'valor inválido' }); return; }
    const com = resolverComunidade(get(l, 'comunidade'), data);
    const extra: Record<string, string | number> = {};
    if (com.original) extra.comunidadeOriginal = com.original;
    for (const k of ['conta', 'caixa', 'reembolso']) { const v = get(l, k); if (v != null && v !== '') extra[k] = String(v); }
    for (const k of ['jump', 'criancas', 'connects']) { const v = parseNumero(get(l, k)); if (Number.isFinite(v)) extra[k] = v; }
    const id = String(get(l, 'id') ?? '').trim() || `${origem}-${data}-${i}-${++seq}`;
    const r: Registo & { comunidadeId: string } = {
      id,
      data,
      valor: r2(Math.abs(valor)),
      categoria: String(get(l, 'categoria') ?? '').trim() || (origem === 'depositos' ? 'Coletas em dinheiro' : origem === 'assistencia' ? 'Assistência' : 'Sem categoria'),
      comunidadeId: com.id,
    };
    const desc = get(l, 'descricao'); if (desc) r.descricao = String(desc);
    const ev = get(l, 'evento'); if (ev) r.evento = String(ev);
    for (const k of PESSOAIS) { const v = get(l, k); if (v != null && String(v).trim()) (r as unknown as Record<string, string>)[k] = String(v).trim(); }
    if (Object.keys(extra).length) r.extra = extra;
    registos.push(r);
  });
  return { registos, rejeitadas };
}

const SAL = 'cclx-caf-portal';
export async function pseudonimo(r: Registo): Promise<string | undefined> {
  const base = norm(r.nif || r.email || r.pessoa || '');
  if (!base) return undefined;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SAL + base));
  return 'Contribuinte #' + [...new Uint8Array(buf)].slice(0, 3).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Remove os dados pessoais para o nível privado. */
export function anonimizar(r: Registo): Registo {
  const out: Registo = { id: r.id, data: r.data, valor: r.valor, categoria: r.categoria };
  if (r.evento) out.evento = r.evento;
  if (r.pessoaRef) out.pessoaRef = r.pessoaRef;
  if (r.extra) {
    const { comunidadeOriginal, ...resto } = r.extra;
    void comunidadeOriginal;
    if (Object.keys(resto).length) out.extra = resto;
  }
  return out;
}

/** Agrupa registos em lotes mensais por comunidade. */
export async function construirLotes(origem: Origem, registos: (Registo & { comunidadeId: string })[], quem: string) {
  const grupos = new Map<string, Lote>();
  const agora = new Date().toISOString();
  for (const r of registos) {
    r.pessoaRef = await pseudonimo(r);
    const ano = Number(r.data.slice(0, 4));
    const mes = Number(r.data.slice(5, 7));
    const id = `${origem}_${ano}_${String(mes).padStart(2, '0')}_${r.comunidadeId}`;
    let l = grupos.get(id);
    if (!l) {
      l = { id, origem, ano, mes, periodo: periodo(ano, mes), comunidadeId: r.comunidadeId, registos: [], total: 0, n: 0, atualizadoEm: agora, atualizadoPor: quem };
      grupos.set(id, l);
    }
    const { comunidadeId, ...reg } = r;
    void comunidadeId;
    l.registos.push(reg);
    l.total = r2(l.total + r.valor);
    l.n += 1;
  }
  const conf = [...grupos.values()];
  const priv = conf.map((l) => ({ ...l, registos: l.registos.map(anonimizar) }));
  return { conf, priv };
}
