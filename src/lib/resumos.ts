import { periodo, r2 } from './format';
import type { BancoLote, Comunidade, CustoFixo, Lote, Publico, PublicoMes, PublicoSite, Resumo, ResumoMes } from './types';

export interface DadosCalculo {
  ano: number;
  comunidades: Comunidade[];
  contribuir: Lote[];
  depositos: Lote[];
  despesas: Lote[];
  assistencia: Lote[];
  banco: BancoLote[];
  custosFixos: CustoFixo[];
  mesesFechados: Set<string>;
  hoje: string; // YYYY-MM-DD
}

const vazio = (mes: number): ResumoMes => ({
  mes, contribuir: 0, coletas: 0, transferencias: 0, quotaBolsa: 0, entradas: 0, custosFixos: 0, despesas: 0, saidas: 0, saldo: 0,
  adultosMedia: null, entradasPorCategoria: {}, despesasPorCategoria: {}, custosRubricas: {},
  n: { contribuir: 0, coletas: 0, transferencias: 0, despesas: 0 },
});

const soma = (o: Record<string, number>, k: string, v: number) => { o[k] = r2((o[k] ?? 0) + v); };

/** Último mês do ano que conta para custos fixos (meses já decorridos). */
export function mesesDecorridos(ano: number, hoje: string): number {
  const a = Number(hoje.slice(0, 4));
  if (ano < a) return 12;
  if (ano > a) return 0;
  return Number(hoje.slice(5, 7));
}

export function custoAtivo(c: CustoFixo, p: string) {
  return c.inicio <= p && (!c.fim || c.fim >= p);
}

export function comunidadeAtiva(c: Comunidade, p: string) {
  const inicio = c.inicio ? c.inicio.slice(0, 7) : '0000-00';
  const fim = c.fim ? c.fim.slice(0, 7) : '9999-99';
  return inicio <= p && fim >= p;
}

/**
 * Calcula os resumos mensais por comunidade.
 * Entradas = Contribuir + coletas depositadas + transferências bancárias atribuídas + quota da bolsa geral.
 * Saídas = custos fixos (tabela) + despesas/reembolsos do Jotform + débitos bancários marcados para contabilizar.
 * A bolsa geral é distribuída pela média de assistência de adultos de cada comunidade no mesmo mês.
 */
export function calcularResumos(d: DadosCalculo): Resumo[] {
  const ate = mesesDecorridos(d.ano, d.hoje);
  const mapa = new Map<string, ResumoMes[]>();
  for (const c of d.comunidades) mapa.set(c.id, Array.from({ length: 12 }, (_, i) => vazio(i + 1)));
  const m = (c: string, mes: number) => {
    if (!mapa.has(c)) mapa.set(c, Array.from({ length: 12 }, (_, i) => vazio(i + 1)));
    return mapa.get(c)![mes - 1];
  };

  for (const l of d.contribuir) for (const r of l.registos) {
    const x = m(l.comunidadeId, l.mes); x.contribuir = r2(x.contribuir + r.valor); x.n.contribuir++; soma(x.entradasPorCategoria, r.categoria || 'Sem categoria', r.valor);
  }
  for (const l of d.depositos) for (const r of l.registos) {
    const x = m(l.comunidadeId, l.mes); x.coletas = r2(x.coletas + r.valor); x.n.coletas++; soma(x.entradasPorCategoria, 'Coletas em dinheiro', r.valor);
  }
  for (const l of d.despesas) for (const r of l.registos) {
    const x = m(l.comunidadeId, l.mes); x.despesas = r2(x.despesas + r.valor); x.n.despesas++; soma(x.despesasPorCategoria, r.categoria || 'Sem categoria', r.valor);
  }
  for (const b of d.banco) for (const r of b.registos) {
    if (!r.contabilizar || !r.comunidadeId) continue;
    const mes = Number(r.data.slice(5, 7));
    if (Number(r.data.slice(0, 4)) !== d.ano) continue;
    const x = m(r.comunidadeId, mes);
    if (r.valor > 0) { x.transferencias = r2(x.transferencias + r.valor); x.n.transferencias++; soma(x.entradasPorCategoria, r.categoria || 'Transferências', r.valor); }
    else { x.despesas = r2(x.despesas - r.valor); x.n.despesas++; soma(x.despesasPorCategoria, r.categoria || 'Débitos bancários', -r.valor); }
  }
  // Assistência média de adultos por comunidade e mês.
  const ass = new Map<string, { soma: number; n: number }>();
  for (const l of d.assistencia) for (const r of l.registos) {
    const k = `${l.comunidadeId}|${l.mes}`;
    const a = ass.get(k) ?? { soma: 0, n: 0 }; a.soma += r.valor; a.n++; ass.set(k, a);
  }
  for (const [k, a] of ass) { const [c, mes] = k.split('|'); m(c, Number(mes)).adultosMedia = r2(a.soma / a.n); }

  // Custos fixos dos meses decorridos.
  for (const cf of d.custosFixos) for (let mes = 1; mes <= ate; mes++) {
    const p = periodo(d.ano, mes);
    if (!custoAtivo(cf, p)) continue;
    const x = m(cf.comunidadeId, mes);
    x.custosFixos = r2(x.custosFixos + cf.valorMensal);
    soma(x.custosRubricas, cf.nivel === 'confidencial' ? 'Outros custos de funcionamento' : cf.rubrica, cf.valorMensal);
  }

  // Distribuição da bolsa geral.
  for (let mes = 1; mes <= 12; mes++) {
    const bolsa = m('bolsa-geral', mes);
    const total = r2(bolsa.contribuir + bolsa.coletas + bolsa.transferencias);
    if (!total) continue;
    const p = periodo(d.ano, mes);
    const elegiveis = d.comunidades.filter((c) => !c.especial && comunidadeAtiva(c, p));
    const pesos = elegiveis.map((c) => ({ c, w: m(c.id, mes).adultosMedia ?? 0 }));
    const somaW = pesos.reduce((s, x) => s + x.w, 0);
    if (!somaW) continue;
    let distribuido = 0;
    pesos.forEach(({ c, w }, i) => {
      const q = i === pesos.length - 1 ? r2(total - distribuido) : r2((total * w) / somaW);
      distribuido = r2(distribuido + q);
      m(c.id, mes).quotaBolsa = q;
    });
    bolsa.quotaBolsa = r2(-total);
  }

  const agora = new Date().toISOString();
  const out: Resumo[] = [];
  for (const [comunidadeId, meses] of mapa) {
    for (const x of meses) {
      x.entradas = r2(x.contribuir + x.coletas + x.transferencias + x.quotaBolsa);
      x.saidas = r2(x.custosFixos + x.despesas);
      x.saldo = r2(x.entradas - x.saidas);
    }
    out.push({ id: `${d.ano}_${comunidadeId}`, ano: d.ano, comunidadeId, meses, calculadoEm: agora, calculadoPor: '' });
  }
  return out;
}

