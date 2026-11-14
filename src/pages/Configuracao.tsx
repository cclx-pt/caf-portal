import { useEffect, useState } from 'react';
import { SyncEstado } from '../components/SyncEstado';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar } from '../components/ui';
import { apagar, auditar, gravar, gravarSegredoJotform, lerSegredoJotform, listarCategorias, listarComunidades, listarContas, listarCustosFixos } from '../lib/db';
import { CATEGORIAS, COMUNIDADES, CONTAS, CUSTOS_FIXOS_CDR, JOTFORM_FORMS } from '../lib/seed';
import { NIVEIS, NIVEL_LABEL, type Categoria, type Comunidade, type Conta, type Nivel } from '../lib/types';
import { formatarIban, ibanValido, limparIban } from '../lib/iban';
import { usosCategoria, usosComunidade, usosConta } from '../lib/uso';
import { slug } from '../lib/format';
import { testarChave, type ResultadoTeste } from '../lib/jotform';

type Edicao =
  | { tipo: 'comunidade'; novo: boolean; v: Comunidade }
  | { tipo: 'conta'; novo: boolean; v: Conta }
  | { tipo: 'categoria'; novo: boolean; v: Categoria };

const ativoTxt = (a?: boolean) => (a === false ? <span className="etiqueta">Inativa</span> : null);

