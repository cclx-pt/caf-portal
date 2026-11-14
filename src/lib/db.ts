import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where, writeBatch,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  BancoLote, Categoria, Comunidade, Conta, CustoFixo, Fecho, Lote, Nivel, Orcamento, Origem, Perfil, Publico, PublicoSite, Resumo,
} from './types';
import { NIVEIS, nivelNum } from './types';

export interface Acesso {
  email: string;
  papel: Perfil['papel'];
  nivel: Nivel;
  comunidades: string[];
}

const todas = (a: Acesso) => a.comunidades.includes('*');

/** Restrição de comunidade exigida pelas regras para quem não vê todas. */
function porComunidade(a: Acesso): QueryConstraint[] {
  if (todas(a)) return [];
  return [where('comunidadeId', 'in', a.comunidades.slice(0, 30))];
}

async function lista<T>(nome: string, ...c: QueryConstraint[]): Promise<T[]> {
  const snap = await getDocs(c.length ? query(collection(db, nome), ...c) : collection(db, nome));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

// ---------- auditoria ----------
export async function auditar(quem: string, acao: string, detalhe: string) {
  try {
    await addDoc(collection(db, 'auditoria'), { quem, acao, detalhe, em: new Date().toISOString() });
  } catch (e) {
    console.warn('auditoria', e);
  }
}
export const listarAuditoria = () => lista<{ id: string; quem: string; acao: string; detalhe: string; em: string }>('auditoria');

// ---------- perfis ----------
export async function lerPerfil(email: string): Promise<Perfil | null> {
  const s = await getDoc(doc(db, 'users', email.toLowerCase()));
  return s.exists() ? ({ email: s.id, ...s.data() } as Perfil) : null;
}
export const listarPerfis = () => lista<Perfil & { id: string }>('users');
export const gravarPerfil = (p: Perfil) => setDoc(doc(db, 'users', p.email.toLowerCase()), { ...p, email: p.email.toLowerCase() });
export const apagarPerfil = (email: string) => deleteDoc(doc(db, 'users', email.toLowerCase()));

// ---------- configuração ----------
export const listarComunidades = async () => (await lista<Comunidade>('comunidades')).sort((a, b) => a.ordem - b.ordem);
export const listarContas = () => lista<Conta>('contas');
export const listarCategorias = async () => (await lista<Categoria>('categorias')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
export const gravar = <T extends { id: string }>(col: string, o: T) => setDoc(doc(db, col, o.id), o);
export const apagar = (col: string, id: string) => deleteDoc(doc(db, col, id));

// ---------- lotes Jotform ----------
export async function listarLotes(a: Acesso, origem: Origem, ano: number, conf = false): Promise<Lote[]> {
  const col = conf ? 'lotes_conf' : 'lotes';
  return lista<Lote>(col, where('origem', '==', origem), where('ano', '==', ano), ...porComunidade(a));
}

/** Grava lotes em blocos (até 400 escritas por bloco). Devolve os que falharam (ex.: mês fechado). */
export async function gravarLotes(conf: Lote[], priv: Lote[], soPrivado = false) {
  const falhas: string[] = [];
  const pares = priv.map((p, i) => ({ p, c: conf[i] }));
  for (let i = 0; i < pares.length; i += 200) {
    const fatia = pares.slice(i, i + 200);
    const b = writeBatch(db);
    for (const { p, c } of fatia) {
      b.set(doc(db, 'lotes', p.id), p);
      if (!soPrivado) b.set(doc(db, 'lotes_conf', c.id), c);
    }
    try {
      await b.commit();
    } catch {
      // Tenta um a um para identificar os lotes recusados.
      for (const { p, c } of fatia) {
        try {
          const b1 = writeBatch(db);
          b1.set(doc(db, 'lotes', p.id), p);
          if (!soPrivado) b1.set(doc(db, 'lotes_conf', c.id), c);
          await b1.commit();
        } catch {
          falhas.push(p.periodo + ' · ' + p.comunidadeId);
        }
      }
    }
  }
  return falhas;
}

// ---------- bancos ----------
export const listarBanco = (ano: number) => lista<BancoLote>('banco_lotes', where('ano', '==', ano));
export const gravarBancoLote = (l: BancoLote) => setDoc(doc(db, 'banco_lotes', l.id), l);

// ---------- custos fixos ----------
export function listarCustosFixos(a: Acesso): Promise<CustoFixo[]> {
  const permitidos = NIVEIS.filter((n) => nivelNum(n) <= nivelNum(a.nivel));
  return lista<CustoFixo>('custos_fixos', where('nivel', 'in', permitidos), ...porComunidade(a));
}

// ---------- resumos ----------
export const listarResumos = (a: Acesso, ano: number) => lista<Resumo>('resumos', where('ano', '==', ano), ...porComunidade(a));
/** Visão do site CCLX (consolidada): aberta, sem login. */
export async function lerPublico(ano: number): Promise<PublicoSite | null> {
  const s = await getDoc(doc(db, 'publico', String(ano)));
  return s.exists() && (s.data() as PublicoSite).site ? (s.data() as PublicoSite) : null;
}
/** Contas públicas por comunidade: só com login (regras: utilizador ativo). */
export async function lerPublicoSites(ano: number): Promise<Publico | null> {
  const s = await getDoc(doc(db, 'publico_sites', String(ano)));
  return s.exists() ? (s.data() as Publico) : null;
}

// ---------- orçamento ----------
export async function lerOrcamento(ano: number): Promise<Orcamento | null> {
  const s = await getDoc(doc(db, 'orcamentos', String(ano)));
  return s.exists() ? (s.data() as Orcamento) : null;
}
export const gravarOrcamento = (o: Orcamento) => setDoc(doc(db, 'orcamentos', String(o.ano)), o);
export const gravarVersaoOrcamento = (o: Orcamento) => setDoc(doc(db, 'orcamentos_versoes', `${o.ano}_v${o.versao}`), o);

// ---------- fechos ----------
export const listarFechos = () => lista<Fecho & { id: string }>('fechos');
export const gravarFecho = (f: Fecho) => setDoc(doc(db, 'fechos', f.periodo), f);

// ---------- segredo Jotform (só master) ----------
export async function lerSegredoJotform(): Promise<{ apiKey: string; base: string } | null> {
  const s = await getDoc(doc(db, 'segredos', 'jotform'));
  return s.exists() ? (s.data() as { apiKey: string; base: string }) : null;
}
export const gravarSegredoJotform = (v: { apiKey: string; base: string }) => setDoc(doc(db, 'segredos', 'jotform'), v);

// ---------- estado da sincronização com o Jotform ----------
import type { EstadoSync } from './sync';
export type { EstadoSync };
export async function lerEstadoSync(): Promise<EstadoSync | null> {
  const s = await getDoc(doc(db, 'estado', 'sync'));
  return s.exists() ? (s.data() as EstadoSync) : null;
}

export { db };
