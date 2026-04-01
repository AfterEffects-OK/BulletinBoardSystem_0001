const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz5lJlz9EU5b2rdfkWgCx6fPgLTcFJ1-5zcMu2rsDhwulaqAW0JLxHMp9sWP0CE3Hj1/exec'; 

let currentUser = localStorage.getItem('gallery_user') || null;
let selectedFile = null;
let editingPostId = null;
let editingPostLikes = 0;

// ズーム・パンの状態管理（コンテナごとに保持するためのマップ）
const zoomStates = {
    'zoom-container': { scale: 1, translateX: 0, translateY: 0 },
    'side-zoom-container': { scale: 1, translateX: 0, translateY: 0 }
};

let activeIsDragging = false;
let activeStartX, activeStartY;
let initialPinchDistance = null;

window.onload = function() {
    initIcons();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('start-date').value = today;
    loadPosts();
    if (currentUser) {
        checkPermission(currentUser, true);
    }
    initEventListeners();
    setupZoomHandlers('zoom-container', 'lightbox-img', 'zoom-indicator');
    setupZoomHandlers('side-zoom-container', 'side-lightbox-img', 'side-zoom-indicator');
    initSidePanelResizer();
};

function initIcons() {
    if (typeof lucide !== 'undefined') {
        requestAnimationFrame(() => {
            lucide.createIcons();
        });
    }
}

function showLoginModal(show) {
    document.getElementById('login-modal').classList.toggle('hidden', !show);
    if(show) {
        setTimeout(initIcons, 10);
    }
}

async function handleLogin() {
    const input = document.getElementById('login-input').value.trim();
    if (!input) return;
    setLoading(true);
    await checkPermission(input, false);
    setLoading(false);
}

async function checkPermission(userId, silentCheck = false) {
    if (!GAS_WEB_APP_URL) {
        if(!silentCheck) alert('GAS URLが未設定です。');
        return;
    }
    try {
        const res = await fetch(`${GAS_WEB_APP_URL}?action=getWhitelist`);
        const whitelist = await res.json();
        if (whitelist.includes(userId)) {
            currentUser = userId;
            localStorage.setItem('gallery_user', userId);
            updateAuthUI(true);
            showLoginModal(false);
            loadPosts();
        } else {
            if(!silentCheck) showMessage('アクセス権限がありません', 'error');
            logout(false);
        }
    } catch (err) { 
        if(!silentCheck) showMessage('認証エラーが発生しました', 'error'); 
    }
}

function updateAuthUI(isLoggedIn) {
    const fab = document.getElementById('mobile-fab');
    const authBtnContainer = document.getElementById('auth-header-btn');
    const displayName = document.getElementById('display-user-name');

    if (isLoggedIn) {
        fab.classList.remove('hidden');
        if (displayName) displayName.textContent = `@${currentUser}`;
        authBtnContainer.innerHTML = `<button onclick="logout()" class="text-xs font-bold bg-red-50 text-red-600 px-4 py-2 rounded-full flex items-center gap-2 transition-colors active:bg-red-100"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>ログアウト</button>`;
    } else {
        fab.classList.add('hidden');
        if (displayName) displayName.textContent = '';
        authBtnContainer.innerHTML = `<button onclick="showLoginModal(true)" class="text-xs font-bold bg-slate-100 text-slate-600 px-4 py-2 rounded-full">ログイン</button>`;
    }
    initIcons();
}

function logout(confirmNeeded = true) {
    if(confirmNeeded && !confirm('ログアウトしますか？')) return;
    localStorage.removeItem('gallery_user');
    editingPostId = null;
    currentUser = null;
    updateAuthUI(false);
    document.getElementById('upload-section').classList.add('hidden');
    loadPosts();
}

function toggleUploadSection() { 
    if (!currentUser) {
        showLoginModal(true);
        return;
    }
    const section = document.getElementById('upload-section');
    if (section.classList.contains('hidden')) {
        // 画面を開くとき：編集IDがない（新規投稿ボタン経由）ならフォームをリセット
        if (!editingPostId) {
            resetForm();
        }
        section.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(initIcons, 10);
    } else {
        // 画面を閉じるとき：状態を残さないようリセットしてから閉じる
        section.classList.add('hidden');
        resetForm();
    }
}

