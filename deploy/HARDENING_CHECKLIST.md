# MedMaestro — VPS Hostinger Hardening Checklist

Sequência mínima para o VPS Hostinger KVM2 antes de receber tráfego real.

## 1. Firewall — UFW

```bash
# SSH primeiro (não trave a si mesmo!)
ufw allow OpenSSH

# HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Bloqueia o resto
ufw default deny incoming
ufw default allow outgoing

# Liga
ufw enable
ufw status verbose
```

**Verificação:** `nmap -p- $IP_DO_VPS` de outra máquina deve mostrar só 22, 80, 443.

## 2. SSH hardening

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no       # só chave SSH
PubkeyAuthentication yes
AllowUsers seu_user             # whitelist
ClientAliveInterval 300
MaxAuthTries 3

systemctl reload ssh
```

Crie usuário não-root para deploy + chave SSH antes de aplicar isso, senão você se tranca fora.

## 3. Nginx

```bash
apt install nginx
cp deploy/nginx.conf /etc/nginx/sites-available/medmaestro
sed -i 's/SEUDOMINIO\.com\.br/seudominio-real.com.br/g' /etc/nginx/sites-available/medmaestro
ln -s /etc/nginx/sites-available/medmaestro /etc/nginx/sites-enabled/

# Cria proxy_params se não existir
cat > /etc/nginx/proxy_params <<'EOF'
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
EOF

nginx -t
systemctl reload nginx
```

## 4. TLS — Let's Encrypt

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d medmaestro.seudominio.com.br

# Auto-renew (já vem em timer do systemd; confirme):
systemctl status certbot.timer
```

## 5. Fail2ban

```bash
apt install fail2ban

# Cria os filtros
cat > /etc/fail2ban/filter.d/medmaestro-noscript.conf <<'EOF'
[Definition]
failregex = ^<HOST>.*"(GET|POST|HEAD).*HTTP.*" (401|403|404) .*$
ignoreregex =
EOF

cat > /etc/fail2ban/filter.d/medmaestro-req-limit.conf <<'EOF'
[Definition]
failregex = limiting requests, excess: .* by zone .*, client: <HOST>
ignoreregex =
EOF

cat > /etc/fail2ban/filter.d/medmaestro-login.conf <<'EOF'
[Definition]
failregex = ^<HOST>.*"POST /login HTTP.*" 4\d\d .*$
ignoreregex =
EOF

cp deploy/fail2ban-medmaestro.conf /etc/fail2ban/jail.d/medmaestro.conf

systemctl restart fail2ban
fail2ban-client status
```

## 6. Docker + Container

Use o `Dockerfile` existente (já instala `poppler-utils` + `tesseract`):

```bash
docker build -t medmaestro:latest .
docker run -d --name medmaestro \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file /etc/medmaestro/.env.production \
  --memory 1.5g --cpus 1.5 \
  --read-only \
  --tmpfs /tmp \
  --security-opt no-new-privileges:true \
  medmaestro:latest
```

Pontos importantes:
- `-p 127.0.0.1:3000:3000` — só localhost (nginx faz o proxy)
- `--read-only` + `--tmpfs /tmp` — FS imutável exceto /tmp
- `--security-opt no-new-privileges` — bloqueia escalação de privilégios
- `--memory` e `--cpus` — protege contra DoS por exaustão de recursos

## 7. Variáveis de ambiente

`/etc/medmaestro/.env.production` (chmod 600, dono root):

```env
NEXT_PUBLIC_SUPABASE_URL=https://ibavtxzlejizsbtztyvl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
WORKER_SECRET=...                       # mesmo valor configurado no GitHub Action
RESEND_API_KEY=re_...
NEXT_PUBLIC_APP_URL=https://medmaestro.seudominio.com.br
NODE_ENV=production
```

```bash
chmod 600 /etc/medmaestro/.env.production
chown root:root /etc/medmaestro/.env.production
```

## 8. Monitoramento mínimo

```bash
# Healthcheck via systemd timer (a cada 5 min)
cat > /etc/systemd/system/medmaestro-health.service <<'EOF'
[Unit]
Description=MedMaestro health probe

[Service]
Type=oneshot
ExecStart=/bin/bash -c '/usr/bin/curl -fsS https://medmaestro.seudominio.com.br/api/health || /usr/bin/systemctl restart docker.medmaestro.service'
EOF

cat > /etc/systemd/system/medmaestro-health.timer <<'EOF'
[Unit]
Description=Run MedMaestro health probe every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

systemctl enable --now medmaestro-health.timer
```

## 9. Backups Supabase

Supabase Pro já faz daily backup automático. Configure também export semanal manual:

```bash
# Cron weekly: 0 3 * * 0
pg_dump $SUPABASE_DB_URL > /backup/medmaestro-$(date +\%Y\%m\%d).sql
gzip /backup/medmaestro-*.sql
# Retém só últimos 8 backups
ls -t /backup/medmaestro-*.gz | tail -n +9 | xargs -r rm
```

## 10. Worker tick — escolha um

**Opção A (recomendada): GitHub Actions**
- Já preparado em `.github/workflows/worker-tick.yml`
- Configure secrets `APP_URL` e `WORKER_SECRET` no repo
- Cron mínimo: 5 min

**Opção B: Cron no host**
```cron
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $(cat /etc/medmaestro/worker-secret)" https://medmaestro.seudominio.com.br/api/worker/tick > /dev/null 2>&1
```

## 11. Validação pós-deploy

```bash
# Headers de segurança presentes?
curl -sI https://medmaestro.seudominio.com.br/login | grep -iE "strict-transport|x-frame|content-security"

# /api/health 200?
curl -s https://medmaestro.seudominio.com.br/api/health | jq

# nmap externo — só 22/80/443
nmap -Pn -p- medmaestro.seudominio.com.br

# SSL Labs — meta A+
# https://www.ssllabs.com/ssltest/analyze.html?d=medmaestro.seudominio.com.br

# fail2ban funcionando?
fail2ban-client status medmaestro-login

# Tente brute force
for i in {1..10}; do
  curl -sI -X POST https://medmaestro.seudominio.com.br/login \
    -d "email=fake@x.com&password=wrong"
done
# Após 5–6 tentativas: deve retornar 429 OU 503 (nginx) OU IP banido
```

## 12. Auditoria contínua

- **Mensal:** revisar `audit_logs` para acessos suspeitos
- **Mensal:** rodar `npm audit` e atualizar deps com vuln high+
- **Trimestral:** rotacionar `WORKER_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
- **Quando alterar:** schema RLS — confirmar com `SELECT * FROM pg_policies WHERE schemaname='public'`
