import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { lerPerfil, type Acesso } from '../lib/db';
import { MASTER_EMAILS, nivelNum, type Nivel, type Papel } from '../lib/types';

interface Estado {
  carregando: boolean;
  user: User | null;
  acesso: Acesso | null;
  motivo?: 'sem-perfil' | 'inativo' | 'nao-verificado';
  sair: () => Promise<void>;
  pode: (acao: Acao) => boolean;
  temNivel: (n: Nivel) => boolean;
}

export type Acao = 'importar' | 'bancos' | 'aprovar' | 'configurar' | 'utilizadores' | 'publicar' | 'auditoria' | 'exportar' | 'custos';

const PERMISSOES: Record<Acao, Papel[]> = {
  importar: ['master', 'caf'],
  custos: ['master', 'caf'],
  bancos: ['master', 'caf'],
  aprovar: ['master', 'caf'],
  publicar: ['master', 'caf'],
  auditoria: ['master', 'caf'],
  exportar: ['master', 'caf'],
  configurar: ['master', 'caf'],
  utilizadores: ['master'],
};

const Ctx = createContext<Estado | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [motivo, setMotivo] = useState<Estado['motivo']>();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setCarregando(true);
    setUser(u);
    setAcesso(null);
    setMotivo(undefined);
    if (u?.email) {
      const email = u.email.toLowerCase();
      if (!u.emailVerified) setMotivo('nao-verificado');
      else if (MASTER_EMAILS.includes(email)) setAcesso({ email, papel: 'master', nivel: 'confidencial', comunidades: ['*'] });
      else {
        try {
          const p = await lerPerfil(email);
          if (!p) setMotivo('sem-perfil');
          else if (!p.ativo) setMotivo('inativo');
          else setAcesso({ email, papel: p.papel, nivel: p.nivel, comunidades: p.comunidades?.length ? p.comunidades : [] });
        } catch {
          setMotivo('sem-perfil');
        }
      }
    }
    setCarregando(false);
  }), []);

  const valor = useMemo<Estado>(() => ({
    carregando, user, acesso, motivo,
    sair: () => signOut(auth),
    pode: (acao) => !!acesso && PERMISSOES[acao].includes(acesso.papel),
    temNivel: (n) => !!acesso && nivelNum(acesso.nivel) >= nivelNum(n),
  }), [carregando, user, acesso, motivo]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
