// topJournals.js —— 医学顶刊跟踪：期刊目录、Crossref 元数据同步与个人不重复投递队列
//
// 本模块只同步公开的书目信息/摘要/DOI/出版社文章页；不抓取或分发受版权保护的 PDF 全文。

const DAY = 24 * 60 * 60 * 1000;
const CROSSREF_API = 'https://api.crossref.org/journals';

export const MED_TOP_JOURNALS = [
  { id: 'nejm', title: "The New England Journal of Medicine", shortTitle: "NEJM", category: '综合临床', issn: '0028-4793', publisherUrl: 'https://www.nejm.org/' },
  { id: 'lancet', title: "The Lancet", shortTitle: "Lancet", category: '综合临床', issn: '0140-6736', publisherUrl: 'https://www.thelancet.com/' },
  { id: 'jama', title: "JAMA", shortTitle: "JAMA", category: '综合临床', issn: '0098-7484', publisherUrl: 'https://jamanetwork.com/journals/jama' },
  { id: 'bmj', title: "The BMJ", shortTitle: "BMJ", category: '综合临床', issn: '0959-8138', publisherUrl: 'https://www.bmj.com/' },
  { id: 'annals', title: "Annals of Internal Medicine", shortTitle: "Ann Intern Med", category: '临床医学', issn: '0003-4819', publisherUrl: 'https://www.acpjournals.org/journal/aim' },
  { id: 'plos-med', title: "PLOS Medicine", shortTitle: "PLOS Med", category: '临床医学', issn: '1549-1676', publisherUrl: 'https://journals.plos.org/plosmedicine/' },
  { id: 'elife', title: "eLife", shortTitle: "eLife", category: '生命科学', issn: '2050-084X', publisherUrl: 'https://elifesciences.org/' },
  { id: 'nature', title: "Nature", shortTitle: "Nature", category: '综合科学', issn: '0028-0836', publisherUrl: 'https://www.nature.com/' },
  { id: 'science', title: "Science", shortTitle: "Science", category: '综合科学', issn: '0036-8075', publisherUrl: 'https://www.science.org/' },
  { id: 'cell', title: "Cell", shortTitle: "Cell", category: '基础医学', issn: '0092-8674', publisherUrl: 'https://www.cell.com/cell/home' },
  { id: 'pnas', title: "Proceedings of the National Academy of Sciences", shortTitle: "PNAS", category: '综合科学', issn: '0027-8424', publisherUrl: 'https://www.pnas.org/' },
  { id: 'nat-commun', title: "Nature Communications", shortTitle: "Nat Commun", category: '综合科学', issn: '2041-1723', publisherUrl: 'https://www.nature.com/ncomms/' },
  { id: 'nature-med', title: "Nature Medicine", shortTitle: "Nat Med", category: '转化医学', issn: '1078-8956', publisherUrl: 'https://www.nature.com/nm/' },
  { id: 'sci-transl-med', title: "Science Translational Medicine", shortTitle: "Sci Transl Med", category: '转化医学', issn: '1946-6234', publisherUrl: 'https://www.science.org/journal/stm' },
  { id: 'nat-biotech', title: "Nature Biotechnology", shortTitle: "Nat Biotechnol", category: '转化医学', issn: '1087-0156', publisherUrl: 'https://www.nature.com/nbt/' },
  { id: 'circulation', title: "Circulation", shortTitle: "Circulation", category: '心血管', issn: '0009-7322', publisherUrl: 'https://www.ahajournals.org/journal/circ' },
  { id: 'eur-heart-j', title: "European Heart Journal", shortTitle: "Eur Heart J", category: '心血管', issn: '0195-668X', publisherUrl: 'https://academic.oup.com/eurheartj' },
  { id: 'jacc', title: "Journal of the American College of Cardiology", shortTitle: "JACC", category: '心血管', issn: '0735-1097', publisherUrl: 'https://www.jacc.org/' },
  { id: 'jama-card', title: "JAMA Cardiology", shortTitle: "JAMA Cardiol", category: '心血管', issn: '2380-6591', publisherUrl: 'https://jamanetwork.com/journals/jamacardiology' },
  { id: 'nat-rev-card', title: "Nature Reviews Cardiology", shortTitle: "Nat Rev Cardiol", category: '心血管', issn: '1759-5002', publisherUrl: 'https://www.nature.com/nrcardio/' },
  { id: 'jco', title: "Journal of Clinical Oncology", shortTitle: "JCO", category: '肿瘤学', issn: '0732-183X', publisherUrl: 'https://ascopubs.org/journal/jco' },
  { id: 'cancer-cell', title: "Cancer Cell", shortTitle: "Cancer Cell", category: '肿瘤学', issn: '1535-6108', publisherUrl: 'https://www.cell.com/cancer-cell/home' },
  { id: 'lancet-oncol', title: "The Lancet Oncology", shortTitle: "Lancet Oncol", category: '肿瘤学', issn: '1470-2045', publisherUrl: 'https://www.thelancet.com/journals/lanonc' },
  { id: 'jama-oncol', title: "JAMA Oncology", shortTitle: "JAMA Oncol", category: '肿瘤学', issn: '2374-2437', publisherUrl: 'https://jamanetwork.com/journals/jamaoncology' },
  { id: 'nat-rev-cancer', title: "Nature Reviews Cancer", shortTitle: "Nat Rev Cancer", category: '肿瘤学', issn: '1474-175X', publisherUrl: 'https://www.nature.com/nrc/' },
  { id: 'blood', title: "Blood", shortTitle: "Blood", category: '血液学', issn: '0006-4971', publisherUrl: 'https://ashpublications.org/blood' },
  { id: 'lancet-neurol', title: "The Lancet Neurology", shortTitle: "Lancet Neurol", category: '神经科学', issn: '1474-4422', publisherUrl: 'https://www.thelancet.com/journals/laneur' },
  { id: 'jama-neurol', title: "JAMA Neurology", shortTitle: "JAMA Neurol", category: '神经科学', issn: '2168-6149', publisherUrl: 'https://jamanetwork.com/journals/jamaneurology' },
  { id: 'neuron', title: "Neuron", shortTitle: "Neuron", category: '神经科学', issn: '0896-6273', publisherUrl: 'https://www.cell.com/neuron/home' },
  { id: 'brain', title: "Brain", shortTitle: "Brain", category: '神经科学', issn: '0006-8950', publisherUrl: 'https://academic.oup.com/brain' },
  { id: 'immunity', title: "Immunity", shortTitle: "Immunity", category: '免疫学', issn: '1074-7613', publisherUrl: 'https://www.cell.com/immunity/home' },
  { id: 'nat-immunol', title: "Nature Immunology", shortTitle: "Nat Immunol", category: '免疫学', issn: '1529-2908', publisherUrl: 'https://www.nature.com/ni/' },
  { id: 'nat-rev-immunol', title: "Nature Reviews Immunology", shortTitle: "Nat Rev Immunol", category: '免疫学', issn: '1474-1733', publisherUrl: 'https://www.nature.com/nri/' },
  { id: 'jem', title: "Journal of Experimental Medicine", shortTitle: "JEM", category: '免疫学', issn: '0022-1007', publisherUrl: 'https://rupress.org/jem' },
  { id: 'sci-immunol', title: "Science Immunology", shortTitle: "Sci Immunol", category: '免疫学', issn: '2470-9468', publisherUrl: 'https://www.science.org/journal/sciimmunol' },
  { id: 'cell-metab', title: "Cell Metabolism", shortTitle: "Cell Metab", category: '代谢内分泌', issn: '1550-4131', publisherUrl: 'https://www.cell.com/cell-metabolism/home' },
  { id: 'diabetes-care', title: "Diabetes Care", shortTitle: "Diabetes Care", category: '代谢内分泌', issn: '0149-5992', publisherUrl: 'https://diabetesjournals.org/care' },
  { id: 'lancet-diab', title: "The Lancet Diabetes & Endocrinology", shortTitle: "Lancet Diab Endo", category: '代谢内分泌', issn: '2213-8587', publisherUrl: 'https://www.thelancet.com/journals/landia' },
  { id: 'ajrccm', title: "American Journal of Respiratory and Critical Care Medicine", shortTitle: "AJRCCM", category: '呼吸与危重症', issn: '1073-449X', publisherUrl: 'https://www.atsjournals.org/journal/ajrccm' },
  { id: 'lancet-resp', title: "The Lancet Respiratory Medicine", shortTitle: "Lancet Respir Med", category: '呼吸与危重症', issn: '2213-2600', publisherUrl: 'https://www.thelancet.com/journals/lanres' },
  { id: 'lancet-infect', title: "The Lancet Infectious Diseases", shortTitle: "Lancet Infect Dis", category: '感染病', issn: '1473-3099', publisherUrl: 'https://www.thelancet.com/journals/laninf' },
  { id: 'gastro', title: "Gastroenterology", shortTitle: "Gastroenterology", category: '消化病', issn: '0016-5085', publisherUrl: 'https://www.gastrojournal.org/' },
  { id: 'lancet-gastro', title: "The Lancet Gastroenterology & Hepatology", shortTitle: "Lancet Gastro Hepatol", category: '消化病', issn: '2468-1253', publisherUrl: 'https://www.thelancet.com/journals/langas' },
  { id: 'kidney-int', title: "Kidney International", shortTitle: "Kidney Int", category: '肾脏病', issn: '0085-2538', publisherUrl: 'https://www.kidney-international.org/' },
  { id: 'mol-cell', title: "Molecular Cell", shortTitle: "Mol Cell", category: '基础医学', issn: '1097-2765', publisherUrl: 'https://www.cell.com/molecular-cell/home' },
  { id: 'cell-stem-cell', title: "Cell Stem Cell", shortTitle: "Cell Stem Cell", category: '基础医学', issn: '1934-5909', publisherUrl: 'https://www.cell.com/cell-stem-cell/home' },
  { id: 'nat-genet', title: "Nature Genetics", shortTitle: "Nat Genet", category: '遗传学', issn: '1061-4036', publisherUrl: 'https://www.nature.com/ng/' },
  { id: 'nat-methods', title: "Nature Methods", shortTitle: "Nat Methods", category: '方法学', issn: '1548-7091', publisherUrl: 'https://www.nature.com/nmeth/' },
];

