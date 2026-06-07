# Gotenberg — conversor DOCX/PPTX → PDF (serviço sidecar)

O caderno da prova agora aceita **PDF, DOCX e PPTX**. PDF segue direto no
pipeline; DOCX/PPTX são convertidos para PDF na ingestão por um serviço
**Gotenberg** (container Debian com LibreOffice + fontes embutidas). Mantém a
imagem do Next enxuta e isola a dependência pesada.

Sem `GOTENBERG_URL` configurado, o app continua funcionando: apenas o upload de
DOCX/PPTX retorna erro claro ("Conversão indisponível"). PDF não é afetado.

## 1. Subir o Gotenberg no Coolify

No Coolify, no mesmo projeto/servidor do MedMaestro, crie um novo recurso do
tipo **Docker Compose** (ou "Service") com:

```yaml
services:
  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped
    command:
      - gotenberg
      - --api-timeout=120s
    # NÃO exponha publicamente. Acesso só pela rede interna do Coolify.
    expose:
      - "3000"
```

Garanta que o serviço esteja na **mesma rede** do app MedMaestro para que o
hostname interno resolva (no Coolify, recursos do mesmo projeto compartilham a
rede). O nome do serviço (`gotenberg`) vira o hostname.

Requisitos de recurso: ~150–300 MB de RAM ocioso; cada conversão usa
~300–500 MB transitórios. Tranquilo no VPS atual (2 vCPU / 8 GB).

## 2. Configurar a env var no app

No app MedMaestro (Coolify → Environment Variables), adicione:

```
GOTENBERG_URL=http://gotenberg:3000
```

(Opcional) `GOTENBERG_TIMEOUT_MS=120000` para ajustar o timeout do app.

Redeploy do app após salvar a variável.

## 3. Validar

`GET https://medmaestro.com.br/api/health` deve mostrar, em `optional.gotenberg`,
`{ ok: true, detail: "online" }`. Então faça um upload de teste com um `.docx`
ou `.pptx` pequeno em **Lotes → Novo**.

## Notas

- O bucket `exam-pdfs` foi liberado para DOCX/PPTX/TXT/MD e o limite subiu para
  ~105 MB (migration `021`). O app limita o caderno a 100 MB.
- O arquivo original (DOCX/PPTX) é preservado em `…/prova.docx|pptx`
  (`exams.source_original_path`) e o PDF convertido vai em `…/prova.pdf`
  (`exams.source_pdf_path`), que é o que o pipeline consome.
