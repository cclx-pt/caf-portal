import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncEmCurso, fundirLote, marcadorMaisRecente, recuar, sincronizar, type ArmazemSync, type EstadoSync } from '../../src/lib/sync';
import { JOTFORM_FORMS } from '../../src/lib/seed';
import type { Lote } from '../../src/lib/types';

/** Jotform falso: devolve as submissões criadas depois do filtro created_at:gt. */
type Sub = { id: string; created_at: string; comunidade: string; valor: string; nome: string; pago?: string };
function jotformFalso(subs: Record<string, Sub[]>) {
  const chamadas: { form: string; desde: string }[] = [];
  const fetchFalso = vi.fn(async (url: string) => {
    const u = new URL(url);
    const form = u.pathname.split('/')[2];
    const desde = JSON.parse(u.searchParams.get('filter')!)['created_at:gt'];
    chamadas.push({ form, desde });
    const lista = (subs[form] ?? []).filter((s) => s.created_at > desde).map((s) => ({
      id: s.id, created_at: s.created_at, status: 'ACTIVE',
      answers: {
        '1': { text: 'Nome ', type: 'control_textbox', answer: s.nome },
        '2': { text: 'Comunidade', type: 'control_dropdown', answer: s.comunidade },
        '3': { text: 'Valor (€)', type: 'control_number', answer: s.valor },
        '4': { text: 'Categoria', type: 'control_dropdown', answer: 'Dízimo' },
        '5': { text: '', name: 'PAGO', type: 'control_hidden', answer: s.pago ?? 'PAGO' },
      },
    }));
    return { ok: true, status: 200, json: async () => ({ responseCode: 200, content: lista }) } as Response;
  });
  return { fetchFalso, chamadas };
}

/** Base de dados em memória. */
function armazemMemoria(fechados: string[] = []) {
  const cols: Record<string, Map<string, Lote>> = { lotes: new Map(), lotes_conf: new Map() };
  let estado: EstadoSync | null = null;
  const recalculados: number[] = [];
  const arm: ArmazemSync = {
    lerEstado: async () => (estado ? structuredClone(estado) : null),
    marcarEmCurso: async (v) => { estado = { ...(estado ?? ({} as EstadoSync)), emCurso: v }; },
    gravarEstado: async (e) => { estado = structuredClone(e); },
    mesesFechados: async () => new Set(fechados),
    lerLotes: async (col, ids) => new Map(ids.filter((i) => cols[col].has(i)).map((i) => [i, structuredClone(cols[col].get(i)!)])),
    listarIdsLotes: async (origem) => [...cols.lotes.values()].filter((l) => l.origem === origem).map((l) => ({ id: l.id, periodo: l.periodo })),
    gravarLotes: async (ops) => { for (const o of ops) { if (o.apagar) cols[o.col].delete(o.id); else cols[o.col].set(o.id, structuredClone(o.lote!)); } },
    recalcular: async (ano) => { recalculados.push(ano); },
    auditar: async () => {},
  };
  return { arm, cols, recalculados, estado: () => estado };
}

const CFG = { apiKey: 'k', base: 'https://eu-api.jotform.com' };
const F = JOTFORM_FORMS.contribuir.id;

