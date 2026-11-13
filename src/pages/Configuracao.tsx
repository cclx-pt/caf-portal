import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar } from '../components/ui';
import { auditar, gravar, gravarSegredoJotform, lerSegredoJotform, listarCategorias, listarComunidades, listarContas } from '../lib/db';
import { CATEGORIAS, COMUNIDADES, CONTAS, CUSTOS_FIXOS_CDR, JOTFORM_FORMS } from '../lib/seed';
import { NIVEIS, NIVEL_LABEL, type Categoria, type Nivel } from '../lib/types';

export default function Configuracao() {
  const { acesso } = useAuth();
  const coms = useCarregar(listarComunidades, []);
  const contas = useCarregar(listarContas, []);
  const cats = useCarregar(listarCategorias, []);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [jot, setJot] = useState({ apiKey: '', base: 'https://eu-api.jotform.com' });
  useEffect(() => { void lerSegredoJotform().then((j) => j && setJot({ apiKey: j.apiKey ? '••••••••' : '', base: j.base })); }, []);

  async function inicializar() {
    setOcupado(true); setMsg(null);
    try {
      for (const c of COMUNIDADES) await gravar('comunidades', c);
      for (const c of CONTAS) await gravar('contas', c);
      const existentes = new Set((cats.dados ?? []).map((c) => c.id));
      for (const c of CATEGORIAS) if (!existentes.has(c.id)) await gravar('categorias', c);
      for (const c of CUSTOS_FIXOS_CDR) await gravar('custos_fixos', c);
      await auditar(acesso!.email, 'inicializar', 'Comunidades, contas, categorias e custos fixos de Caldas da Rainha');
      await Promise.all([coms.recarregar(), contas.recarregar(), cats.recarregar()]);
      setMsg('Dados de referência criados: 8 comunidades + bolsa geral, 3 contas, categorias por atividade e custos fixos reais de Caldas da Rainha.');
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  async function gravarCategoria(c: Categoria) {
    try { await gravar('categorias', c); await cats.recarregar(); } catch (e) { setMsg(mensagemErro(e)); }
  }

  async function guardarJotform() {
    if (jot.apiKey.startsWith('•')) { setMsg('Introduza a nova chave para a substituir.'); return; }
    try {
      await gravarSegredoJotform(jot);
      await auditar(acesso!.email, 'configurar jotform', jot.base);
      setJot({ ...jot, apiKey: '••••••••' }); setMsg('Chave Jotform guardada (só o Master a pode ler).');
    } catch (e) { setMsg(mensagemErro(e)); }
  }

  return (
    <>
      <h1>Configuração</h1>
      {msg && <div className="nota">{msg}</div>}

      <div className="sec card">
        <h2>Dados de referência</h2>
        <p className="small">Cria ou atualiza as comunidades (Barreiro até 31/10/2026), as contas CGD e Santander, as categorias iniciais por atividade e os custos fixos reais de Caldas da Rainha. Pode ser repetido sem duplicar.</p>
        <button disabled={ocupado} onClick={inicializar}>Inicializar / atualizar dados de referência</button>
      </div>

      <div className="grid2">
        <div className="sec">
          <h2>Comunidades</h2>
          <Estado aCarregar={coms.aCarregar} erro={coms.erro} vazio={!coms.dados?.length} />
          <div className="tabela"><table>
            <thead><tr><th>Comunidade</th><th>Fim</th></tr></thead>
            <tbody>{(coms.dados ?? []).map((c) => <tr key={c.id}><td>{c.nome}</td><td>{c.fim ? c.fim.split('-').reverse().join('/') : c.especial ? 'especial' : 'ativa'}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="sec">
          <h2>Contas bancárias</h2>
          <div className="tabela"><table>
            <thead><tr><th>Conta</th><th>Banco</th><th>Nota</th></tr></thead>
            <tbody>{(contas.dados ?? []).map((c) => <tr key={c.id}><td>{c.nome}</td><td>{c.banco}</td><td>{c.etiqueta}</td></tr>)}</tbody>
          </table></div>
        </div>
      </div>

      <div className="sec">
        <h2>Categorias e níveis de privacidade</h2>
        <p className="muted">As categorias de reembolsos vindas do Jotform são mantidas tal como estão. A conta SNC-ESNL fica para preencher com o contabilista.</p>
        <div className="tabela"><table>
          <thead><tr><th>Categoria</th><th>Tipo</th><th>Atividade</th><th>Nível</th><th>Conta SNC-ESNL</th></tr></thead>
          <tbody>{(cats.dados ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.nome}</td><td>{c.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td>
              <td><input defaultValue={c.atividade} onBlur={(e) => e.target.value !== c.atividade && gravarCategoria({ ...c, atividade: e.target.value })} /></td>
              <td><select value={c.nivel} onChange={(e) => gravarCategoria({ ...c, nivel: e.target.value as Nivel })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select></td>
              <td><input defaultValue={c.snc ?? ''} placeholder="ex.: 7xx" style={{ width: 100 }} onBlur={(e) => e.target.value !== (c.snc ?? '') && gravarCategoria({ ...c, snc: e.target.value })} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="sec card">
        <h2>Ligação ao Jotform (só leitura)</h2>
        <p className="small">Formulários: {Object.values(JOTFORM_FORMS).map((f) => `${f.nome} (${f.id})`).join(' · ')}.</p>
        <div className="aviso">
          <b>Decisão crítica pendente:</b> neste PoC a chave da API fica guardada no Firestore, legível só pelo Master, e a sincronização corre no browser do Master.
          Em produção deve passar para uma função no servidor (plano Blaze) com a chave no Secret Manager. Use uma chave <b>só de leitura</b> criada em jotform.com → Definições → API.
        </div>
        <div className="linha">
          <label className="campo">Servidor
            <select value={jot.base} onChange={(e) => setJot({ ...jot, base: e.target.value })}>
              <option value="https://eu-api.jotform.com">Jotform EU (eu-api.jotform.com)</option>
              <option value="https://api.jotform.com">Jotform global (api.jotform.com)</option>
            </select>
          </label>
          <label className="campo">Chave da API (só leitura)<input type="password" value={jot.apiKey} onChange={(e) => setJot({ ...jot, apiKey: e.target.value })} style={{ width: 280 }} /></label>
          <button onClick={guardarJotform} disabled={!jot.apiKey}>Guardar chave</button>
        </div>
      </div>
    </>
  );
}