export const JOURNAL_PRESETS = {
  generalMedicine: { label: '综合临床', journalIds: ['nejm', 'lancet', 'jama', 'bmj', 'annals', 'plos-med'] },
  cardiovascular: { label: '心血管', journalIds: ['circulation', 'eur-heart-j', 'jacc', 'jama-card', 'nat-rev-card'] },
  oncology: { label: '肿瘤与血液', journalIds: ['jco', 'cancer-cell', 'lancet-oncol', 'jama-oncol', 'nat-rev-cancer', 'blood'] },
  neuroscience: { label: '神经科学', journalIds: ['lancet-neurol', 'jama-neurol', 'neuron', 'brain'] },
  immunology: { label: '免疫与炎症', journalIds: ['immunity', 'nat-immunol', 'nat-rev-immunol', 'jem', 'sci-immunol'] },
  metabolism: { label: '代谢与内分泌', journalIds: ['cell-metab', 'diabetes-care', 'lancet-diab'] },
  respiratory: { label: '呼吸与感染', journalIds: ['ajrccm', 'lancet-resp', 'lancet-infect'] },
  gastroNephro: { label: '消化与肾脏', journalIds: ['gastro', 'lancet-gastro', 'kidney-int'] },
  translational: { label: '转化医学', journalIds: ['nature-med', 'sci-transl-med', 'nat-biotech', 'elife'] },
  basicFrontier: { label: '基础前沿', journalIds: ['cell', 'mol-cell', 'cell-stem-cell', 'nat-genet', 'nat-methods'] },
  bigJournals: { label: '高影响力综合刊', journalIds: ['nature', 'science', 'cell', 'pnas', 'nat-commun'] },
};

