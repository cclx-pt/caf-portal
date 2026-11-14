# Portal CAF · CCLX

Portal de gestão financeira do **Conselho Administrativo e Financeiro (CAF)** da CCLX (NIF 592015246).
Prova de conceito (PoC) funcional, com a identidade visual CAF (preto, branco e cinzentos; Montserrat).

- **Aplicação:** https://cclx-pt.github.io/caf-portal/
- **Página pública (sem login):** https://cclx-pt.github.io/caf-portal/#/publico
- **Firebase:** projeto `cclx-caf-portal` (Firestore em `europe-west1`, plano gratuito Spark)

## O que faz

| Área | Descrição |
|---|---|
| Painel | Custos x entradas por comunidade e consolidado, por mês, com cobertura dos custos fixos |
| Entradas, Depósitos, Reembolsos, Assistência | Só recebem e apresentam os dados dos formulários Jotform (importação CSV/Excel ou sincronização pela API) |
| Bancos e bolsa geral | Importação de extratos CGD e Santander, conciliação automática com o Jotform, ofertas sem comunidade na bolsa geral e distribuição pela assistência de adultos do mesmo mês |
| Custos fixos | Tabela por comunidade, rubrica e período (início/fim), com nível de privacidade |
| Orçamento | Proposta gerada a partir do histórico, edição, aprovação pelo CAF, versões, previsto vs real com alertas de desvio > 10% |
| Fecho mensal | O CAF fecha meses (bloqueia alterações) e publica a página pública |
| Exportação | Excel mensal para o contabilista (movimentos + resumo) |
| Administração | CRUD de comunidades, contas bancárias (com IBAN validado) e categorias; utilizadores e perfis; ligação ao Jotform; auditoria |

## Login

- **Google** (OAuth).
- **Email sem senha:** a pessoa indica o email e recebe um link de acesso de uso único (Firebase Email Link). Não há senhas guardadas.
- Só entra quem tiver perfil ativo (ou for Master). O email tem de estar verificado (Google e link de email já o garantem).
- Um código numérico por email exigiria uma função no servidor e um serviço de envio de email (plano Blaze); fica como evolução.

## Perfis e privacidade

| Perfil | Âmbito | Pode |
|---|---|---|
| Master (`tesouraria@cclx.pt` e a conta do Ricardo Ribeiro) | Toda a CCLX | Tudo |
| CAF | Toda a CCLX | Criar, alterar e apagar entidades e custos fixos; importar; bancos; aprovar orçamento; fechar meses; publicar |
| Tesoureiro | A sua comunidade | Importar dados Jotform da sua comunidade; consultar |
| Leitura | Comunidades atribuídas | Consultar até ao nível definido |

Níveis: **Público** (sem login, só totais de meses fechados, grupos com menos de 3 registos escondidos, vencimentos dentro de "Custos de funcionamento"), **Privado** (detalhe com pseudónimos, sem nomes/NIF/email/IBAN), **Confidencial** (tudo).
A privacidade é imposta nas [regras do Firestore](firestore.rules), testadas em [tests/rules](tests/rules).

## Modelo de dados (Firestore)

- `users/{email}`: perfil (papel, nível, comunidades, ativo). Os Master estão fixos nas regras.
- `comunidades`, `contas`, `categorias`: configuração. O Barreiro termina a 31/10/2026; desde 01/11/2026 os registos do Barreiro contam para a Moita.
- `lotes_conf/{origem_ano_mes_comunidade}`: registos Jotform com dados pessoais (confidencial).
- `lotes/{...}`: os mesmos registos sem dados pessoais (privado). Lotes mensais em vez de um documento por registo, para caber no plano gratuito.
- `banco_lotes/{conta_ano_mes}`: movimentos bancários e a sua classificação (master e CAF).
- `custos_fixos`, `resumos/{ano_comunidade}`, `publico/{ano}`, `orcamentos/{ano}`, `orcamentos_versoes`, `fechos/{AAAA-MM}`, `auditoria`.

**Regras de cálculo.** Entradas = Contribuir + coletas depositadas + transferências bancárias atribuídas + quota da bolsa geral.
Saídas = custos fixos (tabela, meses decorridos) + despesas e reembolsos do Jotform + débitos bancários marcados para contabilizar.
Movimentos bancários conciliados com o Jotform não contam duas vezes.

## Desenvolvimento

```bash
npm ci
npm run dev          # http://localhost:5173/caf-portal/
npm test             # lógica: importação, resumos, extratos
npm run test:rules   # regras de segurança no emulador (precisa de Java)
npm run build
```

Publicação: cada push para `main` publica no GitHub Pages ([pages.yml](.github/workflows/pages.yml)).
As regras do Firestore publicam-se com `npx firebase deploy --only firestore:rules` (ou colando `firestore.rules` na consola).

## Primeiros passos

1. Entrar com a conta Master (Google).
2. **Configuração → Inicializar dados de referência** (comunidades, contas, categorias, custos fixos reais de Caldas da Rainha).
3. Importar as exportações Jotform (Entradas, Depósitos, Reembolsos, Assistência) ou configurar a chave da API Jotform e sincronizar.
4. **Painel → Recalcular resumos.** Depois, em **Fecho mensal**, fechar os meses revistos e publicar.
5. Em **Utilizadores**, dar acesso ao CAF, aos tesoureiros (uma comunidade cada) e aos leitores.

## Decisões tomadas no PoC

- Só o Master e o CAF alteram entidades (comunidades, contas, categorias) e custos fixos. Entidades com dados associados não se apagam: desativam-se (`ativo = false`) e deixam de aparecer nas listas de escolha, mantendo o histórico. A verificação de dados associados é feita na aplicação; as regras limitam quem pode apagar.
- A chave da API Jotform fica, por agora, no Firestore (só o Master a lê) e a sincronização corre no browser do Master.

- Plano gratuito (Spark): sem Cloud Functions. Os cálculos e a anonimização correm no browser de quem importa; as regras garantem que cada perfil só lê o seu nível.
- Alojamento no GitHub Pages (sem credenciais no GitHub) em vez do Firebase Hosting.
- Lotes mensais por comunidade (um documento por mês, origem e comunidade) para respeitar os limites de escrita do plano gratuito.
- Importar um ficheiro substitui os meses que ele contém; usar sempre meses completos.
- Pseudónimos: SHA-256 do NIF/email/nome com um sal fixo (estável entre importações).
- Contas SNC-ESNL das categorias ficam vazias até serem definidas com o contabilista.
- Segurança Social de 2025 em Caldas da Rainha assumida igual à de 2026 (113,05 €).

## Decisões críticas pendentes

1. **Chave da API Jotform (evolução):** decidido manter no Firestore por agora. Quando houver plano Blaze: Cloud Function agendada e Secret Manager.
2. **Plano Blaze:** necessário para sincronização automática, cópias de segurança agendadas e cálculos no servidor (dados confidenciais deixam de passar pelo browser).
3. **Propriedade do projeto Firebase:** adicionar `tesouraria@cclx.pt` como Owner (hoje está numa conta pessoal).
4. **Sal dos pseudónimos:** mover para um segredo no servidor (com o sal público, um pseudónimo pode ser confirmado por quem já conhece o NIF/email).
5. **Formato para o contabilista** e **mapa de contas SNC-ESNL** por categoria.
6. **Retenção de dados (RGPD)** e acordos de tratamento de dados com a Jotform e a Google.
7. **Verificação em dois passos** para Master e CAF (Identity Platform).
8. **Login por código numérico** (OTP por email) em vez de link: requer função no servidor e serviço de email.