function initMarquee(el) {
    if (!el) return;
    const container = el.parentElement;
    const distance = el.scrollWidth - container.offsetWidth;
    
    // 既存のアニメーションをクリア
    el.getAnimations().forEach(anim => anim.cancel());
    el.style.transform = 'translateX(0)';

    if (distance <= 0) return;

    const scrollSpeed = 50; // 秒間50px
    const scrollTime = (distance / scrollSpeed) * 1000;
    const pauseTime = 10000; // 10秒
    const totalTime = pauseTime + scrollTime + pauseTime;

    el.animate([
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: pauseTime / totalTime },
        { transform: 'translateX(-' + distance + 'px)', offset: (pauseTime + scrollTime) / totalTime },
        { transform: 'translateX(-' + distance + 'px)', offset: 1 }
    ], {
        duration: totalTime,
        iterations: Infinity,
        easing: 'linear'
    });
}

function initEventListeners() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

    ['dragover', 'dragenter'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drop-zone--over');
        });
    });

    ['dragleave', 'dragend', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drop-zone--over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleFile(files[0]);
        }
    });

    document.getElementById('submit-btn').addEventListener('click', handleSubmit);
    
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });
}

function initSidePanelResizer() {
    const resizer = document.getElementById('panel-resizer');
    const sidePanel = document.getElementById('pc-side-panel');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const rect = sidePanel.getBoundingClientRect();
        const newWidth = rect.right - e.clientX;
        
        // 最小300px、最大は画面幅の70%までに制限
        if (newWidth > 300 && newWidth < window.innerWidth * 0.7) {
            sidePanel.style.width = `${newWidth}px`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
                    // ドラッグ終了時にマーキーを再計算
                    const commentEl = document.getElementById('side-lightbox-comment');
                    if (commentEl) initMarquee(commentEl);
        }
    });
}

function setupZoomHandlers(containerId, imgId, indicatorId) {
    const container = document.getElementById(containerId);
    const img = document.getElementById(imgId);

    const applyTransform = () => {
        const state = zoomStates[containerId];
        img.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
        document.getElementById(indicatorId).textContent = `${Math.round(state.scale * 100)}%`;
    };

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const state = zoomStates[containerId];
        const delta = -e.deltaY;
        const zoomFactor = 1.1;
        if (delta > 0) state.scale *= zoomFactor;
        else state.scale /= zoomFactor;
        
        state.scale = Math.min(Math.max(0.5, state.scale), 10);
        applyTransform();
    }, { passive: false });

    container.addEventListener('mousedown', (e) => {
        const state = zoomStates[containerId];
        activeIsDragging = true;
        activeStartX = e.clientX - state.translateX;
        activeStartY = e.clientY - state.translateY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!activeIsDragging) return;
        const state = zoomStates[containerId];
        state.translateX = e.clientX - activeStartX;
        state.translateY = e.clientY - activeStartY;
        applyTransform();
    });

    window.addEventListener('mouseup', () => { activeIsDragging = false; });

    container.addEventListener('touchstart', (e) => {
        const state = zoomStates[containerId];
        if (e.touches.length === 1) {
            activeIsDragging = true;
            activeStartX = e.touches[0].clientX - state.translateX;
            activeStartY = e.touches[0].clientY - state.translateY;
        } else if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    });

    container.addEventListener('touchmove', (e) => {
        e.preventDefault();
                const state = zoomStates[containerId];
                if (e.touches.length === 1 && activeIsDragging) {
                    state.translateX = e.touches[0].clientX - activeStartX;
                    state.translateY = e.touches[0].clientY - activeStartY;
        } else if (e.touches.length === 2) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (initialPinchDistance) {
                const zoomFactor = currentDist / initialPinchDistance;
                        state.scale *= zoomFactor;
                        state.scale = Math.min(Math.max(0.5, state.scale), 10);
                initialPinchDistance = currentDist;
            }
        }
        applyTransform();
    }, { passive: false });

    container.addEventListener('touchend', () => {
                activeIsDragging = false;
        initialPinchDistance = null;
    });

    container.addEventListener('dblclick', () => {
                const state = zoomStates[containerId];
                if (state.scale > 1.1) {
                    state.scale = 1; state.translateX = 0; state.translateY = 0;
        } else {
                    state.scale = 2.5;
        }
        applyTransform();
    });
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) return showMessage('画像のみ選択できます', 'error');
    if (file.size > 2 * 1024 * 1024) return showMessage('2MB以下にしてください', 'error');
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('image-preview').src = e.target.result;
        document.getElementById('preview-container').classList.remove('hidden');
        document.getElementById('drop-content').classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

