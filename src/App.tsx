import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, type Acao } from './auth/AuthProvider';
import { FiltrosProvider } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Publico from './pages/Publico';
import Painel from './pages/Painel';
import Fonte from './pages/Fonte';
import Bancos from './pages/Bancos';
import CustosFixos from './pages/CustosFixos';
import Orcamento from './pages/Orcamento';
import Fecho from './pages/Fecho';
import Exportacao from './pages/Exportacao';
import Configuracao from './pages/Configuracao';
import Utilizadores from './pages/Utilizadores';
import Auditoria from './pages/Auditoria';
import type { ReactElement } from 'react';

function Protegido() {
  const { carregando, acesso } = useAuth();
  if (carregando) return <div className="login"><p className="muted">A carregar…</p></div>;
  if (!acesso) return <Login />;
  return <FiltrosProvider><Layout /></FiltrosProvider>;
}

function Se({ acao, nivel, children }: { acao?: Acao; nivel?: 'privado' | 'confidencial'; children: ReactElement }) {
  const { pode, temNivel } = useAuth();
  if ((acao && !pode(acao)) || (nivel && !temNivel(nivel))) return <div className="aviso">Sem permissão para esta área.</div>;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/publico" element={<Publico />} />
          <Route element={<Protegido />}>
            <Route index element={<Painel />} />
            <Route path="entradas" element={<Se nivel="privado"><Fonte key="c" origem="contribuir" /></Se>} />
            <Route path="depositos" element={<Se nivel="privado"><Fonte key="d" origem="depositos" /></Se>} />
            <Route path="reembolsos" element={<Se nivel="privado"><Fonte key="r" origem="despesas" /></Se>} />
            <Route path="assistencia" element={<Se nivel="privado"><Fonte key="a" origem="assistencia" /></Se>} />
            <Route path="bancos" element={<Se acao="bancos"><Bancos /></Se>} />
            <Route path="custos-fixos" element={<Se nivel="privado"><CustosFixos /></Se>} />
            <Route path="orcamento" element={<Se nivel="privado"><Orcamento /></Se>} />
            <Route path="fecho" element={<Se acao="publicar"><Fecho /></Se>} />
            <Route path="exportacao" element={<Se acao="exportar"><Exportacao /></Se>} />
            <Route path="configuracao" element={<Se acao="configurar"><Configuracao /></Se>} />
            <Route path="utilizadores" element={<Se acao="utilizadores"><Utilizadores /></Se>} />
            <Route path="auditoria" element={<Se acao="auditoria"><Auditoria /></Se>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
