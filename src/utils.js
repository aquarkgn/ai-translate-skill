const fs = require('fs');
const path = require('path');

// 提取所有需要翻译的文本节点
function extractNodes(obj, pathArr = []) {
    let nodes = [];
    for (const key in obj) {
        const currentPath = [...pathArr, key];

        if (typeof obj[key] === 'string') {
            // 特殊规则：跳过 nativeName 这种不需要翻译的键
            const skipTranslate = (key === 'nativeName');
            nodes.push({ path: currentPath, text: obj[key], skipTranslate });
        } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            nodes = nodes.concat(extractNodes(obj[key], currentPath));
        } else {
            // 数组、数字或布尔值原样复制
            nodes.push({ path: currentPath, text: obj[key], isRaw: true, skipTranslate: true });
        }
    }
    return nodes;
}

// 根据路径获取嵌套对象的值
function getNestedValue(obj, pathArr) {
    return pathArr.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);
}

// 根据路径设置嵌套对象的值
function setNestedValue(obj, pathArr, value) {
    let current = obj;
    for (let i = 0; i < pathArr.length - 1; i++) {
        if (!current[pathArr[i]]) current[pathArr[i]] = {};
        current = current[pathArr[i]];
    }
    current[pathArr[pathArr.length - 1]] = value;
}

// 检查字符串是否包含字母或汉字以判断是否需要翻译
function needsTranslation(str) {
    return /[a-zA-Z\u4e00-\u9fa5]/.test(str);
}

// 保护特殊的占位符（如 {{xxx}}）
function protectPlaceholders(text) {
    const placeholders = [];
    let processedText = text.replace(/\{\{.*?\}\}/g, (match) => {
        placeholders.push(match);
        return `__PH${placeholders.length - 1}__`;
    });
    return { processedText, placeholders };
}

// 还原占位符
function restorePlaceholders(text, placeholders) {
    let restored = text;
    for (let i = 0; i < placeholders.length; i++) {
        // GTX 可能会把 __PH0__ 格式化成 __PH 0__ 
        const regex = new RegExp(`__\\s*PH\\s*${i}\\s*__`, 'gi');
        restored = restored.replace(regex, placeholders[i]);
    }
    return restored;
}

module.exports = {
    extractNodes,
    getNestedValue,
    setNestedValue,
    needsTranslation,
    protectPlaceholders,
    restorePlaceholders
};