function resetImage(e) {
    if (e) e.stopPropagation();
    selectedFile = null;
    document.getElementById('image-preview').src = "";
    document.getElementById('preview-container').classList.add('hidden');
    document.getElementById('drop-content').classList.remove('hidden');
    document.getElementById('file-input').value = "";
}

async function handleSubmit() {
    const comment = document.getElementById('comment-input').value.trim();
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const imageData = document.getElementById('image-preview').src;

    if (!imageData || !comment || !startDate) return showMessage('未入力の項目があります', 'error');
    
    setLoading(true);
    const action = editingPostId ? 'update' : 'add';
    const post = {
        id: editingPostId || crypto.randomUUID(), 
        userName: currentUser, 
        comment,
        imageData: imageData,
        timestamp: Date.now(), 
        likes: editingPostId ? editingPostLikes : 0, 
        startDate, 
        endDate: endDate || '9999-12-31'
    };
    try {
        const res = await fetch(GAS_WEB_APP_URL, { 
            method: 'POST', 
            // GASへのCORSエラーを回避するためにtext/plainを使用
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, post }) 
        });
        const result = await res.json();
        if (result.status === 'success') {
            showMessage(editingPostId ? '更新しました' : '投稿しました', 'success');
            resetForm(); toggleUploadSection(); loadPosts();
        } else { showMessage(result.message || 'サーバーエラーが発生しました', 'error'); }
    } catch (err) {
        console.error('Submit Error:', err); // ブラウザのコンソールに詳細を出力
        showMessage('送信に失敗しました', 'error');
    }
    finally { setLoading(false); }
}

function resetForm() {
    document.getElementById('comment-input').value = "";
    document.getElementById('end-date').value = "";
    resetImage();
    editingPostId = null;
    editingPostLikes = 0;
    document.getElementById('form-title').textContent = "新規投稿";
    document.getElementById('submit-btn').textContent = "投稿を公開する";
}

async function loadPosts() {
    if (!GAS_WEB_APP_URL) return;
    const refreshIcon = document.getElementById('refresh-icon');
    refreshIcon.classList.add('animate-spin');
    try {
        const res = await fetch(GAS_WEB_APP_URL);
        const posts = await res.json();
        const todayStr = new Date().toISOString().split('T')[0];
        const activePosts = posts.filter(p => {
            const start = p.startDate || '0000-00-00';
            const end = p.endDate || '9999-12-31';
            // ログインしている場合は掲載開始前の項目も表示する
            const isStarted = todayStr >= start;
            const isNotExpired = todayStr <= end;
            return isNotExpired && (currentUser ? true : isStarted);
        });
        renderPosts(activePosts.sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) { showMessage('読み込みに失敗しました', 'error'); }
    finally { refreshIcon.classList.remove('animate-spin'); }
}

function renderPosts(posts) {
    const grid = document.getElementById('post-grid');
    const emptyState = document.getElementById('empty-state');
    const todayStr = new Date().toISOString().split('T')[0];
    grid.innerHTML = "";
    if (posts.length === 0) { emptyState.classList.remove('hidden'); return; }
    emptyState.classList.add('hidden');
    posts.forEach(post => {
        // 投稿者と現在のユーザーが一致するかチェック（空白削除・小文字化して比較）
        const isOwner = currentUser && post.userName && post.userName.trim().toLowerCase() === currentUser.trim().toLowerCase();
        
        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl overflow-hidden shadow-sm flex flex-col group h-fit fade-in";
        const postData = btoa(unescape(encodeURIComponent(JSON.stringify(post))));
        card.innerHTML = `
            <div class="relative aspect-square bg-slate-100 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform duration-200" onclick="openLightboxFromBase64('${postData}')">
                <img src="${post.imageData}" class="w-full h-full object-cover" loading="lazy">
            </div>
            <div class="p-3">
                <div class="flex justify-between items-center mb-1">
                    ${post.startDate > todayStr ? '<span class="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">予約中</span>' : '<span></span>'}
                    <span class="text-[9px] text-slate-300 shrink-0 italic">${post.endDate === '9999-12-31' ? 'ALWAYS' : post.endDate.slice(5)}</span>
                </div>
                <div class="overflow-hidden">
                    <p class="marquee-target text-[30px] font-bold text-slate-800 leading-[1.1] tracking-tighter whitespace-nowrap inline-block">${post.comment}</p>
                </div>
                <div class="flex justify-between items-center mt-3 pt-2 border-t border-slate-50">
                    <button onclick="handleLike('${post.id}')" class="text-slate-300 hover:text-pink-500 flex items-center gap-1 active:scale-125 transition-transform">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        <span class="text-[10px] font-bold">${post.likes}</span>
                    </button>
                    ${isOwner ? `
                        <div class="flex gap-1">
                            <button onclick="editPost('${postData}')" class="text-slate-300 hover:text-indigo-600 p-1">
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                </svg>
                            </button>
                            <button onclick="deletePost('${post.id}')" class="text-slate-300 hover:text-red-500 p-1">
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    grid.querySelectorAll('.marquee-target').forEach(el => initMarquee(el));
    initIcons();
}

function editPost(base64) {
    const post = JSON.parse(decodeURIComponent(escape(atob(base64))));
    editingPostId = post.id;
    editingPostLikes = post.likes || 0;
    
    document.getElementById('comment-input').value = post.comment;
    document.getElementById('start-date').value = post.startDate;
    document.getElementById('end-date').value = post.endDate === '9999-12-31' ? '' : post.endDate;
    
    const preview = document.getElementById('image-preview');
    preview.src = post.imageData;
    document.getElementById('preview-container').classList.remove('hidden');
    document.getElementById('drop-content').classList.add('hidden');
    
    toggleUploadSection();
    document.getElementById('form-title').textContent = "投稿を編集";
    document.getElementById('submit-btn').textContent = "投稿を更新する";
}

async function handleLike(id) { 
    try { 
        await fetch(GAS_WEB_APP_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'like', id }) 
        }); 
        loadPosts(); 
    } catch (err) {
        console.error('Like Error:', err);
    } 
}

