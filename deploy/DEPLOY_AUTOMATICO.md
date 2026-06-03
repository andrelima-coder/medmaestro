# Deploy automático (CI → VPS)

Pipeline: a cada `git push` na branch **main**, o GitHub Actions
(`.github/workflows/deploy.yml`) conecta via SSH na VPS Hostinger, atualiza o
código, reconstrói a imagem Docker do Next.js e reinicia o container, com
health check em `/api/health`.

> Importante: o app depende de binários de sistema (poppler-utils, tesseract)
> para a extração. Por isso o alvo é **VPS + Docker**, e não plataformas
> serverless (Vercel/Netlify), que não rodam esses binários.

## Pré-requisitos na VPS (uma vez)

1. **Docker** instalado e usuário de deploy no grupo `docker`.
2. **Repositório clonado** no diretório que será `VPS_APP_DIR`
   (ex.: `/opt/medmaestro`), com `origin` apontando para o GitHub e a branch `main`.
3. **Arquivo de env de produção** (ex.: `/opt/medmaestro/.env.production`) com as
   variáveis de runtime (NÃO versionar):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   NEXT_PUBLIC_APP_URL=https://medmaestro.SEUDOMINIO.com.br
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=...
   WORKER_SECRET=...
   RESEND_API_KEY=...
   ```
4. **nginx + TLS** conforme `deploy/HARDENING_CHECKLIST.md` (proxy para 127.0.0.1:3000).

## Secrets do repositório (GitHub → Settings → Secrets and variables → Actions)

| Secret | Exemplo | Uso |
|---|---|---|
| `VPS_HOST` | `123.45.67.89` | IP/host SSH da VPS |
| `VPS_USER` | `deploy` | usuário SSH (não-root) |
| `VPS_SSH_KEY` | (chave privada) | par da chave pública instalada na VPS |
| `VPS_APP_DIR` | `/opt/medmaestro` | diretório do repo na VPS |
| `VPS_ENV_FILE` | `/opt/medmaestro/.env.production` | env de runtime do container |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ibavtxzlejizsbtztyvl.supabase.co` | build arg |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | build arg |
| `NEXT_PUBLIC_APP_URL` | `https://medmaestro.SEUDOMINIO.com.br` | build arg |

Para o cron já existente (`worker-tick.yml`) também são necessários:
`APP_URL` e `WORKER_SECRET`.

## Ativação

1. Faça o **push** desta branch para o GitHub (o workflow passa a existir lá).
2. Cadastre os secrets acima.
3. Dispare o primeiro deploy: faça um push em `main` **ou** rode manualmente em
   Actions → "Deploy (VPS)" → *Run workflow*.
4. A partir daí, todo push em `main` faz deploy sozinho.

## Rollback rápido

Na VPS: `git reset --hard <commit_anterior>` e rode o workflow manualmente
(ou `docker run` da imagem anterior, se mantida com tag).
