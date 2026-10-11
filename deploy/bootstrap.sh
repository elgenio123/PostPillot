#!/bin/sh
# Prepares a fresh Ubuntu/Debian server (Oracle Cloud or Azure) for PostPilot. Safe to run again.
# Usage: sudo sh bootstrap.sh <deploy-user>
# Installs Docker, adds swap on small machines, opens ports 80/443/5678 and creates /opt/postpilot.
set -eu
DEPLOY_USER="${1:-${SUDO_USER:-$(id -un)}}"
APP_DIR=/opt/postpilot
say() { echo "[bootstrap] $*"; }

if ! command -v apt-get >/dev/null 2>&1; then
  say "This script supports Ubuntu/Debian only. Create the VM with an Ubuntu image."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  apt-get update -y
  apt-get install -y ca-certificates curl
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"

# n8n + PostgreSQL + the app need about 1.5 GB; small VMs (Azure B1s: 1 GB) get a 2 GB swap file
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3000 ] && ! swapon --show | grep -q .; then
  say "Adding a 2 GB swap file (RAM: ${mem_mb} MB)"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Oracle Cloud Ubuntu images block ports with iptables rules, in addition to the cloud firewall
for port in 80 443 5678; do
  if command -v iptables >/dev/null 2>&1 && ! iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 5 -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
  fi
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw allow "$port/tcp"
  fi
done
if command -v netfilter-persistent >/dev/null 2>&1; then netfilter-persistent save; fi

mkdir -p "$APP_DIR/postgres"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"
date -u +%FT%TZ > "$APP_DIR/.bootstrapped"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR/.bootstrapped"
say "Server ready. Docker $(docker --version | cut -d' ' -f3 | tr -d ,), app folder $APP_DIR"
