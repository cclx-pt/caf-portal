/** Sincronização forçada a partir do portal (Master): o mesmo motor da tarefa automática, com o SDK web. */
import { collection, doc, documentId, getDoc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { auditar, lerSegredoJotform, listarFechos, type Acesso } from './db';
import { recalcularAno } from './recalcular';
import { sincronizar, type ArmazemSync, type EstadoSync } from './sync';
import type { Lote } from './types';

function armazemWeb(a: Acesso): ArmazemSync {
  const estadoRef = doc(db, 'estado', 'sync');
  return {
    async lerEstado() {
      const s = await getDoc(estadoRef);
      return s.exists() ? (s.data() as EstadoSync) : null;
    },
    marcarEmCurso: (v) => setDoc(estadoRef, { emCurso: v }, { merge: true }),
    gravarEstado: (e) => setDoc(estadoRef, e),
    async mesesFechados() {
      return new Set((await listarFechos()).filter((f) => f.estado === 'fechado').map((f) => f.periodo));
    },
    async lerLotes(col, ids) {
      const out = new Map<string, Lote>();
      for (let i = 0; i < ids.length; i += 30) {
        const parte = ids.slice(i, i + 30);
        if (!parte.length) continue;
        const s = await getDocs(query(collection(db, col), where(documentId(), 'in', parte)));
        s.forEach((d) => out.set(d.id, d.data() as Lote));
      }
      return out;
    },
    async listarIdsLotes(origem) {
      const s = await getDocs(query(collection(db, 'lotes'), where('origem', '==', origem)));
      return s.docs.map((d) => ({ id: d.id, periodo: (d.data() as Lote).periodo }));
    },
    async gravarLotes(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        for (const o of ops.slice(i, i + 400)) {
          const ref = doc(db, o.col, o.id);
          if (o.apagar) b.delete(ref);
          else b.set(ref, o.lote!);
        }
        await b.commit();
      }
    },
    recalcular: async (ano) => { await recalcularAno(a, ano); },
    auditar,
  };
}

/** Corre a sincronização incremental agora, no browser do Master. */
export async function sincronizarAgora(a: Acesso, onProgresso?: (msg: string) => void): Promise<EstadoSync> {
  const cfg = await lerSegredoJotform();
  if (!cfg?.apiKey) throw new Error('A chave da API Jotform ainda não está guardada.');
  return sincronizar(armazemWeb(a), { apiKey: cfg.apiKey, base: cfg.base || 'https://eu-api.jotform.com' }, a.email, { modo: 'incremental', onProgresso });
}
