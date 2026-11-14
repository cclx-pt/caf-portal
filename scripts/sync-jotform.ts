/**
 * Sincronização automática Jotform → Firestore (corre no GitHub Actions, sem plano Blaze).
 *
 * Variáveis de ambiente:
 *   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço (só com acesso ao Firestore), segredo do repositório
 *   SYNC_MODO                 'incremental' (por defeito) ou 'completo'
 *
 * A chave da API Jotform é lida do Firestore (segredos/jotform), onde o Master a guarda no portal.
 * Em alternativa, pode vir da variável JOTFORM_API_KEY (e JOTFORM_BASE).
 *
 * Incremental: só integra as submissões criadas desde a última sincronização (ver src/lib/sync.ts).
 * Completo: relê tudo desde 01/01/2025 e substitui os lotes dos meses abertos.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { SyncEmCurso, sincronizar, type ArmazemSync, type EstadoSync } from '../src/lib/sync';
import { calcularPublico, calcularPublicoSite, calcularResumos } from '../src/lib/resumos';
import type { BancoLote, Comunidade, CustoFixo, Lote, Origem } from '../src/lib/types';

const QUEM = 'sync-automatico';

function env(nome: string) {
  const v = process.env[nome];
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

initializeApp({ credential: cert(JSON.parse(env('FIREBASE_SERVICE_ACCOUNT'))) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

async function configJotform() {
  if (process.env.JOTFORM_API_KEY) return { apiKey: process.env.JOTFORM_API_KEY, base: process.env.JOTFORM_BASE || 'https://eu-api.jotform.com' };
  const s = await db.collection('segredos').doc('jotform').get();
  const d = s.data() as { apiKey?: string; base?: string } | undefined;
  if (!d?.apiKey) throw new Error('A chave da API Jotform não está configurada (portal → Configuração).');
  return { apiKey: d.apiKey, base: d.base || 'https://eu-api.jotform.com' };
}

async function lerTodos<T>(col: string, campo?: string, valor?: unknown): Promise<T[]> {
  const q = campo ? db.collection(col).where(campo, '==', valor) : db.collection(col);
  const s = await q.get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

async function fechados() {
  const fechos = await lerTodos<{ id: string; estado: string }>('fechos');
  return new Set(fechos.filter((f) => f.estado === 'fechado').map((f) => f.id));
}

const estadoRef = db.collection('estado').doc('sync');

const armazem: ArmazemSync = {
  async lerEstado() {
    const s = await estadoRef.get();
    return s.exists ? (s.data() as EstadoSync) : null;
  },
  async marcarEmCurso(v) { await estadoRef.set({ emCurso: v }, { merge: true }); },
  async gravarEstado(e) { await estadoRef.set(e); },
  mesesFechados: fechados,
  async lerLotes(col, ids) {
    const out = new Map<string, Lote>();
    for (let i = 0; i < ids.length; i += 30) {
      const parte = ids.slice(i, i + 30);
      if (!parte.length) continue;
      const s = await db.collection(col).where(FieldPath.documentId(), 'in', parte).get();
      s.forEach((d) => out.set(d.id, d.data() as Lote));
    }
    return out;
  },
  async listarIdsLotes(origem: Origem) {
    const s = await db.collection('lotes').where('origem', '==', origem).get();
    return s.docs.map((d) => ({ id: d.id, periodo: (d.data() as Lote).periodo }));
  },
  async gravarLotes(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = db.batch();
      for (const o of ops.slice(i, i + 400)) {
        const ref = db.collection(o.col).doc(o.id);
        if (o.apagar) b.delete(ref);
        else b.set(ref, o.lote!);
      }
      await b.commit();
    }
  },
  async recalcular(ano) {
    const [comunidades, conf, priv, banco, custosFixos, mesesFechados] = await Promise.all([
      lerTodos<Comunidade>('comunidades'),
      lerTodos<Lote>('lotes_conf', 'ano', ano),
      lerTodos<Lote>('lotes', 'ano', ano),
      lerTodos<BancoLote>('banco_lotes', 'ano', ano),
      lerTodos<CustoFixo>('custos_fixos'),
      fechados(),
    ]);
    const de = (o: Origem) => conf.filter((l) => l.origem === o);
    const assistencia = priv.filter((l) => l.origem === 'assistencia');
    comunidades.sort((a, b) => a.ordem - b.ordem);
    const hoje = new Date().toISOString().slice(0, 10);
    const resumos = calcularResumos({ ano, comunidades, contribuir: de('contribuir'), depositos: de('depositos'), despesas: de('despesas'), assistencia, banco, custosFixos, mesesFechados, hoje });
    const publico = calcularPublico(ano, resumos, comunidades, mesesFechados);
    const b = db.batch();
    for (const r of resumos) b.set(db.collection('resumos').doc(r.id), { ...r, calculadoPor: QUEM });
    b.set(db.collection('publico').doc(String(ano)), calcularPublicoSite(ano, resumos, mesesFechados)); // aberto: só CCLX
    b.set(db.collection('publico_sites').doc(String(ano)), publico); // com login: por comunidade
    await b.commit();
  },
  async auditar(quem, acao, detalhe) {
    await db.collection('auditoria').add({ quem, acao, detalhe, em: new Date().toISOString() });
  },
};

async function main() {
  const modo = process.env.SYNC_MODO === 'completo' ? 'completo' : 'incremental';
  const cfg = await configJotform();
  const estado = await sincronizar(armazem, cfg, QUEM, { modo, onProgresso: (m) => console.log(m) });
  for (const [k, v] of Object.entries(estado.resultado)) console.log(k, JSON.stringify(v));
  if (!estado.ok) { console.error(estado.erros); process.exit(1); }
}

main().catch((e) => {
  if (e instanceof SyncEmCurso) { console.log(e.message); return; } // outra sincronização (ex.: forçada no portal) já está a correr
  console.error(e);
  process.exit(1);
});
