/**
 * Motor de sincronização Jotform → Firestore, partilhado pela tarefa automática (GitHub Actions)
 * e pela sincronização forçada no portal (Configuração, só Master).
 *
 * Modo incremental (normal): para cada formulário pede ao Jotform só as submissões criadas depois
 * do último marcador guardado em estado/sync e acrescenta-as aos lotes mensais, sem duplicar
 * (a chave é o ID da submissão) e sem reescrever o que já existe.
 * Modo completo (só à mão, na tarefa do GitHub): volta a ler tudo desde 01/01/2025 e substitui
 * os lotes dos meses abertos, removendo submissões apagadas no Jotform.
 *
 * Meses fechados pelo CAF nunca são alterados.
 */
import { FONTES, construirLotes, mapearLinhas, sugerirMapa } from './fontes';
import { lerSubmissoes, type JotConfig } from './jotform';
import { JOTFORM_FORMS } from './seed';
import { r2 } from './format';
import type { Lote, Origem } from './types';

export const SYNC_DESDE = '2025-01-01';
export const ORIGENS_SYNC: Origem[] = ['contribuir', 'depositos', 'despesas', 'assistencia'];
/** Uma sincronização "em curso" há mais do que isto é considerada abandonada. */
export const BLOQUEIO_MIN = 20;
/**
 * Dias a reler antes do marcador, por formulário. No CONTRIBUIR uma contribuição pode passar a
 * PAGO depois de submetida; relendo os últimos 30 dias, entra assim que estiver paga
 * (sem duplicar: a chave é o ID da submissão).
 */
export const RELER_DIAS: Partial<Record<Origem, number>> = { contribuir: 30 };

