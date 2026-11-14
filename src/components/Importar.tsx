import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Modal, mensagemErro } from './ui';
import { FONTES, construirLotes, mapearLinhas, sugerirMapa, type Linha } from '../lib/fontes';
import { lerFicheiro } from '../lib/ficheiros';
import { auditar, gravarLotes, lerSegredoJotform } from '../lib/db';
import { lerSubmissoes } from '../lib/jotform';
import { JOTFORM_FORMS } from '../lib/seed';
import { eur } from '../lib/format';
import type { Origem } from '../lib/types';

export const HISTORICO_DESDE = '2025-01-01';

/** Importa uma exportação Jotform (CSV/Excel) ou sincroniza pela API, e grava em lotes mensais. */
export function Importar({ origem, onFeito, onFechar, modo }: { origem: Origem; onFeito: () => void; onFechar: () => void; modo: 'ficheiro' | 'api' }) {
  const { acesso } = useAuth();
  const def = FONTES[origem];
  const [colunas, setColunas] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function carregarFicheiro(f: File) {
    setErro(null); setEstado('A ler o ficheiro…');
    try {
      const t = await lerFicheiro(f);
      setColunas(t.colunas); setLinhas(t.linhas); setMapa(sugerirMapa(def, t.colunas));
      setEstado(`${t.linhas.length} linhas lidas.`);
    } catch (e) { setErro(mensagemErro(e)); setEstado(null); }
  }

  async function sincronizar() {
    setErro(null); setOcupado(true);
    try {
      const cfg = await lerSegredoJotform();
      if (!cfg?.apiKey) throw new Error('A chave da API Jotform ainda não foi configurada (Configuração → Jotform).');
      setEstado('A ler submissões do Jotform…');
      const rows = await lerSubmissoes(cfg, JOTFORM_FORMS[origem].id, HISTORICO_DESDE, (n) => setEstado(`${n} submissões lidas…`));
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      setColunas(cols); setLinhas(rows); setMapa(sugerirMapa(def, cols));
      setEstado(`${rows.length} submissões lidas desde ${HISTORICO_DESDE}.`);
    } catch (e) { setErro(mensagemErro(e)); setEstado(null); } finally { setOcupado(false); }
  }

  const resultado = useMemo(() => (linhas.length ? mapearLinhas(origem, linhas, mapa) : null), [origem, linhas, mapa]);
  const permitidos = (c: string) => acesso!.comunidades.includes('*') || acesso!.comunidades.includes(c);
  const validos = (resultado?.registos ?? []).filter((r) => r.data >= HISTORICO_DESDE);
  const foraDoAmbito = validos.filter((r) => !permitidos(r.comunidadeId));
  const aGravar = validos.filter((r) => permitidos(r.comunidadeId));
  const porComunidade = aGravar.reduce<Record<string, { n: number; total: number }>>((acc, r) => {
    const x = (acc[r.comunidadeId] ??= { n: 0, total: 0 }); x.n++; x.total += r.valor; return acc;
  }, {});
  const faltaObrigatorio = def.campos.filter((c) => c.obrigatorio && !mapa[c.key]);

  async function gravar() {
    setOcupado(true); setErro(null);
    try {
      const { conf, priv } = await construirLotes(origem, aGravar, acesso!.email);
      setEstado(`A gravar ${priv.length} lotes mensais…`);
      const falhas = await gravarLotes(conf, priv, origem === 'assistencia');
      await auditar(acesso!.email, `importar ${origem}`, `${aGravar.length} registos em ${priv.length} lotes (${modo})${falhas.length ? `; recusados: ${falhas.join(', ')}` : ''}`);
      setEstado(falhas.length ? `Gravado, exceto ${falhas.length} lotes recusados (meses fechados ou sem permissão): ${falhas.join('; ')}` : `Gravados ${aGravar.length} registos em ${priv.length} lotes mensais.`);
      onFeito();
    } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
  }

  return (
    <Modal titulo={`${modo === 'api' ? 'Sincronizar' : 'Importar'}: ${def.titulo}`} onFechar={onFechar}>
      <div className="nota">
        O processo continua no Jotform: o portal só lê. Cada importação <b>substitui os meses que contém</b> (por comunidade), por isso use sempre exportações com meses completos.
        Os dados pessoais (nome, NIF, email, telefone, IBAN) ficam só no nível confidencial; os outros níveis veem pseudónimos.
      </div>
      {modo === 'ficheiro' && (
        <label className="campo">Ficheiro exportado do Jotform (CSV ou Excel)
          <input type="file" accept=".csv,.xlsx,.xlsm,.txt" onChange={(e) => e.target.files?.[0] && carregarFicheiro(e.target.files[0])} />
        </label>
      )}
      {modo === 'api' && !linhas.length && <button disabled={ocupado} onClick={sincronizar}>Ler submissões do Jotform</button>}
      {estado && <p className="small" style={{ marginTop: 10 }}>{estado}</p>}
      {erro && <div className="aviso">{erro}</div>}

      {!!colunas.length && <>
        <h2 style={{ marginTop: 16 }}>Correspondência de colunas</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {def.campos.map((c) => (
            <label key={c.key} className="campo">{c.label}{c.obrigatorio ? ' *' : ''}{c.pessoal ? ' (pessoal)' : ''}
              <select value={mapa[c.key] ?? ''} onChange={(e) => setMapa({ ...mapa, [c.key]: e.target.value })}>
                <option value="">(não usar)</option>
                {colunas.map((col) => <option key={col} value={col}>{col}</option>)}
              </select>
            </label>
          ))}
        </div>
      </>}

      {resultado && <>
        <h2 style={{ marginTop: 16 }}>Pré-visualização</h2>
        <p className="small">
          {aGravar.length} registos a gravar desde {HISTORICO_DESDE}
          {resultado.rejeitadas.length ? ` · ${resultado.rejeitadas.length} linhas rejeitadas (ex.: linha ${resultado.rejeitadas[0].linha}: ${resultado.rejeitadas[0].motivo})` : ''}
          {foraDoAmbito.length ? ` · ${foraDoAmbito.length} de outras comunidades ignorados (fora do seu âmbito)` : ''}
        </p>
        <div className="tabela" style={{ maxHeight: 220 }}>
          <table>
            <thead><tr><th>Comunidade</th><th className="num">Registos</th><th className="num">{origem === 'assistencia' ? 'Soma de adultos' : 'Total'}</th></tr></thead>
            <tbody>{Object.entries(porComunidade).map(([c, x]) => (
              <tr key={c}><td>{c === 'bolsa-geral' ? 'Bolsa geral (sem comunidade)' : c}</td><td className="num">{x.n}</td><td className="num">{origem === 'assistencia' ? x.total : eur(x.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="acoes" style={{ marginTop: 12 }}>
          <button disabled={ocupado || !aGravar.length || faltaObrigatorio.length > 0} onClick={gravar}>Gravar no portal</button>
          {faltaObrigatorio.length > 0 && <span className="small">Falta indicar: {faltaObrigatorio.map((c) => c.label).join(', ')}</span>}
        </div>
      </>}
    </Modal>
  );
}
