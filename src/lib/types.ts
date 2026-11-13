export type Papel = 'master' | 'caf' | 'tesoureiro' | 'leitura';
export type Nivel = 'publico' | 'privado' | 'confidencial';
export type Origem = 'contribuir' | 'depositos' | 'despesas' | 'assistencia';

export const NIVEIS: Nivel[] = ['publico', 'privado', 'confidencial'];
export const NIVEL_LABEL: Record<Nivel, string> = { publico: 'Público', privado: 'Privado', confidencial: 'Confidencial' };
export const PAPEL_LABEL: Record<Papel, string> = { master: 'Master', caf: 'CAF', tesoureiro: 'Tesoureiro', leitura: 'Leitura' };
export const nivelNum = (n: Nivel) => NIVEIS.indexOf(n);

// Contas Master fixas (iguais às das regras de segurança).
export const MASTER_EMAILS = ['tesouraria@cclx.pt', 'ricardoribeiro9@gmail.com', 'ricardoribeiro9@googlemail.com'];

export interface Perfil {
  email: string;
  nome?: string;
  papel: Papel;
  nivel: Nivel;
  comunidades: string[]; // ['*'] = todas
  ativo: boolean;
}

export interface Comunidade {
  id: string;
  nome: string;
  inicio?: string | null; // YYYY-MM-DD
  fim?: string | null;
  ordem: number;
  especial?: boolean; // bolsa geral
}

export interface Conta {
  id: string;
  nome: string;
  banco: string;
  tipo: 'principal' | 'investimentos' | 'corrente';
  etiqueta?: string;
}

export interface Categoria {
  id: string;
  nome: string;
  tipo: 'entrada' | 'saida';
  atividade: string;
  nivel: Nivel;
  snc?: string;
  origem?: string; // jotform, portal
}

/** Um registo individual dentro de um lote mensal. */
export interface Registo {
  id: string;
  data: string; // YYYY-MM-DD
  valor: number;
  categoria: string;
  descricao?: string;
  evento?: string;
  // Só no nível confidencial:
  pessoa?: string;
  nif?: string;
  email?: string;
  telefone?: string;
  iban?: string;
  // Nos dois níveis:
  pessoaRef?: string;
  extra?: Record<string, string | number>;
}

export interface Lote {
  id: string;
  origem: Origem;
  ano: number;
  mes: number;
  periodo: string; // YYYY-MM
  comunidadeId: string;
  registos: Registo[];
  total: number;
  n: number;
  atualizadoEm: string;
  atualizadoPor: string;
}

export interface MovBanco {
  id: string;
  data: string;
  descricao: string;
  valor: number; // + crédito, - débito
  saldo?: number | null;
  categoria?: string;
  comunidadeId?: string; // 'bolsa-geral' para ofertas sem comunidade
  contabilizar: boolean;
  conciliadoCom?: string | null;
  sugestao?: string | null;
}

export interface BancoLote {
  id: string;
  contaId: string;
  ano: number;
  mes: number;
  periodo: string;
  registos: MovBanco[];
  atualizadoEm: string;
  atualizadoPor: string;
}

export interface CustoFixo {
  id: string;
  comunidadeId: string;
  rubrica: string;
  valorMensal: number;
  inicio: string; // YYYY-MM
  fim: string | null;
  nivel: Nivel;
  notas?: string;
}

export interface ResumoMes {
  mes: number;
  contribuir: number;
  coletas: number;
  transferencias: number;
  quotaBolsa: number;
  entradas: number;
  custosFixos: number;
  despesas: number;
  saidas: number;
  saldo: number;
  adultosMedia: number | null;
  entradasPorCategoria: Record<string, number>;
  despesasPorCategoria: Record<string, number>;
  custosRubricas: Record<string, number>; // só rubricas não confidenciais
  n: { contribuir: number; coletas: number; transferencias: number; despesas: number };
}

export interface Resumo {
  id: string;
  ano: number;
  comunidadeId: string;
  meses: ResumoMes[];
  calculadoEm: string;
  calculadoPor: string;
}

export interface PublicoMes {
  mes: number;
  entradas: number | null;
  custosFuncionamento: number | null;
  outrasDespesas: number | null;
  saldo: number | null;
}

export interface Publico {
  ano: number;
  comunidades: { id: string; nome: string; meses: PublicoMes[] }[];
  mesesFechados: number[];
  atualizadoEm: string;
}

export interface LinhaOrcamento {
  comunidadeId: string;
  grupo: 'entradas' | 'custosFixos' | 'despesas';
  categoria: string;
  anual: number;
}

export interface Orcamento {
  ano: number;
  estado: 'rascunho' | 'aprovado';
  versao: number;
  linhas: LinhaOrcamento[];
  base: string;
  atualizadoEm: string;
  atualizadoPor: string;
  aprovadoEm?: string;
  aprovadoPor?: string;
}

export interface Fecho {
  periodo: string;
  estado: 'fechado' | 'aberto';
  por: string;
  em: string;
}
