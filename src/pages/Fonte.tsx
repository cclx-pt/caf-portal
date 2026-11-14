import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, Kpi, useCarregar, useFiltros } from '../components/ui';
import { Importar } from '../components/Importar';
import { SyncEstado } from '../components/SyncEstado';
import { listarComunidades, listarLotes } from '../lib/db';
import { FONTES } from '../lib/fontes';
import { eur, MESES_CURTOS, r2 } from '../lib/format';
import type { Origem } from '../lib/types';

const TEXTOS: Record<Origem, { titulo: string; intro: string; unidade: 'eur' | 'pessoas' }> = {
  contribuir: { titulo: 'Contribuições', intro: 'Contribuições registadas no formulário CCLX - CONTRIBUIR (só as com PAGO = "PAGO"). Para ver em conjunto com os depósitos de coletas, use Entradas: contribuições e depósitos.', unidade: 'eur' },
  depositos: { titulo: 'Depósitos de coletas', intro: 'Coletas em dinheiro depositadas, registadas no formulário CCLX - REGISTO DE DEPÓSITOS.', unidade: 'eur' },
  despesas: { titulo: 'Reembolsos e despesas', intro: 'Despesas e reembolsos registados no formulário CCLX - REGISTO DE DESPESAS (categorias mantidas do Jotform).', unidade: 'eur' },
  assistencia: { titulo: 'Assistência', intro: 'Presenças registadas no formulário CCLX : Registo de Presenças. A média de adultos de cada mês serve para distribuir a bolsa geral.', unidade: 'pessoas' },
};

export default function Fonte({ origem }: { origem: Origem }) {
  const { acesso, pode, temNivel } = useAuth();
  const { ano, comunidade } = useFiltros();
  const [verPessoais, setVerPessoais] = useState(false);
  const [importar, setImportar] = useState(false);
  const conf = verPessoais && temNivel('confidencial') && origem !== 'assistencia';
  const lotes = useCarregar(() => listarLotes(acesso!, origem, ano, conf), [origem, ano, conf, acesso?.email]);
  const coms = useCarregar(listarComunidades, []);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  const t = TEXTOS[origem];
  const fmt = (v: number) => (t.unidade === 'eur' ? eur(v) : v.toLocaleString('pt-PT'));

  const sel = (lotes.dados ?? []).filter((l) => comunidade === 'todas' || l.comunidadeId === comunidade);
  const registos = sel.flatMap((l) => l.registos.map((r) => ({ ...r, comunidadeId: l.comunidadeId }))).sort((a, b) => b.data.localeCompare(a.data));
  const porMes = Array.from({ length: 12 }, (_, i) => {
    const ls = sel.filter((l) => l.mes === i + 1);
    const total = r2(ls.reduce((s, l) => s + l.total, 0));
    const n = ls.reduce((s, l) => s + l.n, 0);
    return { rotulo: MESES_CURTOS[i], Total: origem === 'assistencia' ? (n ? r2(total / n) : 0) : total, n };
  });
  const total = r2(sel.reduce((s, l) => s + l.total, 0));
  const n = sel.reduce((s, l) => s + l.n, 0);
  const porCat = registos.reduce<Record<string, number>>((acc, r) => { acc[r.categoria] = r2((acc[r.categoria] ?? 0) + r.valor); return acc; }, {});

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>{t.titulo} {ano}</h1>
          <p className="muted">{t.intro} O processo é feito no Jotform; aqui só se recebe e apresenta.</p>
          <SyncEstado />
        </div>
        <div className="acoes">
          {pode('importar') && <button className="sec" onClick={() => setImportar(true)}>Importação manual (recurso)</button>}
        </div>
      </div>
      {temNivel('confidencial') && origem !== 'assistencia' && (
        <label className="small" style={{ display: 'block', marginBottom: 12 }}>
          <input type="checkbox" checked={verPessoais} onChange={(e) => setVerPessoais(e.target.checked)} /> Mostrar dados pessoais (nível confidencial)
        </label>
      )}
      <Estado aCarregar={lotes.aCarregar} erro={lotes.erro} vazio={!sel.length} />
      {!!sel.length && <>
        <div className="cards">
          {origem === 'assistencia'
            ? <Kpi titulo="Média de adultos por registo" valor={n ? r2(total / n).toLocaleString('pt-PT') : '—'} sub={`${n} registos`} />
            : <Kpi titulo="Total" valor={eur(total)} sub={`${n} registos`} />}
          <Kpi titulo="Comunidades" valor={String(new Set(sel.map((l) => l.comunidadeId)).size)} />
          <Kpi titulo="Último registo" valor={registos[0]?.data.split('-').reverse().join('/') ?? '—'} />
        </div>
        <div className="card sec">
          <h2>{origem === 'assistencia' ? 'Média de adultos por mês' : 'Total por mês'}</h2>
          <GraficoBarras dados={porMes} series={[{ key: 'Total', nome: origem === 'assistencia' ? 'Média de adultos' : 'Total (€)' }]} altura={240} />
        </div>
        {origem !== 'assistencia' && (
          <div className="sec">
            <h2>Por categoria</h2>
            <div className="tabela"><table>
              <thead><tr><th>Categoria</th><th className="num">Total</th></tr></thead>
              <tbody>{Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>)}</tbody>
            </table></div>
          </div>
        )}
        <div className="sec">
          <h2>Registos ({registos.length > 500 ? 'últimos 500 de ' : ''}{registos.length})</h2>
          <div className="tabela"><table>
            <thead><tr>
              <th>Data</th><th>Comunidade</th><th>{origem === 'assistencia' ? 'Evento' : 'Categoria'}</th>
              {origem !== 'assistencia' && <th>{conf ? 'Pessoa' : 'Pseudónimo'}</th>}
              {conf && <th>Contacto</th>}
              <th className="num">{origem === 'assistencia' ? 'Adultos' : 'Valor'}</th>
            </tr></thead>
            <tbody>{registos.slice(0, 500).map((r) => (
              <tr key={r.comunidadeId + r.id}>
                <td>{r.data.split('-').reverse().join('/')}</td>
                <td>{nomes.get(r.comunidadeId) ?? r.comunidadeId}</td>
                <td>{origem === 'assistencia' ? r.evento ?? '' : r.categoria}{r.evento && origem !== 'assistencia' ? ` · ${r.evento}` : ''}</td>
                {origem !== 'assistencia' && <td>{conf ? r.pessoa ?? '' : r.pessoaRef ?? ''}</td>}
                {conf && <td className="small">{[r.nif && `NIF ${r.nif}`, r.email, r.telefone, r.iban].filter(Boolean).join(' · ')}</td>}
                <td className="num">{fmt(r.valor)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </>}
      {importar && <Importar origem={origem} onFechar={() => setImportar(false)} onFeito={() => void lotes.recarregar()} />}
      <p className="muted">Campos usados: {FONTES[origem].campos.map((c) => c.label).join(', ')}.</p>
    </>
  );
}
