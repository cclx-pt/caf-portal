import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider, isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink, signInWithPopup,
} from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Rodape } from '../components/ui';

const BASE = import.meta.env.BASE_URL;
const CHAVE_EMAIL = 'caf-portal:email-login';

function traduzir(e: unknown) {
  const c = (e as { code?: string }).code ?? '';
  if (c.includes('popup-closed')) return 'A janela de login foi fechada.';
  if (c.includes('unauthorized-domain') || c.includes('unauthorized-continue-uri')) return 'Este endereço não está autorizado no Firebase.';
  if (c.includes('operation-not-allowed')) return 'O login por link de email ainda não está ativo no Firebase (Authentication → Email/senha → Link do email).';
  if (c.includes('invalid-action-code') || c.includes('expired-action-code')) return 'Este link já foi usado ou expirou. Peça um novo.';
  if (c.includes('invalid-email')) return 'Email inválido.';
  return (e as Error).message;
}

/** Endereço de regresso do link: a raiz do portal, sem parâmetros. */
const urlRegresso = () => `${window.location.origin}${BASE}`;

export default function Login() {
  const { user, motivo, sair } = useAuth();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [pedirEmail, setPedirEmail] = useState(false);

  async function correr(f: () => Promise<unknown>) {
    setOcupado(true); setMsg(null);
    try { await f(); } catch (e) { setMsg(traduzir(e)); } finally { setOcupado(false); }
  }

  async function concluirLink(endereco: string) {
    await signInWithEmailLink(auth, endereco, window.location.href);
    window.localStorage.removeItem(CHAVE_EMAIL);
    window.history.replaceState(null, '', urlRegresso());
  }

  // Ao abrir o link recebido por email, conclui o login.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    const guardado = window.localStorage.getItem(CHAVE_EMAIL);
    if (guardado) void correr(() => concluirLink(guardado));
    else setPedirEmail(true); // link aberto noutro dispositivo
  }, []);

  if (user && motivo) {
    return (
      <div className="login">
        <div className="caixa">
          <img src={`${BASE}caf-logo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
          <h2>Sem acesso ao portal</h2>
          <p>A conta <b>{user.email}</b> ainda não tem um perfil ativo. Peça ao Master (tesouraria@cclx.pt) para lhe dar acesso.</p>
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

        {pedirEmail ? <>
          <p className="small">Abriu o link noutro dispositivo. Confirme o email para entrar.</p>
          <label className="campo">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button disabled={ocupado || !email} onClick={() => correr(() => concluirLink(email.trim()))}>Entrar</button>
        </> : enviado ? <>
          <div className="nota">Enviámos um link de acesso para <b>{email}</b>. Abra o email neste dispositivo e carregue no link para entrar. O link é válido uma vez.</div>
          <button className="sec" onClick={() => setEnviado(false)}>Usar outro email</button>
        </> : <>
          <button disabled={ocupado} onClick={() => correr(() => signInWithPopup(auth, new GoogleAuthProvider()))}>Entrar com Google</button>
          <div className="muted" style={{ textAlign: 'center' }}>ou receba um link de acesso por email (sem senha)</div>
          <label className="campo">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button className="sec" disabled={ocupado || !email.includes('@')} onClick={() => correr(async () => {
            const endereco = email.trim().toLowerCase();
            await sendSignInLinkToEmail(auth, endereco, { url: urlRegresso(), handleCodeInApp: true });
            window.localStorage.setItem(CHAVE_EMAIL, endereco);
            setEnviado(true);
          })}>Enviar link de acesso</button>
        </>}

        {msg && <div className="aviso">{msg}</div>}
        <a href={`${BASE}#/publico`}>Ver a página pública</a>
        <Rodape />
      </div>
    </div>
  );
}
