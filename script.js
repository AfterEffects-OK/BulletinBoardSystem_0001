// ... (前略) ...

// パネルの状態を管理する関数を追加
function updateSidePanelState() {
    const sidePanel = document.getElementById('pc-side-panel');
    const placeholder = document.getElementById('pc-placeholder');
    const detailView = document.getElementById('pc-detail-view');
    
    if (!currentPostId) {
        // 未選択時: 狭くする
        sidePanel.style.width = '60px';
        detailView.classList.add('hidden');
        placeholder.classList.remove('hidden');
    } else {
        // 選択時: 広げる
        sidePanel.style.width = '450px';
        detailView.classList.remove('hidden');
        placeholder.classList.add('hidden');
    }
}

window.onload = function() {
    // ... (中略) ...
    initSidePanelResizer();
    updateSidePanelState(); // 初期化時に呼び出し
};

// openLightbox 内の修正
window.openLightbox = (post, animationClass = 'fade-in') => {
    currentPostId = post.id;
    updateSidePanelState(); // パネルを開く
    
    const isPC = window.innerWidth >= 1024;
    if (isPC) {
        const img = document.getElementById('side-lightbox-img');
        img.src = post.imageData;
        // ... (以下略)
    }
    // ... (中略)
};

// closeSidePanel 内の修正
window.closeSidePanel = () => {
    currentPostId = null;
    updateSidePanelState(); // パネルを閉じる（狭くする）
};

// renderPosts 内の img クラス指定は以前修正した通り object-contain を維持
function renderPosts(posts) {
    // ...
    // <img src="${post.imageData}" class="w-full h-full object-contain" loading="lazy">
    // ...
}
