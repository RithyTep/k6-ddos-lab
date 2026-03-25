#!/bin/bash

# ============================================================
# k6 DDoS Simulation Lab - Runner Script
# All traffic stays on local Docker network only!
# ============================================================

set -e

COMPOSE="docker compose"
LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$LAB_DIR"

print_banner() {
  echo ""
  echo "========================================="
  echo "  k6 DDoS Simulation Lab"
  echo "  Target: http://localhost:8080"
  echo "  Proxy:  http://localhost:3128"
  echo "  Grafana: http://localhost:3000"
  echo "========================================="
  echo ""
}

case "${1:-help}" in
  up)
    echo "[*] Starting lab infrastructure..."
    $COMPOSE up -d target proxy prometheus grafana
    echo "[*] Waiting for services to start..."
    sleep 3
    echo "[+] Target:     http://localhost:8080"
    echo "[+] Proxy:      http://localhost:3128"
    echo "[+] Grafana:    http://localhost:3000 (admin/admin)"
    echo "[+] Prometheus: http://localhost:9090"
    echo ""
    echo "[*] Run an attack with: ./run.sh attack <script_name>"
    echo "    Scripts: http_flood | slowloris | multi_proxy"
    ;;

  attack)
    SCRIPT="${2:-http_flood}"
    echo "[*] Launching k6 attack: ${SCRIPT}.js"
    echo "[*] Target: http://target:80 (via Docker network)"
    echo ""
    mkdir -p scripts/results
    $COMPOSE run --rm k6 run "/scripts/${SCRIPT}.js"
    ;;

  status)
    echo "[*] Checking target server status..."
    curl -s http://localhost:8080/nginx_status 2>/dev/null || echo "Target is DOWN or unreachable!"
    echo ""
    echo "[*] Container status:"
    $COMPOSE ps
    ;;

  logs)
    SERVICE="${2:-target}"
    $COMPOSE logs -f "$SERVICE"
    ;;

  down)
    echo "[*] Shutting down lab..."
    $COMPOSE down -v
    echo "[+] Lab stopped."
    ;;

  help|*)
    print_banner
    echo "Usage: ./run.sh <command>"
    echo ""
    echo "Commands:"
    echo "  up              Start lab (target, proxy, monitoring)"
    echo "  attack [name]   Run k6 attack script"
    echo "                  Scripts: http_flood (default) | slowloris | multi_proxy"
    echo "  status          Check target server & container status"
    echo "  logs [service]  Tail logs (target|proxy|k6|prometheus|grafana)"
    echo "  down            Stop and remove all containers"
    echo ""
    echo "Example workflow:"
    echo "  ./run.sh up                    # Start infrastructure"
    echo "  ./run.sh attack http_flood     # Run HTTP flood simulation"
    echo "  ./run.sh attack slowloris      # Run Slowloris simulation"
    echo "  ./run.sh attack multi_proxy    # Run distributed proxy flood"
    echo "  ./run.sh status                # Check if target is still alive"
    echo "  ./run.sh down                  # Clean up"
    ;;
esac
