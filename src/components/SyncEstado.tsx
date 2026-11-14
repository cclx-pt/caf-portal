import { useCarregar } from './ui';
import { lerEstadoSync } from '../lib/db';
import { JOTFORM_FORMS } from '../lib/seed';
import type { Origem } from '../lib/types';

const nomeOrigem = (k: string) => JOTFORM_FORMS[k as Origem]?.nome ?? k;
const dataJot = (d?: string) => (d ? new Date(d.replace(' ', 'T')).toLocaleString('pt-PT') : '');

/** Mostra quando foi a última sincronização com o Jotform e o que trouxe de novo. */
export function SyncEstado({ detalhe, versao = 0 }: { detalhe?: boolean; versao?: number }) {
  const e = useCarregar(lerEstadoSync, [versao]);
  if (e.aCarregar || e.erro) return null;
  const d = e.dados;
  if (!d?.fim) return <div className="aviso small">A sincronização com o Jotform ainda não correu.</div>;
  const quando = new Date(d.fim).toLocaleString('pt-PT');
  const novos = Object.values(d.resultado ?? {}).reduce((s, r) => s + (r.novos ?? 0), 0);
  const quem = d.quem === 'sync-automatico' || !d.quem ? 'automática' : `forçada por ${d.quem}`;
  return (
    <div className={d.ok ? 'nota small' : 'aviso small'}>
      <b>{d.ok ? 'Última sincronização com o Jotform' : 'Última sincronização com erros'}</b>: {quando} ({quem}
      {d.modo === 'completo' ? ', completa' : ''}). {novos} registo{novos === 1 ? '' : 's'} novo{novos === 1 ? '' : 's'}.
      {' '}Corre automaticamente 4 vezes por dia e só integra submissões novas.
      {d.emCurso && <div style={{ marginTop: 6 }}>Sincronização em curso desde {new Date(d.emCurso.desde).toLocaleTimeString('pt-PT')} ({d.emCurso.quem}).</div>}
      {detalhe && <>
        <div style={{ marginTop: 6 }}>
          {Object.entries(d.resultado ?? {}).map(([k, v]) => (
            <div key={k}>
              {nomeOrigem(k)}: +{v.novos ?? 0} novos
              {v.rejeitadas ? `, ${v.rejeitadas} rejeitadas` : ''}
              {v.mesesFechadosIgnorados ? `, ${v.mesesFechadosIgnorados} lote(s) em meses fechados não alterados` : ''}
              {v.removidos ? `, ${v.removidos} lote(s) removidos` : ''}
              {d.marcadores?.[k as Origem] && <span className="muted"> · última submissão integrada: {dataJot(d.marcadores[k as Origem])}</span>}
            </div>
          ))}
        </div>
        {!!d.erros?.length && <div style={{ marginTop: 6 }}>Erros: {d.erros.join('; ')}</div>}
      </>}
    </div>
  );
}
