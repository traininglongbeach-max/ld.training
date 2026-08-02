// database.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// ==================== إعدادات فيربيز ====================
const firebaseConfig = {
    apiKey: "AIzaSyDOFd1M8IIxG7UyLdGHpu24TzC77kBa740",
    authDomain: "training-lb-1945b.firebaseapp.com",
    projectId: "training-lb-1945b",
    storageBucket: "training-lb-1945b.firebasestorage.app",
    messagingSenderId: "202134601199",
    appId: "1:202134601199:web:86d145ef5fe762f247ca1a",
    measurementId: "G-9KMSG3M4P1"
};

// ==================== تهيئة Firebase ====================
const app = initializeApp(firebaseConfig);

// ==================== تهيئة Firestore مع الكاش الحديث ====================
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export const auth = getAuth(app);

// ==================== إعدادات الكاش ====================
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 ساعات بالميلي ثانية
const CACHE_VERSION = 1;

// ==================== الكاش الداخلي ====================
const memoryCache = new Map(); // تخزين البيانات في الذاكرة
const pendingRequests = new Map(); // منع التكرار في الطلبات

// ==================== دوال مساعدة داخلية ====================

/**
 * الحصول على مفتاح التخزين المحلي
 */
function getStorageKey(collectionName) {
    return `db_cache_${collectionName}`;
}

/**
 * الحصول على مفتاح معلومات التخزين المحلي
 */
function getStorageMetaKey(collectionName) {
    return `db_cache_meta_${collectionName}`;
}

/**
 * تحميل البيانات من الذاكرة
 */
function loadFromMemory(collectionName) {
    if (memoryCache.has(collectionName)) {
        console.log(`📖 القراءة من Memory Cache: ${collectionName}`);
        return memoryCache.get(collectionName);
    }
    return null;
}

/**
 * تحميل البيانات من LocalStorage
 */
function loadFromLocalStorage(collectionName) {
    try {
        const key = getStorageKey(collectionName);
        const metaKey = getStorageMetaKey(collectionName);
        
        const data = localStorage.getItem(key);
        const meta = localStorage.getItem(metaKey);
        
        if (!data || !meta) {
            console.log(`⚠️ لا يوجد كاش في LocalStorage: ${collectionName}`);
            return null;
        }
        
        const parsedData = JSON.parse(data);
        const parsedMeta = JSON.parse(meta);
        
        // التحقق من الإصدار والصلاحية
        if (parsedMeta.version !== CACHE_VERSION) {
            console.log(`🔄 إصدار الكاش غير متطابق لـ ${collectionName}، سيتم حذفه`);
            localStorage.removeItem(key);
            localStorage.removeItem(metaKey);
            return null;
        }
        
        if (isCacheExpired(parsedMeta.timestamp)) {
            console.log(`⏰ انتهت صلاحية الكاش لـ ${collectionName}`);
            return null;
        }
        
        console.log(`📖 القراءة من LocalStorage: ${collectionName} (${parsedData.length} عنصر)`);
        return parsedData;
    } catch (error) {
        console.error(`❌ فشل تحميل من LocalStorage: ${collectionName}`, error);
        return null;
    }
}

/**
 * حفظ البيانات في الكاش (الذاكرة + التخزين المحلي)
 */
function saveCache(collectionName, data) {
    try {
        // حفظ في الذاكرة
        memoryCache.set(collectionName, data);
        console.log(`💾 حفظ في Memory Cache: ${collectionName} (${data.length} عنصر)`);
        
        // حفظ في LocalStorage
        const key = getStorageKey(collectionName);
        const metaKey = getStorageMetaKey(collectionName);
        
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(metaKey, JSON.stringify({
            version: CACHE_VERSION,
            timestamp: Date.now(),
            count: data.length
        }));
        
        console.log(`💾 حفظ في LocalStorage: ${collectionName} (${data.length} عنصر)`);
    } catch (error) {
        console.error(`❌ فشل حفظ الكاش: ${collectionName}`, error);
    }
}

/**
 * تحديث عنصر في الكاش
 */
function updateCache(collectionName, id, newData) {
    const cached = loadFromMemory(collectionName);
    if (!cached) return false;
    
    const index = cached.findIndex(item => String(item.id) === String(id));
    if (index !== -1) {
        cached[index] = { ...cached[index], ...newData };
        saveCache(collectionName, cached);
        console.log(`🔄 تحديث الكاش: ${collectionName} - ID: ${id}`);
        return true;
    }
    return false;
}

