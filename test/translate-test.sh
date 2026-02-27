#!/bin/bash

# 添加了对新语言的翻译配置，默认 batch size 等逻辑在代码中已设置为最稳当的 10
LANGS=("ak" "ar" "bn" "es" "fa" "fil" "fr" "ha" "hi" "id" "ig" "ku" "ml" "my" "pt" "ru" "rw" "sv" "th" "tr" "ur" "vi" "zu" "zh")
MODEL="mlx-community/Qwen2.5-14B-Instruct-8bit"
URL="http://localhost:5001/v1/chat/completions"

mkdir -p output

for lang in "${LANGS[@]}"; do
    echo "============================="
    echo "Translating to $lang..."
    echo "============================="
    
    node ~/.openclaw/skills/ai-translate-skill/bin/ai-translate.js \
      --force true \
      --template "$(pwd)/en.json" \
      --target "$lang" \
      --output "$(pwd)/output/${lang}.json" \
      --ai-model "$MODEL" \
      --ai-url "$URL" \
      --ai-api-key "none"
done