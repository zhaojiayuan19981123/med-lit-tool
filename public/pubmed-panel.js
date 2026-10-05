// pubmed-panel.js —— PubMed 检索视图（医学版）
// 侧边栏「🔬 PubMed 检索」是一个独立视图（#viewPubmed），不再是弹窗。
// 依赖由 app.js 注入：{ api, toast, esc, onImported, getExistingPmids }
// 面板内的搜索 / 摘要展开 / 导入均为局部逻辑，不触碰 app.js 内部状态。
window.PubmedPanel = (function () {
  'use strict';

  let deps = null;
  let results = [];         // 当前检索结果（esummary 元信息）
  const abstracts = new Map(); // pmid -> 英文摘要（前端缓存，避免重复请求）
  let selected = new Set();
  let busy = false;
  let inited = false;

  const $ = (id) => document.getElementById(id);

  function yearOptions() {
    const y = new Date().getFullYear();
    const span = (n) => `${y - n + 1}:${y}`;
    return [
      ['', '全部年份'],
      [span(2), '近 2 年'],
      [span(5), '近 5 年'],
      [span(10), '近 10 年'],
    ];
  }

  function init(injected) {
    deps = injected;
    if (!deps || !$('viewPubmed') || inited) return;
    inited = true;
    $('pmYear').innerHTML = yearOptions().map(([v, label]) => `<option value="${v}">${label}</option>`).join('');

    $('pmInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
    $('btnPmSearch').addEventListener('click', search);
    $('pmCheckAll').addEventListener('change', (e) => {
      const on = e.target.checked;
      selected = on ? new Set(results.map((r) => r.pmid)) : new Set();
      renderList();
    });
    $('btnPmImportSelected').addEventListener('click', () => importSelected());
    $('pmResults').addEventListener('click', onListClick);
  }

  // 切到本视图时调用：同步「已导入」标记，并聚焦检索框
  function show(docType) {
    if (!$('viewPubmed')) return;
    const latest = deps?.getExistingPmids?.();
    if (latest) setExistingPmids(latest);
    renderList();
    if (docType) $('pmDocType').value = docType;
    setTimeout(() => $('pmInput')?.focus(), 30);
  }

  async function search() {
    const q = ($('pmInput').value || '').trim();
    if (!q) { deps.toast('请输入检索词', 'error'); return; }
    if (busy) return;
    busy = true;
    $('btnPmSearch').disabled = true;
    $('btnPmSearch').textContent = '检索中…';
    $('pmCount').textContent = '';
    $('pmResults').innerHTML = '<div class="pm-loading">正在检索 PubMed…</div>';
    const year = ($('pmYear').value || '').split(':');
    try {
      const qs = new URLSearchParams({
        q,
        retmax: $('pmMax').value || '20',
        sort: $('pmSort').value || 'relevance',
        mindate: year[0] || '',
        maxdate: year[1] || '',
      });
      const data = await deps.api('/api/pubmed/search?' + qs.toString());
      results = Array.isArray(data.items) ? data.items : [];
      abstracts.clear();
      selected = new Set();
      $('pmCheckAll').checked = false;
      const hasPmid = results.filter((r) => !existingPmids().has(String(r.pmid)));
      $('pmCount').textContent = results.length
        ? `命中约 ${data.count || 0} 条，显示 ${results.length} 条${results.length !== (hasPmid.length) ? `（其中 ${results.length - hasPmid.length} 篇已在文献中心）` : ''}`
        : '';
      renderList();
    } catch (e) {
      $('pmResults').innerHTML = `<div class="pm-loading error">${deps.esc(e.message)}</div>`;
    } finally {
      busy = false;
      $('btnPmSearch').disabled = false;
      $('btnPmSearch').textContent = '检索';
    }
  }

  // 已经在文献里的 PMID —— 用于标记「已导入」
  let existingPmidCache = new Set();
  function setExistingPmids(list) { existingPmidCache = new Set((list || []).map(String)); }
  function existingPmids() { return existingPmidCache; }

  function renderList() {
    const box = $('pmResults');
    if (!box) return;
    if (!results.length) {
      box.innerHTML = '<div class="pm-loading">输入检索词开始检索<br><small>支持 MeSH 词、疾病名、药物名，或布尔表达式：diabetes AND metformin</small></div>';
      return;
    }
    box.innerHTML = results.map((r) => {
      const imported = existingPmids().has(String(r.pmid));
      const hasAbs = abstracts.has(r.pmid);
      return `<div class="pm-item${imported ? ' pm-imported' : ''}">
        <label class="pm-check"><input type="checkbox" data-pmcheck="${r.pmid}" ${selected.has(r.pmid) ? 'checked' : ''} ${imported ? 'disabled' : ''} /></label>
        <div class="pm-body">
          <div class="pm-title" data-pmtitle="${r.pmid}">${deps.esc(r.title || '（无标题）')}</div>
          <div class="pm-meta">${deps.esc(r.authors || '佚名')} · ${deps.esc(r.journal || '')} ${deps.esc(r.year || '')} · PMID:${deps.esc(r.pmid)}${r.doi ? ` · DOI:${deps.esc(r.doi)}` : ''}${r.pubTypes?.length ? ` · ${deps.esc(r.pubTypes.slice(0, 2).join('/'))}` : ''}</div>
          <div class="pm-acts">
            <button class="tb-btn" data-pmabs="${r.pmid}">${hasAbs ? '收起摘要' : '查看摘要'}</button>
            ${imported
              ? '<span class="pm-done">✓ 已在文献中心</span>'
              : `<button class="tb-btn accent" data-pmimport="${r.pmid}">➕ 导入（含摘要）</button>`}
            <a class="tb-btn" href="https://pubmed.ncbi.nlm.nih.gov/${deps.esc(r.pmid)}/" target="_blank" rel="noopener noreferrer">PubMed ↗</a>
          </div>
          <div class="pm-abs hidden" id="pmAbs-${r.pmid}"></div>
        </div>
      </div>`;
    }).join('');
  }

  async function onListClick(e) {
    const absBtn = e.target.closest('[data-pmabs]');
    if (absBtn) { await toggleAbstract(absBtn.dataset.pmabs, absBtn); return; }
    const impBtn = e.target.closest('[data-pmimport]');
    if (impBtn) { await importPmids([impBtn.dataset.pmimport], impBtn); return; }
    const chk = e.target.closest('[data-pmcheck]');
    if (chk && chk.type === 'checkbox') {
      if (chk.checked) selected.add(chk.dataset.pmcheck); else selected.delete(chk.dataset.pmcheck);
      return;
    }
    const title = e.target.closest('[data-pmtitle]');
    if (title) {
      const btn = title.closest('.pm-item').querySelector('[data-pmabs]');
      await toggleAbstract(title.dataset.pmtitle, btn);
    }
  }

  async function toggleAbstract(pmid, btn) {
    const box = $('pmAbs-' + pmid);
    if (!box) return;
    if (!box.classList.contains('hidden')) {
      box.classList.add('hidden');
      if (btn) btn.textContent = '查看摘要';
      return;
    }
    if (!abstracts.has(pmid)) {
      box.textContent = '加载摘要中…';
      box.classList.remove('hidden');
      if (btn) btn.textContent = '收起摘要';
      try {
        const d = await deps.api('/api/pubmed/fetch?pmid=' + encodeURIComponent(pmid));
        abstracts.set(pmid, d.abstract || '（该文献没有摘要）');
      } catch (err) {
        abstracts.set(pmid, '摘要加载失败：' + err.message);
      }
    }
    box.textContent = abstracts.get(pmid) || '（无摘要）';
    box.classList.remove('hidden');
    if (btn) btn.textContent = '收起摘要';
  }

  async function importSelected() {
    const ids = [...selected];
    if (!ids.length) { deps.toast('请先勾选要导入的文献', 'error'); return; }
    await importPmids(ids);
  }

  async function importPmids(pmids, btn) {
    if (!pmids.length) return;
    const original = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '导入中…'; }
    try {
      const d = await deps.api('/api/pubmed/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pmids, docType: $('pmDocType')?.value || 'empirical' }),
      });
      deps.toast(`导入完成：新增 ${d.added} 篇${d.skipped ? `，跳过重复 ${d.skipped} 篇` : ''}`, d.added ? 'success' : '');
      for (const p of pmids) selected.delete(p);
      await deps.onImported?.();
      // 导入后用最新的 PMID 集合刷新列表标记
      const pms = await deps.api('/api/literature');
      setExistingPmids((pms || []).map((it) => it.pmid).filter(Boolean));
      renderList();
    } catch (e) {
      deps.toast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = original || '➕ 导入（含摘要）'; }
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = original || '➕ 导入（含摘要）'; }
  }

  return { init, show, setExistingPmids };
})();
