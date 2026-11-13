import { doc, writeBatch } from 'firebase/firestore';
import { db, listarBanco, listarComunidades, listarCustosFixos, listarFechos, listarLotes, auditar, type Acesso } from './db';
import { calcularPublico, calcularResumos } from './resumos';
import { hoje } from './format';

/** Recalcula os resumos de um ano e a página pública. Só master e CAF (precisa de dados confidenciais). */
export async function recalcularAno(a: Acesso, ano: number) {
  const [comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, fechos] = await Promise.all([
    listarComunidades(),
    listarLotes(a, 'contribuir', ano, true),
    listarLotes(a, 'depositos', ano, true),
    listarLotes(a, 'despesas', ano, true),
    listarLotes(a, 'assistencia', ano, false),
    listarBanco(ano),
    listarCustosFixos(a),
    listarFechos(),
  ]);
  const mesesFechados = new Set(fechos.filter((f) => f.estado === 'fechado').map((f) => f.periodo));
  const resumos = calcularResumos({ ano, comunidades, contribuir, depositos, despesas, assistencia, banco, custosFixos, mesesFechados, hoje: hoje() });
  const publico = calcularPublico(ano, resumos, comunidades, mesesFechados);
  const b = writeBatch(db);
  for (const r of resumos) b.set(doc(db, 'resumos', r.id), { ...r, calculadoPor: a.email });
  b.set(doc(db, 'publico', String(ano)), publico);
  await b.commit();
  await auditar(a.email, 'recalcular', `Resumos e página pública de ${ano}`);
  return { resumos, publico };
}