export function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createTopJournalState(value = {}) {
  // v2 新增收藏与历史软删除。保留投递记录，以便“删历史”后仍能保证文章永不重复投递。
  const favoriteSource = value?.favorites && typeof value.favorites === 'object' ? value.favorites : {};
  const deletedSource = value?.deletedHistoryArticleIds && typeof value.deletedHistoryArticleIds === 'object'
    ? value.deletedHistoryArticleIds : {};
  return {
    version: 2,
    selectedJournalIds: Array.isArray(value?.selectedJournalIds) ? [...new Set(value.selectedJournalIds.filter((id) => MED_TOP_JOURNALS.some((j) => j.id === id)))] : [],
    articles: Array.isArray(value?.articles) ? value.articles : [],
    checkins: value?.checkins && typeof value.checkins === 'object' ? value.checkins : {},
    deliveries: value?.deliveries && typeof value.deliveries === 'object' ? value.deliveries : {},
    sync: value?.sync && typeof value.sync === 'object' ? value.sync : {},
    favorites: Object.fromEntries(Object.entries(favoriteSource).filter(([id]) => typeof id === 'string' && id)),
    deletedHistoryArticleIds: Object.fromEntries(Object.entries(deletedSource).filter(([id]) => typeof id === 'string' && id)),
    preferences: { fillWithRecentUnseen: true, ...(value?.preferences || {}) },
  };
}

