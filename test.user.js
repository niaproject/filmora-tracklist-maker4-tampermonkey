// ==UserScript==
// @name         YouTube Studio Uploader: Custom Button
// @namespace    your-namespace
// @version      0.1.0
// @description  YouTube Studioの動画アップロード画面にカスタムボタン（インライン/固定）を追加
// @match        https://studio.youtube.com/*
// @run-at       document-idle
// @grant        none
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
#${INLINE_BTN_ID}, #${FIXED_BTN_ID}{
  display:inline-flex; align-items:center; gap:.5em;
  padding:var(--ysu-btn-py) var(--ysu-btn-px);
  border-radius:var(--ysu-r); border:1px solid rgba(0,0,0,.12);
  min-height:var(--ysu-minh); line-height:1; font-size:var(--ysu-fs); font-weight:700;
  cursor:pointer; box-shadow:var(--ysu-shadow); letter-spacing:.02em; opacity:.96;
  transition:transform .12s ease, opacity .12s ease; user-select:none;
  background:#2962ff; color:#fff;
}
#${INLINE_BTN_ID}{ margin-left:10px; }
#${INLINE_BTN_ID}:hover, #${FIXED_BTN_ID}:hover{ opacity:1; transform:translateY(-1px); }
#${FIXED_BTN_ID}{ position:fixed; right:16px; bottom:16px; z-index:2147483647; }
  `);

  /** Utils (Shadow DOM 横断) */
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

  /** 対象画面判定（アップロード/投稿フロー） */
  function isUploadFlow(){
    const u = new URL(location.href);
    // 代表的なパス: /upload, /channel/<id>/videos/upload
    if (/\/upload/.test(u.pathname)) return true;
    // DOMの実体で判定
    const markers = [
      'ytcp-uploads-dialog',           // 旧: アップロード開始ダイアログ
      'ytcp-video-metadata-editor',    // 詳細入力画面
      'ytcp-uploads-still-processing'  // 処理中画面
    ];
    return deepQueryAll(markers.join(',')).some(isVisible);
  }

  /** 「次へ」/「公開」近辺のホストボタンを探す */
  function findUploadHostButton(){
    // よくあるID
    const byId = deepQueryAll('ytcp-button#next-button, ytcp-button#done-button, ytcp-button#save-button').find(isVisible);
    if (byId) return byId;

    // ラベルで探索（多言語対応・必要に応じて追加）
    const labels = ['次へ','Next','公開','Publish','保存','Save','保存して公開','Save and publish'];
    const cand = byText(deepQueryAll('ytcp-button,button'), labels);
    return cand ? (cand.closest?.('ytcp-button') || cand) : null;
  }

  /** ボタンクリック時の処理（自由に書き換え） */
  async function onCustomButtonClick(){
    try{
      // 例：タイトル入力欄を取得して末尾にタグを追記
      const titleBox = deepQueryAll('ytcp-social-suggestions-textbox, ytcp-form-input-container')
        .find(el => /title/i.test(el?.getAttribute?.('id') || '') || el.querySelector?.('#title-textarea, #text-input'));
      const input = titleBox?.querySelector?.('#title-textarea, #text-input') || titleBox?.shadowRoot?.querySelector?.('#title-textarea, #text-input');
      if (input) {
        const v = input.value || '';
        input.value = v.replace(/\s+$/, '') + (v ? ' ' : '') + '#TracklistReady';
        input.dispatchEvent(new Event('input', {bubbles:true}));
        toast('✅ タイトルにタグを追記しました');
      } else {
        toast('ℹ️ アクション実行：カスタム処理を追加してください');
      }
    }catch(e){
      console.error(e);
      toast('⚠️ エラーが発生しました（詳細はConsole）');
    }
  }

  /** トースト */
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

  /** スタイル注入 */
  function addStyle(css){
    const s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /** 固定ボタン設置（フォールバック） */
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

  /** インライン設置（見つからないときは固定にフォールバック） */
  function ensureInlineButton(){
    if(!isUploadFlow()){
      ensureFixedButton(false);
      const inline = document.getElementById(INLINE_BTN_ID);
      if (inline) inline.style.display = 'none';
      return false;
    }

    // 既にある場合は表示だけ整える
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

    // インラインボタン作成
    const btn = document.createElement('button');
    btn.id = INLINE_BTN_ID; btn.type = 'button'; btn.textContent = 'Custom Action';
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

  /** 画面変化に追随（StudioはSPA） */
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
    // 初期設置
    ensureInlineButton();

    // DOM変化監視
    const mo = new MutationObserver(()=> heal());
    mo.observe(document.documentElement, {childList:true, subtree:true});

    // YouTube独自イベント/URL変化に追随
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
    setInterval(()=> fire(), 1200); // 保険の軽ポーリング
    window.addEventListener('ysu:url-changed', onUrlMaybeChanged);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();