#!/bin/bash
LANGS=("ak")

mkdir -p src/i18n/locales-new

for lang in "${LANGS[@]}"; do
    echo "============================="
    echo "Translating to $lang..."
    echo "============================="
    node ~/.openclaw/skills/ai-translate-skill/bin/ai-translate.js --force true \
      --template "$(pwd)/en.json" \
      --target "$lang" \
      --output "$(pwd)/output/${lang}.json" \
      --ai-model "mlx-community/Qwen2.5-14B-Instruct-8bit" \
      --ai-url "http://localhost:5001/v1/chat/completions" \
      --ai-api-key "none"
done