import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Lote } from '../../src/lib/types';

const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
const lote = (origem: Lote['origem'], comunidadeId: string, mes: number, regs: Partial<Lote['registos'][number]>[]): Lote => ({
  id: `${origem}_${mes}_${comunidadeId}`, origem, ano: 2026, mes, periodo: `2026-${String(mes).padStart(2, '0')}`, comunidadeId,
  registos: regs.map((r, i) => ({ id: `${origem}-${mes}-${i}`, data: `2026-${String(mes).padStart(2, '0')}-0${i + 1}`, valor: 0, categoria: 'Dízimo', ...r })),
  total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '',
});
const LOTES: Record<string, Lote[]> = {
  contribuir: [lote('contribuir', 'almada', 3, [{ valor: 50, pessoaRef: 'Contribuinte #A1' }, { valor: 20, pessoaRef: 'Contribuinte #B2', categoria: 'Oferta' }]), lote('contribuir', 'bolsa-geral', 4, [{ valor: 100 }])],
  depositos: [lote('depositos', 'almada', 3, [{ valor: 230.5, categoria: 'Coletas em dinheiro' }])],
  assistencia: [
    lote('assistencia', 'almada', 3, [{ valor: 120, evento: 'Culto', extra: { jump: 8, criancas: 20, connects: 5 } }, { valor: 100, evento: 'Culto', extra: { jump: 6, criancas: 15 } }]),
    lote('assistencia', 'porto', 4, [{ valor: 40, evento: 'Culto' }]),
  ],
};

vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'm@x.pt', papel: 'master' }, pode: () => true, temNivel: () => true }) }));
vi.mock('../../src/lib/db', () => ({
  listarLotes: (_a: unknown, origem: string) => sync(LOTES[origem] ?? []),
  listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'porto', nome: 'Porto', ordem: 2 }]),
  lerEstadoSync: () => sync(null),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync, erro: null, aCarregar: false, recarregar: async () => {} }; },
  useFiltros: () => ({ ano: 2026, comunidade: 'todas' }),
}));

describe('páginas', () => {
  it('Assistência: mapa mensal em pessoas, sem €', async () => {
    const { default: Assistencia } = await import('../../src/pages/Assistencia');
    const html = renderToString(<Assistencia />);
    expect(html).toContain('Mapa mensal');
    expect(html).not.toContain('€');
    expect(html).toContain('>260<'); // total de jovens e adultos no ano (120+100+40)
    expect(html).toContain('>86,7<'); // média por registo (260/3)
    expect(html).toContain('>130,0<'); // média mensal (260/2 meses)
    expect(html).toContain('>314<'); // total de pessoas (149+121+40)
    expect(html).toContain('março');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/assistencia.html', html);
  });
  it('Entradas: junta contribuições e depósitos', async () => {
    const { default: EntradasConjunto } = await import('../../src/pages/EntradasConjunto');
    const html = renderToString(<EntradasConjunto />);
    expect(html).toContain('400,50 €'); // 50 + 20 + 100 + 230,50
    expect(html).toContain('170,00 €'); // contribuições
    expect(html).toContain('230,50 €'); // depósitos
    expect(html).toContain('Bolsa geral (sem comunidade)');
    expect(html).toContain('Depósito de coletas');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/entradas.html', html);
  });
});