export default function Configuracao() {
  const { acesso } = useAuth();
  const coms = useCarregar(listarComunidades, []);
  const contas = useCarregar(listarContas, []);
  const cats = useCarregar(listarCategorias, []);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [jot, setJot] = useState({ apiKey: '', base: 'https://eu-api.jotform.com' });
  useEffect(() => { if (acesso?.papel === 'master') void lerSegredoJotform().then((j) => j && setJot({ apiKey: j.apiKey ? '••••••••' : '', base: j.base })); }, [acesso?.papel]);
  async function guardarJotform() {
    if (jot.apiKey.startsWith('•')) { setMsg('Introduza a nova chave para a substituir.'); return; }
    try {
      await gravarSegredoJotform(jot);
      await auditar(acesso!.email, 'configurar jotform', jot.base);
      setJot({ ...jot, apiKey: '••••••••' }); setMsg('Chave Jotform guardada (só o Master a pode ler). A próxima sincronização automática já a usa.');
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  const [teste, setTeste] = useState<ResultadoTeste | null>(null);
  const [aTestar, setATestar] = useState(false);
  async function testarJotform() {
    setATestar(true); setTeste(null);
    try {
      // Usa a chave escrita no campo; se estiver mascarada, usa a guardada no Firebase.
      let cfg = jot;
      if (!jot.apiKey || jot.apiKey.startsWith('•')) {
        const g = await lerSegredoJotform();
        if (!g?.apiKey) { setTeste({ ok: false, formularios: [], erro: 'Ainda não há chave guardada.' }); return; }
        cfg = { apiKey: g.apiKey, base: jot.base || g.base };
      }
      const r = await testarChave(cfg, Object.values(JOTFORM_FORMS));
      setTeste(r);
      await auditar(acesso!.email, 'testar chave jotform', r.ok ? 'ok' : (r.erro ?? 'falhou'));
    } catch (e) { setTeste({ ok: false, formularios: [], erro: mensagemErro(e) }); }
    finally { setATestar(false); }
  }
  const [filtroCat, setFiltroCat] = useState<'todas' | 'entrada' | 'saida'>('todas');
  const recarregar = () => Promise.all([coms.recarregar(), contas.recarregar(), cats.recarregar()]);

  async function inicializar() {
    setOcupado(true); setMsg(null);
    try {
      const comEx = new Set((coms.dados ?? []).map((c) => c.id));
      const contaEx = new Set((contas.dados ?? []).map((c) => c.id));
      const catEx = new Set((cats.dados ?? []).map((c) => c.id));
      for (const c of COMUNIDADES) if (!comEx.has(c.id)) await gravar('comunidades', { ...c, ativo: true });
      for (const c of CONTAS) if (!contaEx.has(c.id)) await gravar('contas', { ...c, ativo: true });
      for (const c of CATEGORIAS) if (!catEx.has(c.id)) await gravar('categorias', { ...c, ativo: true });
      const cfEx = new Set((await listarCustosFixos(acesso!)).map((c) => c.id));
      for (const c of CUSTOS_FIXOS_CDR) if (!cfEx.has(c.id)) await gravar('custos_fixos', c);
      await auditar(acesso!.email, 'inicializar', 'Dados de referência (só os que faltavam)');
      await recarregar();
      setMsg('Dados de referência criados. Os que já existiam não foram alterados.');
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  async function guardar() {
    if (!edit) return;
    setMsg(null);
    try {
      if (edit.tipo === 'comunidade') {
        const v = { ...edit.v, id: edit.novo ? slug(edit.v.nome) : edit.v.id, inicio: edit.v.inicio || null, fim: edit.v.fim || null };
        if (!v.nome.trim()) throw new Error('Indique o nome.');
        if (edit.novo && (coms.dados ?? []).some((c) => c.id === v.id)) throw new Error('Já existe uma comunidade com este nome.');
        await gravar('comunidades', v);
      } else if (edit.tipo === 'conta') {
        const iban = edit.v.iban ? limparIban(edit.v.iban) : '';
        if (iban && !ibanValido(iban)) throw new Error('IBAN inválido (verifique os dígitos de controlo).');
        const v = { ...edit.v, iban, id: edit.novo ? slug(edit.v.nome) : edit.v.id };
        if (!v.nome.trim()) throw new Error('Indique o nome.');
        await gravar('contas', v);
      } else {
        const v = { ...edit.v, id: edit.novo ? `${edit.v.tipo}-${slug(edit.v.nome)}` : edit.v.id };
        if (!v.nome.trim()) throw new Error('Indique o nome.');
        if (edit.novo && (cats.dados ?? []).some((c) => c.id === v.id)) throw new Error('Já existe esta categoria.');
        await gravar('categorias', v);
      }
      await auditar(acesso!.email, `${edit.novo ? 'criar' : 'editar'} ${edit.tipo}`, `${edit.v.nome}`);
      setEdit(null); await recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  async function remover(tipo: Edicao['tipo'], id: string, nome: string) {
    setMsg(null);
    try {
      const usos = tipo === 'comunidade' ? await usosComunidade(id) : tipo === 'conta' ? await usosConta(id) : await usosCategoria(nome);
      if (usos.length) {
        setMsg(`Não é possível apagar "${nome}": tem dados associados (${usos.join(', ')}). Pode desativá-la para deixar de aparecer, mantendo o histórico.`);
        return;
      }
      if (!confirm(`Apagar "${nome}"? Esta ação não se pode desfazer.`)) return;
      await apagar(tipo === 'comunidade' ? 'comunidades' : tipo === 'conta' ? 'contas' : 'categorias', id);
      await auditar(acesso!.email, `apagar ${tipo}`, nome);
      await recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  async function alternarAtivo(tipo: Edicao['tipo'], v: Comunidade | Conta | Categoria) {
    try {
      const col = tipo === 'comunidade' ? 'comunidades' : tipo === 'conta' ? 'contas' : 'categorias';
      await gravar(col, { ...v, ativo: v.ativo === false });
      await auditar(acesso!.email, v.ativo === false ? `ativar ${tipo}` : `desativar ${tipo}`, v.nome);
      await recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  const acoes = (tipo: Edicao['tipo'], v: Comunidade | Conta | Categoria, especial = false) => (
    <>
      <button className="link" onClick={() => setEdit({ tipo, novo: false, v } as Edicao)}>Editar</button>
      {!especial && <> · <button className="link" onClick={() => alternarAtivo(tipo, v)}>{v.ativo === false ? 'Ativar' : 'Desativar'}</button>
        · <button className="link" onClick={() => remover(tipo, v.id, v.nome)}>Apagar</button></>}
    </>
  );
  const catsVis = (cats.dados ?? []).filter((c) => filtroCat === 'todas' || c.tipo === filtroCat);

  return (
    <>
      <h1>Configuração</h1>
      <p className="muted">Só o Master e o CAF podem criar, alterar ou apagar. Entidades com dados não se apagam: desativam-se, para manter o histórico. Todas as alterações ficam na auditoria.</p>
      {msg && <div className="nota">{msg}</div>}

      <div className="sec card">
        <h2>Dados de referência</h2>
        <p className="small">Cria só o que ainda não existe: comunidades (Barreiro até 31/10/2026), contas CGD e Santander, categorias por atividade e custos fixos reais de Caldas da Rainha. Não altera o que já foi editado.</p>
        <button disabled={ocupado} onClick={inicializar}>Inicializar dados de referência</button>
      </div>

      <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Comunidades</h2>
          <button onClick={() => setEdit({ tipo: 'comunidade', novo: true, v: { id: '', nome: '', ordem: (coms.dados?.length ?? 0) + 1, ativo: true } })}>Nova comunidade</button>
        </div>
        <Estado aCarregar={coms.aCarregar} erro={coms.erro} vazio={!coms.dados?.length} />
        <div className="tabela"><table>
          <thead><tr><th>Ordem</th><th>Comunidade</th><th>Início</th><th>Fim</th><th>Estado</th><th /></tr></thead>
          <tbody>{(coms.dados ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.ordem}</td><td>{c.nome}{c.especial && <span className="muted"> (especial)</span>}</td>
              <td>{c.inicio ? c.inicio.split('-').reverse().join('/') : '—'}</td><td>{c.fim ? c.fim.split('-').reverse().join('/') : '—'}</td>
              <td>{ativoTxt(c.ativo) ?? 'Ativa'}</td><td>{acoes('comunidade', c, c.especial)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Contas bancárias</h2>
          <button onClick={() => setEdit({ tipo: 'conta', novo: true, v: { id: '', nome: '', banco: '', tipo: 'corrente', iban: '', ativo: true } })}>Nova conta</button>
        </div>
        <div className="tabela"><table>
          <thead><tr><th>Conta</th><th>Banco</th><th>Tipo</th><th>IBAN</th><th>Nota</th><th>Estado</th><th /></tr></thead>
          <tbody>{(contas.dados ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.nome}</td><td>{c.banco}</td><td>{c.tipo === 'investimentos' ? 'Investimentos' : c.tipo === 'principal' ? 'Principal' : 'Corrente'}</td>
              <td className="small" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatarIban(c.iban) || <span className="muted">por preencher</span>}</td>
              <td className="small">{c.etiqueta}</td><td>{ativoTxt(c.ativo) ?? 'Ativa'}</td><td>{acoes('conta', c)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="sec">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>Categorias e níveis de privacidade</h2>
          <div className="acoes" style={{ margin: 0 }}>
            <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value as typeof filtroCat)} aria-label="Filtrar categorias">
              <option value="todas">Todas</option><option value="entrada">Entradas</option><option value="saida">Saídas</option>
            </select>
            <button onClick={() => setEdit({ tipo: 'categoria', novo: true, v: { id: '', nome: '', tipo: 'saida', atividade: '', nivel: 'privado', snc: '', origem: 'portal', ativo: true } })}>Nova categoria</button>
          </div>
        </div>
        <p className="muted">As categorias de reembolsos vindas do Jotform mantêm-se tal como estão. A conta SNC-ESNL fica para preencher com o contabilista.</p>
        <div className="tabela"><table>
          <thead><tr><th>Categoria</th><th>Tipo</th><th>Atividade</th><th>Nível</th><th>Conta SNC-ESNL</th><th>Estado</th><th /></tr></thead>
          <tbody>{catsVis.map((c) => (
            <tr key={c.id}>
              <td>{c.nome}</td><td>{c.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td><td>{c.atividade}</td>
              <td><span className={'etiqueta' + (c.nivel === 'confidencial' ? ' preta' : '')}>{NIVEL_LABEL[c.nivel]}</span></td>
              <td>{c.snc || <span className="muted">—</span>}</td><td>{ativoTxt(c.ativo) ?? 'Ativa'}</td><td>{acoes('categoria', c)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="sec card">
        <h2>Sincronização automática com o Jotform (só leitura)</h2>
        <p className="small">Formulários: {Object.values(JOTFORM_FORMS).map((f) => `${f.nome} (${f.id})`).join(' · ')}.</p>
        <p className="small">Uma tarefa agendada no GitHub Actions lê os formulários 4 vezes por dia, grava os lotes mensais (sem tocar em meses fechados) e recalcula os resumos e a página pública.</p>
        <SyncEstado detalhe />
        {acesso?.papel === 'master' && <>
          <p className="small"><b>Decisão tomada:</b> a chave da API fica guardada no Firebase, legível só pelo Master e pela sincronização automática. Use uma chave <b>só de leitura</b> (jotform.com → Definições → API).</p>
          <div className="linha">
            <label className="campo">Servidor
              <select value={jot.base} onChange={(e) => setJot({ ...jot, base: e.target.value })}>
                <option value="https://eu-api.jotform.com">Jotform EU (eu-api.jotform.com)</option>
                <option value="https://api.jotform.com">Jotform global (api.jotform.com)</option>
              </select>
            </label>
            <label className="campo">Chave da API (só leitura)<input type="password" value={jot.apiKey} onChange={(e) => setJot({ ...jot, apiKey: e.target.value })} style={{ width: 280 }} /></label>
            <button onClick={guardarJotform} disabled={!jot.apiKey}>Guardar chave</button>
            <button className="sec" onClick={testarJotform} disabled={aTestar}>{aTestar ? 'A testar…' : 'Testar chave'}</button>
          </div>
          <p className="muted">O teste só lê: confirma a conta e o acesso aos 4 formulários. Não importa nem grava dados.</p>
          {teste && (
            <div className={teste.ok ? 'ok-box' : 'aviso'}>
              <b>{teste.ok ? '✓ A chave funciona.' : '✗ A chave não está a funcionar.'}</b>
              {teste.conta && <> Conta Jotform: {teste.conta.utilizador}{teste.conta.plano ? ` (${teste.conta.plano})` : ''}.</>}
              {teste.erro && <> {teste.erro}</>}
              {teste.sugestaoServidor && <> A chave funciona no servidor <b>{teste.sugestaoServidor.replace('https://', '')}</b>: escolha-o acima e guarde de novo.</>}
              {teste.formularios.length > 0 && (
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {teste.formularios.map((f) => (
                    <li key={f.id}>{f.ok ? '✓' : '✗'} {f.nome}: {f.ok ? `${f.submissoes} submissões` : f.erro}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>}
      </div>

      {edit && (
        <Modal titulo={`${edit.novo ? 'Nova' : 'Editar'} ${edit.tipo === 'comunidade' ? 'comunidade' : edit.tipo === 'conta' ? 'conta bancária' : 'categoria'}`} onFechar={() => setEdit(null)}>
          {msg && <div className="aviso">{msg}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {edit.tipo === 'comunidade' && <>
              <label className="campo">Nome<input value={edit.v.nome} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nome: e.target.value } })} /></label>
              <label className="campo">Ordem<input type="number" value={edit.v.ordem} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, ordem: Number(e.target.value) } })} /></label>
              <label className="campo">Início (opcional)<input type="date" value={edit.v.inicio ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, inicio: e.target.value } })} /></label>
              <label className="campo">Fim (opcional)<input type="date" value={edit.v.fim ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, fim: e.target.value } })} /></label>
              {edit.novo && <p className="muted" style={{ gridColumn: '1 / -1' }}>Identificador: {slug(edit.v.nome) || '—'} (não muda depois de criado).</p>}
            </>}
            {edit.tipo === 'conta' && <>
              <label className="campo">Nome<input value={edit.v.nome} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nome: e.target.value } })} /></label>
              <label className="campo">Banco<input value={edit.v.banco} list="bancos" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, banco: e.target.value } })} />
                <datalist id="bancos"><option value="Caixa Geral de Depósitos" /><option value="Santander" /></datalist></label>
              <label className="campo">Tipo
                <select value={edit.v.tipo} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, tipo: e.target.value as Conta['tipo'], etiqueta: e.target.value === 'investimentos' ? '(Conta investimentos)' : edit.v.etiqueta } })}>
                  <option value="principal">Principal</option><option value="corrente">Corrente</option><option value="investimentos">Investimentos</option>
                </select></label>
              <label className="campo">IBAN<input value={edit.v.iban ?? ''} placeholder="PT50 0000 0000 0000 0000 0000 0" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, iban: e.target.value } })} />
                {edit.v.iban && <span className="small">{ibanValido(edit.v.iban) ? '✓ IBAN válido' : 'IBAN inválido'}</span>}</label>
              <label className="campo" style={{ gridColumn: '1 / -1' }}>Nota<input value={edit.v.etiqueta ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, etiqueta: e.target.value } })} /></label>
            </>}
            {edit.tipo === 'categoria' && <>
              <label className="campo">Nome<input value={edit.v.nome} disabled={!edit.novo} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nome: e.target.value } })} /></label>
              <label className="campo">Tipo
                <select value={edit.v.tipo} disabled={!edit.novo} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, tipo: e.target.value as Categoria['tipo'] } })}>
                  <option value="entrada">Entrada</option><option value="saida">Saída</option>
                </select></label>
              <label className="campo">Atividade<input value={edit.v.atividade} list="atividades" onChange={(e) => setEdit({ ...edit, v: { ...edit.v, atividade: e.target.value } })} />
                <datalist id="atividades">{[...new Set((cats.dados ?? []).map((c) => c.atividade))].map((a) => <option key={a} value={a} />)}</datalist></label>
              <label className="campo">Nível de privacidade
                <select value={edit.v.nivel} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, nivel: e.target.value as Nivel } })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select></label>
              <label className="campo">Conta SNC-ESNL<input value={edit.v.snc ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, snc: e.target.value } })} /></label>
              {!edit.novo && <p className="muted" style={{ gridColumn: '1 / -1' }}>O nome e o tipo não mudam depois de criados, porque os registos importados usam o nome.</p>}
            </>}
          </div>
          <div className="acoes" style={{ marginTop: 14 }}>
            <button onClick={guardar}>Guardar</button>
            <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
