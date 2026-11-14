import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Kpi, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { auditar, gravarOrcamento, gravarVersaoOrcamento, lerOrcamento, listarComunidades, listarCustosFixos, listarResumos } from '../lib/db';
import { eur, hoje, pct, periodo, r2 } from '../lib/format';
import { comunidadeAtiva, custoAtivo, mesesDecorridos, somarMeses } from '../lib/resumos';
import type { LinhaOrcamento, Orcamento as Orc } from '../lib/types';

const GRUPO_LABEL = { entradas: 'Entradas', custosFixos: 'Custos fixos', despesas: 'Despesas e reembolsos' } as const;

export default function Orcamento() {
  const { acesso, pode } = useAuth();
  const { ano, comunidade } = useFiltros();
  const coms = useCarregar(listarComunidades, []);
  const orc = useCarregar(() => lerOrcamento(ano), [ano]);
  const real = useCarregar(() => listarResumos(acesso!, ano), [ano, acesso?.email]);
  const [linhas, setLinhas] = useState<LinhaOrcamento[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setLinhas(orc.dados?.linhas ?? []); }, [orc.dados]);

  const decorridos = mesesDecorridos(ano, hoje());
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  const realPor = new Map((real.dados ?? []).map((r) => [r.comunidadeId, somarMeses(r.meses.slice(0, Math.max(decorridos, 0)))]));
  const valorReal = (l: LinhaOrcamento) => {
    const t = realPor.get(l.comunidadeId); if (!t) return 0;
    if (l.grupo === 'custosFixos') return t.custosFixos;
    if (l.grupo === 'entradas') return l.categoria === 'Total' ? t.entradas : t.entradasPorCategoria[l.categoria] ?? 0;
    return t.despesasPorCategoria[l.categoria] ?? 0;
  };
  const visiveis = linhas.filter((l) => comunidade === 'todas' || l.comunidadeId === comunidade);
  const soma = (g: LinhaOrcamento['grupo'], f: (l: LinhaOrcamento) => number) => r2(visiveis.filter((l) => l.grupo === g).reduce((s, l) => s + f(l), 0));
  const prevAte = (l: LinhaOrcamento) => r2((l.anual * decorridos) / 12);

  async function gerar() {
    setOcupado(true); setMsg(null);
    try {
      const [hist, cf] = await Promise.all([listarResumos(acesso!, ano - 1), listarCustosFixos(acesso!)]);
      const decHist = mesesDecorridos(ano - 1, hoje());
      const novas: LinhaOrcamento[] = [];
      for (const c of (coms.dados ?? []).filter((x) => !x.especial && comunidadeAtiva(x, periodo(ano, 1)))) {
        const h = hist.find((r) => r.comunidadeId === c.id);
        const meses = h ? h.meses.slice(0, decHist).filter((m) => m.entradas || m.despesas || m.custosFixos) : [];
        const t = somarMeses(meses);
        const fator = meses.length ? 12 / meses.length : 0;
        const ent = Object.entries(t.entradasPorCategoria);
        if (ent.length) ent.forEach(([cat, v]) => novas.push({ comunidadeId: c.id, grupo: 'entradas', categoria: cat, anual: r2(v * fator) }));
        else novas.push({ comunidadeId: c.id, grupo: 'entradas', categoria: 'Total', anual: 0 });
        const custoAno = r2(cf.filter((x) => x.comunidadeId === c.id).reduce((s, x) => s + Array.from({ length: 12 }, (_, i) => (custoAtivo(x, periodo(ano, i + 1)) ? x.valorMensal : 0)).reduce((a, b) => a + b, 0), 0));
        novas.push({ comunidadeId: c.id, grupo: 'custosFixos', categoria: 'Custos fixos (tabela)', anual: custoAno });
        Object.entries(t.despesasPorCategoria).forEach(([cat, v]) => novas.push({ comunidadeId: c.id, grupo: 'despesas', categoria: cat, anual: r2(v * fator) }));
      }
      setLinhas(novas);
      setMsg(`Proposta gerada a partir do histórico de ${ano - 1} (anualizado quando o ano está incompleto) e da tabela de custos fixos. Reveja e guarde.`);
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  async function guardar(aprovar: boolean) {
    setOcupado(true); setMsg(null);
    try {
      const anterior = orc.dados;
      const o: Orc = {
        ano, linhas, base: `Histórico ${ano - 1} + custos fixos`,
        estado: aprovar ? 'aprovado' : 'rascunho',
        versao: aprovar ? (anterior?.versao ?? 0) + 1 : anterior?.versao ?? 0,
        atualizadoEm: new Date().toISOString(), atualizadoPor: acesso!.email,
        ...(aprovar ? { aprovadoEm: new Date().toISOString(), aprovadoPor: acesso!.email } : {}),
      };
      await gravarOrcamento(o);
      if (aprovar) await gravarVersaoOrcamento(o);
      await auditar(acesso!.email, aprovar ? 'aprovar orçamento' : 'guardar orçamento', `${ano} v${o.versao}`);
      await orc.recarregar();
      setMsg(aprovar ? `Orçamento ${ano} aprovado (versão ${o.versao}).` : 'Rascunho guardado.');
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  const estado = orc.dados?.estado;
  const alterado = JSON.stringify(linhas) !== JSON.stringify(orc.dados?.linhas ?? []);
  const grupos: LinhaOrcamento['grupo'][] = ['entradas', 'custosFixos', 'despesas'];

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Orçamento {ano}</h1>
          <p className="muted">
            {orc.dados ? <>Estado: <span className={'etiqueta' + (estado === 'aprovado' ? ' preta' : '')}>{estado === 'aprovado' ? `Aprovado v${orc.dados.versao}` : 'Rascunho'}</span>
              {orc.dados.aprovadoPor && ` · aprovado por ${orc.dados.aprovadoPor} em ${new Date(orc.dados.aprovadoEm!).toLocaleDateString('pt-PT')}`}</> : 'Ainda não há orçamento para este ano.'}
            {' '}Previsto até hoje = anual × {decorridos}/12 meses.
          </p>
        </div>
        {pode('aprovar') && (
          <div className="acoes">
            <button className="sec" disabled={ocupado} onClick={gerar}>Gerar a partir do histórico</button>
            <button className="sec" disabled={ocupado || !alterado} onClick={() => guardar(false)}>Guardar rascunho</button>
            <button disabled={ocupado || !linhas.length} onClick={() => guardar(true)}>Aprovar (CAF)</button>
          </div>
        )}
      </div>
      {msg && <div className="nota">{msg}</div>}
      <Estado aCarregar={orc.aCarregar} erro={orc.erro} vazio={!linhas.length} />
      {!!linhas.length && <>
        <div className="cards">
          {grupos.map((g) => {
            const prev = soma(g, prevAte); const rl = soma(g, valorReal); const desvio = prev ? rl / prev - 1 : null;
            return <Kpi key={g} titulo={GRUPO_LABEL[g]} valor={eur(soma(g, (l) => l.anual))} sub={<>Real até hoje {eur(rl)} · previsto {eur(prev)}{desvio != null && Math.abs(desvio) > 0.1 ? <> · <b>desvio {pct(desvio)}</b></> : null}</>} />;
          })}
          <Kpi titulo="Saldo previsto" valor={eur(r2(soma('entradas', (l) => l.anual) - soma('custosFixos', (l) => l.anual) - soma('despesas', (l) => l.anual)))} />
        </div>
        <div className="tabela"><table>
          <thead><tr><th>Comunidade</th><th>Grupo</th><th>Categoria</th><th className="num">Previsto anual</th><th className="num">Previsto até hoje</th><th className="num">Real até hoje</th><th className="num">Desvio</th></tr></thead>
          <tbody>{visiveis.map((l) => {
            const i = linhas.indexOf(l); const p = prevAte(l); const rl = valorReal(l); const d = p ? rl / p - 1 : null;
            return (
              <tr key={i}>
                <td>{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td><td>{GRUPO_LABEL[l.grupo]}</td><td>{l.categoria}</td>
                <td className="num">{pode('aprovar')
                  ? <input type="number" step="0.01" value={l.anual} style={{ width: 120 }} onChange={(e) => setLinhas(linhas.map((x, k) => (k === i ? { ...x, anual: Number(e.target.value) } : x)))} />
                  : eur(l.anual)}</td>
                <td className="num">{eur(p)}</td><td className="num">{eur(rl)}</td>
                <td className={'num' + (d != null && Math.abs(d) > 0.1 ? ' neg' : '')}>{d == null ? '—' : pct(d)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <p className="muted" style={{ marginTop: 8 }}>Desvios acima de 10% aparecem a negrito. O real vem dos resumos calculados (Painel → Recalcular).</p>
      </>}
    </>
  );
}
