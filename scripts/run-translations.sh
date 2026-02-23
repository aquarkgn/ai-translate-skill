#!/bin/bash

BATCH_SIZES=(10 20 50 100 200 300 400 600 800 1000)
MODEL="mlx-community/Qwen2.5-14B-Instruct-8bit"
URL="http://localhost:5001/v1/chat/completions"

mkdir -p output/test_results

echo "=== 开始 14B 模型 Translation Batch Size 测试 ==="

for bs in "${BATCH_SIZES[@]}"; do
    echo "============================="
    echo "Testing Batch Size: $bs"
    echo "============================="
    
    start_time=$(date +%s)
    
    node ~/.openclaw/skills/ai-translate-skill/bin/ai-translate.js \
      --force true \
      --template "$(pwd)/en.json" \
      --target "ak" \
      --output "$(pwd)/output/test_results/test_bs_${bs}.json" \
      --ai-model "$MODEL" \
      --ai-url "$URL" \
      --ai-api-key "none" \
      --batch-size "$bs" \
      --max-batches 1
      
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo "Batch Size $bs 耗时: ${duration} 秒"
    echo "-----------------------------"
done

echo "所有批量测试完成！"