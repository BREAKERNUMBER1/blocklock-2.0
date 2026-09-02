#!/bin/bash
# BlockLock-LitVM — Server Setup Script
# Run as root on a fresh Ubuntu 22.04 LTS Droplet
# Usage: bash setup.sh YOUR_DOMAIN

set -e

DOMAIN=${1:?Usage: bash setup.sh your-domain.com}

echo "=== BlockLock-LitVM Server Setup ==="
echo "Domain: $DOMAIN"
echo ""

# ─── System update ────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y

# ─── Node.js 20 ───────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ─── Mosquitto MQTT broker ────────────────────────────────────
apt-get install -y mosquitto mosquitto-clients

# ─── Nginx ────────────────────────────────────────────────────
apt-get install -y nginx

# ─── Certbot (Let's Encrypt TLS) ─────────────────────────────
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN"

# ─── Mosquitto MQTT user ──────────────────────────────────────
echo "Creating MQTT user 'blocklock'..."
read -s -p "Enter MQTT password for 'blocklock': " MQTT_PASS
echo ""
mosquitto_passwd -b -c /etc/mosquitto/passwd blocklock "$MQTT_PASS"
echo "MQTT user created."

# ─── Copy Mosquitto config ────────────────────────────────────
cp "$(dirname "$0")/mosquitto.conf" /etc/mosquitto/mosquitto.conf

# Let's Encrypt's /etc/letsencrypt/archive/** is root-only (0700), which the
# unprivileged 'mosquitto' user can't read. Keep mosquitto-readable copies of
# the cert files instead, and re-copy + reload on every renewal via a deploy
# hook (certbot runs these automatically after each successful renewal).
mkdir -p /etc/mosquitto/certs
cat > /etc/letsencrypt/renewal-hooks/deploy/mosquitto-certs.sh <<'HOOK'
#!/bin/bash
set -e
cp /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/chain.pem /etc/mosquitto/certs/chain.pem
cp /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/cert.pem /etc/mosquitto/certs/cert.pem
cp /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem /etc/mosquitto/certs/privkey.pem
chown mosquitto:mosquitto /etc/mosquitto/certs/*.pem
chmod 640 /etc/mosquitto/certs/*.pem
# Only reload if mosquitto is already running — on first run (during initial
# setup) it hasn't been started yet, so there's nothing to reload.
systemctl is-active --quiet mosquitto && systemctl reload mosquitto || true
HOOK
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/letsencrypt/renewal-hooks/deploy/mosquitto-certs.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/mosquitto-certs.sh
bash /etc/letsencrypt/renewal-hooks/deploy/mosquitto-certs.sh

systemctl enable mosquitto
systemctl restart mosquitto
echo "Mosquitto configured and started."

# ─── Create web root ──────────────────────────────────────────
mkdir -p /var/www/blocklock-litvm

# ─── Copy Nginx config ────────────────────────────────────────
cp "$(dirname "$0")/nginx.conf" /etc/nginx/sites-available/blocklock-litvm
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/blocklock-litvm
ln -sf /etc/nginx/sites-available/blocklock-litvm /etc/nginx/sites-enabled/blocklock-litvm
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Nginx configured."

# ─── Backend setup ────────────────────────────────────────────
mkdir -p /opt/blocklock-litvm-backend
cp -r "$(dirname "$0")/../backend/." /opt/blocklock-litvm-backend/
cd /opt/blocklock-litvm-backend && npm install --production
echo ""
echo "IMPORTANT: Copy and fill in your .env file:"
echo "  cp /opt/blocklock-litvm-backend/.env.example /opt/blocklock-litvm-backend/.env"
echo "  nano /opt/blocklock-litvm-backend/.env"

# ─── PM2 process manager ──────────────────────────────────────
npm install -g pm2
pm2 start /opt/blocklock-litvm-backend/src/server.js --name blocklock-litvm-api
pm2 save
pm2 startup systemd -u root --hp /root
echo "PM2 configured to auto-start BlockLock-LitVM API on boot."

# ─── Firewall ─────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 8883/tcp   # MQTT TLS
ufw --force enable
echo "Firewall configured."

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Fill in /opt/blocklock-litvm-backend/.env"
echo "  2. pm2 restart blocklock-litvm-api"
echo "  3. Build and deploy frontend:"
echo "       cd frontend && npm install && npm run build"
echo "       cp -r dist/. /var/www/blocklock-litvm/"
echo "  4. Deploy contracts: cd contracts && npm run deploy:liteforge"
echo "  5. Update .env files with deployed contract addresses"
echo "  6. Flash ESP32 firmware with config.h filled in"
echo ""
