// script.js
import { auth, DB } from './database.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// ========== المتغيرات العامة ==========
let appData = null;
let currentUser = null;

// ========== تحميل جميع البيانات من Firestore ==========
async function loadData() {
    await DB.init();

    // جلب البيانات من المجموعات السحابية
    const sections = await DB.getAll("sections");
    const links = await DB.getAll("links");
    const users = await DB.getAll("users");
    const materials = await DB.getAll("materials");
    const settings = await DB.getAll("settings");

    const lastId =
        settings.find(s => s.id === "lastId") ||
        { id: "lastId", section: 9, link: 202 };

    // ربط الروابط بأقسامها
    sections.forEach(section => {
        section.links = links.filter(l => String(l.sectionId) === String(section.id));
    });

    appData = {
        sections,
        users,
        materials,
        lastId
    };

    return appData;
}

// ========== حفظ البيانات (معدلة للعمل السحابي) ==========
async function saveData(data) {
    // ملاحظة: في Firebase، نستخدم bulkInsert لتحديث البيانات أو إضافتها. 
    // عمليات الحذف المعقدة تتم من خلال لوحة التحكم الخاصة بالأدمن.
    
    const sections = data.sections.map(({ links, ...s }) => s);
    if (sections.length) await DB.bulkInsert("sections", sections);

    const allLinks = [];
    data.sections.forEach(section => {
        (section.links || []).forEach(link => {
            allLinks.push({ ...link, sectionId: section.id });
        });
    });

    if (allLinks.length) await DB.bulkInsert("links", allLinks);
    if (data.users && data.users.length) await DB.bulkInsert("users", data.users);
    if (data.materials && data.materials.length) await DB.bulkInsert("materials", data.materials);
    if (data.lastId) await DB.update("settings", data.lastId);

    appData = data;
}

// ========== تصدير البيانات (نسخة احتياطية JSON) ==========
async function exportData() {
    const data = await loadData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 تم تصدير النسخة الاحتياطية');
}

// ========== استيراد البيانات إلى Firestore ==========
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                showToast('⏳ جاري رفع البيانات إلى السيرفر... الرجاء الانتظار');
                const importedData = JSON.parse(event.target.result);
                
                // حفظ البيانات المستوردة سحابياً
                await saveData(importedData);
                
                showToast('✅ تم استيراد البيانات بنجاح');
                setTimeout(() => window.location.reload(), 1500);
            } catch (error) {
                console.error(error);
                showToast('❌ خطأ في استيراد الملف', true);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ========== الرسائل المنبثقة ==========
function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    if (isError) toast.classList.add('error');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== تحديث شريط التنقل بناءً على حالة المستخدم السحابية ==========
function updateNavbar() {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // جلب تفاصيل المستخدم من Firestore لمعرفة الصلاحية
            const userData = await DB.get('users', user.uid) || { role: 'user', username: user.email };
            const roleText = userData.role === 'admin' ? 'أدمن' : 'مستخدم';
            
            navLinks.innerHTML = `
                <span class="user-welcome">👋 مرحباً ${escapeHtml(userData.username)} </span>
                <a href="reports-offjob.html" style="background:#4299e1; color:white; padding:0.5rem 1rem; border-radius:2rem; text-decoration:none;">📊 Off Job Report </a>
                <a href="reports-onjob.html" style="background:#48bb78; color:white; padding:0.5rem 1rem; border-radius:2rem; text-decoration:none;">📊 On Job Report </a>
                <a href="top-performers.html" style="background:#e53e3e; color:white;">🏆 تحليل التقرير</a>
                <a href="update.html" style="background:#2b7a4b; color:white;">📊 تحديث البيانات</a>
                ${userData.role === 'admin' ? '<a href="admin.html" style="background:#2b7a4b; color:white; padding:0.5rem 1rem; border-radius:2rem; text-decoration:none;">⚙️ Admin </a>' : ''}
                <a href="#" onclick="logout()" style="background:#e53e3e; color:white; padding:0.5rem 1rem; border-radius:2rem; text-decoration:none;">🚪 تسجيل خروج</a>
            `;
        } else {
            navLinks.innerHTML = `
                <a href="login.html" style="background:#1e3a5f; color:white; padding:0.5rem 1rem; border-radius:2rem; text-decoration:none;">🔐 دخول الموظفين</a>
            `;
        }
    });
}

// ========== تسجيل الخروج ==========
async function logout() {
    try {
        await signOut(auth);
        showToast('👋 تم تسجيل الخروج بنجاح');
        setTimeout(() => window.location.href = 'login.html', 500);
    } catch (error) {
        showToast('❌ حدث خطأ أثناء تسجيل الخروج', true);
    }
}

