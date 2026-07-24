// database.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch 
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// إعدادات الفير بيز الخاصة بك
const firebaseConfig = {
    apiKey: "AIzaSyDOFd1M8IIxG7UyLdGHpu24TzC77kBa740",
    authDomain: "training-lb-1945b.firebaseapp.com",
    projectId: "training-lb-1945b",
    storageBucket: "training-lb-1945b.firebasestorage.app",
    messagingSenderId: "202134601199",
    appId: "1:202134601199:web:86d145ef5fe762f247ca1a",
    measurementId: "G-9KMSG3M4P1"
};

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const DB = {
    // ========== تهيئة قاعدة البيانات ==========
    async init() {
        console.log("✅ تم الاتصال بقاعدة بيانات Firestore بنجاح");
        return Promise.resolve();
    },

    // ========== إدراج عنصر واحد ==========
    async insert(storeName, data) {
        try {
            if (data.id) {
                // إذا كان للعنصر ID مسبق (مثل تسجيل مستخدم)
                await setDoc(doc(db, storeName, String(data.id)), data);
                console.log(`✅ تم إدراج عنصر في ${storeName}`);
                return data.id;
            } else {
                // إنشاء ID تلقائي من Firestore
                const docRef = await addDoc(collection(db, storeName), data);
                // تحديث المستند ليحتوي على الـ ID الخاص به
                await updateDoc(docRef, { id: docRef.id });
                console.log(`✅ تم إدراج عنصر جديد في ${storeName}`);
                return docRef.id;
            }
        } catch (error) {
            console.error(`❌ فشل إدراج في ${storeName}:`, error);
            throw error;
        }
    },

    // ========== تحديث عنصر ==========
    async update(storeName, data) {
        try {
            if (!data.id) throw new Error("ID مطلوب للتحديث");
            const docRef = doc(db, storeName, String(data.id));
            await updateDoc(docRef, data);
            console.log(`✅ تم تحديث عنصر في ${storeName}`);
            return data.id;
        } catch (error) {
            console.error(`❌ فشل تحديث في ${storeName}:`, error);
            throw error;
        }
    },

    // ========== استرجاع عنصر بواسطة ID ==========
    async get(storeName, id) {
        try {
            const docRef = doc(db, storeName, String(id));
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error(`❌ فشل استرجاع من ${storeName}:`, error);
            throw error;
        }
    },

    // ========== استرجاع جميع العناصر ==========
    async getAll(storeName) {
        try {
            const querySnapshot = await getDocs(collection(db, storeName));
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`❌ فشل استرجاع الكل من ${storeName}:`, error);
            throw error;
        }
    },

    // ========== حذف عنصر بواسطة ID ==========
    async delete(storeName, id) {
        try {
            await deleteDoc(doc(db, storeName, String(id)));
            console.log(`✅ تم حذف عنصر من ${storeName} (ID: ${id})`);
        } catch (error) {
            console.error(`❌ فشل حذف من ${storeName}:`, error);
            throw error;
        }
    },

    // ========== فلترة البيانات ==========
    async filter(storeName, predicate) {
        try {
            const all = await this.getAll(storeName);
            return all.filter(predicate);
        } catch (error) {
            console.error(`❌ فشل فلترة البيانات في ${storeName}:`, error);
            throw error;
        }
    },

    // ========== البحث عن عنصر واحد ==========
    async find(storeName, predicate) {
        try {
            const all = await this.getAll(storeName);
            return all.find(predicate) || null;
        } catch (error) {
            console.error(`❌ فشل البحث عن عنصر في ${storeName}:`, error);
            throw error;
        }
    },


    async bulkInsert(storeName, dataArray) {
        try {
            if (!dataArray || dataArray.length === 0) return [];
            
            const CHUNK_SIZE = 50; // تقليص حجم الدفعة إلى 50 لضمان عدم ضغط السيرفر
            const results = [];

            for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
                const chunk = dataArray.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                
                chunk.forEach(item => {
                    const docRef = item.id ? doc(db, storeName, String(item.id)) : doc(collection(db, storeName));
                    const itemData = item.id ? item : { ...item, id: docRef.id };
                    batch.set(docRef, itemData, { merge: true }); // دمج البيانات وتحديثها بدون تكرار
                    results.push(itemData);
                });
                
                await batch.commit();
                console.log(`✅ تم دمج دفعة من ${chunk.length} عنصر في ${storeName}`);
                
                // مهلة زمنية ثвищаً (1 ثانية) بين كل دفعة وأخرى لراحة السيرفر تماماً
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(`✅ تم الانتهاء من إدراج ودمج ${dataArray.length} عنصر في ${storeName} بنجاح`);
            return results;
        } catch (error) {
            console.error(`❌ فشل الإدراج الدفعي في ${storeName}:`, error);
            throw error;
        }
    }
};

// جعل الكائن متاحاً على مستوى الـ Window لتجنب كسر الأكواد القديمة
window.DB = DB;