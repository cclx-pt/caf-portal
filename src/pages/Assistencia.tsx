import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, Kpi, useCarregar, useFiltros } from '../components/ui';
import { Importar } from '../components/Importar';
import { SyncEstado } from '../components/SyncEstado';
import { listarComunidades, listarLotes } from '../lib/db';
import { MESES, MESES_CURTOS, num } from '../lib/format';

/** Grupos de idade do Registo de Presenças. Só pessoas: nunca símbolo de moeda. */
const GRUPOS = [
  { key: 'adultos', nome: 'Jovens e adultos' },
  { key: 'jump', nome: 'Jump (12-14)' },
  { key: 'criancas', nome: 'Crianças (3-11)' },
  { key: 'connects', nome: "Connect's" },
] as const;
type Grupo = (typeof GRUPOS)[number]['key'];

interface Linha { data: string; mes: number; comunidadeId: string; evento: string; adultos: number; jump: number; criancas: number; connects: number; total: number }
interface Agregado { n: number; soma: Record<Grupo | 'total', number>; max: number }

const vazio = (): Agregado => ({ n: 0, soma: { adultos: 0, jump: 0, criancas: 0, connects: 0, total: 0 }, max: 0 });
function somar(a: Agregado, l: Linha) {
  a.n++;
  for (const g of GRUPOS) a.soma[g.key] += l[g.key];
  a.soma.total += l.total;
  a.max = Math.max(a.max, l.adultos);
}
const media = (a: Agregado, k: Grupo | 'total') => (a.n ? a.soma[k] / a.n : null);
const m1 = (v: number | null) => num(v, 1);
const dataPt = (d: string) => d.split('-').reverse().join('/');

