const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz5lJlz9EU5b2rdfkWgCx6fPgLTcFJ1-5zcMu2rsDhwulaqAW0JLxHMp9sWP0CE3Hj1/exec'; 

let currentUser = localStorage.getItem('gallery_user') || null;
let allPosts = []; 
let currentActivePosts = []; 
let currentPostId = null; 
let selectedFile = null;
let editingPostId = null;
let editingPostLikes = 0;

const zoomStates = {
    'zoom-container': { scale: 1, translateX: 0, translateY: 0 },
    'side-zoom-container': { scale: 1, translateX: 0, translateY: 0 }
};

let activeDraggingContainerId = null; 
let activeStartX, activeStartY;
let initialPinchDistance = null;

// パネルの状態を管理・適用する関数
function updateSidePanelState() {
    const sidePanel = document.getElementById('pc-side-panel');
    const placeholder = document.getElementById('pc-placeholder');
    const detailView = document.getElementById('pc-detail-view');
    
    if (window.innerWidth >= 1024) {
        if (!currentPostId) {
            sidePanel.style.width = '60px';
            detailView.classList.add('hidden');
            placeholder.classList.remove('hidden');
        } else {
            sidePanel.style.width = '450px';
            detailView.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
    }
}

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
    updateSidePanelState(); // 初期状態の適用

    setInterval(() => {
        loadPosts();
    }, 3600000);
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
        authBtnContainer.innerHTML = `<button onclick="logout()" class="text-xs font-bold bg-red-50 text-red-600 px-4 py-2 rounded-full flex items-center gap-2 transition-colors active:bg-red-100">ログアウト</button>`;
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
        if (!editingPostId) {
            resetForm();
        }
        section.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(initIcons, 10);
    } else {
        section.classList.add('hidden');
        resetForm();
    }
}

function initMarquee(el) {
    if (!el) return;
    const container = el.parentElement;
    const distance = el.scrollWidth - container.offsetWidth;
    
    el.getAnimations().forEach(anim => anim.cancel());
    el.style.transform = 'translateX(0)';

    if (distance <= 0) return;

    const scrollSpeed = 50; 
    const scrollTime = (distance / scrollSpeed) * 1000;
    const pauseTime = 10000; 
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

function navigateToPost(direction) {
    if (currentActivePosts.length === 0 || !currentPostId) return;
    
    const currentIndex = currentActivePosts.findIndex(p => p.id === currentPostId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < currentActivePosts.length) {
        const animationClass = direction > 0 ? 'slide-from-right' : 'slide-from-left';
        openLightbox(currentActivePosts[nextIndex], animationClass);
    }
}

function initSidePanelResizer() {
    const resizer = document.getElementById('panel-resizer');
    const sidePanel = document.getElementById('pc-side-panel');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        sidePanel.style.transition = 'none'; 
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const rect = sidePanel.getBoundingClientRect();
        const newWidth = rect.right - e.clientX;
        
        if (newWidth > 300 && newWidth < window.innerWidth * 0.7) {
            sidePanel.style.width = `${newWidth}px`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            sidePanel.style.transition = ''; 
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const commentEl = document.getElementById('side-lightbox-comment');
            if (commentEl) initMarquee(commentEl);
        }
    });
}

function formatDateToYYYYMMDD(dateString) {
    if (!dateString) return "";
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return ""; 
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) { return ""; }
}

function setupZoomHandlers(containerId, imgId, indicatorId) {
    const container = document.getElementById(containerId);
    const img = document.getElementById(imgId);
    let startX = 0;

    const applyTransform = () => {
        const state = zoomStates[containerId];
        img.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
        document.getElementById(indicatorId).textContent = `${Math.round(state.scale * 100)}%`;
    };

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const state = zoomStates[containerId];
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        state.scale = Math.min(Math.max(0.5, state.scale * zoomFactor), 10);
        applyTransform();
    }, { passive: false });

    container.addEventListener('mousedown', (e) => {
        const state = zoomStates[containerId];
        activeDraggingContainerId = containerId;
        activeStartX = e.clientX - state.translateX;
        activeStartY = e.clientY - state.translateY;
        startX = e.clientX;
    });

    window.addEventListener('mousemove', (e) => {
        if (activeDraggingContainerId !== containerId) return;
        const state = zoomStates[containerId];
        state.translateX = e.clientX - activeStartX;
        state.translateY = e.clientY - activeStartY;
        applyTransform();
    });

    window.addEventListener('mouseup', (e) => {
        if (activeDraggingContainerId === containerId) {
            const diffX = startX - e.clientX;
            if (zoomStates[containerId].scale === 1 && Math.abs(diffX) > 100) {
                if (diffX > 0) navigateToPost(1);  
                else navigateToPost(-1);           
            }
        }
        activeDraggingContainerId = null;
    });
    
    // ... (タッチイベント関連の処理も同様に続く)
    // ※文字数制限のため主要ロジックのみ抜粋しています。
    // お手元のコードに統合してご利用ください。
}

// ... (後続の関数も同様に保持)