async function deletePost(id) {
    if (confirm('この投稿を削除しますか？')) {
        setLoading(true);
        try {
            const res = await fetch(GAS_WEB_APP_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'delete', id }) 
            });
            const result = await res.json();
            if (result.status === 'success') {
                showMessage('削除しました', 'success');
                loadPosts();
            } else { showMessage(result.message || '削除に失敗しました', 'error'); }
        } catch (err) { showMessage('通信エラーが発生しました', 'error'); }
        finally { setLoading(false); }
    }
}

window.openLightboxFromBase64 = (base64) => {
    const post = JSON.parse(decodeURIComponent(escape(atob(base64))));
    openLightbox(post);
};

window.openLightbox = (post) => {
    const isPC = window.innerWidth >= 1024;
    
    // ズーム状態を初期化
    const modalState = zoomStates['zoom-container'];
    const sideState = zoomStates['side-zoom-container'];
    modalState.scale = 1; modalState.translateX = 0; modalState.translateY = 0;
    sideState.scale = 1; sideState.translateX = 0; sideState.translateY = 0;

    if (isPC) {
        // PC表示: サイドパネルを更新
        document.getElementById('pc-placeholder').classList.add('hidden');
        const detailView = document.getElementById('pc-detail-view');
        detailView.classList.remove('hidden');
        
        const img = document.getElementById('side-lightbox-img');
        img.src = post.imageData;
        img.style.transform = `translate(0px, 0px) scale(1)`;
        document.getElementById('side-zoom-indicator').textContent = '100%';

        const commentEl = document.getElementById('side-lightbox-comment');
        commentEl.textContent = post.comment;
        setTimeout(() => initMarquee(commentEl), 50);
        return;
    }

    // スマホ表示: モーダルを更新
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    img.src = post.imageData;
    img.style.transform = `translate(0px, 0px) scale(1)`;
    document.getElementById('zoom-indicator').textContent = '100%';

    // コメントのみ設定
    const commentEl = document.getElementById('lightbox-comment');
    commentEl.textContent = post.comment;
    lb.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    initIcons();
    setTimeout(() => initMarquee(commentEl), 50);
};

window.closeLightbox = () => { 
    const lb = document.getElementById('lightbox');
    lb.classList.add('hidden'); 
    document.body.style.overflow = ''; 
};

function setLoading(isLoading) { document.getElementById('global-loader').classList.toggle('hidden', !isLoading); }
function showMessage(text, type) {
    const box = document.createElement('div');
    box.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl text-xs text-white font-bold z-[100] transition-all shadow-2xl fade-in ${type === 'error' ? 'bg-red-500' : 'bg-slate-800'}`;
    box.textContent = text;
    document.body.appendChild(box);
    setTimeout(() => { box.style.opacity = '0'; box.style.transform = 'translate(-50%, 20px)'; setTimeout(() => box.remove(), 500); }, 2500);
}