export default function Assistencia() {
  const { acesso, pode } = useAuth();
  const { ano, comunidade } = useFiltros();
  const [evento, setEvento] = useState('todos');
  const [importar, setImportar] = useState(false);
  const lotes = useCarregar(() => listarLotes(acesso!, 'assistencia', ano, false), [ano, acesso?.email]);
  const coms = useCarregar(listarComunidades, []);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));

  const todas: Linha[] = useMemo(() => (lotes.dados ?? [])
    .filter((l) => comunidade === 'todas' || l.comunidadeId === comunidade)
    .flatMap((l) => l.registos.map((r) => {
      const x = (k: string) => Number(r.extra?.[k] ?? 0) || 0;
      const adultos = r.valor, jump = x('jump'), criancas = x('criancas'), connects = x('connects');
      return { data: r.data, mes: l.mes, comunidadeId: l.comunidadeId, evento: r.evento?.trim() || 'Sem evento', adultos, jump, criancas, connects, total: adultos + jump + criancas + connects };
    })), [lotes.dados, comunidade]);
  const eventos = [...new Set(todas.map((l) => l.evento))].sort((a, b) => a.localeCompare(b, 'pt'));
  const linhas = todas.filter((l) => evento === 'todos' || l.evento === evento).sort((a, b) => b.data.localeCompare(a.data));

  const porMes = Array.from({ length: 12 }, () => vazio());
  const ano_ = vazio();
  const porCom = new Map<string, Agregado>();
  for (const l of linhas) {
    somar(porMes[l.mes - 1], l);
    somar(ano_, l);
    if (!porCom.has(l.comunidadeId)) porCom.set(l.comunidadeId, vazio());
    somar(porCom.get(l.comunidadeId)!, l);
  }
  const mesesComDados = porMes.filter((m) => m.n).length;
  const mediaMensal = (k: Grupo | 'total') => (mesesComDados ? ano_.soma[k] / mesesComDados : null);
  const melhor = porMes.map((m, i) => ({ i, v: media(m, 'adultos') ?? -1 })).sort((a, b) => b.v - a.v)[0];
  const grafico = porMes.map((m, i) => ({
    rotulo: MESES_CURTOS[i],
    ...Object.fromEntries(GRUPOS.map((g) => [g.key, m.n ? Math.round((m.soma[g.key] / m.n) * 10) / 10 : 0])),
  }));

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Assistência {ano}</h1>
          <p className="muted">Presenças registadas no formulário CCLX : Registo de Presenças. Valores em número de pessoas. A média de jovens e adultos de cada mês serve para distribuir a bolsa geral.</p>
          <SyncEstado />
        </div>
        <div className="acoes">{pode('importar') && <button className="sec" onClick={() => setImportar(true)}>Importação manual (recurso)</button>}</div>
      </div>

      <div className="filtros" style={{ marginBottom: 12 }}>
        <label className="campo">Evento
          <select value={evento} onChange={(e) => setEvento(e.target.value)}>
            <option value="todos">Todos os eventos</option>
            {eventos.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
      </div>

      <Estado aCarregar={lotes.aCarregar} erro={lotes.erro} vazio={!linhas.length} />
      {!!linhas.length && <>
        <div className="cards">
          <Kpi titulo="Registos (cultos e encontros)" valor={num(ano_.n)} sub={`${mesesComDados} ${mesesComDados === 1 ? 'mês' : 'meses'} com registos`} />
          <Kpi titulo="Média de jovens e adultos" valor={m1(media(ano_, 'adultos'))} sub="por registo" />
          <Kpi titulo="Média total de pessoas" valor={m1(media(ano_, 'total'))} sub="por registo, todas as idades" />
          <Kpi titulo="Mês com maior média" valor={melhor && melhor.v >= 0 ? MESES[melhor.i] : '—'} sub={melhor && melhor.v >= 0 ? `${m1(melhor.v)} jovens e adultos` : undefined} />
        </div>

        <div className="card sec">
          <h2>Média de pessoas por registo, por mês</h2>
          <GraficoBarras dados={grafico} series={GRUPOS.map((g) => ({ key: g.key, nome: g.nome }))} empilhado unidade="pessoas" altura={260} />
        </div>

        <div className="sec">
          <h2>Mapa mensal</h2>
          <p className="muted small">Total = soma das presenças registadas no mês. Média = total a dividir pelo número de registos. Máx. = maior número de jovens e adultos num só registo.</p>
          <div className="tabela"><table>
            <thead>
              <tr>
                <th rowSpan={2}>Mês</th><th rowSpan={2} className="num">Registos</th>
                <th colSpan={3} className="num">Jovens e adultos</th>
                <th colSpan={2} className="num">Jump (12-14)</th>
                <th colSpan={2} className="num">Crianças (3-11)</th>
                <th colSpan={2} className="num">Connect's</th>
                <th colSpan={2} className="num">Total de pessoas</th>
              </tr>
              <tr>
                <th className="num">Total</th><th className="num">Média</th><th className="num">Máx.</th>
                <th className="num">Total</th><th className="num">Média</th>
                <th className="num">Total</th><th className="num">Média</th>
                <th className="num">Total</th><th className="num">Média</th>
                <th className="num">Total</th><th className="num">Média</th>
              </tr>
            </thead>
            <tbody>
              {porMes.map((m, i) => (
                <tr key={i} className={m.n ? '' : 'muted'}>
                  <td>{MESES[i]}</td><td className="num">{m.n ? num(m.n) : '—'}</td>
                  <td className="num">{m.n ? num(m.soma.adultos) : '—'}</td><td className="num">{m1(media(m, 'adultos'))}</td><td className="num">{m.n ? num(m.max) : '—'}</td>
                  {(['jump', 'criancas', 'connects', 'total'] as const).map((k) => (
                    <FragCel key={k} total={m.n ? m.soma[k] : null} media={media(m, k)} />
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total do ano</th><th className="num">{num(ano_.n)}</th>
                <th className="num">{num(ano_.soma.adultos)}</th><th className="num">{m1(media(ano_, 'adultos'))}</th><th className="num">{num(ano_.max)}</th>
                {(['jump', 'criancas', 'connects', 'total'] as const).map((k) => <FragCel key={k} total={ano_.soma[k]} media={media(ano_, k)} cab />)}
              </tr>
              <tr>
                <th>Média mensal</th><th className="num">{m1(mesesComDados ? ano_.n / mesesComDados : null)}</th>
                <th className="num">{m1(mediaMensal('adultos'))}</th><th className="num" /><th className="num" />
                {(['jump', 'criancas', 'connects', 'total'] as const).map((k) => <FragCel key={k} total={mediaMensal(k)} media={null} cab decimal />)}
              </tr>
            </tfoot>
          </table></div>
          <p className="muted small">Média mensal = total do ano a dividir pelos meses com registos ({mesesComDados}).</p>
        </div>

        {comunidade === 'todas' && porCom.size > 1 && (
          <div className="sec">
            <h2>Por comunidade</h2>
            <div className="tabela"><table>
              <thead><tr><th>Comunidade</th><th className="num">Registos</th><th className="num">Média jovens e adultos</th><th className="num">Média total de pessoas</th><th className="num">Total jovens e adultos</th><th className="num">Total de pessoas</th></tr></thead>
              <tbody>{[...porCom.entries()].sort((a, b) => (media(b[1], 'adultos') ?? 0) - (media(a[1], 'adultos') ?? 0)).map(([c, a]) => (
                <tr key={c}><td>{nomes.get(c) ?? c}</td><td className="num">{num(a.n)}</td><td className="num">{m1(media(a, 'adultos'))}</td><td className="num">{m1(media(a, 'total'))}</td><td className="num">{num(a.soma.adultos)}</td><td className="num">{num(a.soma.total)}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        )}

        <div className="sec">
          <h2>Registos ({linhas.length > 500 ? 'últimos 500 de ' : ''}{linhas.length})</h2>
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Comunidade</th><th>Evento</th>{GRUPOS.map((g) => <th key={g.key} className="num">{g.nome}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>{linhas.slice(0, 500).map((l, i) => (
              <tr key={i}><td>{dataPt(l.data)}</td><td>{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td><td>{l.evento}</td>
                {GRUPOS.map((g) => <td key={g.key} className="num">{num(l[g.key])}</td>)}<td className="num">{num(l.total)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </>}
      {importar && <Importar origem="assistencia" onFechar={() => setImportar(false)} onFeito={() => void lotes.recarregar()} />}
    </>
  );
}

function FragCel({ total, media, cab, decimal }: { total: number | null; media: number | null; cab?: boolean; decimal?: boolean }) {
  const T = cab ? 'th' : 'td';
  return <><T className="num">{total == null ? '—' : num(total, decimal ? 1 : 0)}</T><T className="num">{media == null ? (cab && decimal ? '' : '—') : m1(media)}</T></>;
}
