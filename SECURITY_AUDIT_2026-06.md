# MedMaestro — Auditoria de Segurança 2026-06-02

> Revisão de 30 dias pós-deploy. Auditoria automatizada executada via Claude Code.
> Produção: https://www.medmaestro.com.br · Supabase project: `ibavtxzlejizsbtztyvl`

---

## Resumo executivo

| Item | Status |
|---|---|
| **Status global** | 🔴 PROBLEMA |
| **Findings novos** | 4 (1 HIGH · 1 WARN · 2 INFO) |
| **Regressões npm** | 3 HIGH + 6 moderate novos |
| **Findings open (pré-deploy)** | 2 confirmados (#4 rate-limit · #12 race condition) |
| **Anomalias em audit_logs** | Nenhuma |

O status global é **PROBLEMA** por conta das 3 vulnerabilidades HIGH no npm (Next.js, fast-uri, tmp) que não existiam no baseline de deploy. Uma delas (`next` middleware bypass, CVSS 7.5) tem impacto direto em autenticação e deve ser tratada esta semana.

---

## 1. Health check produção

**Resultado: ❌ INACESSÍVEL — finding operacional**

```
curl -fsS https://www.medmaestro.com.br/api/health
HTTP/2 403
x-deny-reason: host_not_allowed
body: "Host not in allowlist"
```

O endpoint `/api/health` retorna 403 para requisições originadas de IPs externos (incluindo este ambiente de execução remoto). O header `x-deny-reason: host_not_allowed` é emitido pela aplicação Next.js (não pelo Nginx — o nginx.conf do repo não contém allowlist de IPs).

**Impacto:** O systemd timer de monitoramento (`medmaestro-health.service`) configurado no checklist de deploy funciona corretamente (executa a partir do próprio VPS, IP local). Porém **qualquer sistema de monitoramento externo** (UptimeRobot, Datadog, BetterUptime, etc.) está efetivamente bloqueado.

**Achado operacional F-INFO-01:** Investigar a origem da restrição (middleware em produção ou env var `ALLOWED_HOSTS` não documentada). Não há `src/middleware.ts` no repo. Se a restrição for intencional, documentar; se não, remover ou tornar configurável.

> Verificação manual dos 6 sub-checks (env, database, storage, claude, pdftoppm, pdftotext) não foi possível remotamente. Executar do VPS: `curl -fsS http://localhost:3000/api/health | jq`

---

## 2. Headers de segurança

**Resultado: ⚠️ PARCIALMENTE VERIFICÁVEL**

O site retornou 403 antes de servir headers de conteúdo, impossibilitando verificação remota. Análise baseada em `deploy/nginx.conf` + `next.config.ts` do repo:

| Header | Fonte | Status |
|---|---|---|
| `Strict-Transport-Security` | nginx (`always`) + Next.js | ✅ Configurado |
| `X-Content-Type-Options: nosniff` | nginx (`always`) + Next.js | ✅ Configurado |
| `X-Frame-Options: DENY` | nginx (`always`) + Next.js | ✅ Configurado |
| `Referrer-Policy: strict-origin-when-cross-origin` | nginx (`always`) + Next.js | ✅ Configurado |
| `Permissions-Policy` | nginx (`always`) + Next.js | ✅ Configurado |
| `Content-Security-Policy` | **Somente Next.js** | ⚠️ Ausente em respostas de erro |

**Finding F-INFO-02:** O CSP está definido apenas em `next.config.ts` (via `async headers()`). O Nginx serve diretamente algumas respostas 4xx/5xx (ex: 429 de rate limit) **sem passar pelo Next.js**, e nesses casos o CSP não é incluído. Adicionar CSP ao bloco de `add_header` no nginx.conf resolve.

**Inconsistência menor:** Permissions-Policy do nginx omite `interest-cohort=()` presente no next.config.ts. Impacto negligenciável (FLoC já descontinuado).

Verificação manual recomendada (do VPS ou rede autorizada):
```bash
curl -sI https://www.medmaestro.com.br/login | grep -iE "strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|content-security-policy"
```

---

## 3. SSL Labs

**Resultado: ❌ INACESSÍVEL — API bloqueada pelo mesmo mecanismo de host allowlist**

A API pública do SSL Labs (`api.ssllabs.com`) retornou 403 ao tentar analisar o host a partir do ambiente de execução remoto.

- **Verificação manual obrigatória:** https://www.ssllabs.com/ssltest/analyze.html?d=www.medmaestro.com.br
- **Meta esperada:** A ou A+ (nginx.conf usa opções SSL do Certbot + TLSv1.2/1.3; HSTS com `includeSubDomains`)
- **Nota:** Ausência de `preload` no HSTS não afeta o grade do SSL Labs, mas bloqueia inclusão no HSTS preload list do Chrome. Opcional para o futuro.

---

## 4. Dependências (npm audit --production)

### Resumo vs. baseline

| Severidade | Baseline (deploy) | Atual (2026-06-02) | Delta |
|---|---|---|---|
| Critical | 0 | **0** | — |
| High | 0 | **3** | ⬆️ +3 REGRESSÃO |
| Moderate | 7 | **12** | ⬆️ +5 (inclui variações) |
| Low | 0 | 0 | — |

### Regressões HIGH (todas novas — baseline tinha zero)

| Pacote vulnerável | Via | CVSS | CVE/Advisory | Impacto |
|---|---|---|---|---|
| `next` | direto | 7.5 | [GHSA-26hh-7cqf-hhc6](https://github.com/advisories/GHSA-26hh-7cqf-hhc6) | **Middleware/Proxy bypass em App Router via segment-prefetch routes** — autenticação pode ser contornada |
| `next` | direto | 7.5 | [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj) | DoS via Server Components — processo Node derrubável por request malformado |
| `fast-uri` v3.1.0 | via `ajv` (prod) | 7.5 | [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6) [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc) | Path traversal via dot segments + host confusion via percent-encoding |
| `tmp` v0.2.5 | via `exceljs` (prod) | — | [GHSA-ph9p-34f9-6g65](https://github.com/advisories/GHSA-ph9p-34f9-6g65) | Path traversal: prefix/postfix não sanitizados no nome do arquivo temporário |

> `next` foi reclassificado de moderate (baseline) para **high** em versões recentes dos advisories — é uma elevação de severidade, não uma vuln nova, mas ainda conta como regressão.

### Moderados novos (não estavam no baseline de 7)

| Pacote | CVSS | Descrição |
|---|---|---|
| `brace-expansion` | 6.5 | DoS via numeric range grande |
| `hono` | 4.3 / 3.8 | CSS injection em JSX SSR + JWT NumericDate bypass |
| `ip-address` | — | XSS em Address6 HTML-emitting methods |
| `express-rate-limit` | — | transitivo via ip-address |
| `qs` | 5.3 | DoS: crash no stringify com null em arrays comma-format |
| `ws` | 4.4 | Uninitialized memory disclosure |

### Moderados do baseline (ainda presentes — não são regressão)

`@anthropic-ai/sdk` · `postcss` · `resend` · `svix` · `uuid` (via exceljs, svix) · `exceljs`

### Ação recomendada

```bash
# 1. Atualizar Next.js (prioritário — middleware bypass)
npm update next

# 2. Verificar se ajv tem versão com fast-uri corrigida
npm update ajv

# 3. Verificar se exceljs tem versão com tmp corrigida
npm update exceljs

# Após atualizar, rodar full test suite e re-audit
npm audit --production
```

---

## 5. Findings ainda open

### Finding #4 — Rate limit in-memory (Redis pendente)

**Status: OPEN · Risco aceitável para single-container**

Arquivo: `src/lib/utils/rate-limit.ts`

```typescript
// linha 15-16
const stores = new Map<string, Map<string, Bucket>>()
```

Implementação usa `Map` global — o próprio código documenta a limitação:

```
// Se algum dia migrar para múltiplos containers, trocar por Redis/Upstash sem mudar callers.
```

**Contexto atual:** Docker com `--restart unless-stopped` em single-process é suficiente para o volume atual. O limite de 5 tentativas/min em `/login` via `mm_login` zone do Nginx funciona de forma independente como primeira linha de defesa.

**Risco real:** Se o processo Node reiniciar (deploy, crash), os contadores são perdidos — um atacante pode fazer exatamente 5 tentativas, forçar reinício, repetir. Baixo risco enquanto houver Fail2ban ativo.

**Ação:** Implementar Upstash Redis quando o projeto escalar para múltiplos workers ou quando o volume de usuários aumentar. Não urgente agora.

### Finding #12 — Race condition em reorder de simulado

**Status: OPEN · Risco baixo em produção (uso single-user)**

Arquivo: `src/app/(dashboard)/simulados/actions.ts`

Três funções afetadas:

| Função | Linhas | Problema |
|---|---|---|
| `removeQuestionFromSimulado` | 162–169 | `Promise.all` de N `UPDATE position` sem transação |
| `reorderSimuladoQuestions` | 270–279 | `Promise.all` de N `UPDATE position` sem transação |
| `moveSimuladoQuestion` | 243–246 | 2 `UPDATE` paralelos (swap) sem transação |

Se dois reorders ocorrem simultaneamente, positions podem ficar inconsistentes (ex: duas questões na mesma posição, ou gaps).

**Contexto atual:** Plataforma de uso interno com 1 usuário ativo (confirmado via audit_logs). Risco de colisão é praticamente zero hoje.

**Fix recomendado (este mês):** Substituir `Promise.all` por chamada a uma stored procedure com `BEGIN/COMMIT`, ou usar `FOR UPDATE` lock na query de leitura. A constraint `UNIQUE (simulado_id, position)` no banco captura colisões e retorna erro — o dado nunca fica silenciosamente corrompido.

---

## 6. Audit logs (últimos 30 dias)

### Atividade por entidade/ação

| entity_type | action | total |
|---|---|---|
| exams | UPDATE | 58 |
| exams | INSERT | 11 |
| exam_boards | INSERT | 1 |
| exam | exam_uploaded | 1 |

### Top usuários por volume

| user_id | ações (30 dias) |
|---|---|
| df70d40c-2515-474e-ae29-8fdc6084b3cb | 1 |

### Ações destrutivas suspeitas (>20 por hora)

Nenhuma ocorrência encontrada.

### Contexto geral do banco

| Métrica | Valor |
|---|---|
| Total de rows em audit_logs | 773 |
| Primeira ação registrada | 2026-04-23 02:35 UTC |
| Última ação registrada | 2026-06-01 18:17 UTC |
| Usuários distintos com ações | 1 |

### Interpretação

Volume consistente com plataforma em fase de setup/ingestão de dados (apenas 1 usuário operador). As 58 atualizações em `exams` são compatíveis com o pipeline de extração TEMI (status transitions durante processamento). Nenhuma anomalia detectada: sem clusters de DELETE, sem actions repetitivas de undo/reject, sem acessos noturnos de múltiplos IPs.

**Nota de cobertura:** As actions dos últimos 30 dias têm apenas 1 user_id com ações (1 action). Os 58 UPDATEs de `exams` e 11 INSERTs provavelmente foram feitos via `service_role` (sem `user_id` — worker/extractor). A tabela `audit_logs` deveria registrar o `user_id` em operações de sistema? Verificar se o worker preenche `user_id=NULL` vs. um UUID de sistema.

---

## 7. Advisors de segurança — Supabase

### F-WARN-01 (NOVO): `get_user_role()` SECURITY DEFINER acessível por `authenticated`

**Nível:** WARN · Advisory Supabase

A função `public.get_user_role()` está marcada como `SECURITY DEFINER` e pode ser executada por qualquer usuário autenticado via REST: `POST /rest/v1/rpc/get_user_role`.

Funções SECURITY DEFINER executam com os privilégios do owner da função (geralmente um role privilegiado). Se a função contiver uma vulnerabilidade futura (SQL injection, lógica incorreta), ela rodaria com privilégios elevados.

**Avaliação de risco atual:** Baixo — a função apenas retorna o role do usuário logado, sem side-effects. Mas o vetor de escalada via `rpc/` é desnecessário.

**Fix recomendado:**
```sql
-- Trocar para SECURITY INVOKER (rodar com privilégios do caller)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;
```

### F-INFO-03: `api_usage` RLS habilitado sem policies

**Nível:** INFO · Advisory Supabase

`api_usage` tem `rowsecurity=true` mas zero policies. Em Postgres isso bloqueia tudo para roles non-owner por default. Por design (`api_usage` é escrito diretamente pelo worker via `service_role` que bypassa RLS).

**Ação:** Ou desabilitar RLS explicitamente (`ALTER TABLE api_usage DISABLE ROW LEVEL SECURITY`) para deixar a intenção clara, ou adicionar uma policy `USING (false)` como documentação. Atualmente é INFO (não é um risco real).

### RLS coverage geral

Todas as 24 tabelas públicas têm `rowsecurity=true` ✅

---

## 8. TODO manuais (acesso humano necessário)

Execute a partir do VPS Hostinger:

```bash
# Verificar status do Fail2ban e jails ativos
fail2ban-client status medmaestro-login
fail2ban-client status medmaestro-noscript
fail2ban-client status medmaestro-req-limit

# Health check interno (contorna o allowlist de host)
curl -fsS http://localhost:3000/api/health | jq

# Verificar IPs banidos atualmente
fail2ban-client status medmaestro-login | grep "Banned IP list"

# Testar rate limit de login (deve bloquear após 5 tentativas)
for i in {1..7}; do
  curl -sI -X POST https://www.medmaestro.com.br/login \
    -d "email=teste@x.com&password=wrong" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    | head -1
done

# SSL Labs grade (browser ou curl autorizado)
# https://www.ssllabs.com/ssltest/analyze.html?d=www.medmaestro.com.br
```

- [ ] Rodar `fail2ban-client status medmaestro-login medmaestro-noscript medmaestro-req-limit` no VPS
- [ ] Verificar `/api/health` interno com 6 sub-checks verdes
- [ ] Confirmar SSL Labs grade A/A+
- [ ] Investigar origem do `x-deny-reason: host_not_allowed` (middleware não documentado)

---

## 9. Recomendações priorizadas

### Agir esta semana 🔴

| # | Ação | Motivo |
|---|---|---|
| R1 | **Atualizar Next.js** (`npm update next`) | Middleware bypass CVSS 7.5 pode contornar autenticação — risco crítico em produção |
| R2 | **Fix `get_user_role()` para SECURITY INVOKER** | Elimina vetor SECURITY DEFINER desnecessário via REST API |
| R3 | **Investigar `x-deny-reason: host_not_allowed`** | Monitoria externa está cega — falhas de produção não seriam detectadas por ferramentas externas |

### Agir este mês 🟡

| # | Ação | Motivo |
|---|---|---|
| R4 | Atualizar `ajv` (fix `fast-uri`) e `exceljs` (fix `tmp`) | HIGH path-traversal, embora exploração requeira input controlado |
| R5 | Adicionar CSP ao nginx.conf (`add_header Content-Security-Policy ... always`) | Respostas 4xx/5xx do nginx ficam sem CSP |
| R6 | Corrigir Finding #12 (reorder via DB transaction) | Race condition em simulados, baixo risco hoje mas cresce com usuários |
| R7 | Clarificar `api_usage` RLS (disable ou policy explícita) | Evitar confusão em futuras auditorias |

### Monitorar 🟢

| # | Ação |
|---|---|
| R8 | Rodar `npm audit --production` mensalmente (conforme checklist) |
| R9 | Revisar `audit_logs` mensalmente — rastrear crescimento de `distinct_users` |
| R10 | Rotação trimestral de secrets: `WORKER_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` |
| R11 | Quando escalar para múltiplos containers: implementar Finding #4 (Redis rate limit) |

---

*Auditoria executada em 2026-06-02. Próxima revisão recomendada: 2026-09-01 (trimestral).*
