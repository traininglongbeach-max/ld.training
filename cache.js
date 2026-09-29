// ============================================================
// cache.js - IndexedDB Cache Layer for L&D System
// ============================================================
// بديل localStorage — يدعم بيانات كبيرة بدون QuotaExceededError
// ============================================================
// الميزات:
//  - حفظ/قراءة/حذف/مسح عناصر من IndexedDB
//  - دعم TTL خارجي (يُدار من database.js)
//  - حجم يصل إلى 50MB+ (حسب المتصفح)
//  - Async بالكامل — لا يُجمّد الواجهة
// ============================================================

const DB_NAME = 'ld_system_cache';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';

let _dbPromise = null;

/**
 * فتح/إنشاء قاعدة IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function openCacheDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        const store = db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn('⚠️ IndexedDB blocked — another tab may have it open');
    };
  });

  return _dbPromise;
}

/**
 * حفظ عنصر في الكاش
 * @param {string} key   - مثال: "employees"
 * @param {any}    data  - البيانات (أي نوع قابل للتسلسل)
 * @returns {Promise<boolean>}
 */
export async function cacheSet(key, data) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_CACHE);
      const record = { key, data, ts: Date.now() };
      const req = store.put(record);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);

      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`⚠️ cacheSet(${key}) failed:`, err.message);
    return false;
  }
}

/**
 * قراءة عنصر من الكاش
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function cacheGet(key) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.get(key);

      req.onsuccess = () => {
        const rec = req.result;
        resolve(rec ? rec.data : null);
      };
      req.onerror = () => reject(req.error);

      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`⚠️ cacheGet(${key}) failed:`, err.message);
    return null;
  }
}

/**
 * قراءة timestamp آخر حفظ
 * @param {string} key
 * @returns {Promise<number|null>}
 */
export async function cacheGetMeta(key) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.get(key);

      req.onsuccess = () => {
        const rec = req.result;
        resolve(rec ? rec.ts : null);
      };
      req.onerror = () => reject(req.error);

      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    return null;
  }
}

/**
 * حذف عنصر واحد
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function cacheRemove(key) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.delete(key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);

      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`⚠️ cacheRemove(${key}) failed:`, err.message);
    return false;
  }
}

/**
 * مسح كل الكاش
 * @returns {Promise<boolean>}
 */
export async function cacheClear() {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);

      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('⚠️ cacheClear failed:', err.message);
    return false;
  }
}

/**
 * قائمة كل المفاتيح
 * @returns {Promise<string[]>}
 */
export async function cacheKeys() {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.getAllKeys();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);

      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('⚠️ cacheKeys failed:', err.message);
    return [];
  }
}

/**
 * جلب كل العناصر مع بياناتها (للتصدير/الفحص)
 * @returns {Promise<Array<{key:string, data:any, ts:number}>>}
 */
export async function cacheGetAll() {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);

      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('⚠️ cacheGetAll failed:', err.message);
    return [];
  }
}

/**
 * إحصائيات الحجم التقريبي للكاش
 * @returns {Promise<{count:number, size:number, sizeMB:string, keys:string[]}>}
 */
export async function cacheStats() {
  try {
    const items = await cacheGetAll();
    let totalSize = 0;
    items.forEach(item => {
      try {
        totalSize += new Blob([JSON.stringify(item)]).size;
      } catch (e) {}
    });
    return {
      count: items.length,
      size: totalSize,
      sizeMB: (totalSize / 1024 / 1024).toFixed(2),
      keys: items.map(i => i.key)
    };
  } catch (err) {
    console.warn('⚠️ cacheStats failed:', err.message);
    return { count: 0, size: 0, sizeMB: '0.00', keys: [] };
  }
}

/**
 * حذف قاعدة IndexedDB بالكامل (للاستخدام الطارئ فقط)
 * @returns {Promise<boolean>}
 */
export async function cacheDestroy() {
  try {
    if (_dbPromise) {
      const db = await _dbPromise;
      db.close();
      _dbPromise = null;
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        console.warn('⚠️ deleteDatabase blocked — close all tabs');
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('⚠️ cacheDestroy failed:', err.message);
    return false;
  }
}

/**
 * اختبار سريع للتأكد من عمل IndexedDB
 * (يمكن استدعاؤها من Console للتحقق)
 */
export async function cacheSelfTest() {
  try {
    const testKey = '__cache_test__';
    const testData = { hello: 'world', ts: Date.now() };

    const okSet = await cacheSet(testKey, testData);
    if (!okSet) return { ok: false, step: 'set' };

    const got = await cacheGet(testKey);
    if (!got || got.hello !== 'world') return { ok: false, step: 'get' };

    await cacheRemove(testKey);
    return { ok: true, message: '✅ IndexedDB working properly' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
