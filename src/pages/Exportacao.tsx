import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { mensagemErro, useFiltros } from '../components/ui';
import { auditar, listarBanco, listarCategorias, listarComunidades, listarContas, listarLotes, listarResumos } from '../lib/db';
import { MESES, periodo, r2 } from '../lib/format';

/** Exportação mensal para o contabilista: folha de movimentos e folha de resumo. */
export default function Exportacao() {
  const { acesso } = useAuth();
  const { ano } = useFiltros();
  const [mes, setMes] = useState(Math.max(1, new Date().getMonth()));
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function exportar() {
    setOcupado(true); setMsg(null);
    try {
      const [coms, contas, cats, contribuir, depositos, despesas, banco, resumos] = await Promise.all([
        listarComunidades(), listarContas(), listarCategorias(),
        listarLotes(acesso!, 'contribuir', ano, true), listarLotes(acesso!, 'depositos', ano, true), listarLotes(acesso!, 'despesas', ano, true),
        listarBanco(ano), listarResumos(acesso!, ano),
      ]);
      const nomeC = new Map(coms.map((c) => [c.id, c.nome]));
      const nomeConta = new Map(contas.map((c) => [c.id, c.nome + (c.tipo === 'investimentos' ? ' (Conta investimentos)' : '')]));
      const snc = new Map(cats.map((c) => [`${c.tipo}|${c.nome}`, c.snc ?? '']));
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Portal CAF · CCLX';
      const ws = wb.addWorksheet('Movimentos');
      ws.columns = [
        { header: 'Data', key: 'data', width: 12 }, { header: 'Origem', key: 'origem', width: 16 }, { header: 'Conta bancária', key: 'conta', width: 30 },
        { header: 'ID do movimento', key: 'id', width: 22 }, { header: 'Descrição', key: 'descricao', width: 40 }, { header: 'Comunidade', key: 'comunidade', width: 22 },
        { header: 'Categoria', key: 'categoria', width: 24 }, { header: 'Conta SNC-ESNL', key: 'snc', width: 16 }, { header: 'Débito (€)', key: 'debito', width: 14 },
        { header: 'Crédito (€)', key: 'credito', width: 14 }, { header: 'Referência Jotform', key: 'ref', width: 22 }, { header: 'Estado de reconciliação', key: 'estado', width: 26 },
      ];
      const sel = <T extends { mes: number }>(xs: T[]) => xs.filter((x) => x.mes === mes);
      for (const [origem, lotes, tipo] of [['Contribuir', contribuir, 'entrada'], ['Depósito de coleta', depositos, 'entrada'], ['Despesa/reembolso', despesas, 'saida']] as const) {
        for (const l of sel(lotes)) for (const r of l.registos) ws.addRow({
          data: r.data, origem, conta: '', id: r.id, descricao: r.evento ?? '', comunidade: nomeC.get(l.comunidadeId) ?? l.comunidadeId, categoria: r.categoria,
          snc: snc.get(`${tipo}|${r.categoria}`) ?? '', debito: tipo === 'saida' ? r.valor : null, credito: tipo === 'entrada' ? r.valor : null, ref: `jotform:${r.id}`, estado: 'Registo Jotform',
        });
      }
      for (const l of sel(banco)) for (const m of l.registos) ws.addRow({
        data: m.data, origem: 'Extrato bancário', conta: nomeConta.get(l.contaId) ?? l.contaId, id: m.id, descricao: m.descricao,
        comunidade: m.comunidadeId ? nomeC.get(m.comunidadeId) ?? m.comunidadeId : '', categoria: m.categoria ?? '', snc: m.categoria ? snc.get(`${m.valor > 0 ? 'entrada' : 'saida'}|${m.categoria}`) ?? '' : '',
        debito: m.valor < 0 ? -m.valor : null, credito: m.valor > 0 ? m.valor : null, ref: m.conciliadoCom ?? '',
        estado: m.conciliadoCom ? 'Conciliado com Jotform' : m.contabilizar ? 'Contabilizado' : 'Por classificar',
      });
      const r1 = wb.addWorksheet('Resumo');
      r1.columns = [{ header: 'Comunidade', key: 'c', width: 28 }, { header: 'Entradas (€)', key: 'e', width: 14 }, { header: 'Custos fixos (€)', key: 'f', width: 16 }, { header: 'Despesas (€)', key: 'd', width: 14 }, { header: 'Saldo (€)', key: 's', width: 14 }];
      for (const r of resumos) { const x = r.meses[mes - 1]; r1.addRow({ c: nomeC.get(r.comunidadeId) ?? r.comunidadeId, e: x.entradas, f: x.custosFixos, d: x.despesas, s: x.saldo }); }
      r1.addRow({});
      r1.addRow({ c: 'Saldos bancários (último do mês, segundo o extrato)' });
      for (const c of contas) {
        const regs = sel(banco).filter((l) => l.contaId === c.id).flatMap((l) => l.registos).filter((m) => m.saldo != null);
        r1.addRow({ c: nomeConta.get(c.id), s: regs.length ? r2(regs[regs.length - 1].saldo!) : null });
      }
      for (const w of [ws, r1]) {
        w.getRow(1).font = { name: 'Montserrat', bold: true, color: { argb: 'FFFFFFFF' } };
        w.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
        w.eachRow((row, i) => { if (i > 1) row.font = { name: 'Montserrat' }; });
        w.columns.forEach((col) => { if (/€/.test(String(col.header))) col.numFmt = '#,##0.00 "€"'; });
      }
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `CCLX_contabilidade_${periodo(ano, mes)}.xlsx`; a.click(); URL.revokeObjectURL(url);
      await auditar(acesso!.email, 'exportar contabilidade', periodo(ano, mes));
      setMsg(`Ficheiro de ${MESES[mes - 1]} ${ano} gerado.`);
    } catch (e) { setMsg(mensagemErro(e)); } finally { setOcupado(false); }
  }

  return (
    <>
      <h1>Exportação para o contabilista</h1>
      <p className="muted">Um ficheiro Excel por mês: folha <b>Movimentos</b> (registos Jotform e extratos, com conta SNC-ESNL e estado de reconciliação) e folha <b>Resumo</b> (por comunidade e saldos bancários). Formato proposto; ajustável quando o contabilista indicar o seu.</p>
      {msg && <div className="nota">{msg}</div>}
      <div className="linha">
        <label className="campo">Mês
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m} {ano}</option>)}</select>
        </label>
        <button disabled={ocupado} onClick={exportar}>{ocupado ? 'A gerar…' : 'Descarregar Excel'}</button>
      </div>
    </>
  );
}
