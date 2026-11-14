import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

let env: RulesTestEnvironment;

const MASTER = 'tesouraria@cclx.pt';
const CAF = 'caf@exemplo.pt';
const TES_CDR = 'tes.caldas@exemplo.pt';
const LEITOR = 'leitor@exemplo.pt';

function as(email: string, verified = true) {
  return env.authenticatedContext(email, { email, email_verified: verified }).firestore();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-caf',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', CAF), { papel: 'caf', nivel: 'confidencial', comunidades: ['*'], ativo: true });
    await setDoc(doc(db, 'users', TES_CDR), { papel: 'tesoureiro', nivel: 'privado', comunidades: ['caldas-da-rainha'], ativo: true });
    await setDoc(doc(db, 'users', LEITOR), { papel: 'leitura', nivel: 'publico', comunidades: ['*'], ativo: true });
    await setDoc(doc(db, 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'lotes', 'contribuir_2026_03_caldas-da-rainha'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'lotes', 'contribuir_2026_03_almada'), { comunidadeId: 'almada', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'custos_fixos', 'cdr-vencimentos'), { comunidadeId: 'caldas-da-rainha', nivel: 'confidencial', rubrica: 'Vencimentos' });
    await setDoc(doc(db, 'custos_fixos', 'cdr-renda'), { comunidadeId: 'caldas-da-rainha', nivel: 'privado', rubrica: 'Renda' });
    await setDoc(doc(db, 'publico', '2026'), { site: { nome: 'CCLX', meses: [] } });
    await setDoc(doc(db, 'publico_sites', '2026'), { comunidades: [] });
    await setDoc(doc(db, 'fechos', '2026-01'), { estado: 'fechado' });
  });
});

describe('página pública', () => {
  it('qualquer pessoa lê o resumo público do site (CCLX)', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'publico', '2026')));
  });
  it('as contas por comunidade só se leem com login', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'publico_sites', '2026')));
    await assertSucceeds(getDoc(doc(as(LEITOR), 'publico_sites', '2026')));
    await assertFails(setDoc(doc(as(LEITOR), 'publico_sites', '2026'), { comunidades: [] }));
    await assertSucceeds(setDoc(doc(as(CAF), 'publico_sites', '2026'), { comunidades: [] }));
  });
  it('sem login não lê dados privados', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'lotes', 'contribuir_2026_03_almada')));
  });
});

