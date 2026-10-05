// pubmed.js —— PubMed E-utilities 接入（esearch + esummary + efetch）
// 检索 → 元信息 → 摘要全文，全部走 NCBI 官方公开接口，无需 API Key。
// 频率限制：无 key 时 3 请求/秒，这里串行调用并加最小间隔。
//
// 出站请求统一走传入的 fetchImpl（server.js 里是 modelFetch），
// 因此用户在「出站代理」里的设置对 PubMed 同样生效。

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const MIN_INTERVAL = 400; // ms，保证不超过无 key 的 3 req/s 限制
const UA = 'med-lit-tool/1.0 (medical research assistant)';

export function createPubMed({ fetchImpl } = {}) {
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  let lastCall = 0;

  async function throttle() {
    const wait = Math.max(0, MIN_INTERVAL - (Date.now() - lastCall));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  }

  async function eutils(path, params) {
    await throttle();
    const url = new URL(`${EUTILS}/${path}`);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await doFetch(url.toString(), { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json, text/xml, */*' } });
      if (!res || !res.ok) throw new Error(`PubMed 接口返回 ${res?.status || '未知状态'}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  // 检索：esearch 拿 PMID 列表，esummary 批量取元信息（一次请求带全部 ID）
  async function search({ query, retmax = 20, sort = 'relevance', mindate = '', maxdate = '' }) {
    const q = String(query || '').trim();
    if (!q) return { count: 0, items: [] };
    const searchParams = {
      db: 'pubmed',
      term: q,
      retmode: 'json',
      retmax: Math.max(1, Math.min(100, Number(retmax) || 20)),
      sort,
      tool: 'med-lit-tool',
      email: 'medres@example.com',
    };
    if (mindate) searchParams.mindate = mindate;
    if (maxdate) searchParams.maxdate = maxdate;
    if (mindate || maxdate) searchParams.datetype = 'pdat';

    const r = await eutils('esearch.fcgi', searchParams);
    const data = await r.json();
    const ids = (data?.esearchresult?.idlist) || [];
    const count = Number(data?.esearchresult?.count || 0);
    if (!ids.length) return { count, items: [] };

    const summary = await eutils('esummary.fcgi', { db: 'pubmed', id: ids.join(','), retmode: 'json' });
    const sumData = await summary.json();
    const docsums = sumData?.result || {};
    const items = ids.map((id) => toItem(docsums[id], id)).filter(Boolean);
    return { count, items };
  }

  // 单篇详情：efetch 拉取结构化 XML（含摘要），解析出干净字段
  async function fetchOne(pmid) {
    const id = String(pmid || '').trim();
    if (!/^\d+$/.test(id)) throw new Error('无效的 PMID');
    const r = await eutils('efetch.fcgi', { db: 'pubmed', id, retmode: 'xml' });
    const xml = await r.text();
    return parseEfetchXml(xml, id);
  }

  // 把 PMID 数组批量转成文献条目（导入用；逐篇 efetch 拿摘要，串行限速）
  async function fetchByPmids(pmids) {
    const ids = [...new Set((pmids || []).map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x)))];
    const out = [];
    for (const id of ids) {
      try {
        out.push(await fetchOne(id));
      } catch (e) {
        console.warn(`[pubmed] 获取 ${id} 失败：`, e.message);
      }
    }
    return out;
  }

  return { search, fetchOne, fetchByPmids };
}

// esummary docsum → 医学文献元信息
function toItem(doc, id) {
  if (!doc) return null;
  const authors = Array.isArray(doc.authors)
    ? doc.authors.map((a) => a?.name || '').filter(Boolean).join(', ')
    : '';
  const year = String(doc.pubdate || doc.epubdate || '').match(/\b(19|20)\d{2}\b/)?.[0] || '';
  const doi = Array.isArray(doc.articleids)
    ? (doc.articleids.find((x) => x?.idtype === 'doi')?.value || '')
    : (String(doc.elocationid || '').replace(/^doi:\s*/i, ''));
  const pubTypes = Array.isArray(doc.pubtype) ? doc.pubtype : [];
  return {
    pmid: id,
    title: String(doc.title || '').replace(/\.$/, ''),
    authors,
    journal: String(doc.source || ''),
    volume: String(doc.volume || ''),
    issue: String(doc.issue || ''),
    pages: String(doc.pages || ''),
    year,
    doi,
    pubTypes,
    hasAbstract: true, // 摘要需单独 efetch
  };
}

// efetch XML 解析：提取 AbstractText、MeSH、关键词
function parseEfetchXml(xml, pmid) {
  const text = xml || '';
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  const title = strip(text.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/s)?.[1] || '');
  const abstractParts = [];
  const absRe = /<AbstractText[^>]*>(.*?)<\/AbstractText>/gs;
  let m;
  while ((m = absRe.exec(text)) !== null) {
    const label = m[0].match(/Label="([^"]+)"/)?.[1];
    const body = strip(m[1]);
    if (body) abstractParts.push(label ? `${label}: ${body}` : body);
  }
  const abstract = abstractParts.join('\n');
  const journal = strip(text.match(/<Title>(.*?)<\/Title>/s)?.[1] || '');
  const doi = strip(text.match(/<ELocationID EIdType="doi"[^>]*>(.*?)<\/ELocationID>/s)?.[1] || '');
  const year = strip(text.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1]
    || text.match(/<MedlineDate>((?:19|20)\d{2})/)?.[1] || '');

  const authors = [];
  const authRe = /<Author[^>]*>[\s\S]*?<LastName>(.*?)<\/LastName>[\s\S]*?<ForeName>(.*?)<\/ForeName>/g;
  while ((m = authRe.exec(text)) !== null) {
    authors.push(`${m[2].trim()} ${m[1].trim()}`);
  }
  // 作者可能只有集体名（CollectiveName）
  const collRe = /<CollectiveName>(.*?)<\/CollectiveName>/g;
  while ((m = collRe.exec(text)) !== null) authors.push(m[1].trim());

  const pubTypes = [];
  const ptRe = /<PublicationType\b[^>]*>(.*?)<\/PublicationType>/g;
  while ((m = ptRe.exec(text)) !== null) pubTypes.push(m[1].trim());

  const keywords = [];
  const kwRe = /<Keyword\b[^>]*>(.*?)<\/Keyword>/g;
  while ((m = kwRe.exec(text)) !== null) keywords.push(m[1].trim());

  const mesh = [];
  const meshRe = /<DescriptorName[^>]*>(.*?)<\/DescriptorName>/g;
  while ((m = meshRe.exec(text)) !== null) mesh.push(m[1].trim());

  const volume = strip(text.match(/<Volume>(.*?)<\/Volume>/s)?.[1] || '');
  const issue = strip(text.match(/<Issue>(.*?)<\/Issue>/s)?.[1] || '');
  const pages = strip(text.match(/<MedlinePgn>(.*?)<\/MedlinePgn>/s)?.[1] || '');

  return {
    pmid,
    title, abstract, journal, doi, year,
    authors: authors.join(', '),
    volume, issue, pages,
    pubTypes, keywords, mesh,
  };
}