/** Resumo público: só meses fechados, só totais, com supressão de grupos com menos de 3 registos. */
export function calcularPublico(ano: number, resumos: Resumo[], comunidades: Comunidade[], mesesFechados: Set<string>): Publico {
  const fechados = Array.from({ length: 12 }, (_, i) => i + 1).filter((mes) => mesesFechados.has(periodo(ano, mes)));
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const linhas = resumos
    .filter((r) => r.comunidadeId !== 'bolsa-geral')
    .map((r) => ({
      id: r.comunidadeId,
      nome: nomes.get(r.comunidadeId) ?? r.comunidadeId,
      meses: fechados.map((mes): PublicoMes => {
        const x = r.meses[mes - 1];
        const nEntradas = x.n.contribuir + x.n.coletas + x.n.transferencias;
        const entradas = nEntradas >= 3 || nEntradas === 0 ? x.entradas : null;
        const outras = x.n.despesas >= 3 || x.n.despesas === 0 ? x.despesas : null;
        const saldo = entradas == null || outras == null ? null : r2(entradas - x.custosFixos - outras);
        return { mes, entradas, custosFuncionamento: x.custosFixos, outrasDespesas: outras, saldo };
      }),
    }))
    .sort((a, b) => (comunidades.find((c) => c.id === a.id)?.ordem ?? 50) - (comunidades.find((c) => c.id === b.id)?.ordem ?? 50));
  return { ano, comunidades: linhas, mesesFechados: fechados, atualizadoEm: new Date().toISOString() };
}

/**
 * Visão pública do site (CCLX consolidado), para a página sem login.
 * Calculada a partir dos resumos (não da soma das comunidades já protegidas), com a mesma regra:
 * valores com menos de 3 registos no total não são mostrados.
 */
export function calcularPublicoSite(ano: number, resumos: Resumo[], mesesFechados: Set<string>): PublicoSite {
  const fechados = Array.from({ length: 12 }, (_, i) => i + 1).filter((mes) => mesesFechados.has(periodo(ano, mes)));
  const rs = resumos.filter((r) => r.comunidadeId !== 'bolsa-geral');
  const meses = fechados.map((mes): PublicoMes => {
    const xs = rs.map((r) => r.meses[mes - 1]);
    const nEntradas = xs.reduce((s, x) => s + x.n.contribuir + x.n.coletas + x.n.transferencias, 0);
    const nDespesas = xs.reduce((s, x) => s + x.n.despesas, 0);
    const somaE = r2(xs.reduce((s, x) => s + x.entradas, 0));
    const somaD = r2(xs.reduce((s, x) => s + x.despesas, 0));
    const custos = r2(xs.reduce((s, x) => s + x.custosFixos, 0));
    const entradas = nEntradas >= 3 || nEntradas === 0 ? somaE : null;
    const outras = nDespesas >= 3 || nDespesas === 0 ? somaD : null;
    const saldo = entradas == null || outras == null ? null : r2(entradas - custos - outras);
    return { mes, entradas, custosFuncionamento: custos, outrasDespesas: outras, saldo };
  });
  return { ano, site: { nome: 'CCLX', meses }, mesesFechados: fechados, atualizadoEm: new Date().toISOString() };
}

export function somarMeses(ms: ResumoMes[]) {
  const t = vazio(0);
  for (const x of ms) {
    for (const k of ['contribuir', 'coletas', 'transferencias', 'quotaBolsa', 'entradas', 'custosFixos', 'despesas', 'saidas', 'saldo'] as const) t[k] = r2(t[k] + x[k]);
    for (const [k, v] of Object.entries(x.entradasPorCategoria)) soma(t.entradasPorCategoria, k, v);
    for (const [k, v] of Object.entries(x.despesasPorCategoria)) soma(t.despesasPorCategoria, k, v);
    for (const [k, v] of Object.entries(x.custosRubricas)) soma(t.custosRubricas, k, v);
    t.n.contribuir += x.n.contribuir; t.n.coletas += x.n.coletas; t.n.transferencias += x.n.transferencias; t.n.despesas += x.n.despesas;
  }
  return t;
}
