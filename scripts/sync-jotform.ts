/**
 * Sincronização automática Jotform → Firestore (corre no GitHub Actions, sem plano Blaze).
 *
 * Variáveis de ambiente (segredos do repositório):
 *   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço (só com acesso ao Firestore)
 *
 * A chave da API Jotform é lida do Firestore (segredos/jotform), onde o Master a guarda no portal.
 * Em alternativa, pode vir da variável JOTFORM_API_KEY (e JOTFORM_BASE).
 *
 * O que faz:
 *   1. Lê as submissões dos 4 formulários desde 01/01/2025 (só leitura no Jotform).
 *   2. Agrupa em lotes mensais por comunidade: confidencial (com dados pessoais) e privado (pseudónimos).
 *   3. Não toca em meses fechados pelo CAF.
 *   4. Recalcula os resumos e a página pública.
 *   5. Regista o resultado em estado/sync e na auditoria.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type WriteBatch } from 'firebase-admin/firestore';
import { FONTES, construirLotes, mapearLinhas, sugerirMapa } from '../src/lib/fontes';
import { lerSubmissoes } from '../src/lib/jotform';
import { JOTFORM_FORMS } from '../src/lib/seed';
import { calcularPublico, calcularResumos } from '../src/lib/resumos';
import type { BancoLote, Comunidade, CustoFixo, Lote, Origem } from '../src/lib/types';

const DESDE = '2025-01-01';
const QUEM = 'sync-automatico';

function env(nome: string) {
  const v = process.env[nome];
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

initializeApp({ credential: cert(JSON.parse(env('FIREBASE_SERVICE_ACCOUNT'))) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

async function emBlocos(ops: ((b: WriteBatch) => void)[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

async function configJotform() {
  if (process.env.JOTFORM_API_KEY) return { apiKey: process.env.JOTFORM_API_KEY, base: process.env.JOTFORM_BASE || 'https://eu-api.jotform.com' };
  const s = await db.collection('segredos').doc('jotform').get();
  const d = s.data() as { apiKey?: string; base?: string } | undefined;
  if (!d?.apiKey) throw new Error('A chave da API Jotform não está configurada (portal → Configuração).');
  return { apiKey: d.apiKey, base: d.base || 'https://eu-api.jotform.com' };
}

async function sincronizarOrigem(origem: Origem, fechados: Set<string>, cfg: { apiKey: string; base: string }) {
  const linhas = await lerSubmissoes(cfg, JOTFORM_FORMS[origem].id, DESDE);
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const mapa = sugerirMapa(FONTES[origem], colunas);
  const falta = FONTES[origem].campos.filter((c) => c.obrigatorio && !mapa[c.key]).map((c) => c.label);
  if (falta.length) throw new Error(`${origem}: colunas obrigatórias não encontradas (${falta.join(', ')})`);
  const { registos, rejeitadas } = mapearLinhas(origem, linhas, mapa);
  const validos = registos.filter((r) => r.data >= DESDE);
  const { conf, priv } = await construirLotes(origem, validos, QUEM);

  const novos = new Set(priv.map((l) => l.id));
  const ops: ((b: WriteBatch) => void)[] = [];
  let saltados = 0;
  priv.forEach((p, i) => {
    if (fechados.has(p.periodo)) { saltados++; return; }
    ops.push((b) => b.set(db.collection('lotes').doc(p.id), p));
    if (origem !== 'assistencia') ops.push((b) => b.set(db.collection('lotes_conf').doc(conf[i].id), conf[i]));
  });
  // Lotes que deixaram de existir no Jotform (submissões apagadas), em meses abertos.
  const existentes = await db.collection('lotes').where('origem', '==', origem).get();
  let removidos = 0;
  for (const d of existentes.docs) {
    const l = d.data() as Lote;
    if (!novos.has(d.id) && !fechados.has(l.periodo)) {
      removidos++;
      ops.push((b) => b.delete(d.ref));
      if (origem !== 'assistencia') ops.push((b) => b.delete(db.collection('lotes_conf').doc(d.id)));
    }
  }
  await emBlocos(ops);
  return { submissoes: linhas.length, registos: validos.length, rejeitadas: rejeitadas.length, lotes: priv.length - saltados, mesesFechadosIgnorados: saltados, removidos, mapa };
}

async function lerTodos<T>(col: string, campo?: string, valor?: unknown): Promise<T[]> {
  const q = campo ? db.collection(col).where(campo, '==', valor) : db.collection(col);
  const s = await q.get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

async function recalcular(ano: number, fechados: Set<string>) {
  const [comunidades, conf, priv, banco, custosFixos] = await Promise.all([
    lerTodos<Comunidade>('comunidades'),
    lerTodos<Lote>('lotes_conf', 'ano', ano),
    lerTodos<Lote>('lotes', 'ano', ano),
    lerTodos<BancoLote>('banco_lotes', 'ano', ano),
    lerTodos<CustoFixo>('custos_fixos'),
  ]);
  const de = (o: Origem) => conf.filter((l) => l.origem === o);
  const [contribuir, depositos, despesas] = [de('contribuir'), de('depositos'), de('despesas')];
  const assistencia = priv.filter((l) => l.origem === 'assistencia');
  comunidades.sort((a, b) => a.ordem - b.ordem);
  const hoje = new Date().toISOString().slice(0, 10);
  const resumos = calcularResumos({ ano, comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, mesesFechados: fechados, hoje });
  const publico = calcularPublico(ano, resumos, comunidades, fechados);
  await emBlocos([
    ...resumos.map((r) => (b: WriteBatch) => b.set(db.collection('resumos').doc(r.id), { ...r, calculadoPor: QUEM })),
    (b: WriteBatch) => b.set(db.collection('publico').doc(String(ano)), publico),
  ]);
  return resumos.length;
}

async function main() {
  const inicio = new Date().toISOString();
  const fechos = await lerTodos<{ id: string; estado: string }>('fechos');
  const fechados = new Set(fechos.filter((f) => f.estado === 'fechado').map((f) => f.id));
  const resultado: Record<string, unknown> = {};
  const erros: string[] = [];
  let cfg: { apiKey: string; base: string } | null = null;
  try { cfg = await configJotform(); } catch (e) { erros.push((e as Error).message); }
  for (const origem of ['contribuir', 'depositos', 'despesas', 'assistencia'] as Origem[]) {
    if (!cfg) break;
    try {
      resultado[origem] = await sincronizarOrigem(origem, fechados, cfg);
      console.log(origem, JSON.stringify(resultado[origem]));
    } catch (e) {
      erros.push(`${origem}: ${(e as Error).message}`);
      console.error(origem, e);
    }
  }
  const anoAtual = new Date().getFullYear();
  for (let ano = 2025; ano <= anoAtual; ano++) {
    try { await recalcular(ano, fechados); } catch (e) { erros.push(`resumos ${ano}: ${(e as Error).message}`); }
  }
  const fim = new Date().toISOString();
  await db.collection('estado').doc('sync').set({ inicio, fim, ok: !erros.length, erros, resultado });
  const resumo = Object.entries(resultado).map(([k, v]) => `${k}: ${(v as { registos: number }).registos}`).join(' · ');
  await db.collection('auditoria').add({ quem: QUEM, acao: 'sincronizar jotform', detalhe: (resumo || 'sem dados') + (erros.length ? ` · erros: ${erros.join('; ')}` : ''), em: fim });
  if (erros.length) { console.error(erros); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