/**
 * حذف عنصر من الكاش
 */
function removeCacheItem(collectionName, id) {
    const cached = loadFromMemory(collectionName);
    if (!cached) return false;
    
    const filtered = cached.filter(item => String(item.id) !== String(id));
    if (filtered.length !== cached.length) {
        saveCache(collectionName, filtered);
        console.log(`🗑️ حذف من الكاش: ${collectionName} - ID: ${id}`);
        return true;
    }
    return false;
}

/**
 * إضافة عنصر إلى الكاش
 */
function addToCache(collectionName, item) {
    const cached = loadFromMemory(collectionName);
    if (!cached) {
        saveCache(collectionName, [item]);
        return true;
    }
    
    // تجنب التكرار
    const exists = cached.some(cachedItem => String(cachedItem.id) === String(item.id));
    if (!exists) {
        cached.push(item);
        saveCache(collectionName, cached);
        console.log(`➕ إضافة إلى الكاش: ${collectionName} - ID: ${item.id}`);
        return true;
    }
    return false;
}

/**
 * التحقق من انتهاء صلاحية الكاش
 */
function isCacheExpired(timestamp) {
    return Date.now() - timestamp > CACHE_TTL;
}

/**
 * تحميل البيانات من Firestore مع منع التكرار
 */
async function fetchFromFirestore(collectionName) {
    // التحقق من وجود طلب مكرر
    if (pendingRequests.has(collectionName)) {
        console.log(`⏳ انتظار طلب جارٍ لـ ${collectionName}`);
        return pendingRequests.get(collectionName);
    }
    
    console.log(`🔥 القراءة من Firestore: ${collectionName}`);
    
    const promise = (async () => {
        try {
            const querySnapshot = await getDocs(collection(db, collectionName));
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // حفظ في الكاش
            saveCache(collectionName, data);
            return data;
        } catch (error) {
            console.error(`❌ فشل القراءة من Firestore: ${collectionName}`, error);
            throw error;
        } finally {
            // إزالة الطلب المعلق
            pendingRequests.delete(collectionName);
        }
    })();
    
    pendingRequests.set(collectionName, promise);
    return promise;
}

/**
 * تحميل البيانات (استراتيجية متعددة المستويات)
 */
async function loadData(collectionName) {
    // 1. محاولة القراءة من الذاكرة
    let data = loadFromMemory(collectionName);
    if (data) return data;
    
    // 2. محاولة القراءة من LocalStorage
    data = loadFromLocalStorage(collectionName);
    if (data) {
        // حفظ في الذاكرة
        memoryCache.set(collectionName, data);
        return data;
    }
    
    // 3. القراءة من Firestore
    return await fetchFromFirestore(collectionName);
}

