// trainee-db.js
// ⚠️ نسخة منفصلة تماماً عن database.js — خاصة بالمتدربين فقط

import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    initializeFirestore, getFirestore,
    persistentLocalCache, persistentMultipleTabManager,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch,
    query, where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import { cacheSet, cacheGet, cacheGetMeta, cacheRemove, cacheClear } from './cache.js';

const firebaseConfig = {
    apiKey: "AIzaSyDOFd1M8IIxG7UyLdGHpu24TzC77kBa740",
    authDomain: "training-lb-1945b.firebaseapp.com",
    projectId: "training-lb-1945b",
    storageBucket: "training-lb-1945b.firebasestorage.app",
    messagingSenderId: "202134601199",
    appId: "1:202134601199:web:86d145ef5fe762f247ca1a",
    measurementId: "G-9KMSG3M4P1"
};

// ✅ استخدام نفس الـ default app (لضمان auth مشترك مع database.js)
let app;
try {
    app = getApp();
    console.log("✅ Trainee-DB: using existing Firebase app");
} catch (e) {
    app = initializeApp(firebaseConfig);
    console.log("✅ Trainee-DB: created new Firebase app");
}

// ✅ Firestore: نحاول نستخدم الموجود، أو نعمل واحد جديد
// ملاحظة: لو database.js عمل initializeFirestore، هيبقى موجود ومشترك
// لكن الكاش بتاعنا (IndexedDB) منفصل عبر بادئة المفاتيح trainee_cache_*
let db;
try {
    db = getFirestore(app);
    console.log("✅ Trainee-DB: using existing Firestore instance");
} catch (e) {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
    console.log("✅ Trainee-DB: initialized new Firestore instance");
}

export { db };

// ✅ نفس auth المشترك
export const auth = getAuth(app);

// ==================== إعدادات الكاش ====================
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 ساعات
const CACHE_VERSION = 1;               // إصدار مستقل للمتدربين

// ==================== بادئة مفاتيح الكاش (منفصلة تماماً) ====================
const CACHE_PREFIX = 'trainee__';       // بادئة مفاتيح الذاكرة
const IDB_PREFIX   = 'trainee_cache_';  // بادئة مفاتيح IndexedDB

// ==================== الكاش الداخلي ====================
const memoryCache = new Map();
const pendingRequests = new Map();

// ==================== دوال مساعدة داخلية ====================

/**
 * تحميل البيانات من الذاكرة
 */
function loadFromMemory(collectionName) {
    const key = CACHE_PREFIX + collectionName;
    if (memoryCache.has(key)) {
        console.log(`📖 Memory Cache: ${collectionName}`);
        return memoryCache.get(key);
    }
    return null;
}

/**
 * ✅ تحميل البيانات من IndexedDB
 */
async function loadFromIndexedDB(collectionName) {
    try {
        const idbKey = IDB_PREFIX + collectionName;
        const meta = await cacheGetMeta(idbKey);
        if (!meta) {
            console.log(`⚠️ No IndexedDB cache: ${collectionName}`);
            return null;
        }

        if (isCacheExpired(meta)) {
            console.log(`⏰ IndexedDB cache expired: ${collectionName}`);
            await cacheRemove(idbKey);
            return null;
        }

        const data = await cacheGet(idbKey);
        if (data) {
            const cnt = Array.isArray(data) ? data.length : 1;
            console.log(`📖 IndexedDB Cache: ${collectionName} (${cnt} items)`);
            return data;
        }
        return null;
    } catch (error) {
        console.error(`❌ IndexedDB load failed: ${collectionName}`, error);
        return null;
    }
}

/**
 * ✅ حفظ البيانات في IndexedDB
 */
async function saveCache(collectionName, data) {
    try {
        const memKey = CACHE_PREFIX + collectionName;
        const idbKey = IDB_PREFIX + collectionName;

        memoryCache.set(memKey, data);
        const cnt = Array.isArray(data) ? data.length : 1;
        console.log(`💾 Memory Cache: ${collectionName} (${cnt} items)`);

        const ok = await cacheSet(idbKey, data);
        if (ok) {
            console.log(`💾 IndexedDB: ${collectionName} (${cnt} items)`);
        } else {
            console.warn(`⚠️ IndexedDB save failed: ${collectionName}`);
        }
    } catch (error) {
        console.error(`❌ Cache save failed: ${collectionName}`, error);
    }
}

/**
 * تحديث عنصر في الكاش
 */
async function updateCache(collectionName, id, newData) {
    const cached = loadFromMemory(collectionName);
    if (!cached) return false;

    const index = cached.findIndex(item => String(item.id) === String(id));
    if (index !== -1) {
        cached[index] = { ...cached[index], ...newData };
        await saveCache(collectionName, cached);
        console.log(`🔄 Cache updated: ${collectionName} - ID: ${id}`);
        return true;
    }
    return false;
}

