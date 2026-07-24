// auth-guard.js
import { auth, DB } from './database.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

(function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['login.html'];

    // مراقبة حالة تسجيل الدخول من سيرفرات Firebase
    onAuthStateChanged(auth, async (user) => {
        
        // 1. إذا لم يكن مسجلاً ويحاول دخول صفحة محمية
        if (!user && !publicPages.includes(currentPage)) {
            window.location.replace('login.html');
            return; 
        } 
        
        // 2. إذا كان مسجلاً ويحاول الدخول لصفحة اللوجين
        if (user && currentPage === 'login.html') {
            window.location.replace('index.html');
            return;
        }
        
        // 3. حماية إضافية لصفحة الأدمن
        if (user && currentPage === 'admin.html') {
            try {
                // جلب بيانات المستخدم من Firestore للتحقق من الصلاحية (Role)
                const userData = await DB.get('users', user.uid);
                
                if (!userData || userData.role !== 'admin') {
                    alert('❌ غير مصرح لك بالدخول للوحة التحكم');
                    window.location.replace('index.html');
                }
            } catch (error) {
                console.error("خطأ في التحقق من صلاحيات الأدمن:", error);
                window.location.replace('index.html');
            }
        }
    });
})();