// ==================== كائن DB الأساسي ====================
export const DB = {
    // ==================== تهيئة قاعدة البيانات ====================
    async init() {
        console.log("✅ تم الاتصال بقاعدة بيانات Firestore بنجاح (مع الكاش الحديث)");
        console.log(`📋 إعدادات الكاش: TTL=${CACHE_TTL/3600000} ساعات, الإصدار=${CACHE_VERSION}`);
        return Promise.resolve();
    },

    // ==================== إدراج عنصر واحد ====================
    async insert(storeName, data) {
        try {
            let id = data.id;
            
            if (id) {
                // إذا كان للعنصر ID مسبق
                await setDoc(doc(db, storeName, String(id)), data);
                console.log(`✅ تم إدراج عنصر في ${storeName} (ID: ${id})`);
            } else {
                // إنشاء ID تلقائي من Firestore
                const docRef = await addDoc(collection(db, storeName), data);
                id = docRef.id;
                await updateDoc(docRef, { id: id });
                data.id = id;
                console.log(`✅ تم إدراج عنصر جديد في ${storeName} (ID: ${id})`);
            }
            
            // تحديث الكاش المحلي
            const cached = loadFromMemory(storeName);
            if (cached) {
                addToCache(storeName, data);
            }
            
            return id;
        } catch (error) {
            console.error(`❌ فشل إدراج في ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== تحديث عنصر ====================
    async update(storeName, data) {
        try {
            if (!data.id) throw new Error("ID مطلوب للتحديث");
            
            const docRef = doc(db, storeName, String(data.id));
            await updateDoc(docRef, data);
            console.log(`✅ تم تحديث عنصر في ${storeName} (ID: ${data.id})`);
            
            // تحديث الكاش المحلي
            updateCache(storeName, data.id, data);
            
            return data.id;
        } catch (error) {
            console.error(`❌ فشل تحديث في ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== استرجاع عنصر بواسطة ID ====================
    async get(storeName, id) {
        try {
            // محاولة القراءة من الكاش أولاً
            const cached = loadFromMemory(storeName);
            if (cached) {
                const found = cached.find(item => String(item.id) === String(id));
                if (found) {
                    console.log(`📖 القراءة من Memory Cache: ${storeName} - ID: ${id}`);
                    return found;
                }
            }
            
            // إذا لم يوجد في الكاش، القراءة من Firestore
            console.log(`🔥 القراءة من Firestore: ${storeName} - ID: ${id}`);
            const docRef = doc(db, storeName, String(id));
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() };
                
                // إضافة إلى الكاش
                addToCache(storeName, data);
                
                return data;
            }
            
            return null;
        } catch (error) {
            console.error(`❌ فشل استرجاع من ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== استرجاع جميع العناصر ====================
    async getAll(storeName) {
        try {
            return await loadData(storeName);
        } catch (error) {
            console.error(`❌ فشل استرجاع الكل من ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== حذف عنصر بواسطة ID ====================
    async delete(storeName, id) {
        try {
            await deleteDoc(doc(db, storeName, String(id)));
            console.log(`✅ تم حذف عنصر من ${storeName} (ID: ${id})`);
            
            // حذف من الكاش المحلي
            removeCacheItem(storeName, id);
        } catch (error) {
            console.error(`❌ فشل حذف من ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== فلترة البيانات ====================
    async filter(storeName, predicate) {
        try {
            // القراءة من الكاش دائماً
            const all = await loadData(storeName);
            const result = all.filter(predicate);
            console.log(`🔍 فلترة البيانات: ${storeName} - تم العثور على ${result.length} عنصر`);
            return result;
        } catch (error) {
            console.error(`❌ فشل فلترة البيانات في ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== البحث عن عنصر واحد ====================
    async find(storeName, predicate) {
        try {
            // القراءة من الكاش دائماً
            const all = await loadData(storeName);
            const result = all.find(predicate) || null;
            console.log(`🔍 البحث عن عنصر: ${storeName} - ${result ? 'تم العثور' : 'لم يتم العثور'}`);
            return result;
        } catch (error) {
            console.error(`❌ فشل البحث عن عنصر في ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== الإدراج الدفعي ====================
    async bulkInsert(storeName, dataArray) {
        try {
            if (!dataArray || dataArray.length === 0) return [];
            
            const CHUNK_SIZE = 50;
            const results = [];
            
            for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
                const chunk = dataArray.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                const chunkResults = [];
                
                chunk.forEach(item => {
                    const docRef = item.id ? doc(db, storeName, String(item.id)) : doc(collection(db, storeName));
                    const itemData = item.id ? item : { ...item, id: docRef.id };
                    batch.set(docRef, itemData, { merge: true });
                    chunkResults.push(itemData);
                });
                
                await batch.commit();
                console.log(`✅ تم دمج دفعة من ${chunk.length} عنصر في ${storeName}`);
                results.push(...chunkResults);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log(`✅ تم الانتهاء من إدراج ودمج ${dataArray.length} عنصر في ${storeName} بنجاح`);
            
            // تحديث الكاش بالكامل
            try {
                const currentData = await loadData(storeName);
                if (currentData) {
                    // دمج البيانات الجديدة مع القديمة
                    const mergedData = [...currentData];
                    results.forEach(newItem => {
                        const index = mergedData.findIndex(item => String(item.id) === String(newItem.id));
                        if (index !== -1) {
                            mergedData[index] = newItem;
                        } else {
                            mergedData.push(newItem);
                        }
                    });
                    saveCache(storeName, mergedData);
                } else {
                    saveCache(storeName, results);
                }
            } catch (cacheError) {
                console.warn(`⚠️ فشل تحديث الكاش بعد bulkInsert: ${storeName}`, cacheError);
            }
            
            return results;
        } catch (error) {
            console.error(`❌ فشل الإدراج الدفعي في ${storeName}:`, error);
            throw error;
        }
    },

    // ==================== تحديث كاش Collection محدد ====================
    async refresh(collectionName) {
        try {
            console.log(`🔄 تحديث الكاش لـ ${collectionName}`);
            // حذف الكاش القديم
            memoryCache.delete(collectionName);
            const key = getStorageKey(collectionName);
            const metaKey = getStorageMetaKey(collectionName);
            localStorage.removeItem(key);
            localStorage.removeItem(metaKey);
            
            // تحميل جديد من Firestore
            return await fetchFromFirestore(collectionName);
        } catch (error) {
            console.error(`❌ فشل تحديث الكاش لـ ${collectionName}:`, error);
            throw error;
        }
    },

    // ==================== تحديث جميع الكاش ====================
    async refreshAll() {
        try {
            console.log('🔄 تحديث جميع الكاش');
            const collections = Array.from(memoryCache.keys());
            const results = {};
            
            for (const collectionName of collections) {
                results[collectionName] = await this.refresh(collectionName);
            }
            
            console.log(`✅ تم تحديث ${collections.length} Collection`);
            return results;
        } catch (error) {
            console.error('❌ فشل تحديث جميع الكاش:', error);
            throw error;
        }
    },

    // ==================== مسح الكاش ====================
    clearCache() {
        try {
            console.log('🗑️ مسح الكاش بالكامل');
            
            // مسح الذاكرة
            memoryCache.clear();
            
            // مسح LocalStorage
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('db_cache_')) {
                    localStorage.removeItem(key);
                }
            });
            
            console.log('✅ تم مسح الكاش بالكامل');
            return true;
        } catch (error) {
            console.error('❌ فشل مسح الكاش:', error);
            throw error;
        }
    },

    // ==================== معلومات الكاش ====================
    cacheInfo() {
        try {
            const info = {
                version: CACHE_VERSION,
                ttl: CACHE_TTL,
                ttlHours: CACHE_TTL / 3600000,
                memoryCollections: Array.from(memoryCache.keys()),
                memoryCount: memoryCache.size,
                localStorageCollections: []
            };
            
            // جمع معلومات LocalStorage
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('db_cache_meta_')) {
                    const collectionName = key.replace('db_cache_meta_', '');
                    try {
                        const meta = JSON.parse(localStorage.getItem(key));
                        info.localStorageCollections.push({
                            name: collectionName,
                            count: meta.count,
                            timestamp: new Date(meta.timestamp).toISOString(),
                            expired: isCacheExpired(meta.timestamp),
                            version: meta.version
                        });
                    } catch (e) {
                        console.warn(`⚠️ فشل قراءة معلومات الكاش لـ ${collectionName}`);
                    }
                }
            });
            
            console.log('📊 معلومات الكاش:', info);
            return info;
        } catch (error) {
            console.error('❌ فشل الحصول على معلومات الكاش:', error);
            throw error;
        }
    },

    // ==================== إبطال كاش Collection محدد ====================
    invalidate(collectionName) {
        try {
            console.log(`🚫 إبطال الكاش لـ ${collectionName}`);
            
            // حذف من الذاكرة
            memoryCache.delete(collectionName);
            
            // حذف من LocalStorage
            const key = getStorageKey(collectionName);
            const metaKey = getStorageMetaKey(collectionName);
            localStorage.removeItem(key);
            localStorage.removeItem(metaKey);
            
            console.log(`✅ تم إبطال الكاش لـ ${collectionName}`);
            return true;
        } catch (error) {
            console.error(`❌ فشل إبطال الكاش لـ ${collectionName}:`, error);
            throw error;
        }
    }
};

// ==================== تصدير للاستخدام العام ====================
window.DB = DB;

// ==================== تنظيف الكاش عند تغيير الإصدار ====================
// التحقق من الإصدار عند التحميل
(() => {
    try {
        const versionKey = 'db_cache_version';
        const currentVersion = localStorage.getItem(versionKey);
        
        if (currentVersion && parseInt(currentVersion) !== CACHE_VERSION) {
            console.log(`🔄 تغيير الإصدار من ${currentVersion} إلى ${CACHE_VERSION}، سيتم مسح الكاش القديم`);
            // مسح الكاش القديم
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('db_cache_')) {
                    localStorage.removeItem(key);
                }
            });
        }
        
        localStorage.setItem(versionKey, String(CACHE_VERSION));
    } catch (error) {
        console.warn('⚠️ فشل التحقق من إصدار الكاش:', error);
    }
})();