/** Recua `dias` a uma data do Jotform (AAAA-MM-DD hh:mm:ss). */
export function recuar(marcador: string, dias: number): string {
  const d = new Date(marcador.replace(' ', 'T') + 'Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export interface ResultadoOrigem {
  submissoes: number;
  registos: number;
  novos: number;
  rejeitadas: number;
  /** Entradas ignoradas por não terem PAGO = "PAGO". */
  naoPagas?: number;
  lotes: number;
  mesesFechadosIgnorados: number;
  removidos: number;
}

export interface EstadoSync {
  inicio: string;
  fim: string;
  ok: boolean;
  modo: 'incremental' | 'completo';
  quem: string;
  erros: string[];
  resultado: Record<string, ResultadoOrigem>;
  /** Data de criação (Jotform) da submissão mais recente já integrada, por formulário. */
  marcadores?: Partial<Record<Origem, string>>;
  emCurso?: { desde: string; quem: string } | null;
}

/** Acesso à base de dados: implementado com o Admin SDK (servidor) e com o SDK web (portal). */
export interface ArmazemSync {
  lerEstado(): Promise<EstadoSync | null>;
  /** Marca/desmarca a sincronização como em curso (fusão, não substitui o resto). */
  marcarEmCurso(v: EstadoSync['emCurso']): Promise<void>;
  gravarEstado(e: EstadoSync): Promise<void>;
  mesesFechados(): Promise<Set<string>>;
  lerLotes(col: 'lotes' | 'lotes_conf', ids: string[]): Promise<Map<string, Lote>>;
  listarIdsLotes(origem: Origem): Promise<{ id: string; periodo: string }[]>;
  gravarLotes(ops: { col: 'lotes' | 'lotes_conf'; lote?: Lote; id: string; apagar?: boolean }[]): Promise<void>;
  recalcular(ano: number): Promise<void>;
  auditar(quem: string, acao: string, detalhe: string): Promise<void>;
}

/**
 * Junta os registos novos a um lote existente, sem duplicar IDs.
 * Os registos que já existem ficam como estão.
 */
export function fundirLote(existente: Lote | undefined, novo: Lote): { lote: Lote; acrescentados: number } {
  if (!existente) return { lote: novo, acrescentados: novo.registos.length };
  const ids = new Set(existente.registos.map((r) => r.id));
  const extra = novo.registos.filter((r) => !ids.has(r.id));
  if (!extra.length) return { lote: existente, acrescentados: 0 };
  const registos = [...existente.registos, ...extra].sort((a, b) => a.data.localeCompare(b.data));
  return {
    lote: {
      ...existente,
      registos,
      total: r2(registos.reduce((s, r) => s + r.valor, 0)),
      n: registos.length,
      atualizadoEm: novo.atualizadoEm,
      atualizadoPor: novo.atualizadoPor,
    },
    acrescentados: extra.length,
  };
}

/** Data de criação mais recente entre as linhas lidas (formato do Jotform: AAAA-MM-DD hh:mm:ss). */
export function marcadorMaisRecente(linhas: Record<string, unknown>[], atual?: string): string | undefined {
  let m = atual;
  for (const l of linhas) {
    const d = String(l['Submission Date'] ?? '');
    if (/^\d{4}-\d{2}-\d{2}/.test(d) && (!m || d > m)) m = d;
  }
  return m;
}

async function sincronizarOrigem(
  arm: ArmazemSync,
  origem: Origem,
  cfg: JotConfig,
  quem: string,
  fechados: Set<string>,
  modo: EstadoSync['modo'],
  marcador: string | undefined,
  anosTocados: Set<number>,
): Promise<{ resultado: ResultadoOrigem; marcador?: string }> {
  let desde = modo === 'completo' || !marcador ? SYNC_DESDE : marcador;
  if (desde !== SYNC_DESDE && RELER_DIAS[origem]) {
    desde = recuar(desde, RELER_DIAS[origem]!);
    if (desde < SYNC_DESDE) desde = SYNC_DESDE;
  }
  const linhas = await lerSubmissoes(cfg, JOTFORM_FORMS[origem].id, desde);
  const novoMarcador = marcadorMaisRecente(linhas, modo === 'completo' ? undefined : marcador);
  const vazio: ResultadoOrigem = { submissoes: 0, registos: 0, novos: 0, rejeitadas: 0, lotes: 0, mesesFechadosIgnorados: 0, removidos: 0 };
  if (!linhas.length && modo === 'incremental') return { resultado: vazio, marcador: novoMarcador };

  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const mapa = sugerirMapa(FONTES[origem], colunas);
  const falta = FONTES[origem].campos.filter((c) => c.obrigatorio && !mapa[c.key]).map((c) => c.label);
  if (linhas.length && falta.length) throw new Error(`colunas obrigatórias não encontradas (${falta.join(', ')})`);
  const { registos, rejeitadas, naoPagas } = linhas.length ? mapearLinhas(origem, linhas, mapa) : { registos: [], rejeitadas: [], naoPagas: 0 };
  const validos = registos.filter((r) => r.data >= SYNC_DESDE);
  const { conf, priv } = await construirLotes(origem, validos, quem);
  const temConf = origem !== 'assistencia';

  const abertos = priv.map((p, i) => ({ p, c: conf[i] })).filter(({ p }) => !fechados.has(p.periodo));
  const mesesFechadosIgnorados = priv.length - abertos.length;
  const ops: Parameters<ArmazemSync['gravarLotes']>[0] = [];
  let novos = 0;
  let removidos = 0;

  if (modo === 'incremental') {
    const ids = abertos.map(({ p }) => p.id);
    const [privEx, confEx] = await Promise.all([arm.lerLotes('lotes', ids), temConf ? arm.lerLotes('lotes_conf', ids) : Promise.resolve(new Map<string, Lote>())]);
    for (const { p, c } of abertos) {
      const fp = fundirLote(privEx.get(p.id), p);
      if (!fp.acrescentados) continue;
      novos += fp.acrescentados;
      anosTocados.add(p.ano);
      ops.push({ col: 'lotes', id: p.id, lote: fp.lote });
      if (temConf) ops.push({ col: 'lotes_conf', id: c.id, lote: fundirLote(confEx.get(c.id), c).lote });
    }
  } else {
    const ids = new Set(priv.map((l) => l.id));
    for (const { p, c } of abertos) {
      anosTocados.add(p.ano);
      ops.push({ col: 'lotes', id: p.id, lote: p });
      if (temConf) ops.push({ col: 'lotes_conf', id: c.id, lote: c });
    }
    novos = abertos.reduce((s, { p }) => s + p.registos.length, 0);
    for (const l of await arm.listarIdsLotes(origem)) {
      if (ids.has(l.id) || fechados.has(l.periodo)) continue;
      removidos++;
      anosTocados.add(Number(l.periodo.slice(0, 4)));
      ops.push({ col: 'lotes', id: l.id, apagar: true });
      if (temConf) ops.push({ col: 'lotes_conf', id: l.id, apagar: true });
    }
  }
  if (ops.length) await arm.gravarLotes(ops);
  return {
    resultado: { submissoes: linhas.length, registos: validos.length, novos, rejeitadas: rejeitadas.length, naoPagas, lotes: ops.filter((o) => o.col === 'lotes' && !o.apagar).length, mesesFechadosIgnorados, removidos },
    marcador: novoMarcador,
  };
}

export class SyncEmCurso extends Error {}

/** Corre a sincronização. Devolve o estado gravado em estado/sync. */
export async function sincronizar(
  arm: ArmazemSync,
  cfg: JotConfig,
  quem: string,
  opcoes: { modo?: EstadoSync['modo']; onProgresso?: (msg: string) => void; ignorarBloqueio?: boolean } = {},
): Promise<EstadoSync> {
  const modo = opcoes.modo ?? 'incremental';
  const progresso = opcoes.onProgresso ?? (() => {});
  const anterior = await arm.lerEstado();
  const em = anterior?.emCurso;
  if (em && !opcoes.ignorarBloqueio && Date.now() - new Date(em.desde).getTime() < BLOQUEIO_MIN * 60_000) {
    throw new SyncEmCurso(`Já há uma sincronização em curso (${em.quem}, desde ${new Date(em.desde).toLocaleTimeString('pt-PT')}). Tente daqui a alguns minutos.`);
  }
  const inicio = new Date().toISOString();
  await arm.marcarEmCurso({ desde: inicio, quem });

  const marcadores: Partial<Record<Origem, string>> = { ...(anterior?.marcadores ?? {}) };
  const resultado: Record<string, ResultadoOrigem> = {};
  const erros: string[] = [];
  const anosTocados = new Set<number>();
  let estado: EstadoSync | undefined;
  try {
    const fechados = await arm.mesesFechados();
    for (const origem of ORIGENS_SYNC) {
      progresso(`A ler ${JOTFORM_FORMS[origem].nome}…`);
      try {
        const r = await sincronizarOrigem(arm, origem, cfg, quem, fechados, modo, marcadores[origem], anosTocados);
        resultado[origem] = r.resultado;
        if (r.marcador) marcadores[origem] = r.marcador;
      } catch (e) {
        erros.push(`${origem}: ${(e as Error).message}`);
      }
    }
    for (const ano of [...anosTocados].sort()) {
      progresso(`A recalcular resumos de ${ano}…`);
      try { await arm.recalcular(ano); } catch (e) { erros.push(`resumos ${ano}: ${(e as Error).message}`); }
    }
  } finally {
    estado = { inicio, fim: new Date().toISOString(), ok: !erros.length, modo, quem, erros, resultado, marcadores, emCurso: null };
    await arm.gravarEstado(estado);
    const total = Object.values(resultado).reduce((s, r) => s + r.novos, 0);
    const resumo = Object.entries(resultado).map(([k, v]) => `${k}: +${v.novos}`).join(' · ');
    await arm.auditar(quem, modo === 'completo' ? 'sincronizar jotform (completo)' : 'sincronizar jotform', `${total} registos novos${resumo ? ` (${resumo})` : ''}${erros.length ? ` · erros: ${erros.join('; ')}` : ''}`);
    progresso('Concluído.');
  }
  return estado;
}
