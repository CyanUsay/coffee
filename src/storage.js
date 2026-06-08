// ─── 存储层 ───────────────────────────────────────────────
// 目前用浏览器 localStorage 实现，单设备、零后端、马上能用。
//
// 第二步（多设备 + 和瑶共享数据）时，只要把下面三个函数换成
// Supabase 的实现即可，CafeJournal.jsx 里的调用方式完全不用改：
//   storageGet(key)    -> { value } | null
//   storageSet(key, v) -> true | false
//   storageDelete(key) -> void
//
// 之所以写成 async，就是为了未来接网络数据库时签名不变。

export async function storageGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : { value: v };
  } catch (e) {
    return null;
  }
}

export async function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    // localStorage 写满（约 5MB）或被禁用时会走到这里
    return false;
  }
}

export async function storageDelete(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}
