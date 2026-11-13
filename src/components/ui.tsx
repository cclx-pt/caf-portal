import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { eur, eurK } from '../lib/format';

// ---------- filtros globais (ano e comunidade) ----------
interface Filtros { ano: number; setAno: (a: number) => void; comunidade: string; setComunidade: (c: string) => void }
const FiltrosCtx = createContext<Filtros | null>(null);
export function FiltrosProvider({ children }: { children: ReactNode }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [comunidade, setComunidade] = useState('todas');
  return <FiltrosCtx.Provider value={{ ano, setAno, comunidade, setComunidade }}>{children}</FiltrosCtx.Provider>;
}
export const useFiltros = () => useContext(FiltrosCtx)!;

// ---------- carregamento ----------
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const recarregar = useCallback(async () => {
    setACarregar(true); setErro(null);
    try { setDados(await fn()); } catch (e) { setErro(mensagemErro(e)); } finally { setACarregar(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { dados, erro, aCarregar, recarregar, setDados };
}

export function mensagemErro(e: unknown) {
  const s = e instanceof Error ? e.message : String(e);
  if (/permission|insufficient/i.test(s)) return 'Sem permissão para estes dados. Confirme o seu perfil com o Master.';
  return s;
}

export function Estado({ aCarregar, erro, vazio }: { aCarregar: boolean; erro: string | null; vazio?: boolean }) {
  if (aCarregar) return <p className="muted">A carregar…</p>;
  if (erro) return <div className="aviso">{erro}</div>;
  if (vazio) return <p className="muted">Sem dados para este período.</p>;
  return null;
}

// ---------- KPI ----------
export function Kpi({ titulo, valor, sub, negativo }: { titulo: string; valor: string; sub?: ReactNode; negativo?: boolean }) {
  return (
    <div className="kpi">
      <h3>{titulo}</h3>
      <div className={'valor' + (negativo ? ' neg' : '')}>{valor}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// ---------- gráfico de barras em escala de cinzentos ----------
export const TONS = ['#000000', '#777777', '#333333', '#bdbdbd'];
export function GraficoBarras({ dados, series, altura = 280, empilhado }: {
  dados: Record<string, string | number>[];
  series: { key: string; nome: string; stack?: string }[];
  altura?: number;
  empilhado?: boolean;
}) {
  return (
    <div role="img" aria-label={'Gráfico: ' + series.map((s) => s.nome).join(', ')} style={{ width: '100%', height: altura }}>
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid stroke="#e6e6e6" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#333' }} axisLine={{ stroke: '#777' }} tickLine={false} />
          <YAxis tickFormatter={(v) => eurK(Number(v))} tick={{ fontSize: 11, fill: '#333' }} axisLine={false} tickLine={false} width={80} />
          <Tooltip cursor={{ fill: '#f2f2f2' }} formatter={(v) => eur(Number(v))} contentStyle={{ border: '1px solid #333', borderRadius: 0, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.nome} fill={TONS[i % TONS.length]} stackId={empilhado ? s.stack ?? 'a' : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{titulo}</h2>
          <button className="sec" onClick={onFechar} aria-label="Fechar">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Rodape() {
  return (
    <div className="pe">
      <b>CONSELHO ADMINISTRATIVO E FINANCEIRO • CCLX</b>
      <span>Portal CAF · PoC · Valores em euros (€), com duas casas decimais</span>
    </div>
  );
}
