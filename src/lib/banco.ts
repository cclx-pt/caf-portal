import { norm, parseData, parseNumero, periodo, r2 } from './format';
import type { Linha } from './fontes';
import type { BancoLote, Lote, MovBanco } from './types';

export interface MapaBanco { data?: string; descricao?: string; valor?: string; debito?: string; credito?: string; saldo?: string }

export function sugerirMapaBanco(colunas: string[]): MapaBanco {
  const acha = (...ps: string[]) => colunas.find((c) => ps.some((p) => norm(c) === p)) ?? colunas.find((c) => ps.some((p) => norm(c).includes(p)));
  return {
    data: acha('data mov', 'data movimento', 'data lancamento', 'data operacao', 'data'),
    descricao: acha('descricao', 'descritivo', 'movimento', 'designacao'),
    valor: acha('montante', 'valor', 'importancia'),
    debito: acha('debito'),
    credito: acha('credito'),
    saldo: acha('saldo contabilistico', 'saldo'),
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function mapearExtrato(linhas: Linha[], m: MapaBanco) {
  const out: MovBanco[] = [];
  const rejeitadas: number[] = [];
  const contagem = new Map<string, number>();
  linhas.forEach((l, i) => {
    const data = parseData(m.data ? l[m.data] : null);
    let valor = NaN;
    if (m.debito || m.credito) {
      const deb = parseNumero(m.debito ? l[m.debito] : 0);
      const cred = parseNumero(m.credito ? l[m.credito] : 0);
      valor = (Number.isFinite(cred) ? Math.abs(cred) : 0) - (Number.isFinite(deb) ? Math.abs(deb) : 0);
      if (!Number.isFinite(deb) && !Number.isFinite(cred)) valor = NaN;
    }
    if ((!Number.isFinite(valor) || valor === 0) && m.valor) valor = parseNumero(l[m.valor]);
    if (!data || !Number.isFinite(valor) || valor === 0) { rejeitadas.push(i + 2); return; }
    const descricao = String((m.descricao ? l[m.descricao] : '') ?? '').trim();
    const base = `${data}|${descricao}|${valor}`;
    const k = (contagem.get(base) ?? 0) + 1; contagem.set(base, k);
    const saldo = m.saldo ? parseNumero(l[m.saldo]) : NaN;
    out.push({ id: hash(base + '|' + k), data, descricao, valor: r2(valor), saldo: Number.isFinite(saldo) ? saldo : null, contabilizar: false, conciliadoCom: null, sugestao: null });
  });
  return { movimentos: out, rejeitadas };
}

const dias = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;

/** Sugere a reconciliação com os registos Jotform (depósitos e reembolsos) e as ofertas para a bolsa geral. */
export function sugerir(movs: MovBanco[], depositos: Lote[], despesas: Lote[]) {
  const deps = depositos.flatMap((l) => l.registos.map((r) => ({ ...r, comunidadeId: l.comunidadeId, usado: false })));
  const desp = despesas.flatMap((l) => l.registos.map((r) => ({ ...r, comunidadeId: l.comunidadeId, usado: false })));
  for (const m of movs) {
    if (m.conciliadoCom) continue;
    const alvo = m.valor > 0 ? deps : desp;
    const v = Math.abs(m.valor);
    const par = alvo.find((r) => !r.usado && Math.abs(r.valor - v) < 0.005 && dias(r.data, m.data) <= 10);
    if (par) {
      par.usado = true;
      m.sugestao = `${m.valor > 0 ? 'Depósito' : 'Reembolso'} Jotform ${par.id} (${par.comunidadeId})`;
      m.conciliadoCom = `${m.valor > 0 ? 'depositos' : 'despesas'}:${par.id}`;
      m.comunidadeId = m.comunidadeId ?? par.comunidadeId;
      m.contabilizar = false; // já contado pelo Jotform
    } else if (m.valor > 0 && /transf|trf|mb ?way|sepa|oferta|dizimo|donativo/.test(norm(m.descricao))) {
      m.sugestao = 'Possível oferta ou dízimo por transferência: bolsa geral';
    }
  }
  return movs;
}

/** Junta os movimentos importados com os já classificados (mantém a classificação existente). */
export function fundir(novos: MovBanco[], existentes: MovBanco[]) {
  const ex = new Map(existentes.map((m) => [m.id, m]));
  return novos.map((n) => {
    const e = ex.get(n.id);
    return e ? { ...n, categoria: e.categoria, comunidadeId: e.comunidadeId, contabilizar: e.contabilizar, conciliadoCom: e.conciliadoCom ?? n.conciliadoCom, sugestao: e.sugestao ?? n.sugestao } : n;
  });
}

export function agruparPorMes(contaId: string, movs: MovBanco[], quem: string): BancoLote[] {
  const g = new Map<string, BancoLote>();
  const agora = new Date().toISOString();
  for (const m of movs) {
    const ano = Number(m.data.slice(0, 4)); const mes = Number(m.data.slice(5, 7));
    const id = `${contaId}_${ano}_${String(mes).padStart(2, '0')}`;
    let l = g.get(id);
    if (!l) { l = { id, contaId, ano, mes, periodo: periodo(ano, mes), registos: [], atualizadoEm: agora, atualizadoPor: quem }; g.set(id, l); }
    l.registos.push(m);
  }
  for (const l of g.values()) l.registos.sort((a, b) => a.data.localeCompare(b.data));
  return [...g.values()];
}
