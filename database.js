import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch,
    query, where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import { cacheSet, cacheGet, cacheGetMeta, cacheRemove, cacheClear } from './cache.js';

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

export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export const auth = getAuth(app);

// ==================== إعدادات الكاش ====================
const CACHE_TTL = 6 * 60 * 60 * 1000;
const CACHE_VERSION = 3;

const memoryCache = new Map();
const pendingRequests = new Map();

// ==================== دوال مساعدة ====================

function loadFromMemory(collectionName) {
    if (memoryCache.has(collectionName)) {
        console.log(`📖 Memory Cache: ${collectionName}`);
        return memoryCache.get(collectionName);
    }
    return null;
}

async function loadFromIndexedDB(collectionName) {
    try {
        const meta = await cacheGetMeta(collectionName);
        if (!meta) {
            console.log(`⚠️ No IndexedDB cache: ${collectionName}`);
            return null;
        }

        if (isCacheExpired(meta)) {
            console.log(`⏰ IndexedDB cache expired: ${collectionName}`);
            await cacheRemove(collectionName);
            return null;
        }

        const data = await cacheGet(collectionName);
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

async function saveCache(collectionName, data) {
    try {
        memoryCache.set(collectionName, data);
        const cnt = Array.isArray(data) ? data.length : 1;
        console.log(`💾 Memory Cache: ${collectionName} (${cnt} items)`);

        const ok = await cacheSet(collectionName, data);
        if (ok) {
            console.log(`💾 IndexedDB: ${collectionName} (${cnt} items)`);
        } else {
            console.warn(`⚠️ IndexedDB save failed: ${collectionName}`);
        }
    } catch (error) {
        console.error(`❌ Cache save failed: ${collectionName}`, error);
    }
}

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

function isCacheExpired(timestamp) {
    return Date.now() - timestamp > CACHE_TTL;
}

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

async function loadData(collectionName) {
    let data = loadFromMemory(collectionName);
    if (data) return data;

    data = await loadFromIndexedDB(collectionName);
    if (data) {
        memoryCache.set(collectionName, data);
        return data;
    }

    return await fetchFromFirestore(collectionName);
}

// ==================== كائن DB ====================
export const DB = {
    async init() {
        console.log("✅ Firestore connected (IndexedDB cache enabled)");
        console.log(`📋 Cache: TTL=${CACHE_TTL/3600000}h, Version=${CACHE_VERSION}`);
        return Promise.resolve();
    },

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

    async getAll(storeName) {
        try {
            return await loadData(storeName);
        } catch (error) {
            console.error(`❌ GetAll failed: ${storeName}`, error);
            throw error;
        }
    },

    // ============================================================
    // ✅ جلب السجلات بتاريخ محدد فقط (استعلام Firestore مباشر)
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

            const cacheKey = `${storeName}__date__${date}`;
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

    // ============================================================
    // ✅ جلب السجلات بقيم متعددة (WHERE IN) — لتوفير القراءات
    // ============================================================
    async queryWhereIn(storeName, field, values) {
        try {
            if (!values || values.length === 0) {
                console.log(`⚠️ queryWhereIn: no values for ${storeName}.${field}`);
                return [];
            }

            console.log(`🔥 Firestore queryWhereIn: ${storeName} where ${field} in [${values.length} values]`);

            const CHUNK = 30; // Firestore in limit
            const results = [];

            for (let i = 0; i < values.length; i += CHUNK) {
                const chunk = values.slice(i, i + CHUNK);
                const colRef = collection(db, storeName);
                const q = query(colRef, where(field, "in", chunk));
                const querySnapshot = await getDocs(q);

                querySnapshot.docs.forEach(d => {
                    results.push({ id: d.id, ...d.data() });
                });

                console.log(`  ↳ chunk ${Math.floor(i/CHUNK)+1}: ${querySnapshot.size} docs`);
            }

            console.log(`✅ queryWhereIn: ${results.length} total records from ${storeName}`);

            const cacheKey = `${storeName}__in__${field}__${values.length}__${values[0] || ''}`;
            memoryCache.set(cacheKey, results);

            return results;
        } catch (error) {
            console.error(`❌ queryWhereIn failed: ${storeName}`, error);
            throw error;
        }
    },

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

    async refresh(collectionName) {
        try {
            console.log(`🔄 Refreshing: ${collectionName}`);
            memoryCache.delete(collectionName);

            const dateKeysToRemove = [];
            for (const key of memoryCache.keys()) {
                if (key.startsWith(`${collectionName}__date__`) ||
                    key.startsWith(`${collectionName}__in__`)) {
                    dateKeysToRemove.push(key);
                }
            }
            dateKeysToRemove.forEach(k => memoryCache.delete(k));

            await cacheRemove(collectionName);

            return await fetchFromFirestore(collectionName);
        } catch (error) {
            console.error(`❌ Refresh failed: ${collectionName}`, error);
            throw error;
        }
    },

    async refreshAll() {
        try {
            console.log('🔄 Refreshing all caches');
            const collections = Array.from(memoryCache.keys())
                .filter(k => !k.includes('__date__') && !k.includes('__in__'));
            const results = {};

            for (const collectionName of collections) {
                results[collectionName] = await this.refresh(collectionName);
            }

            console.log(`✅ Refreshed ${collections.length} collections`);
            return results;
        } catch (error) {
            console.error('❌ RefreshAll failed:', error);
            throw error;
        }
    },

    async clearCache() {
        try {
            console.log('🗑️ Clearing all caches');

            memoryCache.clear();
            await cacheClear();

            try {
                Object.keys(localStorage)
                    .filter(k => k.startsWith('db_cache_'))
                    .forEach(k => localStorage.removeItem(k));
            } catch (e) {}

            console.log('✅ All caches cleared');
            return true;
        } catch (error) {
            console.error('❌ ClearCache failed:', error);
            throw error;
        }
    },

    async cacheInfo() {
        try {
            const info = {
                version: CACHE_VERSION,
                ttl: CACHE_TTL,
                ttlHours: CACHE_TTL / 3600000,
                memoryCollections: Array.from(memoryCache.keys()),
                memoryCount: memoryCache.size,
                indexedDBCollections: []
            };

            try {
                const cacheModule = await import('./cache.js');
                const keys = await cacheModule.cacheKeys();
                for (const key of keys) {
                    const meta = await cacheGetMeta(key);
                    const data = await cacheGet(key);
                    info.indexedDBCollections.push({
                        name: key,
                        count: Array.isArray(data) ? data.length : (data ? 1 : 0),
                        timestamp: meta ? new Date(meta).toISOString() : null,
                        expired: meta ? isCacheExpired(meta) : true
                    });
                }
            } catch (e) {
                console.warn('⚠️ Could not read IndexedDB info:', e);
            }

            console.log('📊 Cache info:', info);
            return info;
        } catch (error) {
            console.error('❌ CacheInfo failed:', error);
            throw error;
        }
    },

    async invalidate(collectionName) {
        try {
            console.log(`🚫 Invalidating: ${collectionName}`);
            memoryCache.delete(collectionName);

            const dateKeysToRemove = [];
            for (const key of memoryCache.keys()) {
                if (key.startsWith(`${collectionName}__date__`) ||
                    key.startsWith(`${collectionName}__in__`)) {
                    dateKeysToRemove.push(key);
                }
            }
            dateKeysToRemove.forEach(k => memoryCache.delete(k));

            await cacheRemove(collectionName);
            console.log(`✅ Invalidated: ${collectionName}`);
            return true;
        } catch (error) {
            console.error(`❌ Invalidate failed: ${collectionName}`, error);
            throw error;
        }
    },

    invalidateDate(storeName, date) {
        const cacheKey = `${storeName}__date__${date}`;
        if (memoryCache.has(cacheKey)) {
            memoryCache.delete(cacheKey);
            console.log(`🚫 Invalidated date cache: ${storeName} @ ${date}`);
            return true;
        }
        return false;
    }
};

window.DB = DB;

(async () => {
    try {
        const versionKey = 'db_cache_version';
        const currentVersion = localStorage.getItem(versionKey);

        if (!currentVersion || parseInt(currentVersion) !== CACHE_VERSION) {
            console.log(`🔄 Version change ${currentVersion} → ${CACHE_VERSION}, clearing old localStorage cache`);
            Object.keys(localStorage)
                .filter(k => k.startsWith('db_cache_'))
                .forEach(k => localStorage.removeItem(k));
            localStorage.setItem(versionKey, String(CACHE_VERSION));
        }
    } catch (error) {
        console.warn('⚠️ Version check failed:', error);
    }
})();


/* ============================================================
   ✅ Checklist Module — Collections & Helpers
   ============================================================ */

export const CHECKLIST = {
    CATALOG: 'checklist_catalog',
    RECORDS: 'checklist_records'
};

/* ------------------------------------------------------------
   تحميل سجلات يوم محدد فقط (لتوفير القراءات)
   - يستخدم getRecordsByDate الموجود (استعلام Firestore مباشر)
   - يخزّن النتيجة في memory cache بمفتاح date
   ------------------------------------------------------------ */
DB.getChecklistRecordsByDate = async function (date) {
    return this.getRecordsByDate(CHECKLIST.RECORDS, date, 'date');
};

/* ------------------------------------------------------------
   تحميل الكتالوج (الإدارات + الأقسام)
   - يُقرأ مرة واحدة فقط
   - يخزَّن في memory + IndexedDB cache
   ------------------------------------------------------------ */
DB.getChecklistCatalog = async function () {
    return this.getAll(CHECKLIST.CATALOG);
};

/* ------------------------------------------------------------
   upsert سجل يومي (يمنع التكرار عبر id ثابت)
   id = "YYYY-MM-DD::Department::Section"
   ------------------------------------------------------------ */
DB.upsertChecklistRecord = async function (record) {
    const {
        date, department, section,
        existStatus, implementedStatus, updatedBy
    } = record;

    if (!date || !department || !section) {
        throw new Error('date, department, section are required');
    }

    const id = `${date}::${department}::${section}`;
    const now = Date.now();

    let existing = null;
    try {
        existing = await this.get(CHECKLIST.RECORDS, id);
    } catch (e) {
        console.warn('get existing record failed, assuming new:', e);
    }

    if (existing) {
        return this.update(CHECKLIST.RECORDS, {
            ...existing,
            existStatus,
            implementedStatus,
            updatedAt: now,
            updatedBy: updatedBy || 'unknown'
        });
    }

    return this.insert(CHECKLIST.RECORDS, {
        id,
        date,
        department,
        section,
        existStatus,
        implementedStatus,
        createdAt: now,
        updatedAt: now,
        updatedBy: updatedBy || 'unknown'
    });
};

/* ------------------------------------------------------------
   إضافة قسم جديد للكتالوج (يمنع التكرار)
   id = "cat::Department::Section"
   ------------------------------------------------------------ */
DB.addCatalogSection = async function (department, section, createdBy) {
    if (!department || !section) throw new Error('department and section are required');

    const id = `cat::${department}::${section}`;
    let existing = null;
    try { existing = await this.get(CHECKLIST.CATALOG, id); } catch (e) {}
    if (existing) {
        console.log(`⚠️ Section already exists: ${department} / ${section}`);
        return existing;
    }

    return this.insert(CHECKLIST.CATALOG, {
        id,
        department,
        section,
        createdAt: Date.now(),
        createdBy: createdBy || 'unknown'
    });
};

/* ------------------------------------------------------------
   إضافة إدارة جديدة (placeholder) — تظهر في القائمة حتى بدون أقسام
   ------------------------------------------------------------ */
DB.addCatalogDepartment = async function (department, createdBy) {
    if (!department) throw new Error('department is required');

    const id = `dept::${department}::__placeholder__`;
    let existing = null;
    try { existing = await this.get(CHECKLIST.CATALOG, id); } catch (e) {}
    if (existing) {
        console.log(`⚠️ Department already exists: ${department}`);
        return existing;
    }

    return this.insert(CHECKLIST.CATALOG, {
        id,
        department,
        section: '__placeholder__',
        createdAt: Date.now(),
        createdBy: createdBy || 'unknown'
    });
};

/* ------------------------------------------------------------
   حذف إدارة كاملة (كل أقسامها من الكتالوج فقط — السجلات التاريخية تُحفظ)
   ------------------------------------------------------------ */
DB.deleteCatalogDepartment = async function (department) {
    const all = await this.getAll(CHECKLIST.CATALOG);
    const targets = (all || []).filter(c => c.department === department);
    if (targets.length === 0) return 0;

    const ids = targets.map(t => t.id);
    return this.bulkDelete(CHECKLIST.CATALOG, ids);
};

/* ------------------------------------------------------------
   حذف كل سجلات يوم واحد (اختياري)
   ------------------------------------------------------------ */
DB.deleteChecklistRecordsForDate = async function (date) {
    const rows = await this.getChecklistRecordsByDate(date);
    if (!rows.length) return 0;

    const ids = rows.map(r => r.id);
    return this.bulkDelete(CHECKLIST.RECORDS, ids);
};

/* ------------------------------------------------------------
   إعادة تسمية إدارة (تُحدِّث الكتالوج فقط)
   ------------------------------------------------------------ */
DB.renameCatalogDepartment = async function (oldName, newName) {
    if (!oldName || !newName || oldName === newName) return 0;

    const all = await this.getAll(CHECKLIST.CATALOG);
    const targets = (all || []).filter(c => c.department === oldName);
    if (targets.length === 0) return 0;

    let count = 0;
    for (const t of targets) {
        const newId = t.section === '__placeholder__'
            ? `dept::${newName}::__placeholder__`
            : `cat::${newName}::${t.section}`;

        try {
            await this.delete(CHECKLIST.CATALOG, t.id);
            await this.insert(CHECKLIST.CATALOG, {
                ...t,
                id: newId,
                department: newName,
                updatedAt: Date.now()
            });
            count++;
        } catch (e) {
            console.error(`rename item failed: ${t.id}`, e);
        }
    }
    return count;
};

/* ------------------------------------------------------------
   Seed initial catalog (مرة واحدة عند أول استخدام)
   ------------------------------------------------------------ */
DB.seedCatalog = async function (seedData, createdBy) {
    if (!Array.isArray(seedData) || seedData.length === 0) {
        console.warn('⚠️ seedCatalog: no data');
        return 0;
    }

    const items = seedData.map(({ department, section }) => ({
        id: `cat::${department}::${section}`,
        department,
        section,
        createdAt: Date.now(),
        createdBy: createdBy || 'seed'
    }));

    console.log(`🌱 Seeding ${items.length} catalog items...`);
    const result = await this.bulkInsert(CHECKLIST.CATALOG, items);
    console.log(`✅ Seeded ${result.length} catalog items`);
    return result.length;
};

console.log('✅ Checklist module ready:', Object.keys(CHECKLIST).join(', '));
