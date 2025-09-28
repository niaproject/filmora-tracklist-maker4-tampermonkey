// ==UserScript==
// @name         YouTube Studio Filmora Tracklist Maker
// @namespace    niaproject
// @version      1.0.0
// @author       Nia
// @description  Filmora (.wfp) から音声クリップの開始時刻とファイル名を抽出し、YouTube Studio の説明欄へ自動整形して挿入します。
// @match        https://studio.youtube.com/*
// @run-at       document-idle
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(() => {
  'use strict';

  /** IDs */
  const INLINE_BTN_ID = 'ysu-inline-btn';
  const FIXED_BTN_ID  = 'ysu-fixed-btn';

  /** Styles */
  addStyle(`
:root{
  --ysu-btn-py:8px; --ysu-btn-px:12px; --ysu-fs:13px; --ysu-r:10px; --ysu-minh:36px;
  --ysu-shadow:0 4px 16px rgba(0,0,0,.18);
}
#${INLINE_BTN_ID}{
  display:inline-flex; align-items:center; gap:.5em;
  padding:var(--ysu-btn-py) var(--ysu-btn-px);
  border-radius:var(--ysu-r); border:1px solid rgba(0,0,0,.12);
  min-height:var(--ysu-minh); line-height:1; font-size:var(--ysu-fs); font-weight:700;
  cursor:pointer; box-shadow:var(--ysu-shadow); letter-spacing:.02em; opacity:.96;
  transition:transform .12s ease, opacity .12s ease; user-select:none;
  background:#1976d2; color:#fff;
}
#${FIXED_BTN_ID}{
  display:inline-flex; align-items:center; gap:.5em;
  padding:var(--ysu-btn-py) var(--ysu-btn-px);
  border-radius:var(--ysu-r); border:1px solid rgba(0,0,0,.12);
  min-height:var(--ysu-minh); line-height:1; font-size:var(--ysu-fs); font-weight:700;
  cursor:pointer; box-shadow:var(--ysu-shadow); letter-spacing:.02em; opacity:.96;
  transition:transform .12s ease, opacity .12s ease; user-select:none;
  background:#43a047; color:#fff;
}
#${INLINE_BTN_ID}{ margin-left:10px; }
#${INLINE_BTN_ID}:hover, #${FIXED_BTN_ID}:hover{ opacity:1; transform:translateY(-1px); }
#${FIXED_BTN_ID}{ position:fixed; right:16px; bottom:16px; z-index:2147483647; }
  `);

  const isVisible = (el) => {
    const r = el?.getBoundingClientRect?.();
    return !!r && r.width > 0 && r.height > 0;
  };
  function deepQueryAll(selector, root = document){
    const out = [], seen = new WeakSet(), st = [root];
    while (st.length){
      const n = st.pop(); if (!n || seen.has(n)) continue; seen.add(n);
      try { n.querySelectorAll?.(selector)?.forEach(e => out.push(e)); } catch {}
      if (n.children) for (const c of n.children) st.push(c);
      if (n.shadowRoot) st.push(n.shadowRoot);
      if (n instanceof DocumentFragment || n instanceof ShadowRoot) n.childNodes?.forEach?.(c => st.push(c));
    }
    return out;
  }
  const byText = (nodes, texts) => nodes.find(n => {
    const t = (n.innerText || n.getAttribute?.('aria-label') || '').trim();
    return texts.includes(t) && isVisible(n);
  });

  function isUploadFlow(){
    const u = new URL(location.href);
    if (/\/upload/.test(u.pathname)) return true;
    // DOMの実体で判定
    const markers = [
      'ytcp-uploads-dialog',      
      'ytcp-video-metadata-editor',
      'ytcp-uploads-still-processing'  
    ];
    return deepQueryAll(markers.join(',')).some(isVisible);
  }

  function findUploadHostButton(){
    const byId = deepQueryAll('ytcp-button#next-button, ytcp-button#done-button, ytcp-button#save-button').find(isVisible);
    if (byId) return byId;

    const labels = ['次へ','Next','公開','Publish','保存','Save','保存して公開','Save and publish'];
    const cand = byText(deepQueryAll('ytcp-button,button'), labels);
    return cand ? (cand.closest?.('ytcp-button') || cand) : null;
  }

  async function extractWfpTimestampsAndNames(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      let wesprojFile = null;
      zip.forEach((relativePath, zipEntry) => {
        if (relativePath.endsWith('timeline.wesproj')) {
          wesprojFile = zipEntry;
        }
      });

      if (!wesprojFile) return {error: 'timeline.wesprojが見つかりません'};
      const wesprojText = await wesprojFile.async('text');
      const wesprojJson = JSON.parse(wesprojText);
      // extractKeysで.mp3/.wav抽出
      const found = [];
      if (typeof extractKeys === 'function') {
        extractKeys(wesprojJson, found);
      }
      // tlBeginで昇順ソート
      found.sort((a, b) => a.tlBegin - b.tlBegin);
      return {data: found};
    } catch (err) {
      return {error: 'wfp解析エラー'};
    }
  }

  function getBaseNameWithoutExt(path) {
    const base = path.split('/').pop().split('\\').pop();
    return base.replace(/\.[^/.]+$/, '');
  }

  function formatWfpResultLines(data) {
    return data.map(x => `${formatNanoToTime(x.tlBegin)} ${getBaseNameWithoutExt(x.filename)}`).join('\n');
  }

  function writeDescription(descInput, lines) {
  const current = descInput.innerText.trim();
  const newText = current ? (current + '\n' + lines) : lines;
  descInput.innerText = newText;
  descInput.dispatchEvent(new Event('input', {bubbles:true}));
  }

  /** ファイル選択時の処理 */
  async function handleFileInputChange(e, fileInput) {
    const file = e.target.files[0];
    if (!file) {
      fileInput.remove();
      return;
    }
    const descInput = Array.from(document.querySelectorAll('div#textbox[contenteditable="true"]'))
      .find(el => el.getAttribute('aria-label')?.includes('視聴者に向けて動画の内容を紹介しましょう'));
    if (file.name.endsWith('.wfp')) {
      const result = await extractWfpTimestampsAndNames(file);
      if (descInput) {
        if (result.data && result.data.length > 0) {
          toast('✅ ' + result.data.length + '件抽出しました');
          toast('data構造: ' + result.data.map(x => JSON.stringify(x)).join(', '));
          try {
            const lines = formatWfpResultLines(result.data);
            writeDescription(descInput, lines);
            toast('✅ 説明欄に抽出結果を書き込みました');
          } catch (err) {
            toast('❌ map処理でエラー: ' + err);
          }
        } else {
          toast('ℹ️ wfp抽出結果がありません');
        }
      } else {
        toast('ℹ️ 説明欄が見つかりません');
      }
    } else {
      toast('ℹ️ ファイルの形式が異なります');
    }
  fileInput.remove();
  }

  /**
   * 100ns単位の値を hh:mm:ss 形式に変換
   */
  function formatNanoToTime(nano) {
    const sec = Math.floor(nano / 10000000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  }

  /** wfp抽出結果をトースト表示 */
  function showWfpToast(result) {
    if (result.error) {
      toast('⚠️ ' + result.error);
      return;
    }
    const outText = result.data.map(x => `${x.tlBegin} ${x.filename}`).join('\n');
    toast('🗂️ wfp抽出結果:\n' + outText.slice(0, 200));
  }

  /** ボタンクリック時の処理（自由に書き換え） */
  async function onCustomButtonClick(){
    try {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      fileInput.accept = '.wfp'; // .wfpのみ選択可能
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', function(e){ handleFileInputChange(e, fileInput); }, {once:true});
      fileInput.click();
    } catch(e) {
      console.error(e);
      toast('⚠️ エラーが発生しました（詳細はConsole）');
    }
  }

  function extractKeys(obj, result) {
    if (obj == null || typeof obj !== 'object') return;

    const hasFilename = ('filename' in obj);
    const hasBegin = ('tlBegin' in obj);

    if (hasFilename && hasBegin) {
        // filenameが.mp3または.wavで終わる場合のみ抽出
        if (typeof obj.filename === 'string' &&
            (obj.filename.toLowerCase().endsWith('.mp3') || obj.filename.toLowerCase().endsWith('.wav'))
        ) {
            result.push({
                filename: obj.filename,
                tlBegin: obj.tlBegin
            });
        }
    }
    // 再帰
    for (const k in obj) extractKeys(obj[k], result);
  }

  function toast(msg){
    let el = document.getElementById('ysu-toast');
    if(!el){
      el = document.createElement('div'); el.id = 'ysu-toast';
      Object.assign(el.style, {
        position:'fixed', right:'16px', top:'64px', zIndex:2147483647,
        background:'#222', color:'#fff', padding:'8px 12px', borderRadius:'10px',
        fontSize:'12px', boxShadow:'0 4px 18px rgba(0,0,0,.2)', whiteSpace:'nowrap', opacity:'0',
        transition:'opacity .18s ease', pointerEvents:'none'
      });
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = String(msg ?? '');
    el.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>{ el.style.opacity = '0'; }, 1500);
  }

  function addStyle(css){
    const s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function ensureFixedButton(show = true){
    let btn = document.getElementById(FIXED_BTN_ID);
    if(!btn){
      btn = document.createElement('button');
      btn.id = FIXED_BTN_ID; btn.type = 'button'; btn.textContent = 'Custom Action';
      btn.addEventListener('click', onCustomButtonClick);
      (document.body || document.documentElement).appendChild(btn);
    }
    btn.style.display = show ? 'inline-flex' : 'none';
    return btn;
  }

  function ensureInlineButton(){
    if(!isUploadFlow()){
      ensureFixedButton(false);
      const inline = document.getElementById(INLINE_BTN_ID);
      if (inline) inline.style.display = 'none';
      return false;
    }

    const existing = document.getElementById(INLINE_BTN_ID);
    if (existing){
      existing.style.display = 'inline-flex';
      ensureFixedButton(false);
      return true;
    }

    const host = findUploadHostButton();
    if(!host){
      ensureFixedButton(true);
      return false;
    }

    const btn = document.createElement('button');
    btn.id = INLINE_BTN_ID; btn.type = 'button'; btn.textContent = 'Filmoraファイル選択';
    btn.addEventListener('click', onCustomButtonClick);

    try{
      host.insertAdjacentElement('afterend', btn);
      ensureFixedButton(false);
      return true;
    }catch{
      ensureFixedButton(true);
      return false;
    }
  }

  function heal(){
    if(!isUploadFlow()){
      ensureFixedButton(false);
      const inline = document.getElementById(INLINE_BTN_ID);
      if (inline) inline.style.display = 'none';
      return;
    }
    ensureInlineButton();
  }

  function init(){
    if (!ensureInlineButton()) {
      ensureFixedButton(true);
    }

    const mo = new MutationObserver(()=> heal());
    mo.observe(document.documentElement, {childList:true, subtree:true});

    const fire = ()=> window.dispatchEvent(new Event('ysu:url-changed'));
    const debounce = (fn, ms=120)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
    const onUrlMaybeChanged = debounce(()=> heal(), 80);

    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function(...a){ const r = origPush.apply(this,a); fire(); return r; };
    history.replaceState = function(...a){ const r = origReplace.apply(this,a); fire(); return r; };
    window.addEventListener('popstate', fire);
    window.addEventListener('yt-navigate-start', fire);
    window.addEventListener('yt-navigate-finish', fire);
    document.addEventListener('yt-page-data-updated', fire);
    window.addEventListener('hashchange', fire);
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) fire(); });
    setInterval(()=> fire(), 1200); 
    window.addEventListener('ysu:url-changed', onUrlMaybeChanged);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
    window.addEventListener('load', init, {once:true});
  } else {
    init();
  }
})();