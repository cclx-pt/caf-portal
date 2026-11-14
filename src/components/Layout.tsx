import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useCarregar, useFiltros, Rodape } from './ui';
import { listarComunidades } from '../lib/db';
import { NIVEL_LABEL, PAPEL_LABEL } from '../lib/types';

const BASE = import.meta.env.BASE_URL;

export default function Layout() {
  const { acesso, sair, pode, temNivel } = useAuth();
  const { ano, setAno, comunidade, setComunidade } = useFiltros();
  const { dados: comunidades } = useCarregar(listarComunidades, []);
  const anoAtual = new Date().getFullYear();
  const visiveis = (comunidades ?? []).filter((c) => c.ativo !== false && (acesso?.comunidades.includes('*') || acesso?.comunidades.includes(c.id)));

  return (
    <div className="app">
      <nav className="side" aria-label="Navegação principal">
        <img src={`${BASE}caf-logo-negativo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
        <NavLink to="/" end>Painel</NavLink>
        {temNivel('privado') && <>
          <div className="grupo">Dados (Jotform)</div>
          <NavLink to="/entradas-conjunto">Entradas: contribuições e depósitos</NavLink>
          <NavLink to="/entradas">Contribuições</NavLink>
          <NavLink to="/depositos">Depósitos de coletas</NavLink>
          <NavLink to="/reembolsos">Reembolsos e despesas</NavLink>
          <NavLink to="/assistencia">Assistência</NavLink>
        </>}
        {pode('bancos') && <><div className="grupo">Tesouraria</div><NavLink to="/bancos">Bancos e bolsa geral</NavLink></>}
        {temNivel('privado') && <NavLink to="/custos-fixos">Custos fixos</NavLink>}
        {temNivel('privado') && <NavLink to="/orcamento">Orçamento</NavLink>}
        {pode('publicar') && <NavLink to="/fecho">Fecho mensal e publicação</NavLink>}
        {pode('exportar') && <NavLink to="/exportacao">Exportação contabilista</NavLink>}
        {(pode('configurar') || pode('auditoria')) && <div className="grupo">Administração</div>}
        {pode('configurar') && <NavLink to="/configuracao">Configuração</NavLink>}
        {pode('utilizadores') && <NavLink to="/utilizadores">Utilizadores</NavLink>}
        {pode('auditoria') && <NavLink to="/auditoria">Auditoria</NavLink>}
        <a href={`${BASE}#/publico`} target="_blank" rel="noreferrer">Página pública ↗</a>
        <div className="rodape">Portal CAF · PoC</div>
      </nav>
      <main className="main">
        <div className="topo">
          <div>
            <div className="kicker">CCLX · Conselho Administrativo e Financeiro</div>
          </div>
          <div className="filtros">
            <label className="campo">Ano
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="campo">Comunidade
              <select value={comunidade} onChange={(e) => setComunidade(e.target.value)}>
                <option value="todas">Todas</option>
                {visiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>
          <div className="utilizador">
            <div>{acesso?.email}</div>
            <div className="muted">{acesso && `${PAPEL_LABEL[acesso.papel]} · nível ${NIVEL_LABEL[acesso.nivel]}`}</div>
            <button className="link" onClick={() => void sair()}>Terminar sessão</button>
          </div>
        </div>
        <Outlet />
        <Rodape />
      </main>
    </div>
  );
}
