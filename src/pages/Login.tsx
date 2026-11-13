import { useState } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup,
} from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Rodape } from '../components/ui';

const BASE = import.meta.env.BASE_URL;

function traduzir(e: unknown) {
  const c = (e as { code?: string }).code ?? '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email ou senha incorretos.';
  if (c.includes('email-already-in-use')) return 'Já existe uma conta com este email. Use "Entrar".';
  if (c.includes('weak-password')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (c.includes('popup-closed')) return 'A janela de login foi fechada.';
  if (c.includes('unauthorized-domain')) return 'Este endereço não está autorizado no Firebase.';
  return (e as Error).message;
}

export default function Login() {
  const { user, motivo, sair } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(f: () => Promise<unknown>) {
    setOcupado(true); setMsg(null);
    try { await f(); } catch (e) { setMsg(traduzir(e)); } finally { setOcupado(false); }
  }

  if (user && motivo) {
    return (
      <div className="login">
        <div className="caixa">
          <img src={`${BASE}caf-logo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
          {motivo === 'nao-verificado' && <>
            <h2>Confirme o seu email</h2>
            <p>Enviámos uma mensagem para <b>{user.email}</b>. Abra o link e volte a entrar.</p>
            <button className="sec" onClick={() => correr(() => sendEmailVerification(user).then(() => setMsg('Mensagem reenviada.')))}>Reenviar email</button>
          </>}
          {(motivo === 'sem-perfil' || motivo === 'inativo') && <>
            <h2>Sem acesso ao portal</h2>
            <p>A conta <b>{user.email}</b> ainda não tem um perfil ativo. Peça ao Master (tesouraria@cclx.pt) para lhe dar acesso.</p>
          </>}
          {msg && <div className="nota">{msg}</div>}
          <button onClick={() => void sair()}>Terminar sessão</button>
          <a href={`${BASE}#/publico`}>Ver a página pública</a>
          <Rodape />
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="caixa">
        <img src={`${BASE}caf-logo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
        <h1>Portal CAF</h1>
        <p className="muted">Gestão financeira da CCLX. Acesso reservado a utilizadores autorizados.</p>
        <button disabled={ocupado} onClick={() => correr(() => signInWithPopup(auth, new GoogleAuthProvider()))}>Entrar com Google</button>
        <div className="muted" style={{ textAlign: 'center' }}>ou com email e senha</div>
        <label className="campo">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="campo">Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" /></label>
        <div className="acoes">
          <button disabled={ocupado || !email || !senha} onClick={() => correr(() => signInWithEmailAndPassword(auth, email, senha))}>Entrar</button>
          <button className="sec" disabled={ocupado || !email || !senha} onClick={() => correr(async () => {
            const c = await createUserWithEmailAndPassword(auth, email, senha);
            await sendEmailVerification(c.user);
          })}>Criar conta</button>
          <button className="link" disabled={!email} onClick={() => correr(() => sendPasswordResetEmail(auth, email).then(() => setMsg('Enviámos um email para redefinir a senha.')))}>Esqueci-me da senha</button>
        </div>
        {msg && <div className="nota">{msg}</div>}
        <a href={`${BASE}#/publico`}>Ver a página pública</a>
        <Rodape />
      </div>
    </div>
  );
}
