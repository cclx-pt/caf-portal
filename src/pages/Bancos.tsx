import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Kpi, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { auditar, gravarBancoLote, listarBanco, listarCategorias, listarComunidades, listarContas, listarLotes } from '../lib/db';
import { lerFicheiro } from '../lib/ficheiros';
import { agruparPorMes, fundir, mapearExtrato, sugerir, sugerirMapaBanco, type MapaBanco } from '../lib/banco';
import { eur, MESES, r2 } from '../lib/format';
import type { BancoLote, MovBanco } from '../lib/types';
import type { Linha } from '../lib/fontes';
import { comunidadeAtiva } from '../lib/resumos';

type Filtro = 'todos' | 'por-classificar' | 'bolsa' | 'contabilizados' | 'conciliados';

export default function Bancos() {
  const { acesso } = useAuth();
  const { ano } = useFiltros();
  const contas = useCarregar(listarContas, []);
  const coms = useCarregar(listarComunidades, []);
  const cats = useCarregar(listarCategorias, []);
  const banco = useCarregar(() => listarBanco(ano), [ano]);
  const assist = useCarregar(() => listarLotes(acesso!, 'assistencia', ano), [ano]);
  const [contaId, setContaId] = useState('cgd-principal');
  const [filtro, setFiltro] = useState<Filtro>('por-classificar');
  const [alterados, setAlterados] = useState<Record<string, BancoLote>>({});
  const [importar, setImportar] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const conta = contas.dados?.find((c) => c.id === contaId);
  const lotes = useMemo(() => (banco.dados ?? []).filter((l) => l.contaId === contaId).map((l) => alterados[l.id] ?? l).sort((a, b) => a.mes - b.mes), [banco.dados, contaId, alterados]);
  const movs = lotes.flatMap((l) => l.registos.map((m) => ({ ...m, loteId: l.id })));
  const visiveis = movs.filter((m) =>
    filtro === 'todos' ? true
      : filtro === 'por-classificar' ? !m.conciliadoCom && !m.contabilizar && !m.categoria
        : filtro === 'bolsa' ? m.comunidadeId === 'bolsa-geral'
          : filtro === 'contabilizados' ? m.contabilizar
            : !!m.conciliadoCom);
  const creditos = r2(movs.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0));
  const debitos = r2(movs.filter((m) => m.valor < 0).reduce((s, m) => s - m.valor, 0));
  const ultimoSaldo = [...movs].reverse().find((m) => m.saldo != null)?.saldo ?? null;

  function alterar(loteId: string, id: string, patch: Partial<MovBanco>) {
    const base = alterados[loteId] ?? banco.dados!.find((l) => l.id === loteId)!;
    setAlterados({ ...alterados, [loteId]: { ...base, registos: base.registos.map((m) => (m.id === id ? { ...m, ...patch } : m)) } });
  }
  function marcarBolsa() {
    const novo = { ...alterados };
    for (const l of lotes) {
      const regs = l.registos.map((m) => (m.valor > 0 && !m.conciliadoCom && !m.comunidadeId && /bolsa geral/.test(m.sugestao ?? '')
        ? { ...m, comunidadeId: 'bolsa-geral', contabilizar: true, categoria: m.categoria ?? 'Ofertas' } : m));
      novo[l.id] = { ...l, registos: regs };
    }
    setAlterados(novo);
  }
  async function guardar() {
    setMsg(null);
    try {
      const ls = Object.values(alterados);
      for (const l of ls) await gravarBancoLote({ ...l, atualizadoEm: new Date().toISOString(), atualizadoPor: acesso!.email });
      await auditar(acesso!.email, 'classificar banco', `${ls.length} meses de ${conta?.nome}`);
      setAlterados({}); await banco.recarregar(); setMsg('Classificação guardada. Recalcule os resumos no Painel para atualizar os totais.');
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  // Pré-visualização da distribuição da bolsa geral pela assistência de adultos do mesmo mês.
  const bolsaPorMes = Array.from({ length: 12 }, (_, i) => r2((banco.dados ?? []).flatMap((l) => l.registos)
    .filter((m) => m.contabilizar && m.comunidadeId === 'bolsa-geral' && m.valor > 0 && Number(m.data.slice(5, 7)) === i + 1 && m.data.startsWith(String(ano)))
    .reduce((s, m) => s + m.valor, 0)));
  const distribuicao = bolsaPorMes.map((total, i) => {
    if (!total) return null;
    const p = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const pesos = (coms.dados ?? []).filter((c) => !c.especial && comunidadeAtiva(c, p)).map((c) => {
      const regs = (assist.dados ?? []).filter((l) => l.comunidadeId === c.id && l.mes === i + 1).flatMap((l) => l.registos);
      return { c, media: regs.length ? regs.reduce((s, r) => s + r.valor, 0) / regs.length : 0 };
    });
    const soma = pesos.reduce((s, x) => s + x.media, 0);
    return { mes: i, total, linhas: pesos.filter((x) => x.media > 0).map((x) => ({ nome: x.c.nome, media: r2(x.media), pct: soma ? x.media / soma : 0, valor: soma ? r2((total * x.media) / soma) : 0 })), semAssistencia: !soma };
  }).filter(Boolean) as { mes: number; total: number; linhas: { nome: string; media: number; pct: number; valor: number }[]; semAssistencia: boolean }[];

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Bancos e bolsa geral {ano}</h1>
          <p className="muted">Extratos da CGD e do Santander. Os movimentos já registados no Jotform são conciliados e não contam duas vezes. As transferências de ofertas e dízimos sem comunidade entram na bolsa geral.</p>
        </div>
        <div className="acoes">
          <button onClick={() => setImportar(true)}>Importar extrato</button>
          <button className="sec" disabled={!Object.keys(alterados).length} onClick={guardar}>Guardar classificação</button>
        </div>
      </div>
      {msg && <div className="nota">{msg}</div>}
      <div className="acoes">
        {(contas.dados ?? []).filter((c) => c.ativo !== false).map((c) => (
          <button key={c.id} className={c.id === contaId ? '' : 'sec'} onClick={() => setContaId(c.id)}>
            {c.nome}{c.tipo === 'investimentos' ? ' (Conta investimentos)' : ''}
          </button>
        ))}
      </div>
      <Estado aCarregar={banco.aCarregar} erro={banco.erro} />
      <div className="cards">
        <Kpi titulo="Créditos" valor={eur(creditos)} sub={`${movs.filter((m) => m.valor > 0).length} movimentos`} />
        <Kpi titulo="Débitos" valor={eur(debitos)} sub={`${movs.filter((m) => m.valor < 0).length} movimentos`} />
        <Kpi titulo="Último saldo no extrato" valor={eur(ultimoSaldo)} />
        <Kpi titulo="Por classificar" valor={String(movs.filter((m) => !m.conciliadoCom && !m.contabilizar && !m.categoria).length)} />
      </div>

      <div className="acoes">
        <label className="campo">Mostrar
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="por-classificar">Por classificar</option>
            <option value="bolsa">Bolsa geral</option>
            <option value="contabilizados">A contabilizar</option>
            <option value="conciliados">Conciliados com o Jotform</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <button className="sec" style={{ alignSelf: 'flex-end' }} onClick={marcarBolsa}>Marcar transferências sugeridas como bolsa geral</button>
      </div>
      <div className="tabela sec">
        <table>
          <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th><th>Sugestão / conciliação</th><th>Comunidade</th><th>Categoria</th><th>Contabilizar</th></tr></thead>
          <tbody>
            {visiveis.slice(0, 400).map((m) => (
              <tr key={m.id}>
                <td>{m.data.split('-').reverse().join('/')}</td>
                <td className="small">{m.descricao}</td>
                <td className={'num' + (m.valor < 0 ? ' neg' : '')}>{eur(m.valor)}</td>
                <td className="small">{m.conciliadoCom ? <span className="etiqueta preta">Conciliado</span> : null} {m.sugestao}</td>
                <td>
                  <select value={m.comunidadeId ?? ''} onChange={(e) => alterar(m.loteId, m.id, { comunidadeId: e.target.value || undefined })}>
                    <option value="">—</option>
                    {(coms.dados ?? []).filter((c) => c.ativo !== false || c.id === m.comunidadeId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </td>
                <td>
                  <select value={m.categoria ?? ''} onChange={(e) => alterar(m.loteId, m.id, { categoria: e.target.value || undefined })}>
                    <option value="">—</option>
                    {(cats.dados ?? []).filter((c) => (c.ativo !== false || c.nome === m.categoria) && (m.valor > 0 ? c.tipo === 'entrada' : c.tipo === 'saida')).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={m.contabilizar} disabled={!!m.conciliadoCom} onChange={(e) => alterar(m.loteId, m.id, { contabilizar: e.target.checked })} aria-label="Contabilizar movimento" /></td>
              </tr>
            ))}
            {!visiveis.length && <tr><td colSpan={7} className="muted">Sem movimentos neste filtro.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="sec">
        <h2>Distribuição da bolsa geral (pré-visualização)</h2>
        <p className="muted">Regra: cada mês, a bolsa geral é distribuída pela percentagem da média de assistência de adultos de cada comunidade nesse mesmo mês.</p>
        {!distribuicao.length && <p className="muted">Sem ofertas na bolsa geral neste ano.</p>}
        {distribuicao.map((d) => (
          <div key={d.mes} className="card" style={{ marginBottom: 10 }}>
            <b>{MESES[d.mes]}: {eur(d.total)}</b>
            {d.semAssistencia ? <p className="muted">Sem registos de assistência neste mês: fica por distribuir.</p> : (
              <table style={{ marginTop: 6 }}><thead><tr><th>Comunidade</th><th className="num">Média de adultos</th><th className="num">%</th><th className="num">Quota</th></tr></thead>
                <tbody>{d.linhas.map((x) => <tr key={x.nome}><td>{x.nome}</td><td className="num">{x.media}</td><td className="num">{(x.pct * 100).toFixed(1).replace('.', ',')}%</td><td className="num">{eur(x.valor)}</td></tr>)}</tbody></table>
            )}
          </div>
        ))}
      </div>
      {importar && conta && <ImportarExtrato contaId={contaId} nomeConta={conta.nome} ano={ano} existentes={banco.dados ?? []} onFechar={() => setImportar(false)} onFeito={() => void banco.recarregar()} />}
    </>
  );
}

function ImportarExtrato({ contaId, nomeConta, ano, existentes, onFechar, onFeito }: { contaId: string; nomeConta: string; ano: number; existentes: BancoLote[]; onFechar: () => void; onFeito: () => void }) {
  const { acesso } = useAuth();
  const [colunas, setColunas] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [mapa, setMapa] = useState<MapaBanco>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const res = useMemo(() => (linhas.length ? mapearExtrato(linhas, mapa) : null), [linhas, mapa]);

  async function ler(f: File) {
    try { const t = await lerFicheiro(f); setColunas(t.colunas); setLinhas(t.linhas); setMapa(sugerirMapaBanco(t.colunas)); setMsg(`${t.linhas.length} linhas lidas.`); }
    catch (e) { setMsg(mensagemErro(e)); }
  }
  async function gravar() {
    if (!res) return;
    setOcupado(true);
    try {
      const anos = [...new Set(res.movimentos.map((m) => Number(m.data.slice(0, 4))))];
      const [deps, desp] = await Promise.all([
        Promise.all(anos.map((a) => listarLotes(acesso!, 'depositos', a, true))).then((x) => x.flat()),
        Promise.all(anos.map((a) => listarLotes(acesso!, 'despesas', a, true))).then((x) => x.flat()),
      ]);
      const anteriores = (anos.includes(ano) ? existentes : []).filter((l) => l.contaId === contaId).flatMap((l) => l.registos);
      const movs = sugerir(fundir(res.movimentos, anteriores), deps, desp);
      const lotes = agruparPorMes(contaId, movs, acesso!.email);
      for (const l of lotes) await gravarBancoLote(l);
      await auditar(acesso!.email, 'importar extrato', `${nomeConta}: ${movs.length} movimentos em ${lotes.length} meses`);
      setMsg(`Gravados ${movs.length} movimentos em ${lotes.length} meses. ${movs.filter((m) => m.conciliadoCom).length} conciliados automaticamente com o Jotform.`);
      onFeito();
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }
  const campos: [keyof MapaBanco, string][] = [['data', 'Data *'], ['descricao', 'Descrição'], ['valor', 'Montante (com sinal)'], ['debito', 'Débito'], ['credito', 'Crédito'], ['saldo', 'Saldo']];
  return (
    <Modal titulo={`Importar extrato: ${nomeConta}`} onFechar={onFechar}>
      <div className="nota">Exporte o extrato do homebanking em CSV ou Excel. A importação substitui os meses que o ficheiro contém e mantém as classificações já feitas.</div>
      <input type="file" accept=".csv,.xlsx,.txt" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
      {!!colunas.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 12 }}>
          {campos.map(([k, label]) => (
            <label key={k} className="campo">{label}
              <select value={mapa[k] ?? ''} onChange={(e) => setMapa({ ...mapa, [k]: e.target.value || undefined })}>
                <option value="">(não usar)</option>{colunas.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {res && <>
        <p className="small" style={{ marginTop: 10 }}>{res.movimentos.length} movimentos válidos{res.rejeitadas.length ? `, ${res.rejeitadas.length} linhas ignoradas` : ''}.</p>
        <button disabled={ocupado || !res.movimentos.length} onClick={gravar}>Gravar movimentos</button>
      </>}
    </Modal>
  );
}
