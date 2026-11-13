import type { Categoria, Comunidade, Conta, CustoFixo } from './types';

/** Comunidades da CCLX. O Barreiro existiu até 31/10/2026 e unificou-se com a Moita a 01/11/2026. */
export const COMUNIDADES: Comunidade[] = [
  { id: 'almada', nome: 'Almada', ordem: 1 },
  { id: 'acores', nome: 'Açores', ordem: 2 },
  { id: 'moita', nome: 'Moita', ordem: 3 },
  { id: 'porto', nome: 'Porto', ordem: 4 },
  { id: 'coruche', nome: 'Coruche', ordem: 5 },
  { id: 'sede', nome: 'Sede', ordem: 6 },
  { id: 'caldas-da-rainha', nome: 'Caldas da Rainha', ordem: 7 },
  { id: 'barreiro', nome: 'Barreiro', ordem: 8, fim: '2026-10-31' },
  { id: 'bolsa-geral', nome: 'Bolsa geral (não atribuído)', ordem: 99, especial: true },
];

/** Nomes alternativos usados nos formulários Jotform. */
export const ALIASES: Record<string, string> = {
  almada: 'almada',
  acores: 'acores',
  'sao miguel': 'acores',
  'ponta delgada': 'acores',
  moita: 'moita',
  porto: 'porto',
  coruche: 'coruche',
  sede: 'sede',
  lisboa: 'sede',
  'caldas da rainha': 'caldas-da-rainha',
  caldas: 'caldas-da-rainha',
  cdr: 'caldas-da-rainha',
  barreiro: 'barreiro',
  'moita barreiro': 'moita',
  'barreiro moita': 'moita',
};

export const CONTAS: Conta[] = [
  { id: 'cgd-principal', nome: 'CGD · Conta principal', banco: 'Caixa Geral de Depósitos', tipo: 'principal', etiqueta: 'Ligada à contabilidade' },
  { id: 'cgd-investimentos', nome: 'CGD · Conta investimentos', banco: 'Caixa Geral de Depósitos', tipo: 'investimentos', etiqueta: '(Conta investimentos)' },
  { id: 'santander', nome: 'Santander', banco: 'Santander', tipo: 'corrente' },
];

const c = (nome: string, tipo: Categoria['tipo'], atividade: string, nivel: Categoria['nivel'] = 'privado'): Categoria => ({
  id: `${tipo}-${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  nome, tipo, atividade, nivel, snc: '', origem: 'portal',
});

/** Categorias iniciais por atividade. As contas SNC-ESNL ficam por preencher com o contabilista. */
export const CATEGORIAS: Categoria[] = [
  c('Dízimos', 'entrada', 'Contribuições'),
  c('Ofertas', 'entrada', 'Contribuições'),
  c('Coletas em dinheiro', 'entrada', 'Contribuições'),
  c('Missões', 'entrada', 'Missões'),
  c('Ação social', 'entrada', 'Ação social'),
  c('Obras', 'entrada', 'Obras'),
  c('Eventos', 'entrada', 'Eventos'),
  c('Outras entradas', 'entrada', 'Outros'),
  c('Renda', 'saida', 'Funcionamento'),
  c('Vencimentos', 'saida', 'Funcionamento', 'confidencial'),
  c('Segurança Social', 'saida', 'Funcionamento', 'confidencial'),
  c('Luz', 'saida', 'Funcionamento', 'publico'),
  c('Água', 'saida', 'Funcionamento', 'publico'),
  c('Internet', 'saida', 'Funcionamento', 'publico'),
  c('Cultos', 'saida', 'Cultos'),
  c('Jovens', 'saida', 'Jovens'),
  c('Crianças', 'saida', 'Crianças'),
  c('Ação social', 'saida', 'Ação social'),
  c('Missões', 'saida', 'Missões'),
  c('Eventos', 'saida', 'Eventos'),
  c('Comissões bancárias', 'saida', 'Funcionamento', 'publico'),
  c('Outras despesas', 'saida', 'Outros'),
];

/** Custos fixos reais de Caldas da Rainha (ficheiro Custos_x_Entrada_CDR.xlsx e indicações da tesouraria). */
export const CUSTOS_FIXOS_CDR: CustoFixo[] = [
  { id: 'cdr-renda-2025', comunidadeId: 'caldas-da-rainha', rubrica: 'Renda', valorMensal: 612.96, inicio: '2025-01', fim: '2025-12', nivel: 'privado' },
  { id: 'cdr-renda-2026', comunidadeId: 'caldas-da-rainha', rubrica: 'Renda', valorMensal: 626.69, inicio: '2026-01', fim: null, nivel: 'privado' },
  { id: 'cdr-vencimentos', comunidadeId: 'caldas-da-rainha', rubrica: 'Vencimentos', valorMensal: 750, inicio: '2025-01', fim: null, nivel: 'confidencial' },
  { id: 'cdr-seguranca-social', comunidadeId: 'caldas-da-rainha', rubrica: 'Segurança Social', valorMensal: 113.05, inicio: '2025-01', fim: null, nivel: 'confidencial', notas: 'Valor de 2025 assumido igual ao de 2026 (pendente de confirmação).' },
  { id: 'cdr-luz', comunidadeId: 'caldas-da-rainha', rubrica: 'Luz', valorMensal: 55.98, inicio: '2025-01', fim: null, nivel: 'publico' },
  { id: 'cdr-agua', comunidadeId: 'caldas-da-rainha', rubrica: 'Água', valorMensal: 29.42, inicio: '2025-01', fim: null, nivel: 'publico' },
  { id: 'cdr-internet', comunidadeId: 'caldas-da-rainha', rubrica: 'Internet', valorMensal: 23, inicio: '2025-01', fim: null, nivel: 'publico' },
];

/** Formulários Jotform (só leitura). */
export const JOTFORM_FORMS = {
  contribuir: { id: '240093000783346', nome: 'CCLX - CONTRIBUIR' },
  depositos: { id: '240082801669356', nome: 'CCLX - REGISTO DE DEPÓSITOS' },
  despesas: { id: '233304995902359', nome: 'CCLX - REGISTO DE DESPESAS' },
  assistencia: { id: '252725639553364', nome: 'CCLX : Registo de Presenças' },
} as const;