/**
 * حذف عنصر من الكاش
 */
async function removeCacheItem(collectionName, id) {
    const cached = loadFromMemory(collectionName);
    if (!cached) return false;

    const filtered = cached.filter(item => String(item.id) !== String(id));
    if (filtered.length !== cached.length) {
        await saveCache(collectionName, filtered);
        console.log(`🗑️ Cache removed: ${collectionName} - ID: ${id}`);
        return true;
    }
    return false;
}

/**
 * حذف عدة عناصر من الكاش
 */
async function removeCacheItems(collectionName, idsArray) {
    const cached = loadFromMemory(collectionName);
    if (!cached) return false;

    const idSet = new Set(idsArray.map(String));
    const filtered = cached.filter(item => !idSet.has(String(item.id)));
    const removedCount = cached.length - filtered.length;

    if (removedCount > 0) {
        await saveCache(collectionName, filtered);
        console.log(`🗑️ Cache bulk removed: ${collectionName} - ${removedCount} items`);
        return true;
    }
    return false;
}

/**
 * إضافة عنصر إلى الكاش
 */
async function addToCache(collectionName, item) {
    const cached = loadFromMemory(collectionName);
    if (!cached) {
        await saveCache(collectionName, [item]);
        return true;
    }

    const exists = cached.some(c => String(c.id) === String(item.id));
    if (!exists) {
        cached.push(item);
        await saveCache(collectionName, cached);
        console.log(`➕ Cache added: ${collectionName} - ID: ${item.id}`);
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
    if (pendingRequests.has(collectionName)) {
        console.log(`⏳ Waiting for pending request: ${collectionName}`);
        return pendingRequests.get(collectionName);
    }

    console.log(`🔥 Firestore Read: ${collectionName}`);

    const promise = (async () => {
        try {
            const querySnapshot = await getDocs(collection(db, collectionName));
            const data = querySnapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));

            await saveCache(collectionName, data);
            return data;
        } catch (error) {
            console.error(`❌ Firestore Read Failed: ${collectionName}`, error);
            throw error;
        } finally {
            pendingRequests.delete(collectionName);
        }
    })();

    pendingRequests.set(collectionName, promise);
    return promise;
}

/**
 * تحميل البيانات (متعدد المستويات)
 */
async function loadData(collectionName) {
    // 1. Memory
    let data = loadFromMemory(collectionName);
    if (data) return data;

    // 2. IndexedDB
    data = await loadFromIndexedDB(collectionName);
    if (data) {
        memoryCache.set(CACHE_PREFIX + collectionName, data);
        return data;
    }

    // 3. Firestore
    return await fetchFromFirestore(collectionName);
}

