import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar } from '../components/ui';
import { apagarPerfil, auditar, gravarPerfil, listarComunidades, listarPerfis } from '../lib/db';
import { MASTER_EMAILS, NIVEIS, NIVEL_LABEL, PAPEL_LABEL, type Nivel, type Papel, type Perfil } from '../lib/types';

const NIVEL_DEFEITO: Record<Papel, Nivel> = { master: 'confidencial', caf: 'confidencial', tesoureiro: 'privado', leitura: 'publico' };
const novo = (): Perfil => ({ email: '', papel: 'leitura', nivel: 'publico', comunidades: ['*'], ativo: true });

export default function Utilizadores() {
  const { acesso } = useAuth();
  const perfis = useCarregar(listarPerfis, []);
  const coms = useCarregar(listarComunidades, []);
  const [edit, setEdit] = useState<Perfil | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));

  async function guardar() {
    if (!edit) return;
    try {
      const p = { ...edit, email: edit.email.trim().toLowerCase(), comunidades: edit.papel === 'caf' ? ['*'] : edit.comunidades };
      if (p.papel === 'tesoureiro' && (p.comunidades.includes('*') || !p.comunidades.length)) { setMsg('O tesoureiro tem de ter uma comunidade.'); return; }
      await gravarPerfil(p);
      await auditar(acesso!.email, 'utilizador', `${p.email}: ${p.papel}, ${p.nivel}, ${p.comunidades.join(',')}, ${p.ativo ? 'ativo' : 'inativo'}`);
      setEdit(null); await perfis.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function remover(email: string) {
    if (!confirm(`Remover o acesso de ${email}?`)) return;
    try { await apagarPerfil(email); await auditar(acesso!.email, 'remover utilizador', email); await perfis.recarregar(); } catch (e) { setMsg(mensagemErro(e)); }
  }

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Utilizadores</h1>
          <p className="muted">Master (fixos): {MASTER_EMAILS.join(', ')}. O CAF vê toda a organização; o tesoureiro só a sua comunidade; a leitura só consulta, até ao nível definido.</p>
        </div>
        <button onClick={() => setEdit(novo())}>Novo utilizador</button>
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <Estado aCarregar={perfis.aCarregar} erro={perfis.erro} />
      <div className="tabela"><table>
        <thead><tr><th>Email</th><th>Perfil</th><th>Nível</th><th>Comunidades</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {(perfis.dados ?? []).map((p) => (
            <tr key={p.email}>
              <td>{p.email}</td><td>{PAPEL_LABEL[p.papel]}</td><td>{NIVEL_LABEL[p.nivel]}</td>
              <td>{p.comunidades.includes('*') ? 'Todas' : p.comunidades.map((c) => nomes.get(c) ?? c).join(', ')}</td>
              <td>{p.ativo ? 'Ativo' : 'Inativo'}</td>
              <td><button className="link" onClick={() => setEdit(p)}>Editar</button> · <button className="link" onClick={() => remover(p.email)}>Remover</button></td>
            </tr>
          ))}
          {!perfis.dados?.length && !perfis.aCarregar && <tr><td colSpan={6} className="muted">Ainda não há utilizadores além dos Master.</td></tr>}
        </tbody>
      </table></div>
      {edit && (
        <div className="modal-fundo" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{edit.email ? edit.email : 'Novo utilizador'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label className="campo">Email (conta Google ou email/senha)<input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
              <label className="campo">Perfil
                <select value={edit.papel} onChange={(e) => { const papel = e.target.value as Papel; setEdit({ ...edit, papel, nivel: NIVEL_DEFEITO[papel], comunidades: papel === 'caf' ? ['*'] : papel === 'tesoureiro' ? [] : edit.comunidades }); }}>
                  {(['caf', 'tesoureiro', 'leitura'] as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
                </select>
              </label>
              <label className="campo">Nível máximo de privacidade
                <select value={edit.nivel} onChange={(e) => setEdit({ ...edit, nivel: e.target.value as Nivel })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select>
              </label>
              <label className="campo">Estado
                <select value={edit.ativo ? '1' : '0'} onChange={(e) => setEdit({ ...edit, ativo: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select>
              </label>
            </div>
            {edit.papel !== 'caf' && (
              <fieldset style={{ marginTop: 12, border: '1px solid #e6e6e6' }}>
                <legend className="small">Comunidades</legend>
                {edit.papel === 'leitura' && <label className="small" style={{ marginRight: 12 }}><input type="checkbox" checked={edit.comunidades.includes('*')} onChange={(e) => setEdit({ ...edit, comunidades: e.target.checked ? ['*'] : [] })} /> Todas</label>}
                {!edit.comunidades.includes('*') && (coms.dados ?? []).filter((c) => !c.especial).map((c) => (
                  <label key={c.id} className="small" style={{ marginRight: 12, whiteSpace: 'nowrap' }}>
                    <input type={edit.papel === 'tesoureiro' ? 'radio' : 'checkbox'} name="com" checked={edit.comunidades.includes(c.id)}
                      onChange={(e) => setEdit({ ...edit, comunidades: edit.papel === 'tesoureiro' ? [c.id] : e.target.checked ? [...edit.comunidades, c.id] : edit.comunidades.filter((x) => x !== c.id) })} /> {c.nome}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="acoes" style={{ marginTop: 14 }}>
              <button disabled={!edit.email.includes('@')} onClick={guardar}>Guardar</button>
              <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
