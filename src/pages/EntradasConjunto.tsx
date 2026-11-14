import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, Kpi, useCarregar, useFiltros } from '../components/ui';
import { SyncEstado } from '../components/SyncEstado';
import { listarComunidades, listarLotes } from '../lib/db';
import { eur, MESES, MESES_CURTOS, norm, num, parseNumero, pct, r2 } from '../lib/format';
import type { Registo } from '../lib/types';

type OrigemEntrada = 'contribuir' | 'depositos';
const ROTULO: Record<OrigemEntrada, string> = { contribuir: 'Contribuição', depositos: 'Depósito de coletas' };
type Agrupar = 'mes' | 'comunidade' | 'categoria' | 'pessoa';
interface Linha extends Registo { origem: OrigemEntrada; comunidadeId: string; mes: number }

const dataPt = (d: string) => d.split('-').reverse().join('/');

/** Vista conjunta das entradas: contribuições (CONTRIBUIR, só pagas) e depósitos de coletas em dinheiro. */
export default function EntradasConjunto() {
  const { acesso, temNivel } = useAuth();
  const { ano, comunidade } = useFiltros();
  const [verPessoais, setVerPessoais] = useState(false);
  const conf = verPessoais && temNivel('confidencial');
  const contrib = useCarregar(() => listarLotes(acesso!, 'contribuir', ano, conf), [ano, conf, acesso?.email]);
  const deps = useCarregar(() => listarLotes(acesso!, 'depositos', ano, conf), [ano, conf, acesso?.email]);
  const coms = useCarregar(listarComunidades, []);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  const nomeC = (id: string) => nomes.get(id) ?? (id === 'bolsa-geral' ? 'Bolsa geral (sem comunidade)' : id);

  // Filtros propostos
  const [origem, setOrigem] = useState<'todas' | OrigemEntrada>('todas');
  const [mesDe, setMesDe] = useState(1);
  const [mesAte, setMesAte] = useState(12);
  const [categoria, setCategoria] = useState('todas');
  const [bolsa, setBolsa] = useState(true);
  const [vMin, setVMin] = useState('');
  const [vMax, setVMax] = useState('');
  const [texto, setTexto] = useState('');
  const [agrupar, setAgrupar] = useState<Agrupar>('mes');

  const todas: Linha[] = useMemo(() => {
    const de = (o: OrigemEntrada, ls: typeof contrib.dados) => (ls ?? []).flatMap((l) => l.registos.map((r) => ({ ...r, origem: o, comunidadeId: l.comunidadeId, mes: l.mes })));
    return [...de('contribuir', contrib.dados), ...de('depositos', deps.dados)];
  }, [contrib.dados, deps.dados]);

  const categorias = [...new Set(todas.filter((l) => origem === 'todas' || l.origem === origem).map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, 'pt'));
  const min = vMin.trim() ? parseNumero(vMin) : NaN;
  const max = vMax.trim() ? parseNumero(vMax) : NaN;
  const q = norm(texto);

  const linhas = todas.filter((l) =>
    (origem === 'todas' || l.origem === origem)
    && (comunidade === 'todas' || l.comunidadeId === comunidade)
    && (bolsa || l.comunidadeId !== 'bolsa-geral')
    && l.mes >= mesDe && l.mes <= mesAte
    && (categoria === 'todas' || l.categoria === categoria)
    && (!Number.isFinite(min) || l.valor >= min)
    && (!Number.isFinite(max) || l.valor <= max)
    && (!q || norm([l.id, l.categoria, l.descricao, l.evento, l.pessoaRef, l.pessoa, l.nif, l.email, l.extra?.conta, nomeC(l.comunidadeId)].filter(Boolean).join(' ')).includes(q)),
  ).sort((a, b) => b.data.localeCompare(a.data));

  const soma = (ls: Linha[], o?: OrigemEntrada) => r2(ls.filter((l) => !o || l.origem === o).reduce((s, l) => s + l.valor, 0));
  const total = soma(linhas);
  const tc = soma(linhas, 'contribuir');
  const td = soma(linhas, 'depositos');
  const contribuintes = new Set(linhas.filter((l) => l.origem === 'contribuir').map((l) => l.pessoaRef ?? l.pessoa).filter(Boolean)).size;

  const grafico = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => m >= mesDe && m <= mesAte).map((m) => {
    const ls = linhas.filter((l) => l.mes === m);
    return { rotulo: MESES_CURTOS[m - 1], contribuir: soma(ls, 'contribuir'), depositos: soma(ls, 'depositos') };
  });

  const chave = (l: Linha) => agrupar === 'mes' ? String(l.mes).padStart(2, '0')
    : agrupar === 'comunidade' ? l.comunidadeId
    : agrupar === 'categoria' ? l.categoria
    : (conf ? l.pessoa : l.pessoaRef) || (l.origem === 'depositos' ? 'Depósitos (sem contribuinte)' : 'Sem identificação');
  const rotulo = (k: string) => agrupar === 'mes' ? MESES[Number(k) - 1] : agrupar === 'comunidade' ? nomeC(k) : k;
  const grupos = new Map<string, Linha[]>();
  for (const l of linhas) { const k = chave(l); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(l); }
  const resumo = [...grupos.entries()].map(([k, ls]) => ({ k, n: ls.length, c: soma(ls, 'contribuir'), d: soma(ls, 'depositos'), t: soma(ls) }))
    .sort((a, b) => (agrupar === 'mes' ? a.k.localeCompare(b.k) : b.t - a.t));

  async function exportar() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Entradas');
    ws.columns = [
      { header: 'Data', key: 'data', width: 12 }, { header: 'Origem', key: 'origem', width: 20 }, { header: 'Comunidade', key: 'com', width: 24 },
      { header: 'Categoria', key: 'cat', width: 24 }, { header: conf ? 'Pessoa' : 'Pseudónimo', key: 'pessoa', width: 26 },
      ...(conf ? [{ header: 'NIF', key: 'nif', width: 12 }, { header: 'E-mail', key: 'email', width: 26 }] : []),
      { header: 'Descrição', key: 'desc', width: 30 }, { header: 'ID Jotform', key: 'id', width: 22 }, { header: 'Valor (€)', key: 'valor', width: 12 },
    ];
    for (const l of linhas) ws.addRow({ data: dataPt(l.data), origem: ROTULO[l.origem], com: nomeC(l.comunidadeId), cat: l.categoria, pessoa: conf ? l.pessoa ?? '' : l.pessoaRef ?? '', nif: l.nif ?? '', email: l.email ?? '', desc: l.descricao ?? '', id: l.id, valor: l.valor });
    ws.getColumn('valor').numFmt = '#,##0.00 €';
    ws.getRow(1).font = { bold: true, name: 'Montserrat' };
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `entradas-${ano}${comunidade !== 'todas' ? '-' + comunidade : ''}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function limpar() {
    setOrigem('todas'); setMesDe(1); setMesAte(12); setCategoria('todas'); setBolsa(true); setVMin(''); setVMax(''); setTexto('');
  }

  const aCarregar = contrib.aCarregar || deps.aCarregar;
  return (
    <>
      <h1>Entradas {ano}: contribuições e depósitos</h1>
      <p className="muted">Junta as contribuições do CCLX - CONTRIBUIR (só as com PAGO = "PAGO") e as coletas em dinheiro do CCLX - REGISTO DE DEPÓSITOS. O ano e a comunidade escolhem-se no topo.</p>
      <SyncEstado />

      <div className="card sec">
        <div className="filtros" style={{ alignItems: 'flex-end' }}>
          <label className="campo">Origem
            <select value={origem} onChange={(e) => { setOrigem(e.target.value as typeof origem); setCategoria('todas'); }}>
              <option value="todas">Todas</option><option value="contribuir">Contribuições</option><option value="depositos">Depósitos de coletas</option>
            </select>
          </label>
          <label className="campo">De
            <select value={mesDe} onChange={(e) => { const v = Number(e.target.value); setMesDe(v); if (v > mesAte) setMesAte(v); }}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="campo">Até
            <select value={mesAte} onChange={(e) => { const v = Number(e.target.value); setMesAte(v); if (v < mesDe) setMesDe(v); }}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="campo">Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="todas">Todas</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className="campo">Valor mín. (€)<input inputMode="decimal" value={vMin} onChange={(e) => setVMin(e.target.value)} style={{ width: 90 }} /></label>
          <label className="campo">Valor máx. (€)<input inputMode="decimal" value={vMax} onChange={(e) => setVMax(e.target.value)} style={{ width: 90 }} /></label>
          <label className="campo">Pesquisar<input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={conf ? 'nome, NIF, email, categoria…' : 'pseudónimo, categoria, ID…'} style={{ width: 200 }} /></label>
          <label className="small" style={{ paddingBottom: 6 }}><input type="checkbox" checked={bolsa} onChange={(e) => setBolsa(e.target.checked)} /> Incluir bolsa geral</label>
          <button className="sec" onClick={limpar}>Limpar filtros</button>
        </div>
        {temNivel('confidencial') && (
          <label className="small" style={{ display: 'block', marginTop: 10 }}>
            <input type="checkbox" checked={verPessoais} onChange={(e) => setVerPessoais(e.target.checked)} /> Mostrar dados pessoais (nível confidencial)
          </label>
        )}
      </div>

      <Estado aCarregar={aCarregar} erro={contrib.erro || deps.erro} vazio={!linhas.length} />
      {!aCarregar && !!linhas.length && <>
        <div className="cards">
          <Kpi titulo="Total de entradas" valor={eur(total)} sub={`${num(linhas.length)} registos`} />
          <Kpi titulo="Contribuições" valor={eur(tc)} sub={`${pct(total ? tc / total : null)} · ${num(contribuintes)} contribuintes`} />
          <Kpi titulo="Depósitos de coletas" valor={eur(td)} sub={pct(total ? td / total : null)} />
          <Kpi titulo="Valor médio por registo" valor={eur(r2(total / linhas.length))} />
        </div>

        <div className="card sec">
          <h2>Por mês</h2>
          <GraficoBarras dados={grafico} series={[{ key: 'contribuir', nome: 'Contribuições' }, { key: 'depositos', nome: 'Depósitos de coletas' }]} empilhado altura={250} />
        </div>

        <div className="sec">
          <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <h2 style={{ margin: 0 }}>Resumo</h2>
            <label className="campo">Agrupar por
              <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)}>
                <option value="mes">Mês</option><option value="comunidade">Comunidade</option><option value="categoria">Categoria</option><option value="pessoa">{conf ? 'Contribuinte' : 'Contribuinte (pseudónimo)'}</option>
              </select>
            </label>
          </div>
          <div className="tabela"><table>
            <thead><tr><th>{{ mes: 'Mês', comunidade: 'Comunidade', categoria: 'Categoria', pessoa: 'Contribuinte' }[agrupar]}</th><th className="num">Registos</th><th className="num">Contribuições</th><th className="num">Depósitos</th><th className="num">Total</th><th className="num">% do total</th></tr></thead>
            <tbody>{resumo.slice(0, 300).map((r) => (
              <tr key={r.k}><td>{rotulo(r.k)}</td><td className="num">{num(r.n)}</td><td className="num">{eur(r.c)}</td><td className="num">{eur(r.d)}</td><td className="num">{eur(r.t)}</td><td className="num">{pct(total ? r.t / total : null)}</td></tr>
            ))}</tbody>
            <tfoot><tr><th>Total</th><th className="num">{num(linhas.length)}</th><th className="num">{eur(tc)}</th><th className="num">{eur(td)}</th><th className="num">{eur(total)}</th><th className="num">100,0%</th></tr></tfoot>
          </table></div>
          {resumo.length > 300 && <p className="muted small">Mostrados os primeiros 300 de {resumo.length} grupos. A exportação inclui todos os registos.</p>}
        </div>

        <div className="sec">
          <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Registos ({linhas.length > 500 ? 'últimos 500 de ' : ''}{num(linhas.length)})</h2>
            <button className="sec" onClick={() => void exportar()}>Exportar para Excel</button>
          </div>
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Origem</th><th>Comunidade</th><th>Categoria</th><th>{conf ? 'Pessoa' : 'Pseudónimo'}</th>{conf && <th>Contacto</th>}<th className="num">Valor</th></tr></thead>
            <tbody>{linhas.slice(0, 500).map((l) => (
              <tr key={l.origem + l.id}>
                <td>{dataPt(l.data)}</td><td>{ROTULO[l.origem]}</td><td>{nomeC(l.comunidadeId)}</td>
                <td>{l.categoria}{l.descricao ? <span className="muted small"> · {l.descricao}</span> : null}</td>
                <td>{conf ? l.pessoa ?? '' : l.pessoaRef ?? ''}</td>
                {conf && <td className="small">{[l.nif && `NIF ${l.nif}`, l.email, l.telefone].filter(Boolean).join(' · ')}</td>}
                <td className="num">{eur(l.valor)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </>}
    </>
  );
}
