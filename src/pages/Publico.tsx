import { useState } from 'react';
import { Estado, GraficoBarras, Kpi, Rodape, useCarregar } from '../components/ui';
import { lerPublico } from '../lib/db';
import { eur, MESES, MESES_CURTOS, r2 } from '../lib/format';

const BASE = import.meta.env.BASE_URL;

export default function Publico({ embutido }: { embutido?: boolean }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [com, setCom] = useState('todas');
  const p = useCarregar(() => lerPublico(ano), [ano]);
  const d = p.dados;
  const lista = d?.comunidades ?? [];
  const sel = com === 'todas' ? lista : lista.filter((c) => c.id === com);
  const mesesF = d?.mesesFechados ?? [];
  const somaNull = (vs: (number | null)[]) => (vs.some((v) => v == null) ? null : r2(vs.reduce<number>((s, v) => s + (v ?? 0), 0)));
  const porMes = mesesF.map((mes) => {
    const xs = sel.map((c) => c.meses.find((m) => m.mes === mes)!).filter(Boolean);
    return {
      mes,
      entradas: somaNull(xs.map((x) => x.entradas)),
      custos: somaNull(xs.map((x) => x.custosFuncionamento)),
      outras: somaNull(xs.map((x) => x.outrasDespesas)),
      saldo: somaNull(xs.map((x) => x.saldo)),
    };
  });
  const tot = {
    entradas: somaNull(porMes.map((m) => m.entradas)),
    custos: somaNull(porMes.map((m) => m.custos)),
    outras: somaNull(porMes.map((m) => m.outras)),
    saldo: somaNull(porMes.map((m) => m.saldo)),
  };

  const conteudo = (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="topo" style={{ border: 0, padding: 0, margin: 0 }}><span className="kicker">Página pública · Transparência financeira</span></div>
          <h1>Contas da CCLX {ano}</h1>
          <p className="muted">Só totais de meses já fechados e aprovados pelo CAF. Valores com menos de 3 registos não são mostrados, para proteger a privacidade.</p>
        </div>
        <div className="filtros">
          <label className="campo">Ano
            <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {[0, 1, 2].map((k) => new Date().getFullYear() - k).map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="campo">Comunidade
            <select value={com} onChange={(e) => setCom(e.target.value)}>
              <option value="todas">Todas</option>
              {lista.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        </div>
      </div>
      <Estado aCarregar={p.aCarregar} erro={p.erro} vazio={!d || !mesesF.length} />
      {d && !!mesesF.length && <>
        <div className="cards">
          <Kpi titulo="Entradas" valor={eur(tot.entradas)} sub={`${mesesF.length} meses fechados`} />
          <Kpi titulo="Custos de funcionamento" valor={eur(tot.custos)} sub="Renda, pessoal, luz, água, internet" />
          <Kpi titulo="Outras despesas" valor={eur(tot.outras)} />
          <Kpi titulo="Saldo" valor={eur(tot.saldo)} negativo={(tot.saldo ?? 0) < 0} sub={(tot.saldo ?? 0) < 0 ? 'Défice coberto pelo orçamento geral' : undefined} />
        </div>
        <div className="card sec">
          <h2>Por mês</h2>
          <GraficoBarras dados={porMes.map((m) => ({ rotulo: MESES_CURTOS[m.mes - 1], Entradas: m.entradas ?? 0, 'Custos de funcionamento': m.custos ?? 0, 'Outras despesas': m.outras ?? 0 }))}
            series={[{ key: 'Entradas', nome: 'Entradas' }, { key: 'Custos de funcionamento', nome: 'Custos de funcionamento' }, { key: 'Outras despesas', nome: 'Outras despesas' }]} />
        </div>
        <div className="tabela">
          <table>
            <thead><tr><th>Mês</th><th className="num">Entradas</th><th className="num">Custos de funcionamento</th><th className="num">Outras despesas</th><th className="num">Saldo</th></tr></thead>
            <tbody>{porMes.map((m) => (
              <tr key={m.mes}><td>{MESES[m.mes - 1]}</td><td className="num">{eur(m.entradas)}</td><td className="num">{eur(m.custos)}</td><td className="num">{eur(m.outras)}</td><td className={'num' + ((m.saldo ?? 0) < 0 ? ' neg' : '')}>{eur(m.saldo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>“—” = valor não mostrado (menos de 3 registos). Atualizado em {new Date(d.atualizadoEm).toLocaleString('pt-PT')}.</p>
      </>}
    </>
  );

  if (embutido) return conteudo;
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <div className="linha" style={{ justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 12, marginBottom: 20 }}>
          <img src={`${BASE}caf-logo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" style={{ height: 64 }} />
          <a href={`${BASE}#/`}>Entrar no portal</a>
        </div>
        {conteudo}
        <Rodape />
      </div>
    </div>
  );
}
