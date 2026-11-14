import { useCarregar } from './ui';
import { lerEstadoSync } from '../lib/db';

/** Mostra quando foi a última sincronização automática com o Jotform. */
export function SyncEstado({ detalhe }: { detalhe?: boolean }) {
  const e = useCarregar(lerEstadoSync, []);
  if (e.aCarregar || e.erro) return null;
  const d = e.dados;
  if (!d) return <div className="aviso small">A sincronização automática com o Jotform ainda não correu.</div>;
  const quando = new Date(d.fim).toLocaleString('pt-PT');
  return (
    <div className={d.ok ? 'nota small' : 'aviso small'}>
      <b>{d.ok ? 'Sincronização automática com o Jotform' : 'Última sincronização com erros'}</b>: {quando}.
      {' '}Corre automaticamente 4 vezes por dia.
      {detalhe && <>
        <div style={{ marginTop: 6 }}>
          {Object.entries(d.resultado ?? {}).map(([k, v]) => (
            <div key={k}>{k}: {v.registos} registos ({v.submissoes} submissões, {v.rejeitadas} rejeitadas, {v.mesesFechadosIgnorados} lotes de meses fechados não alterados)</div>
          ))}
        </div>
        {!!d.erros?.length && <div style={{ marginTop: 6 }}>Erros: {d.erros.join('; ')}</div>}
      </>}
    </div>
  );
}