// ==================== كائن TraineeDB ====================
export const TraineeDB = {
    async init() {
        console.log("✅ Trainee Firestore connected (IndexedDB cache enabled)");
        console.log(`📋 Trainee Cache: TTL=${CACHE_TTL/3600000}h, Version=${CACHE_VERSION}`);
        return Promise.resolve();
    },

    // ==================== إدراج عنصر ====================
    async insert(storeName, data) {
        try {
            let id = data.id;

            if (id) {
                await setDoc(doc(db, storeName, String(id)), data);
                console.log(`✅ Inserted ${storeName} (ID: ${id})`);
            } else {
                const docRef = await addDoc(collection(db, storeName), data);
                id = docRef.id;
                await updateDoc(docRef, { id: id });
                data.id = id;
                console.log(`✅ Inserted new ${storeName} (ID: ${id})`);
            }

            const cached = loadFromMemory(storeName);
            if (cached) {
                await addToCache(storeName, data);
            }

            return id;
        } catch (error) {
            console.error(`❌ Insert failed: ${storeName}`, error);
            throw error;
        }
    },

    // ==================== تحديث عنصر ====================
    async update(storeName, data) {
        try {
            if (!data.id) throw new Error("ID required for update");

            const docRef = doc(db, storeName, String(data.id));
            await updateDoc(docRef, data);
            console.log(`✅ Updated ${storeName} (ID: ${data.id})`);

            await updateCache(storeName, data.id, data);
            return data.id;
        } catch (error) {
            console.error(`❌ Update failed: ${storeName}`, error);
            throw error;
        }
    },

    // ==================== استرجاع عنصر بواسطة ID ====================
    async get(storeName, id) {
        try {
            const cached = loadFromMemory(storeName);
            if (cached) {
                const found = cached.find(item => String(item.id) === String(id));
                if (found) {
                    console.log(`📖 Memory hit: ${storeName} - ID: ${id}`);
                    return found;
                }
            }

            console.log(`🔥 Firestore get: ${storeName} - ID: ${id}`);
            const docRef = doc(db, storeName, String(id));
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() };
                await addToCache(storeName, data);
                return data;
            }

            return null;
        } catch (error) {
            console.error(`❌ Get failed: ${storeName}`, error);
            throw error;
        }
    },

    // ==================== استرجاع جميع العناصر ====================
    async getAll(storeName) {
        try {
            return await loadData(storeName);
        } catch (error) {
            console.error(`❌ GetAll failed: ${storeName}`, error);
            throw error;
        }
    },

    // ============================================================
    // جلب السجلات بتاريخ محدد فقط (استعلام Firestore مباشر)
    // ============================================================
    async getRecordsByDate(storeName, date, dateField = 'task_date') {
        try {
            if (!date) {
                console.warn(`⚠️ getRecordsByDate: date is empty for ${storeName}`);
                return [];
            }

            console.log(`🔥 Firestore query: ${storeName} where ${dateField} == ${date}`);

            const colRef = collection(db, storeName);
            const q = query(colRef, where(dateField, "==", date));
            const querySnapshot = await getDocs(q);

            const data = querySnapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));

            console.log(`✅ getRecordsByDate: ${data.length} records for ${date}`);

            const cacheKey = `${CACHE_PREFIX}${storeName}__date__${date}`;
            memoryCache.set(cacheKey, data);

            return data;
        } catch (error) {
            console.error(`❌ getRecordsByDate failed: ${storeName} @ ${date}`, error);

            try {
                console.log(`⚠️ Falling back to full collection fetch for ${storeName}`);
                const all = await this.getAll(storeName);
                const filtered = (all || []).filter(r => String(r[dateField]) === String(date));
                console.log(`✅ Fallback: ${filtered.length} records found for ${date}`);
                return filtered;
            } catch (fallbackError) {
                console.error(`❌ Fallback also failed: ${storeName}`, fallbackError);
                throw error;
            }
        }
    },

    // ==================== حذف عنصر ====================
    async delete(storeName, id) {
        try {
            await deleteDoc(doc(db, storeName, String(id)));
            console.log(`✅ Deleted ${storeName} (ID: ${id})`);
            await removeCacheItem(storeName, id);
        } catch (error) {
            console.error(`❌ Delete failed: ${storeName}`, error);
            throw error;
        }
    },

    // ==================== الحذف الدفعي ====================
    async bulkDelete(storeName, idsArray) {
        try {
            if (!idsArray || idsArray.length === 0) return 0;

            const CHUNK_SIZE = 400;
            let deleted = 0;

            for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
                const chunk = idsArray.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);

                chunk.forEach(id => {
                    batch.delete(doc(db, storeName, String(id)));
                });

                await batch.commit();
                deleted += chunk.length;
                console.log(`🗑️ Bulk deleted ${chunk.length} from ${storeName}`);

                if (i + CHUNK_SIZE < idsArray.length) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            await removeCacheItems(storeName, idsArray);

            console.log(`✅ BulkDelete done: ${deleted} items from ${storeName}`);
            return deleted;
        } catch (error) {
            console.error(`❌ BulkDelete failed: ${storeName}`, error);
            throw error;
        }
    },

    // ==================== فلترة ====================
    async filter(storeName, predicate) {
        try {
            const all = await loadData(storeName);
            const result = all.filter(predicate);
            console.log(`🔍 Filter: ${storeName} → ${result.length} items`);
            return result;
        } catch (error) {
            console.error(`❌ Filter failed: ${storeName}`, error);
            throw error;
        }
    },

    // ==================== البحث عن عنصر ====================
    async find(storeName, predicate) {
        try {
            const all = await loadData(storeName);
            const result = all.find(predicate) || null;
            console.log(`🔍 Find: ${storeName} → ${result ? 'found' : 'not found'}`);
            return result;
        } catch (error) {
            console.error(`❌ Find failed: ${storeName}`, error);
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
                    const docRef = item.id
                        ? doc(db, storeName, String(item.id))
                        : doc(collection(db, storeName));
                    const itemData = item.id ? item : { ...item, id: docRef.id };
                    batch.set(docRef, itemData, { merge: true });
                    chunkResults.push(itemData);
                });

                await batch.commit();
                console.log(`✅ Batch committed: ${chunk.length} items → ${storeName}`);
                results.push(...chunkResults);

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(`✅ Bulk insert done: ${dataArray.length} items → ${storeName}`);

            try {
                const currentData = await loadData(storeName);
                if (currentData) {
                    const mergedData = [...currentData];
                    results.forEach(newItem => {
                        const index = mergedData.findIndex(item => String(item.id) === String(newItem.id));
                        if (index !== -1) mergedData[index] = newItem;
                        else mergedData.push(newItem);
                    });
                    await saveCache(storeName, mergedData);
                } else {
                    await saveCache(storeName, results);
                }
            } catch (cacheError) {
                console.warn(`⚠️ Cache update failed after bulkInsert: ${storeName}`, cacheError);
            }

            return results;
        } catch (error) {
            console.error(`❌ BulkInsert failed: ${storeName}`, error);
            throw error;
        }
    },

    // ==================== تحديث كاش Collection ====================
    async refresh(collectionName) {
        try {
            console.log(`🔄 Refreshing: ${collectionName}`);
            memoryCache.delete(CACHE_PREFIX + collectionName);

            // امسح كل مفاتيح التاريخ المرتبطة
            const dateKeysToRemove = [];
            for (const key of memoryCache.keys()) {
                if (key.startsWith(`${CACHE_PREFIX}${collectionName}__date__`)) {
                    dateKeysToRemove.push(key);
                }
            }
            dateKeysToRemove.forEach(k => memoryCache.delete(k));

            await cacheRemove(IDB_PREFIX + collectionName);

            return await fetchFromFirestore(collectionName);
        } catch (error) {
            console.error(`❌ Refresh failed: ${collectionName}`, error);
            throw error;
        }
    },

    // ==================== تحديث جميع الكاش ====================
    async refreshAll() {
        try {
            console.log('🔄 Refreshing all trainee caches');
            const collections = Array.from(memoryCache.keys())
                .filter(k => k.startsWith(CACHE_PREFIX) && !k.includes('__date__'))
                .map(k => k.substring(CACHE_PREFIX.length));
            const results = {};

            for (const collectionName of collections) {
                results[collectionName] = await this.refresh(collectionName);
            }

            console.log(`✅ Refreshed ${collections.length} trainee collections`);
            return results;
        } catch (error) {
            console.error('❌ RefreshAll failed:', error);
            throw error;
        }
    },

    // ==================== مسح الكاش ====================
    async clearCache() {
        try {
            console.log('🗑️ Clearing all trainee caches');

            memoryCache.clear();
            await cacheClear();

            try {
                Object.keys(localStorage)
                    .filter(k => k.startsWith('db_cache_trainee_'))
                    .forEach(k => localStorage.removeItem(k));
            } catch (e) {}

            console.log('✅ All trainee caches cleared');
            return true;
        } catch (error) {
            console.error('❌ ClearCache failed:', error);
            throw error;
        }
    },

    // ==================== إبطال كاش Collection ====================
    async invalidate(collectionName) {
        try {
            console.log(`🚫 Invalidating: ${collectionName}`);
            memoryCache.delete(CACHE_PREFIX + collectionName);

            const dateKeysToRemove = [];
            for (const key of memoryCache.keys()) {
                if (key.startsWith(`${CACHE_PREFIX}${collectionName}__date__`)) {
                    dateKeysToRemove.push(key);
                }
            }
            dateKeysToRemove.forEach(k => memoryCache.delete(k));

            await cacheRemove(IDB_PREFIX + collectionName);
            console.log(`✅ Invalidated: ${collectionName}`);
            return true;
        } catch (error) {
            console.error(`❌ Invalidate failed: ${collectionName}`, error);
            throw error;
        }
    },

    // ============================================================
    // إبطال cache تاريخ محدد فقط
    // ============================================================
    invalidateDate(storeName, date) {
        const cacheKey = `${CACHE_PREFIX}${storeName}__date__${date}`;
        if (memoryCache.has(cacheKey)) {
            memoryCache.delete(cacheKey);
            console.log(`🚫 Invalidated date cache: ${storeName} @ ${date}`);
            return true;
        }
        return false;
    }
};

// ==================== تصدير للاستخدام العام ====================
window.TraineeDB = TraineeDB;

// ==================== تنظيف الكاش القديم من localStorage عند الترقية ====================
(async () => {
    try {
        const versionKey = 'trainee_db_cache_version';
        const currentVersion = localStorage.getItem(versionKey);

        if (!currentVersion || parseInt(currentVersion) !== CACHE_VERSION) {
            console.log(`🔄 Trainee Version change ${currentVersion} → ${CACHE_VERSION}, clearing old localStorage cache`);
            Object.keys(localStorage)
                .filter(k => k.startsWith('db_cache_trainee_'))
                .forEach(k => localStorage.removeItem(k));
            localStorage.setItem(versionKey, String(CACHE_VERSION));
        }
    } catch (error) {
        console.warn('⚠️ Trainee version check failed:', error);
    }
})();