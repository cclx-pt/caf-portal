import { Estado, useCarregar } from '../components/ui';
import { listarAuditoria } from '../lib/db';

export default function Auditoria() {
  const a = useCarregar(listarAuditoria, []);
  const linhas = [...(a.dados ?? [])].sort((x, y) => y.em.localeCompare(x.em));
  return (
    <>
      <h1>Auditoria</h1>
      <p className="muted">Registo de importações, classificações, fechos, aprovações e alterações de utilizadores. Só se acrescenta; nada se apaga.</p>
      <Estado aCarregar={a.aCarregar} erro={a.erro} vazio={!linhas.length} />
      <div className="tabela"><table>
        <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead>
        <tbody>{linhas.slice(0, 500).map((l) => (
          <tr key={l.id}><td className="small">{new Date(l.em).toLocaleString('pt-PT')}</td><td className="small">{l.quem}</td><td>{l.acao}</td><td className="small">{l.detalhe}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}