// ========== تسجيل الزيارات (محسنة لتقليل الضغط على قاعدة البيانات) ==========
async function trackView(sectionId, linkId) {
    if (!appData) await loadData();
    const section = appData.sections.find(s => String(s.id) === String(sectionId));
    if (section) {
        const link = section.links.find(l => String(l.id) === String(linkId));
        if (link) {
            link.views = (link.views || 0) + 1;
            // تحديث هذا الرابط بالتحديد فقط في Firestore لتقليل القراءة والكتابة
            await DB.update('links', { id: link.id, views: link.views });
        }
    }
}

// ========== عرض الروابط ==========
function renderLinks(links, sectionId) {
    if (!links || links.length === 0) {
        return '<div class="empty-links">📭 لا توجد روابط حالياً</div>';
    }
    
    const sortedLinks = [...links].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    
    return sortedLinks.map(link => `
        <a href="${link.url}" target="_blank" class="link-item ${link.pinned ? 'pinned' : ''}" onclick="trackView('${sectionId}', '${link.id}')">
            <div class="link-title">
                <span class="link-icon">${link.pinned ? '📌' : '🔗'}</span>
                <span>${escapeHtml(link.title)}</span>
                ${link.pinned ? '<span class="pinned-badge">مثبت</span>' : ''}
                ${link.views ? `<span class="view-count">👁️ ${link.views}</span>` : ''}
            </div>
        </a>
    `).join('');
}

// ========== عرض الأقسام ==========
async function renderSections() {
    const container = document.getElementById('sectionsContainer');
    if (!container) return;
    
    const data = await loadData();
    if (!data || !data.sections) return;
    
    const sections = data.sections;
    
    if (sections.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem;">📭 لا توجد أقسام حالياً</div>';
        return;
    }
    
    container.innerHTML = sections.map(section => `
        <div class="section-card" id="section-${section.id}">
            <div class="section-header">
                <div class="section-icon">${section.icon || '📁'}</div>
                <div>
                    <h3>${escapeHtml(section.name)}</h3>
                    <div class="section-desc">${escapeHtml(section.description || '')}</div>
                </div>
            </div>
            <div class="links-list">
                ${renderLinks(section.links || [], section.id)}
            </div>
        </div>
    `).join('');
}

// ========== البحث ==========
async function searchContent() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    const resultsDiv = document.getElementById('searchResults');
    
    if (!resultsDiv) return;
    
    if (!searchTerm || searchTerm.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }
    
    const data = await loadData();
    if (!data) return;
    
    const results = [];
    
    data.sections.forEach(section => {
        if (section.name.toLowerCase().includes(searchTerm)) {
            results.push({ type: 'section', name: section.name, id: section.id, icon: section.icon || '📁' });
        }
        (section.links || []).forEach(link => {
            if (link.title.toLowerCase().includes(searchTerm)) {
                results.push({ type: 'link', name: link.title, sectionId: section.id, linkId: link.id, sectionName: section.name });
            }
        });
    });
    
    if (results.length > 0) {
        resultsDiv.innerHTML = results.map(r => `
            <div class="search-result-item" onclick='goToResult(${JSON.stringify(r)})'>
                <span class="search-result-type ${r.type === 'section' ? 'type-section' : 'type-link'}">
                    ${r.type === 'section' ? '📂 قسم' : '🔗 رابط'}
                </span>
                <strong>${escapeHtml(r.name)}</strong>
                ${r.type === 'link' ? `<small> (في قسم: ${escapeHtml(r.sectionName)})</small>` : ''}
            </div>
        `).join('');
        resultsDiv.style.display = 'block';
    } else {
        resultsDiv.innerHTML = '<div class="search-result-item">❌ لا توجد نتائج</div>';
        resultsDiv.style.display = 'block';
    }
}

function goToResult(result) {
    const resultsDiv = document.getElementById('searchResults');
    if (resultsDiv) resultsDiv.style.display = 'none';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    if (result.type === 'section') {
        const element = document.getElementById(`section-${result.id}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.boxShadow = '0 0 0 3px #2b7a4b';
            setTimeout(() => { element.style.boxShadow = ''; }, 2000);
        }
    }
}

// ========== حماية لوحة التحكم (محسنة لـ Firebase) ==========
async function checkAdminAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                resolve(false);
                return;
            }
            
            const userData = await DB.get('users', user.uid);
            if (!userData || userData.role !== 'admin') {
                window.location.href = 'index.html';
                resolve(false);
                return;
            }
            
            currentUser = userData;
            resolve(true);
        });
    });
}

// ========== تصدير الدوال للـ Window لتسهيل استدعائها في الـ HTML ==========
window.exportData = exportData;
window.importData = importData;
window.searchContent = searchContent;
window.goToResult = goToResult;
window.logout = logout;
window.updateNavbar = updateNavbar;
window.renderSections = renderSections;
window.loadData = loadData;
window.checkAdminAuth = checkAdminAuth;
window.trackView = trackView;