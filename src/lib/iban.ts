/** Normaliza um IBAN: maiúsculas, sem espaços. */
export const limparIban = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** Formata em grupos de 4 (PT50 0035 0000 ...). */
export const formatarIban = (s?: string) => (s ? limparIban(s).replace(/(.{4})/g, '$1 ').trim() : '');

/** Valida o IBAN pelo algoritmo mod 97 (ISO 13616). Portugal: 25 caracteres, começa por PT50. */
export function ibanValido(s: string): boolean {
  const iban = limparIban(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('PT') && iban.length !== 25) return false;
  const rearranjado = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const ch of rearranjado) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}
