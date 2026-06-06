---
name: medmaestro-deploy
description: >
  Commit + push + deploy do MedMaestro em produção (Next.js na VPS via Coolify).
  Use SEMPRE que o usuário pedir: commit, commit e deploy, subir para produção,
  publicar, colocar no ar, fazer deploy, redeploy, "manda pro GitHub", ou qualquer
  variação de tornar as mudanças acessíveis em https://medmaestro.com.br. Cobre o
  procedimento seguro (curadoria de arquivos, push autenticado na máquina do
  usuário, disparo do deploy no Coolify e verificação do /api/health).
---

# MedMaestro — commit & deploy

Procedimento canônico para levar mudanças locais até a produção.

## Topologia (o que roda onde)

- **Repositório git:** raiz = a pasta `app/` (origin `github.com/andrelima-coder/medmaestro`, branch `main`).
- **Produção:** Next.js em container Docker numa VPS, gerenciado pelo **Coolify**
  (`http://187.77.250.197:8000`). App uuid `ldtodn3k88mw50ortjjw8ib0`.
- **Deploy é MANUAL** — não há webhook de auto-deploy. `git push` **não** publica
  sozinho; é preciso disparar o "Redeploy" (botão no painel ou endpoint da API).
- **Domínio / health:** `https://medmaestro.com.br` · health `https://medmaestro.com.br/api/health`.

## Limitações do ambiente (importante)

O sandbox do agente **não** tem credenciais de git nem alcança o IP privado do
Coolify. Portanto:

- **Push:** roda na máquina do usuário (Mac), via script `.command` de duplo-clique
  (as credenciais do git já estão salvas lá). Não tente `git push` pelo sandbox.
- **Deploy no Coolify:** ou pelo script `.command` (curl à API, o Mac alcança o IP),
  ou pelo botão **Redeploy** no painel via Claude in Chrome. Não pelo sandbox.

## Regras de segurança (não violar)

1. **Nunca `git commit -a` cego.** Há WIP e arquivos potencialmente "stale" no
   working tree. Sempre rode `git status` antes e confira o que vai entrar.
2. **Cuidado com os 5 arquivos do extrator** (`src/lib/extrator/core/pipeline.ts`,
   `core/text-first.ts`, `core/types.ts`, `bancas/amib_temi.ts`, `gabarito/run.ts`).
   Se aparecerem com **grandes deleções**, são cópias antigas que reverteriam
   trabalho — **aborte** e restaure com `git checkout HEAD -- <arquivo>`
   (ver `PIPELINE_DEFINICOES.md`, seção 3).
3. **Não commitar segredos.** `.env.local` e `.env.coolify` são ignorados pelo git —
   mantenha assim. Chaves só nas envs do Coolify.
4. **Pré-deploy de mudanças sensíveis:** criar tag de checkpoint antes
   (`git tag pre-deploy-AAAA-MM-DD-HHMM`) para rollback rápido.

## Fluxo recomendado

### 1. Curar o que entra no commit
Rode `git status -s` (na máquina do usuário). Para mudanças focadas, prefira uma
lista explícita de arquivos (como em `commit_push_docling.command`). Para um lote
rotineiro já revisado, `git add -A` é aceitável **depois** de inspecionar o status.

### 2. Commit + push + deploy (um duplo-clique)
Oriente o usuário a rodar **`mm_commit_deploy.command`** (na raiz do projeto). Ele:
mostra o `git status`, pede a mensagem do commit (ENTER vazio aborta), faz
`git add -A` + commit + `git push origin main`, dispara o deploy no Coolify (se
houver `app/.env.coolify`) e fica verificando o `/api/health` até ficar `ok`.

### 3. Só deploy (sem commit)
Quando o código já está no GitHub e falta só publicar: **`mm_deploy.command`**
(dispara o Redeploy + verifica health). Alternativa sem token: abrir o Coolify e
clicar **Redeploy** (via Claude in Chrome) — o agente sabe os uuids.

### 4. Verificar
`https://medmaestro.com.br/api/health` deve retornar `"status":"ok"` com
`database`, `storage`, `claude`, `pdftoppm`, `pdftotext` todos `ok`. Se mexeu em
variável `NEXT_PUBLIC_*`, confirme também o `/login` no navegador (essas variáveis
são embutidas no build; exigem **Redeploy**, não basta Restart).

## Token do Coolify (uma vez, opcional mas recomendado)

Para o deploy automático via API, copie `app/.env.coolify.example` para
`app/.env.coolify` e preencha `COOLIFY_API_TOKEN` (Coolify → Keys & Tokens → API
tokens; formato `N|xxxx`, com `|` literal). Sem o token, use o botão Redeploy.

## Endpoints úteis (Coolify API)

- Disparar deploy: `GET /api/v1/deploy?uuid=<APP_UUID>&force=true` (Bearer token).
- Listar apps: `GET /api/v1/applications`.
- (O `POST /applications/{uuid}/deploy` NÃO existe — retorna "Not found".)

## Coordenadas Coolify (referência)

- BASE: `http://187.77.250.197:8000`
- project `k9juxa8i6jd6ex98u8tcztf8` · environment `b3ns56ou7kcugkr7qproyiee` · application `ldtodn3k88mw50ortjjw8ib0`
