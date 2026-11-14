import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';

async function existe(col: string, campo: string, op: '==' | 'array-contains', valor: string) {
  const s = await getDocs(query(collection(db, col), where(campo, op, valor), limit(1)));
  return !s.empty;
}

/**
 * Verifica se uma entidade tem dados associados. Devolve a lista de motivos (vazia = pode ser apagada).
 * Entidades com dados não se apagam: desativam-se, para manter o histórico.
 */
export async function usosComunidade(id: string): Promise<string[]> {
  const m: string[] = [];
  if (await existe('lotes', 'comunidadeId', '==', id)) m.push('registos Jotform');
  if (await existe('custos_fixos', 'comunidadeId', '==', id)) m.push('custos fixos');
  if (await existe('resumos', 'comunidadeId', '==', id)) m.push('resumos calculados');
  if (await existe('users', 'comunidades', 'array-contains', id)) m.push('utilizadores com acesso');
  const banco = await getDocs(collection(db, 'banco_lotes'));
  if (banco.docs.some((d) => (d.data().registos ?? []).some((r: { comunidadeId?: string }) => r.comunidadeId === id))) m.push('movimentos bancários atribuídos');
  return m;
}

export async function usosConta(id: string): Promise<string[]> {
  return (await existe('banco_lotes', 'contaId', '==', id)) ? ['movimentos bancários importados'] : [];
}

/** Uma categoria está em uso se aparece em resumos calculados ou em movimentos bancários classificados. */
export async function usosCategoria(nome: string): Promise<string[]> {
  const m: string[] = [];
  const resumos = await getDocs(collection(db, 'resumos'));
  const emResumo = resumos.docs.some((d) =>
    (d.data().meses ?? []).some((x: { entradasPorCategoria?: Record<string, number>; despesasPorCategoria?: Record<string, number> }) =>
      (x.entradasPorCategoria && nome in x.entradasPorCategoria) || (x.despesasPorCategoria && nome in x.despesasPorCategoria)));
  if (emResumo) m.push('registos nos resumos');
  const banco = await getDocs(collection(db, 'banco_lotes'));
  if (banco.docs.some((d) => (d.data().registos ?? []).some((r: { categoria?: string }) => r.categoria === nome))) m.push('movimentos bancários classificados');
  return m;
}
