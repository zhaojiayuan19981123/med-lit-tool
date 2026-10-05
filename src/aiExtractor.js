// aiExtractor.js —— 信息提取调度器：优先调用 LLM（硅基流动），否则回退规则提取
// 支持两种文献类型：empirical（实证类）/ model（模型类），字段与提示词不同
import { extractByRules } from './ruleExtractor.js';

// 公共字段
const COMMON_FIELDS = ['title', 'authors', 'journal', 'year', 'doi', 'keywords', 'abstract', 'background', 'summary', 'innovation'];
// 实证类专属
const EMPIRICAL_FIELDS = ['theory', 'method', 'researchDesign', 'constructs', 'results', 'conclusion', 'criticalThinking'];
// 模型类专属（method/results 与实证共用 key，但语义不同）
const MODEL_FIELDS = ['model', 'method', 'paramDiscussion', 'results'];

// 字段全集（存储用）
export const FIELDS = [...new Set([...COMMON_FIELDS, ...EMPIRICAL_FIELDS, ...MODEL_FIELDS])];

export const FIELD_LABELS = {
  title: '标题', authors: '作者', journal: '期刊/会议', year: '年份', doi: 'DOI',
  abstract: '摘要', keywords: '关键词', background: '研究背景', summary: '一段话总结', innovation: '创新点',
  theory: '理论', method: '研究方法', researchDesign: '研究设计', constructs: '构念',
  results: '实验结果', conclusion: '结论', criticalThinking: '批判性思考',
  model: '模型', paramDiscussion: '参数讨论',
};

// 两套类型对应的可见字段（供前端与提示词使用）
export const TYPE_FIELDS = {
  empirical: [...COMMON_FIELDS, ...EMPIRICAL_FIELDS],
  model: [...COMMON_FIELDS, ...MODEL_FIELDS],
};

// ---------- 提示词 ----------
const COMMON_SPEC = `通用字段（两类文献都需提取）：
- title：论文标题
- authors：作者列表，逗号分隔
- journal：期刊或会议名称
- year：发表年份（4位数字）
- doi：DOI
- keywords：关键词，分号分隔
- abstract：摘要的【中文翻译】（若原文为中文则保留原文，否则翻译成简体中文）
- background：研究背景，分点说明本文要解决的问题与动机
- summary：用一段话（150-250字）概括这篇论文做了什么
- innovation：创新点，本文相比现有工作的独特贡献`;

const EMPIRICAL_SPEC = `临床实证类专属字段：
- theory：本文依据的理论假说或生物学/病理生理学基础（如炎症假说、胰岛素抵抗机制、免疫逃逸假说等），简述假说内容及其在本文中的应用
- method：研究设计类型，用简洁的分类词描述（如：RCT / 前瞻性队列 / 回顾性队列 / 病例对照 / 横断面 / 真实世界研究 / Meta 分析 / 孟德尔随机化 等），并说明数据来源、样本量与随访时间
- researchDesign：研究分组与流程，如何分组或定义暴露/干预、对照如何设置、随访时间点、主要终点与次要终点是什么
- constructs：主要结局指标（primary outcome）与暴露/干预因素的定义与测量方式；同时列出纳入的协变量、潜在混杂因素是如何控制的（匹配 / 分层 / 多因素回归 / 倾向性评分等），以及是否做了效应修饰或亚组分析
- results：主要结果，给出关键效应量及其可信区间与显著性（如 HR / OR / RR / 均数差 + 95%CI、P 值、绝对风险差与 NNT 等），并说明关键亚组或敏感性分析结果
- conclusion：结论与临床意义，本文对临床实践、诊疗指南或公共卫生决策意味着什么
- criticalThinking：批判性思考，站在循证医学审稿人角度指出偏倚风险（选择偏倚 / 信息偏倚 / 失访偏倚）、残余混杂、统计学方法与样本量的不足、外部有效性（能否外推到目标人群），以及可如何改进`;

const MODEL_SPEC = `机制模型类专属字段：
- model：本文使用了什么模型（如药代动力学/药效学模型、疾病传播动力学模型、网络药理学模型、孟德尔随机化模型、影像组学或机器学习预测模型：CNN / Transformer / 随机森林 / Cox 回归等）
- method：本文使用了什么求解或训练方法（如最大似然估计、贝叶斯推断、马尔可夫链蒙特卡洛、数值模拟、交叉验证、外部验证队列等）
- paramDiscussion：参数讨论，本文分别讨论了哪些参数或超参数（含敏感性分析与假设条件）、为什么这样讨论
- results：模型结果，模型如何验证（内部验证 / 外部队列验证 / 独立数据集），主要评价指标是什么（如 AUC / C-index / 灵敏度特异度 / 校准曲线 / 决策曲线 / 累计发生率等）`;

function buildPrompt(docType, lang) {
  const extra = docType === 'model' ? MODEL_SPEC : EMPIRICAL_SPEC;
  return `请对给定的学术论文全文，提取以下字段，并以严格的 JSON 对象返回（不要包含 markdown 代码块、不要任何额外解释，只返回 JSON）。

${COMMON_SPEC}

${extra}

输出格式要求：
1. 所有字段都返回（没有的字段返回空字符串 ""，不要省略）。
2. background/summary 等需要分点或分段的内容，用 markdown 无序列表（每点以 "- " 开头）分点输出。
3. abstract 必须是中文（翻译结果）；其余内容字段用${lang}撰写，保持学术严谨、精炼、忠实原文，不要编造。

只返回 JSON 对象本身。`;
}

/**
 * 调用 OpenAI 兼容的 Chat Completions 接口（硅基流动 / 其他兼容服务）
 */
async function callLLM(settings, systemPrompt, userContent) {
  const url = (settings.baseURL || '').replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || 'deepseek-ai/DeepSeek-V4-Flash',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM 接口返回 ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseJsonLoose(str) {
  let s = (str || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { /* ignore */ }
    }
    throw new Error('LLM 返回内容无法解析为 JSON：' + s.slice(0, 200));
  }
}

function sanitizeField(val) {
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) return val.join(', ');
  if (val == null) return '';
  return String(val);
}

function normalizeResult(obj) {
  const out = {};
  for (const f of FIELDS) out[f] = sanitizeField(obj[f]);
  return out;
}

/**
 * 信息提取主入口
 * @param {string} text 全文文本
 * @param {object} pdfInfo 元信息
 * @param {object} settings 设置（含 aiProvider/apiKey/model/baseURL/language）
 * @param {string} docType 文献类型 'empirical' | 'model'
 */
export async function extract(text, pdfInfo, settings, docType = 'empirical') {
  const useAI = (settings?.aiProvider === 'openai' || settings?.aiProvider === 'siliconflow') && settings?.apiKey;

  if (useAI) {
    const lang = settings.language === 'zh' ? '简体中文' : 'English';
    const systemPrompt = buildPrompt(docType, lang);
    const userContent = text.slice(0, 14000);
    const raw = await callLLM(settings, systemPrompt, userContent);
    const parsed = parseJsonLoose(raw);
    return { ...normalizeResult(parsed), _source: 'ai' };
  }

  // 规则兜底（规则提取不区分类型，抽取公共字段）
  const rules = extractByRules(text, pdfInfo);
  return { ...rules, _source: 'rule' };
}
