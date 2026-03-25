#!/bin/bash

set -e

COMPOSE="docker compose"
LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$LAB_DIR"

RED='\033[0;31m'
GRN='\033[0;32m'
DIM='\033[0;90m'
RST='\033[0m'

case "${1:-help}" in
  up)
    echo -e "${DIM}[*] Starting lab infrastructure...${RST}"
    $COMPOSE up -d --build target proxy monitor
    echo -e "${DIM}[*] Waiting for services...${RST}"
    sleep 3
    echo ""
    echo -e "${GRN}[+] Target:   http://localhost:8080${RST}"
    echo -e "${GRN}[+] Monitor:  http://localhost:4000${RST}"
    echo -e "${GRN}[+] Proxy:    http://localhost:3128${RST}"
    echo ""
    echo -e "${DIM}Open the monitor dashboard, then run an attack:${RST}"
    echo "    ./run.sh attack http_flood"
    echo "    ./run.sh attack slowloris"
    echo "    ./run.sh attack multi_proxy"
    ;;

  attack)
    SCRIPT="${2:-http_flood}"
    echo -e "${RED}[!] Launching attack: ${SCRIPT}${RST}"
    mkdir -p scripts/results
    $COMPOSE run --rm k6 run "/scripts/${SCRIPT}.js"
    ;;

  status)
    echo -e "${DIM}[*] Target status:${RST}"
    curl -s http://localhost:8080/nginx_status 2>/dev/null || echo -e "${RED}TARGET DOWN${RST}"
    echo ""
    $COMPOSE ps
    ;;

  logs)
    $COMPOSE logs -f "${2:-target}"
    ;;

  down)
    $COMPOSE down -v
    echo -e "${GRN}[+] Lab stopped.${RST}"
    ;;

  help|*)
    echo ""
    echo "  ██╗  ██╗ ██████╗     ██╗      █████╗ ██████╗ "
    echo "  ██║ ██╔╝██╔════╝     ██║     ██╔══██╗██╔══██╗"
    echo "  █████╔╝ ███████╗     ██║     ███████║██████╔╝"
    echo "  ██╔═██╗ ██╔═══██╗    ██║     ██╔══██║██╔══██╗"
    echo "  ██║  ██╗╚██████╔╝    ███████╗██║  ██║██████╔╝"
    echo "  ╚═╝  ╚═╝ ╚═════╝     ╚══════╝╚═╝  ╚═╝╚═════╝"
    echo ""
    echo "  Usage: ./run.sh <command>"
    echo ""
    echo "  up              Start lab + open monitor"
    echo "  attack [name]   Run attack (http_flood | slowloris | multi_proxy)"
    echo "  status          Check target server"
    echo "  logs [service]  Tail container logs"
    echo "  down            Stop everything"
    echo ""
    ;;
esac
