import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { auditar, gravarFecho, listarFechos } from '../lib/db';
import { recalcularAno } from '../lib/recalcular';
import { MESES, periodo } from '../lib/format';

const BASE = import.meta.env.BASE_URL;

export default function Fecho() {
  const { acesso } = useAuth();
  const { ano } = useFiltros();
  const fechos = useCarregar(listarFechos, []);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mapa = new Map((fechos.dados ?? []).map((f) => [f.periodo, f]));

  async function alternar(p: string, fechar: boolean) {
    if (!fechar && !confirm(`Reabrir ${p}? Fica registado na auditoria.`)) return;
    setOcupado(true); setMsg(null);
    try {
      await gravarFecho({ periodo: p, estado: fechar ? 'fechado' : 'aberto', por: acesso!.email, em: new Date().toISOString() });
      await auditar(acesso!.email, fechar ? 'fechar mês' : 'reabrir mês', p);
      await fechos.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }
  async function publicar() {
    setOcupado(true); setMsg(null);
    try { const { publico } = await recalcularAno(acesso!, ano); setMsg(`Resumos recalculados. Página pública de ${ano} com ${publico.mesesFechados.length} meses fechados.`); }
    catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  return (
    <>
      <h1>Fecho mensal e publicação {ano}</h1>
      <p className="muted">Depois de reconciliado, o CAF fecha o mês: deixa de poder ser alterado (só o Master pode) e passa a aparecer na página pública. Reabrir fica registado na auditoria.</p>
      {msg && <div className="nota">{msg}</div>}
      <div className="acoes">
        <button disabled={ocupado} onClick={publicar}>Recalcular resumos e publicar</button>
        <a className="btn sec" href={`${BASE}#/publico`} target="_blank" rel="noreferrer">Ver página pública ↗</a>
      </div>
      <Estado aCarregar={fechos.aCarregar} erro={fechos.erro} />
      <div className="tabela"><table>
        <thead><tr><th>Mês</th><th>Estado</th><th>Por</th><th>Em</th><th /></tr></thead>
        <tbody>{MESES.map((nome, i) => {
          const p = periodo(ano, i + 1); const f = mapa.get(p); const fechado = f?.estado === 'fechado';
          return (
            <tr key={p}>
              <td>{nome} {ano}</td>
              <td>{fechado ? <span className="etiqueta preta">Fechado</span> : <span className="etiqueta">Aberto</span>}</td>
              <td className="small">{f?.por ?? ''}</td>
              <td className="small">{f ? new Date(f.em).toLocaleString('pt-PT') : ''}</td>
              <td><button className="sec" disabled={ocupado} onClick={() => alternar(p, !fechado)}>{fechado ? 'Reabrir' : 'Fechar mês'}</button></td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </>
  );
}
