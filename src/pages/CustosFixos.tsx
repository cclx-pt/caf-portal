import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { apagar, auditar, gravar, listarComunidades, listarCustosFixos } from '../lib/db';
import { eur, periodo, r2 } from '../lib/format';
import { custoAtivo, mesesDecorridos } from '../lib/resumos';
import { NIVEIS, NIVEL_LABEL, type CustoFixo, type Nivel } from '../lib/types';
import { hoje } from '../lib/format';

const vazio = (comunidadeId: string): CustoFixo => ({ id: '', comunidadeId, rubrica: '', valorMensal: 0, inicio: `${new Date().getFullYear()}-01`, fim: null, nivel: 'privado' });
const NIVEL_SUGERIDO: Record<string, Nivel> = { vencimentos: 'confidencial', 'seguranca social': 'confidencial', renda: 'privado', luz: 'publico', agua: 'publico', internet: 'publico' };

export default function CustosFixos() {
  const { acesso, pode } = useAuth();
  const { ano, comunidade } = useFiltros();
  const coms = useCarregar(listarComunidades, []);
  const cf = useCarregar(() => listarCustosFixos(acesso!), [acesso?.email]);
  const [edit, setEdit] = useState<CustoFixo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  const linhas = (cf.dados ?? []).filter((c) => comunidade === 'todas' || c.comunidadeId === comunidade)
    .sort((a, b) => (nomes.get(a.comunidadeId) ?? '').localeCompare(nomes.get(b.comunidadeId) ?? '') || a.rubrica.localeCompare(b.rubrica) || a.inicio.localeCompare(b.inicio));
  const ate = mesesDecorridos(ano, hoje());
  const noAno = (c: CustoFixo) => r2(Array.from({ length: 12 }, (_, i) => (custoAtivo(c, periodo(ano, i + 1)) ? c.valorMensal : 0)).reduce((s, v) => s + v, 0));
  const ateHoje = (c: CustoFixo) => r2(Array.from({ length: ate }, (_, i) => (custoAtivo(c, periodo(ano, i + 1)) ? c.valorMensal : 0)).reduce((s, v) => s + v, 0));

  async function guardar() {
    if (!edit) return;
    try {
      const id = edit.id || `${edit.comunidadeId}-${edit.rubrica.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${edit.inicio}`;
      await gravar('custos_fixos', { ...edit, id, valorMensal: r2(Number(edit.valorMensal)), fim: edit.fim || null });
      await auditar(acesso!.email, 'custo fixo', `${edit.comunidadeId} · ${edit.rubrica} · ${edit.valorMensal} € desde ${edit.inicio}`);
      setEdit(null); await cf.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function remover(c: CustoFixo) {
    if (!confirm(`Remover "${c.rubrica}" de ${nomes.get(c.comunidadeId)}?`)) return;
    try { await apagar('custos_fixos', c.id); await auditar(acesso!.email, 'remover custo fixo', c.id); await cf.recarregar(); } catch (e) { setMsg(mensagemErro(e)); }
  }

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Custos fixos por comunidade</h1>
          <p className="muted">Uma linha por rubrica e período. Quando um valor muda a meio do ano, feche a linha anterior (mês de fim) e crie uma nova. Os vencimentos e a Segurança Social são confidenciais.</p>
        </div>
        {pode('custos') && <button onClick={() => setEdit(vazio(comunidade === 'todas' ? (acesso!.comunidades[0] === '*' ? 'caldas-da-rainha' : acesso!.comunidades[0]) : comunidade))}>Nova linha</button>}
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <Estado aCarregar={cf.aCarregar} erro={cf.erro} vazio={!linhas.length} />
      {!!linhas.length && (
        <div className="tabela"><table>
          <thead><tr><th>Comunidade</th><th>Rubrica</th><th>Nível</th><th className="num">Mensal</th><th>Início</th><th>Fim</th><th className="num">{ano} (até hoje)</th><th className="num">{ano} (ano)</th><th /></tr></thead>
          <tbody>{linhas.map((c) => (
            <tr key={c.id}>
              <td>{nomes.get(c.comunidadeId) ?? c.comunidadeId}</td>
              <td>{c.rubrica}{c.notas && <div className="muted">{c.notas}</div>}</td>
              <td><span className={'etiqueta' + (c.nivel === 'confidencial' ? ' preta' : '')}>{NIVEL_LABEL[c.nivel]}</span></td>
              <td className="num">{eur(c.valorMensal)}</td><td>{c.inicio}</td><td>{c.fim ?? 'em vigor'}</td>
              <td className="num">{eur(ateHoje(c))}</td><td className="num">{eur(noAno(c))}</td>
              <td>{pode('custos') && <><button className="link" onClick={() => setEdit(c)}>Editar</button> · <button className="link" onClick={() => remover(c)}>Remover</button></>}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={6}>Total</td><td className="num">{eur(r2(linhas.reduce((s, c) => s + ateHoje(c), 0)))}</td><td className="num">{eur(r2(linhas.reduce((s, c) => s + noAno(c), 0)))}</td><td /></tr></tfoot>
        </table></div>
      )}
      {edit && (
        <div className="modal-fundo" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{edit.id ? 'Editar custo fixo' : 'Novo custo fixo'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label className="campo">Comunidade
                <select value={edit.comunidadeId} onChange={(e) => setEdit({ ...edit, comunidadeId: e.target.value })}>
                  {(coms.dados ?? []).filter((c) => !c.especial && (c.ativo !== false || c.id === edit.comunidadeId) && (acesso!.comunidades.includes('*') || acesso!.comunidades.includes(c.id))).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
              <label className="campo">Rubrica
                <input value={edit.rubrica} list="rubricas" onChange={(e) => {
                  const r = e.target.value; const k = r.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
                  setEdit({ ...edit, rubrica: r, nivel: edit.id ? edit.nivel : NIVEL_SUGERIDO[k] ?? edit.nivel });
                }} />
                <datalist id="rubricas">{['Renda', 'Vencimentos', 'Segurança Social', 'Luz', 'Água', 'Internet', 'Seguros', 'Condomínio'].map((r) => <option key={r} value={r} />)}</datalist>
              </label>
              <label className="campo">Valor mensal (€)<input type="number" step="0.01" value={edit.valorMensal} onChange={(e) => setEdit({ ...edit, valorMensal: Number(e.target.value) })} /></label>
              <label className="campo">Nível de privacidade
                <select value={edit.nivel} onChange={(e) => setEdit({ ...edit, nivel: e.target.value as Nivel })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select>
              </label>
              <label className="campo">Início (mês)<input type="month" value={edit.inicio} onChange={(e) => setEdit({ ...edit, inicio: e.target.value })} /></label>
              <label className="campo">Fim (mês, vazio = em vigor)<input type="month" value={edit.fim ?? ''} onChange={(e) => setEdit({ ...edit, fim: e.target.value || null })} /></label>
              <label className="campo" style={{ gridColumn: '1 / -1' }}>Notas<input value={edit.notas ?? ''} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} /></label>
            </div>
            <div className="acoes" style={{ marginTop: 14 }}>
              <button disabled={!edit.rubrica || !edit.inicio} onClick={guardar}>Guardar</button>
              <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
