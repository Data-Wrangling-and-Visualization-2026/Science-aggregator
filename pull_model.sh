#!/bin/bash
# pull_model.sh — скачивает языковую модель в ollama контейнер.
# Запускать ОДИН РАЗ после первого docker compose up.
# Модель (~2GB) сохраняется в томе ollama_data — при рестарте не скачивается снова.
#
# Usage (из корня проекта):
#   bash pull_model.sh

MODEL="llama3.2:3b"

echo "Waiting for ollama container..."
until curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; do
  sleep 3
  echo "  still starting..."
done
echo "Ollama ready."

echo ""
echo "Pulling model: $MODEL (~2GB, 5-10 min)..."
docker exec science_ollama ollama pull $MODEL

echo ""
echo "Done! Test:"
echo "  curl -s http://localhost:11434/api/tags"
