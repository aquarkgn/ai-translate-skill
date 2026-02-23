const fs = require('fs');
const {
    extractNodes,
    getNestedValue,
    setNestedValue,
    needsTranslation
} = require('./utils');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const BATCH_SIZE = 50;

async function callAI(systemPrompt, userContent, model, apiKey, apiUrl) {
    const response = await fetch(`${apiUrl}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    let content = result.choices[0].message.content;
    try {
        return JSON.parse(content);
    } catch (e) {
        content = content.replace(/^```json/m, '').replace(/```$/m, '').trim();
        return JSON.parse(content);
    }
}

async function translateBatch(batchMap, targetLang, model, apiKey, apiUrl) {
    const systemPrompt = `You are an expert multi-language translation engine specializing in software UI localization.
Your task: Translate the values of the provided JSON object to ${targetLang}.
Guidelines:
1. Provide highly accurate, contextual translations suitable for a modern web application. 
2. The key names in the JSON indicate context. Use this context to deliver the best translation.
3. DO NOT translate or modify any placeholders formatted as {{...}}. Keep them exactly as they are.
4. Ensure the tone is professional, concise, and natural to native speakers of ${targetLang}.
5. Return a JSON object with the exact same keys as the input. Only translate the values.
6. Provide ONLY the raw JSON output format without any markdown wrappers.`;

    const userContent = JSON.stringify(batchMap, null, 2);
    return await callAI(systemPrompt, userContent, model, apiKey, apiUrl);
}

async function runAITranslate(templatePath, targetLang, outputPath, model, apiKey, apiUrl) {
    console.log('加载源模板文件...');
    const sourceData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const allNodes = extractNodes(sourceData);

    console.log(`\n>>> 正在使用 AI 模型 ${model} 处理语言: ${targetLang}`);

    let translatedData = {};
    if (fs.existsSync(outputPath)) {
        try {
            translatedData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        } catch (e) {
            translatedData = {};
        }
    }

    const pendingNodes = [];
    for (const node of allNodes) {
        const existingVal = getNestedValue(translatedData, node.path);
        const sourceVal = node.text;

        if (node.skipTranslate) {
            setNestedValue(translatedData, node.path, existingVal !== undefined ? existingVal : sourceVal);
            continue;
        }

        let isTranslated = false;
        if (existingVal) {
            if (existingVal !== sourceVal) {
                isTranslated = true;
            } else if (!needsTranslation(sourceVal)) {
                isTranslated = true;
            }
        } else if (!needsTranslation(sourceVal)) {
            isTranslated = true;
            setNestedValue(translatedData, node.path, sourceVal);
        }

        if (!isTranslated) {
            pendingNodes.push(node);
        } else {
            setNestedValue(translatedData, node.path, existingVal || sourceVal);
        }
    }

    if (pendingNodes.length === 0) {
        console.log(`- ${targetLang} 已经无须再翻译，完全同步。`);
        fs.writeFileSync(outputPath, JSON.stringify(translatedData, null, 2));
        return;
    }

    console.log(`- 发现 ${pendingNodes.length} 条需要翻译的文本，开始分块(Batch)翻译...`);

    for (let i = 0; i < pendingNodes.length; i += BATCH_SIZE) {
        const chunk = pendingNodes.slice(i, i + BATCH_SIZE);
        const batchMap = {};

        chunk.forEach((node, idx) => {
            const contextHint = node.path.slice(-2).map(p => p.replace(/[^a-zA-Z0-9]/g, '')).join('_');
            const safeKey = `idx_${idx}_${contextHint}`;
            batchMap[safeKey] = node.text;
        });

        console.log(`  -> 正在请求翻译第 ${i + 1} 到 ${i + chunk.length} 条数据...`);
        let retryCount = 0;
        let success = false;

        while (!success && retryCount < 3) {
            try {
                const translatedBatch = await translateBatch(batchMap, targetLang, model, apiKey, apiUrl);

                chunk.forEach((node, idx) => {
                    const contextHint = node.path.slice(-2).map(p => p.replace(/[^a-zA-Z0-9]/g, '')).join('_');
                    const safeKey = `idx_${idx}_${contextHint}`;
                    const tText = translatedBatch[safeKey];

                    if (tText) {
                        setNestedValue(translatedData, node.path, tText);
                    } else {
                        console.warn(`    [警告] 丢失翻译项，原文本: "${node.text}"`);
                        setNestedValue(translatedData, node.path, node.text);
                    }
                });

                fs.writeFileSync(outputPath, JSON.stringify(translatedData, null, 2));
                success = true;
            } catch (err) {
                retryCount++;
                console.error(`    [错误] 翻译批次失败 (第 ${i + 1}-${i + chunk.length} 条) - 尝试重试 ${retryCount}/3:`, err.message);
                if (retryCount >= 3) {
                    console.error('    达到最大重试次数，跳过此批次。');
                }
            }
        }
    }

    console.log(`语言 ${targetLang} 首批翻译成功完成。文件输出于 ${outputPath}`);
}

module.exports = {
    runAITranslate
};