function htmlToText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function firstDate(message) {
  for (const key of ['published-online', 'published-print', 'published', 'issued', 'created']) {
    const part = message?.[key];
    const values = part?.['date-parts']?.[0];
    if (Array.isArray(values) && values.length) {
      const [year, month = 1, day = 1] = values;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

function articleIdFor(item) {
  const doi = String(item?.DOI || '').trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  return `fallback:${String(item?.title?.[0] || '').trim().toLowerCase()}|${firstDate(item)}`;
}

export function mapCrossrefWork(work, journal) {
  const doi = String(work?.DOI || '').trim();
  const authors = Array.isArray(work?.author) ? work.author.map((author) => [author.given, author.family].filter(Boolean).join(' ').trim()).filter(Boolean) : [];
  const affiliations = Array.from(new Set((work?.author || []).flatMap((author) => (author.affiliation || []).map((row) => String(row?.name || '').trim()).filter(Boolean))));
  return {
    id: articleIdFor(work),
    journalId: journal.id,
    journal: String(work?.['container-title']?.[0] || journal.title).trim(),
    title: String(work?.title?.[0] || '').trim(),
    authors,
    affiliations,
    abstract: htmlToText(work?.abstract),
    doi,
    originalUrl: String(work?.URL || (doi ? `https://doi.org/${doi}` : '')).trim(),
    publishedAt: firstDate(work),
    volume: String(work?.volume || ''),
    issue: String(work?.issue || ''),
    pages: String(work?.page || work?.article_number || ''),
    articleType: String(work?.type || ''),
    source: 'Crossref',
    discoveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    translations: work?.translations && typeof work.translations === 'object' ? work.translations : {},
  };
}

function mergeArticles(existing, incoming) {
  const byId = new Map(existing.map((article) => [article.id, article]));
  for (const next of incoming) {
    if (!next.title) continue;
    const old = byId.get(next.id);
    byId.set(next.id, {
      ...old,
      ...next,
      abstract: next.abstract || old?.abstract || '',
      authors: next.authors?.length ? next.authors : (old?.authors || []),
      affiliations: next.affiliations?.length ? next.affiliations : (old?.affiliations || []),
      translations: old?.translations || next.translations || {},
      discoveredAt: old?.discoveredAt || next.discoveredAt,
    });
  }
  return [...byId.values()]
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || String(b.discoveredAt || '').localeCompare(String(a.discoveredAt || '')))
    .slice(0, 6000);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export async function syncJournals(stateInput, journalIds, { fetchImpl = globalThis.fetch, rows = 50 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不支持网络请求，无法同步期刊元数据');
  const state = createTopJournalState(stateInput);
  const wanted = [...new Set((journalIds || []).filter((id) => MED_TOP_JOURNALS.some((journal) => journal.id === id)))];
  if (!wanted.length) return { state, synced: [], failed: [] };
  const synced = [];
  const failed = [];
  const fetched = [];
  // 限制并发为 3，既比逐刊串行快，也避免对 Crossref 造成突发请求。
  const queue = [...wanted];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const journal = MED_TOP_JOURNALS.find((candidate) => candidate.id === id);
      try {
        const params = new URLSearchParams({ filter: 'type:journal-article', sort: 'published', order: 'desc', rows: String(Math.max(1, Math.min(100, rows))) });
        const response = await fetchImpl(`${CROSSREF_API}/${encodeURIComponent(journal.issn)}/works?${params}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'med-lit-tool/1.9 (mailto:research@example.invalid)' },
        });
        if (!response.ok) throw new Error(`Crossref ${response.status}`);
        const payload = await response.json();
        const articles = (payload?.message?.items || []).map((item) => mapCrossrefWork(item, journal));
        fetched.push(...articles);
        state.sync[id] = { lastSuccessAt: new Date().toISOString(), source: 'Crossref', count: articles.length, error: '' };
        synced.push({ journalId: id, count: articles.length });
      } catch (error) {
        const message = error?.message || '未知同步错误';
        state.sync[id] = { ...(state.sync[id] || {}), lastAttemptAt: new Date().toISOString(), error: message };
        failed.push({ journalId: id, error: message });
      }
    }
  });
  await Promise.all(workers);
  state.articles = mergeArticles(state.articles, fetched);
  return { state, synced, failed };
}

function articleDateMillis(article) {
  const parsed = Date.parse(`${article.publishedAt || ''}T12:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deliveredIdsFor(state, journalId) {
  const ids = new Set();
  for (const batch of Object.values(state.deliveries)) {
    for (const entry of batch?.items || []) if (entry.journalId === journalId) ids.add(entry.articleId);
  }
  return ids;
}

export function checkInAndCreateDelivery(stateInput, { date = dayKey(), perJournal = 5 } = {}) {
  if (!isValidDate(date)) throw new Error('签到日期格式无效');
  const state = createTopJournalState(stateInput);
  const existing = state.deliveries[date];
  if (!state.selectedJournalIds.length && !existing) throw new Error('请先在「期刊管理」勾选至少一本 UTD 期刊');

  // 同一天再次签到不会重置旧投递；如果用户随后新增期刊（或旧期刊此前不足 5 篇），仅追加未投递文章。
  const now = new Date().toISOString();
  const limit = Math.max(1, Math.min(10, Number(perJournal) || 5));
  const delivery = existing
    ? { ...existing, items: Array.isArray(existing.items) ? [...existing.items] : [] }
    : { date, createdAt: now, items: [], shortages: [] };
  const addedEntries = [];
  const shortages = [];
  for (const journalId of state.selectedJournalIds) {
    const currentCount = delivery.items.filter((item) => item.journalId === journalId).length;
    const missing = Math.max(0, limit - currentCount);
    const previouslyDelivered = deliveredIdsFor(state, journalId);
    const candidates = state.articles
      .filter((article) => article.journalId === journalId && !previouslyDelivered.has(article.id))
      .sort((a, b) => articleDateMillis(b) - articleDateMillis(a) || String(b.discoveredAt || '').localeCompare(String(a.discoveredAt || '')));
    const chosen = candidates.slice(0, missing);
    for (const article of chosen) {
      const entry = { journalId, articleId: article.id, slot: currentCount + addedEntries.filter((item) => item.journalId === journalId).length + 1, openedAt: '', savedAt: '' };
      delivery.items.push(entry);
      addedEntries.push(entry);
    }
    const totalForJournal = currentCount + chosen.length;
    if (totalForJournal < limit) shortages.push({ journalId, available: totalForJournal, requested: limit });
  }
  delivery.shortages = shortages;
  delivery.updatedAt = now;
  state.checkins[date] = { ...(state.checkins[date] || {}), checkedInAt: state.checkins[date]?.checkedInAt || now, deliveredCount: delivery.items.length };
  state.deliveries[date] = delivery;
  return { state, delivery, alreadyCheckedIn: Boolean(existing), addedCount: addedEntries.length };
}

export function deliveryArticles(stateInput, date = dayKey()) {
  const state = createTopJournalState(stateInput);
  const delivery = state.deliveries[date] || null;
  if (!delivery) return { delivery: null, articles: [] };
  const order = new Map(delivery.items.map((entry, index) => [entry.articleId, index]));
  return {
    delivery,
    articles: delivery.items.map((entry) => state.articles.find((article) => article.id === entry.articleId)).filter(Boolean)
      .sort((a, b) => order.get(a.id) - order.get(b.id)),
  };
}

export function recentArticles(stateInput, { journalIds = [], limit = 120 } = {}) {
  const state = createTopJournalState(stateInput);
  const ids = journalIds.length ? new Set(journalIds) : new Set(state.selectedJournalIds);
  return state.articles.filter((article) => !ids.size || ids.has(article.journalId))
    .sort((a, b) => articleDateMillis(b) - articleDateMillis(a) || String(b.discoveredAt || '').localeCompare(String(a.discoveredAt || '')))
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 120)));
}

export function deliveredArticleIds(stateInput) {
  const state = createTopJournalState(stateInput);
  return new Set(Object.values(state.deliveries).flatMap((batch) => (batch?.items || []).map((entry) => entry.articleId)));
}

export function historyArticles(stateInput, { includeDeleted = false } = {}) {
  const state = createTopJournalState(stateInput);
  const ids = deliveredArticleIds(state);
  return state.articles
    .filter((article) => ids.has(article.id) && (includeDeleted || !state.deletedHistoryArticleIds[article.id]))
    .sort((a, b) => articleDateMillis(b) - articleDateMillis(a) || String(b.discoveredAt || '').localeCompare(String(a.discoveredAt || '')));
}

export function setArticleFavorite(stateInput, articleId, favorite = true) {
  const state = createTopJournalState(stateInput);
  if (!state.articles.some((article) => article.id === articleId)) throw new Error('文章不存在或已从本地缓存清理');
  if (favorite) state.favorites[articleId] = { ...(state.favorites[articleId] || {}), savedAt: state.favorites[articleId]?.savedAt || new Date().toISOString() };
  else delete state.favorites[articleId];
  return state;
}

export function removeFavorites(stateInput, articleIds) {
  const state = createTopJournalState(stateInput);
  const ids = [...new Set((Array.isArray(articleIds) ? articleIds : []).filter((id) => typeof id === 'string' && id))];
  let removedCount = 0;
  for (const id of ids) if (state.favorites[id]) { delete state.favorites[id]; removedCount += 1; }
  return { state, removedCount };
}

export function removeHistoryArticles(stateInput, articleIds) {
  const state = createTopJournalState(stateInput);
  const delivered = deliveredArticleIds(state);
  const ids = [...new Set((Array.isArray(articleIds) ? articleIds : []).filter((id) => typeof id === 'string' && id))];
  const deletedIds = [];
  for (const id of ids) {
    if (!delivered.has(id) || state.deletedHistoryArticleIds[id]) continue;
    state.deletedHistoryArticleIds[id] = { deletedAt: new Date().toISOString() };
    deletedIds.push(id);
  }
  return { state, deletedIds };
}

export function calendarSummary(stateInput, now = new Date()) {
  const state = createTopJournalState(stateInput);
  const today = dayKey(now);
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-`;
  const checkinDays = Object.keys(state.checkins).filter((date) => date.startsWith(monthPrefix)).sort();
  let streak = 0;
  const walk = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (state.checkins[dayKey(walk)]) { streak += 1; walk.setDate(walk.getDate() - 1); }
  const libraryIds = deliveredArticleIds(state);
  const historyCount = [...libraryIds].filter((id) => !state.deletedHistoryArticleIds[id]).length;
  return { today, todayCheckedIn: Boolean(state.checkins[today]), streak, checkinDays, libraryCount: historyCount, historyCount, favoriteCount: Object.keys(state.favorites).length, selectedCount: state.selectedJournalIds.length };
}

export function markArticleOpened(stateInput, articleId, date = dayKey()) {
  const state = createTopJournalState(stateInput);
  const delivery = state.deliveries[date];
  if (!delivery) return state;
  const entry = delivery.items.find((item) => item.articleId === articleId);
  if (entry && !entry.openedAt) entry.openedAt = new Date().toISOString();
  return state;
}

export function pruneTopJournalState(stateInput, now = Date.now()) {
  const state = createTopJournalState(stateInput);
  // 文章元数据保留两年，已投递论文永不因清理而删除。
  const protectedIds = new Set([...deliveredArticleIds(state), ...Object.keys(state.favorites)]);
  state.articles = state.articles.filter((article) => protectedIds.has(article.id) || !article.publishedAt || Date.parse(article.publishedAt) >= now - 730 * DAY);
  return state;
}
