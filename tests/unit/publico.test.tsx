import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
const mes = (m: number, e: number) => ({ mes: m, entradas: e, custosFuncionamento: 100, outrasDespesas: 10, saldo: e - 110 });
let comLogin = false;
const lerSites = vi.fn(() => sync({ ano: 2026, mesesFechados: [1], atualizadoEm: '2026-11-14T10:00:00Z', comunidades: [{ id: 'porto', nome: 'Porto', meses: [mes(1, 300)] }] }));

vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: comLogin ? { email: 'l@x.pt', papel: 'leitura', nivel: 'publico' } : null }) }));
vi.mock('../../src/lib/db', () => ({
  lerPublico: () => sync({ ano: 2026, mesesFechados: [1], atualizadoEm: '2026-11-14T10:00:00Z', site: { nome: 'CCLX', meses: [mes(1, 1000)] } }),
  lerPublicoSites: () => lerSites(),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync ?? null, erro: null, aCarregar: false, recarregar: async () => {} }; },
}));

describe('página pública', () => {
  it('sem login: só a visão do site CCLX', async () => {
    comLogin = false;
    const { default: Publico } = await import('../../src/pages/Publico');
    const html = renderToString(<Publico />);
    expect(html).toContain('Contas da CCLX');
    expect(html).toContain('1.000,00 €');
    expect(html).not.toContain('Porto');
    expect(lerSites).not.toHaveBeenCalled();
  });
  it('com login: pode escolher cada comunidade', async () => {
    comLogin = true;
    const { default: Publico } = await import('../../src/pages/Publico');
    const html = renderToString(<Publico />);
    expect(html).toContain('CCLX (todas as comunidades)');
    expect(html).toContain('Porto');
    expect(lerSites).toHaveBeenCalled();
  });
});