describe('master', () => {
  it('master fixo lê dados confidenciais sem perfil criado', async () => {
    await assertSucceeds(getDoc(doc(as(MASTER), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
  });
  it('email não verificado não é master', async () => {
    await assertFails(getDoc(doc(as(MASTER, false), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
  });
  it('só o master gere utilizadores', async () => {
    await assertSucceeds(setDoc(doc(as(MASTER), 'users', 'novo@exemplo.pt'), { papel: 'leitura' }));
    await assertFails(setDoc(doc(as(CAF), 'users', 'novo@exemplo.pt'), { papel: 'master' }));
  });
  it('master altera mês fechado', async () => {
    await assertSucceeds(setDoc(doc(as(MASTER), 'lotes', 'x'), { comunidadeId: 'almada', periodo: '2026-01', registos: [] }));
  });
});

describe('CAF', () => {
  it('lê confidencial de todas as comunidades', async () => {
    await assertSucceeds(getDoc(doc(as(CAF), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
    await assertSucceeds(getDoc(doc(as(CAF), 'custos_fixos', 'cdr-vencimentos')));
  });
  it('não altera mês fechado', async () => {
    await assertFails(setDoc(doc(as(CAF), 'lotes', 'y'), { comunidadeId: 'almada', periodo: '2026-01', registos: [] }));
  });
  it('cria, altera e apaga entidades', async () => {
    await assertSucceeds(setDoc(doc(as(CAF), 'comunidades', 'nova'), { nome: 'Nova', ordem: 9, ativo: true }));
    await assertSucceeds(setDoc(doc(as(CAF), 'contas', 'cgd-principal'), { nome: 'CGD', iban: 'PT50000201231234567890154' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'categorias', 'saida-x'), { nome: 'X', tipo: 'saida', nivel: 'privado' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'custos_fixos', 'cdr-renda'), { comunidadeId: 'caldas-da-rainha', nivel: 'privado', rubrica: 'Renda' }));
  });
  it('fecha meses e publica', async () => {
    await assertSucceeds(setDoc(doc(as(CAF), 'fechos', '2026-02'), { estado: 'fechado' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'publico', '2026'), { comunidades: [] }));
  });
});

describe('tesoureiro de Caldas da Rainha', () => {
  it('lê dados privados só da sua comunidade', async () => {
    await assertSucceeds(getDoc(doc(as(TES_CDR), 'lotes', 'contribuir_2026_03_caldas-da-rainha')));
    await assertFails(getDoc(doc(as(TES_CDR), 'lotes', 'contribuir_2026_03_almada')));
  });
  it('consulta filtrada pela sua comunidade funciona', async () => {
    const q = query(collection(as(TES_CDR), 'lotes'), where('comunidadeId', 'in', ['caldas-da-rainha']));
    await assertSucceeds(getDocs(q));
  });
  it('não lê dados confidenciais nem vencimentos', async () => {
    await assertFails(getDoc(doc(as(TES_CDR), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
    await assertFails(getDoc(doc(as(TES_CDR), 'custos_fixos', 'cdr-vencimentos')));
    await assertSucceeds(getDoc(doc(as(TES_CDR), 'custos_fixos', 'cdr-renda')));
  });
  it('consulta custos fixos só até ao seu nível', async () => {
    const db = as(TES_CDR);
    await assertSucceeds(getDocs(query(collection(db, 'custos_fixos'), where('nivel', 'in', ['publico', 'privado']), where('comunidadeId', 'in', ['caldas-da-rainha']))));
    await assertFails(getDocs(query(collection(db, 'custos_fixos'), where('nivel', 'in', ['publico', 'privado', 'confidencial']), where('comunidadeId', 'in', ['caldas-da-rainha']))));
  });
  it('só consulta: não importa nem altera dados', async () => {
    await assertFails(setDoc(doc(as(TES_CDR), 'lotes', 'z'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-04', registos: [] }));
    await assertFails(setDoc(doc(as(TES_CDR), 'lotes_conf', 'z'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-04', registos: [] }));
  });
  it('lê o estado da sincronização; só o Master o escreve (sincronização forçada)', async () => {
    await assertSucceeds(getDoc(doc(as(TES_CDR), 'estado', 'sync')));
    await assertSucceeds(setDoc(doc(as(MASTER), 'estado', 'sync'), { ok: true }));
    await assertFails(setDoc(doc(as(CAF), 'estado', 'sync'), { ok: true }));
    await assertFails(setDoc(doc(as(TES_CDR), 'estado', 'sync'), { ok: true }));
  });
  it('não altera entidades nem custos fixos', async () => {
    await assertFails(setDoc(doc(as(TES_CDR), 'comunidades', 'nova'), { nome: 'Nova' }));
    await assertFails(setDoc(doc(as(TES_CDR), 'categorias', 'saida-x'), { nome: 'X' }));
    await assertFails(setDoc(doc(as(TES_CDR), 'custos_fixos', 'cdr-renda'), { comunidadeId: 'caldas-da-rainha', nivel: 'privado', rubrica: 'Renda' }));
    await assertFails(getDoc(doc(as(TES_CDR), 'contas', 'cgd-principal')));
  });
  it('não vê bancos nem publica', async () => {
    await assertFails(getDoc(doc(as(TES_CDR), 'banco_lotes', 'qualquer')));
    await assertFails(setDoc(doc(as(TES_CDR), 'publico', '2026'), { comunidades: [] }));
  });
});

describe('leitura (nível público)', () => {
  it('não lê dados privados', async () => {
    await assertFails(getDoc(doc(as(LEITOR), 'lotes', 'contribuir_2026_03_almada')));
  });
  it('não escreve', async () => {
    await assertFails(setDoc(doc(as(LEITOR), 'lotes', 'k'), { comunidadeId: 'almada', periodo: '2026-04', registos: [] }));
  });
});

describe('desconhecido', () => {
  it('utilizador sem perfil não lê nada privado', async () => {
    await assertFails(getDoc(doc(as('estranho@exemplo.pt'), 'lotes', 'contribuir_2026_03_almada')));
    await assertFails(getDoc(doc(as('estranho@exemplo.pt'), 'comunidades', 'almada')));
  });
  it('auditoria só aceita o próprio email', async () => {
    await assertFails(setDoc(doc(as(CAF), 'auditoria', 'a1'), { quem: 'outro@exemplo.pt', acao: 'x' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'auditoria', 'a2'), { quem: CAF, acao: 'x' }));
  });
});
