import { afterEach, describe, expect, it, vi } from 'vitest';
import { eur, parseData, parseNumero } from '../../src/lib/format';
import { FONTES, construirLotes, mapearLinhas, resolverComunidade, sugerirMapa } from '../../src/lib/fontes';
import { calcularPublico, calcularResumos, somarMeses } from '../../src/lib/resumos';
import { mapearExtrato, sugerir, sugerirMapaBanco } from '../../src/lib/banco';
import { achatar } from '../../src/lib/jotform';
import { COMUNIDADES, CUSTOS_FIXOS_CDR } from '../../src/lib/seed';
import type { Lote } from '../../src/lib/types';

describe('formatos portugueses', () => {
  it('números', () => {
    expect(parseNumero('1.234,56')).toBe(1234.56);
    expect(parseNumero('1234.56')).toBe(1234.56);
    expect(parseNumero('-12,50 €')).toBe(-12.5);
    expect(parseNumero('(10,00)')).toBe(-10);
    expect(parseNumero('1,234.56')).toBe(1234.56);
  });
  it('datas', () => {
    expect(parseData('13/11/2026')).toBe('2026-11-13');
    expect(parseData('2026-11-02 10:00:17')).toBe('2026-11-02');
    expect(parseData('03-01-2026')).toBe('2026-01-03');
  });
  it('euros com duas casas', () => {
    expect(eur(-7847.65).replace(/\s/g, ' ')).toBe('-7.847,65 €');
  });
});

describe('comunidades', () => {
  it('resolve nomes e aliases', () => {
    expect(resolverComunidade('Caldas da Rainha', '2026-01-01').id).toBe('caldas-da-rainha');
    expect(resolverComunidade('CCLX Almada', '2026-01-01').id).toBe('almada');
    expect(resolverComunidade('', '2026-01-01').id).toBe('bolsa-geral');
  });
  it('Barreiro passa a Moita a partir de 01/11/2026', () => {
    expect(resolverComunidade('Barreiro', '2026-10-31').id).toBe('barreiro');
    expect(resolverComunidade('Barreiro', '2026-11-01').id).toBe('moita');
  });
});