describe('sincronização incremental', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('funde lotes sem duplicar registos', () => {
    const base: Lote = { id: 'x', origem: 'contribuir', ano: 2026, mes: 3, periodo: '2026-03', comunidadeId: 'almada', registos: [{ id: '1', data: '2026-03-01', valor: 10, categoria: 'D' }], total: 10, n: 1, atualizadoEm: 'a', atualizadoPor: 'a' };
    const novo: Lote = { ...base, registos: [{ id: '1', data: '2026-03-01', valor: 99, categoria: 'D' }, { id: '2', data: '2026-03-05', valor: 5, categoria: 'D' }], atualizadoEm: 'b' };
    const r = fundirLote(base, novo);
    expect(r.acrescentados).toBe(1);
    expect(r.lote.registos.map((x) => x.valor)).toEqual([10, 5]); // o existente não é reescrito
    expect(r.lote.total).toBe(15);
    expect(r.lote.n).toBe(2);
    expect(fundirLote(r.lote, novo).acrescentados).toBe(0);
  });

  it('guarda o marcador da submissão mais recente', () => {
    expect(marcadorMaisRecente([{ 'Submission Date': '2026-03-02 10:00:00' }, { 'Submission Date': '2026-03-09 08:00:00' }], '2026-01-01 00:00:00')).toBe('2026-03-09 08:00:00');
    expect(marcadorMaisRecente([], '2026-01-01 00:00:00')).toBe('2026-01-01 00:00:00');
  });

  it('1.ª vez lê tudo; depois só pede e integra as submissões novas', async () => {
    const subs = { [F]: [
      { id: 'a', created_at: '2026-03-02 10:00:00', comunidade: 'Almada', valor: '50', nome: 'Ana' },
      { id: 'b', created_at: '2026-03-09 10:00:00', comunidade: 'Almada', valor: '20', nome: 'Rui' },
    ] };
    const j = jotformFalso(subs);
    vi.stubGlobal('fetch', j.fetchFalso);
    const m = armazemMemoria();

    const e1 = await sincronizar(m.arm, CFG, 'teste');
    expect(e1.ok).toBe(true);
    expect(e1.resultado.contribuir.novos).toBe(2);
    expect(e1.marcadores?.contribuir).toBe('2026-03-09 10:00:00');
    expect(j.chamadas.find((c) => c.form === F)!.desde).toBe('2025-01-01 00:00:00');
    expect(m.recalculados).toEqual([2026]);
    expect(m.cols.lotes.get('contribuir_2026_03_almada')!.n).toBe(2);
    expect(m.cols.lotes_conf.get('contribuir_2026_03_almada')!.registos[0].pessoa).toBe('Ana');

    // Sem novidades: não escreve nem recalcula.
    j.chamadas.length = 0; m.recalculados.length = 0;
    const e2 = await sincronizar(m.arm, CFG, 'teste');
    expect(j.chamadas.find((c) => c.form === F)!.desde).toBe('2026-02-07 10:00:00'); // relê 30 dias
    expect(e2.resultado.contribuir.novos).toBe(0);
    expect(m.recalculados).toEqual([]);

    // Uma submissão nova: só essa é acrescentada.
    subs[F].push({ id: 'c', created_at: '2026-03-20 12:00:00', comunidade: 'Almada', valor: '5', nome: 'Eva' });
    const e3 = await sincronizar(m.arm, CFG, 'teste');
    expect(e3.resultado.contribuir.novos).toBe(1);
    const l = m.cols.lotes.get('contribuir_2026_03_almada')!;
    expect(l.n).toBe(3);
    expect(l.total).toBe(75);
    expect(new Set(l.registos.map((r) => r.id)).size).toBe(3);
    expect(m.estado()?.emCurso).toBeNull();
  });

  it('recua o marcador', () => {
    expect(recuar('2026-03-09 10:00:00', 30)).toBe('2026-02-07 10:00:00');
  });

  it('só integra contribuições pagas; uma que passa a PAGO depois entra na sincronização seguinte', async () => {
    const subs: Record<string, Sub[]> = { [F]: [
      { id: 'a', created_at: '2026-03-02 10:00:00', comunidade: 'Almada', valor: '50', nome: 'Ana', pago: 'PAGO' },
      { id: 'b', created_at: '2026-03-03 10:00:00', comunidade: 'Almada', valor: '20', nome: 'Rui', pago: 'PENDENTE' },
    ] };
    vi.stubGlobal('fetch', jotformFalso(subs).fetchFalso);
    const m = armazemMemoria();
    const e1 = await sincronizar(m.arm, CFG, 'teste');
    expect(e1.resultado.contribuir.novos).toBe(1);
    expect(e1.resultado.contribuir.naoPagas).toBe(1);
    expect(m.cols.lotes.get('contribuir_2026_03_almada')!.total).toBe(50);

    subs[F][1].pago = 'PAGO'; // pagamento confirmado mais tarde (sem nova submissão)
    const e2 = await sincronizar(m.arm, CFG, 'teste');
    expect(e2.resultado.contribuir.novos).toBe(1);
    expect(m.cols.lotes.get('contribuir_2026_03_almada')!.total).toBe(70);
  });

  it('sem o campo PAGO não integra nada e dá erro', async () => {
    const semPago = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ responseCode: 200, content: !url.includes(F) ? [] : [
      { id: 'a', created_at: '2026-03-02 10:00:00', status: 'ACTIVE', answers: { '2': { text: 'Comunidade', answer: 'Almada' }, '3': { text: 'Valor (€)', answer: '50' } } },
    ] }) }) as Response);
    vi.stubGlobal('fetch', semPago);
    const m = armazemMemoria();
    const e = await sincronizar(m.arm, CFG, 'teste');
    expect(e.ok).toBe(false);
    expect(e.erros.join()).toMatch(/contribuir: .*Pago/);
    expect([...m.cols.lotes.keys()].filter((k) => k.startsWith('contribuir'))).toEqual([]);
  });

  it('não toca em meses fechados', async () => {
    vi.stubGlobal('fetch', jotformFalso({ [F]: [{ id: 'a', created_at: '2026-03-02 10:00:00', comunidade: 'Almada', valor: '50', nome: 'Ana' }] }).fetchFalso);
    const m = armazemMemoria(['2026-03']);
    const e = await sincronizar(m.arm, CFG, 'teste');
    expect(e.resultado.contribuir.novos).toBe(0);
    expect(e.resultado.contribuir.mesesFechadosIgnorados).toBe(1);
    expect(m.cols.lotes.size).toBe(0);
  });

  it('não corre duas sincronizações ao mesmo tempo', async () => {
    vi.stubGlobal('fetch', jotformFalso({}).fetchFalso);
    const m = armazemMemoria();
    await m.arm.marcarEmCurso({ desde: new Date().toISOString(), quem: 'outro' });
    await expect(sincronizar(m.arm, CFG, 'teste')).rejects.toBeInstanceOf(SyncEmCurso);
  });
});
