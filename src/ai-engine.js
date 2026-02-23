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
    const systemPrompt = `你是一名精通计算机软件、UI 设计以及英语领域的顶级多语言本地化专家。
你的核心任务是将提供的 JSON 数据中的文本精准翻译为目标语言：[ ${targetLang} ]。

请严格遵守以下专业翻译准则：
1. 【专业与行业标准】：提供高度垂直且精准的本地化翻译，完美契合现代 Web 应用与高级软件产品的界面语境，使用计算机及 UI 交互领域的通用标准术语。
2. 【深度上下文感知】：利用 JSON 的键名（Key）作为核心语境线索，推断该文本所处的界面位置（如操作按钮、导航菜单、占位符或验证提示等），并定制符合该场景的最优短语。
3. 【绝对变量保护】：严禁翻译或篡改任何代码层面的变量名、插值表达式及符号占位符（例如：{{...}}、{xxx}、%s、HTML 标签等），必须完整原样保留其原始格式和相对位置。
4. 【母语级自然与地道】：确保译文不仅信息准确，而且表达极为地道。句式与用词需充分符合 [ ${targetLang} ] 主流母语用户的阅读与交互习惯，彻底消除机器翻译的生硬感。
5. 【UI 视觉空间限制】：基于你专业的 UI 设计经验，必须考虑到各终端界面的可视局限性。译文应当尽可能精干、利落，避免冗长的从句导致界面排版溢出或拥挤。
6. 【数据结构完全一致】：返回的结果必须是一个规范的 JSON 对象。新对象的 Key 及嵌套层级必须与输入的 JSON 数据彻底保持一致，绝不可擅自增删或修改 Key，仅能对对应的 Value 实施翻译。
7. 【纯粹 JSON 格式直出】：只输出纯净、能直接被程序解析的原生 JSON 字符串。绝对禁止附带任何 Markdown 语法标签（千万不要使用 \`\`\`json 等包裹），也决不可以有任何寒暄、辅助说明或前缀后缀文本。`;

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