describe('importação Jotform', () => {
  const linhas = [
    { 'Submission Date': '2026-03-02 10:00:00', 'Submission ID': '1', 'Nome ': 'Ana Silva', Comunidade: 'Caldas da Rainha', 'Valor (€)': '50,00', 'Nº Contribuinte (NIF)': '123456789', 'E-mail': 'ana@x.pt', Categoria: 'Dízimo', PAGO: 'PAGO' },
    { 'Submission Date': '2026-03-09 10:00:00', 'Submission ID': '2', 'Nome ': 'Rui', Comunidade: 'Almada', 'Valor (€)': '20', Categoria: 'Oferta', PAGO: 'pago' },
    { 'Submission Date': 'xx', 'Submission ID': '3', Comunidade: 'Almada', 'Valor (€)': '20', PAGO: 'PAGO' },
    { 'Submission Date': '2026-03-10 10:00:00', 'Submission ID': '4', Comunidade: 'Almada', 'Valor (€)': '99', PAGO: 'PENDENTE' },
    { 'Submission Date': '2026-03-11 10:00:00', 'Submission ID': '5', Comunidade: 'Almada', 'Valor (€)': '77' },
  ];
  it('sugere o mapa de colunas', () => {
    const m = sugerirMapa(FONTES.contribuir, Object.keys(linhas[0]));
    expect(m.data).toBe('Submission Date');
    expect(m.valor).toBe('Valor (€)');
    expect(m.pessoa).toBe('Nome ');
    expect(m.nif).toBe('Nº Contribuinte (NIF)');
    expect(m.pago).toBe('PAGO');
  });
  it('só conta contribuições com PAGO = "PAGO"', () => {
    const m = sugerirMapa(FONTES.contribuir, Object.keys(linhas[0]));
    const r = mapearLinhas('contribuir', linhas, m);
    expect(r.registos.map((x) => x.id)).toEqual(['1', '2']);
    expect(r.naoPagas).toBe(2); // PENDENTE e vazio
  });
  it('anonimiza no nível privado', async () => {
    const m = sugerirMapa(FONTES.contribuir, Object.keys(linhas[0]));
    const { registos, rejeitadas } = mapearLinhas('contribuir', linhas, m);
    expect(registos).toHaveLength(2);
    expect(rejeitadas).toHaveLength(1);
    const { conf, priv } = await construirLotes('contribuir', registos, 'teste');
    const c = conf.find((l) => l.comunidadeId === 'caldas-da-rainha')!;
    const p = priv.find((l) => l.comunidadeId === 'caldas-da-rainha')!;
    expect(c.id).toBe('contribuir_2026_03_caldas-da-rainha');
    expect(c.registos[0].nif).toBe('123456789');
    expect(p.registos[0].nif).toBeUndefined();
    expect(p.registos[0].pessoa).toBeUndefined();
    expect(p.registos[0].pessoaRef).toMatch(/^Contribuinte #[0-9A-F]{6}$/);
  });
  it('achata respostas da API', () => {
    const l = achatar({ id: '9', created_at: '2026-05-01 09:00:00', status: 'ACTIVE', answers: {
      '3': { text: 'Comunidade', type: 'control_dropdown', answer: 'Porto' },
      '4': { text: 'Dia', type: 'control_datetime', answer: { day: '03', month: '05', year: '2026' } },
      '5': { text: 'Enviar', type: 'control_button' },
      '6': { text: '', name: 'PAGO', type: 'control_hidden', answer: 'PAGO' },
    } });
    expect(l).toEqual({ 'Submission ID': '9', 'Submission Date': '2026-05-01 09:00:00', Comunidade: 'Porto', Dia: '2026-05-03', PAGO: 'PAGO' });
  });
});

const lote = (origem: Lote['origem'], comunidadeId: string, mes: number, valores: number[]): Lote => ({
  id: `${origem}_2026_${mes}_${comunidadeId}`, origem, ano: 2026, mes, periodo: `2026-${String(mes).padStart(2, '0')}`, comunidadeId,
  registos: valores.map((v, i) => ({ id: `${mes}-${i}`, data: `2026-${String(mes).padStart(2, '0')}-10`, valor: v, categoria: origem === 'despesas' ? 'Material' : 'Dízimos' })),
  total: valores.reduce((a, b) => a + b, 0), n: valores.length, atualizadoEm: '', atualizadoPor: '',
});

describe('resumos (caso real de Caldas da Rainha, 2026 até 13/11)', () => {
  it('reproduz o saldo e a cobertura do relatório', () => {
    const resumos = calcularResumos({
      ano: 2026, comunidades: COMUNIDADES,
      contribuir: [lote('contribuir', 'caldas-da-rainha', 6, [8264.18])],
      depositos: [lote('depositos', 'caldas-da-rainha', 6, [2217.59])],
      despesas: [lote('despesas', 'caldas-da-rainha', 6, [749.88])],
      assistencia: [], banco: [],
      custosFixos: CUSTOS_FIXOS_CDR, mesesFechados: new Set(), hoje: '2026-11-13',
    });
    const t = somarMeses(resumos.find((r) => r.comunidadeId === 'caldas-da-rainha')!.meses);
    expect(t.entradas).toBe(10481.77);
    expect(t.custosFixos).toBe(17579.54);
    expect(t.saldo).toBe(-7847.65);
    expect(t.custosRubricas['Outros custos de funcionamento']).toBe(9493.55); // vencimentos + SS ficam agregados
  });

  it('distribui a bolsa geral pela média de adultos do mesmo mês', () => {
    const resumos = calcularResumos({
      ano: 2026, comunidades: COMUNIDADES,
      contribuir: [lote('contribuir', 'bolsa-geral', 3, [300])],
      depositos: [], despesas: [], banco: [], custosFixos: [], mesesFechados: new Set(), hoje: '2026-11-13',
      assistencia: [lote('assistencia', 'almada', 3, [100, 100]), lote('assistencia', 'porto', 3, [50])],
    });
    const mar = (c: string) => resumos.find((r) => r.comunidadeId === c)!.meses[2];
    expect(mar('almada').quotaBolsa).toBe(200);
    expect(mar('porto').quotaBolsa).toBe(100);
    expect(mar('bolsa-geral').entradas).toBe(0);
  });

  it('página pública: só meses fechados e esconde grupos com menos de 3 registos', () => {
    const resumos = calcularResumos({
      ano: 2026, comunidades: COMUNIDADES,
      contribuir: [lote('contribuir', 'porto', 1, [10, 20]), lote('contribuir', 'porto', 2, [10, 20, 30])],
      depositos: [], despesas: [], assistencia: [], banco: [], custosFixos: [], mesesFechados: new Set(), hoje: '2026-11-13',
    });
    const pub = calcularPublico(2026, resumos, COMUNIDADES, new Set(['2026-01', '2026-02']));
    const porto = pub.comunidades.find((c) => c.id === 'porto')!;
    expect(pub.mesesFechados).toEqual([1, 2]);
    expect(porto.meses[0].entradas).toBeNull();
    expect(porto.meses[1].entradas).toBe(60);
    expect(pub.comunidades.find((c) => c.id === 'bolsa-geral')).toBeUndefined();
  });
});

describe('extratos bancários', () => {
  it('lê débito/crédito e concilia com depósitos Jotform', () => {
    const linhas = [
      { 'Data mov.': '05-03-2026', Descrição: 'DEPOSITO NUMERARIO', 'Débito': '', 'Crédito': '120,00', Saldo: '1.120,00' },
      { 'Data mov.': '06-03-2026', Descrição: 'TRF DE JOAO OFERTA', 'Débito': '', 'Crédito': '50,00', Saldo: '1.170,00' },
      { 'Data mov.': '07-03-2026', Descrição: 'RENDA MARCO', 'Débito': '626,69', 'Crédito': '', Saldo: '543,31' },
    ];
    const mapa = sugerirMapaBanco(Object.keys(linhas[0]));
    const { movimentos } = mapearExtrato(linhas, mapa);
    expect(movimentos.map((m) => m.valor)).toEqual([120, 50, -626.69]);
    const deps = [lote('depositos', 'porto', 3, [120])];
    deps[0].registos[0].data = '2026-03-04';
    const s = sugerir(movimentos, deps, []);
    expect(s[0].conciliadoCom).toBe('depositos:3-0');
    expect(s[0].comunidadeId).toBe('porto');
    expect(s[1].sugestao).toMatch(/bolsa geral/);
  });
});

import { ibanValido, formatarIban } from '../../src/lib/iban';
describe('IBAN', () => {
  it('valida pelo mod 97', () => {
    expect(ibanValido('PT50 0002 0123 1234 5678 9015 4')).toBe(true);
    expect(ibanValido('PT50 0002 0123 1234 5678 9015 5')).toBe(false);
    expect(ibanValido('PT50 0002')).toBe(false);
  });
  it('formata em grupos de 4', () => {
    expect(formatarIban('pt50000201231234567890154')).toBe('PT50 0002 0123 1234 5678 9015 4');
  });
});

import { testarChave } from '../../src/lib/jotform';
describe('teste da chave Jotform', () => {
  const forms = [{ id: '1', nome: 'A' }, { id: '2', nome: 'B' }];
  const resp = (b: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => b }) as Response;
  afterEach(() => vi.unstubAllGlobals());
  it('confirma conta e formulários', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => u.includes('/user')
      ? resp({ responseCode: 200, content: { username: 'cclx', account_type: 'https://api.jotform.com/system/plan/GOLD' } })
      : u.includes('/form/2') ? resp({ responseCode: 401, message: 'no' }) : resp({ responseCode: 200, content: { title: 'A', count: '42', status: 'ENABLED' } })));
    const r = await testarChave({ apiKey: 'k', base: 'https://eu-api.jotform.com' }, forms);
    expect(r.conta?.utilizador).toBe('cclx');
    expect(r.conta?.plano).toBe('GOLD');
    expect(r.formularios[0]).toMatchObject({ ok: true, submissoes: 42 });
    expect(r.formularios[1]).toMatchObject({ ok: false, erro: 'sem acesso com esta chave' });
    expect(r.ok).toBe(false);
  });
  it('sugere o outro servidor quando a chave só funciona lá', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => u.startsWith('https://api.') ? resp({ responseCode: 200, content: {} }) : resp({ responseCode: 401 })));
    const r = await testarChave({ apiKey: 'k', base: 'https://eu-api.jotform.com' }, forms);
    expect(r.ok).toBe(false);
    expect(r.sugestaoServidor).toBe('https://api.jotform.com');
  });
});
