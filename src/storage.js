// ─── 存储层 ───────────────────────────────────────────────
// 现在用 Supabase（云端 Postgres）实现，多设备共享、零登录。
// 数据存在云端，跟前端代码完全独立 —— 以后怎么改 app、重新部署，
// 已经记下的咖啡日志都不会丢。
//
// 对上层（CafeJournal.jsx）来说，接口和原来的 localStorage 版完全一样，
// 所以业务代码一行都不用改：
//   storageGet(key)    -> { value } | null
//   storageSet(key, v) -> true | false
//   storageDelete(key) -> void
//
// 实现方式：把 `entries` 表当成一个 key-value 仓库用。
//   id   = key（"cj_entries" / "cj_img_<id>" / "_test" ...）
//   data = { v: <字符串值> }（jsonb，原样包一层，存什么取什么）

import { supabase } from "./supabase.js";

const TABLE = "entries";

export async function storageGet(key) {
  try {
    const { data: row, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("id", key)
      .maybeSingle();
    if (error || !row) return null;
    const v = row.data?.v;
    return v == null ? null : { value: v };
  } catch (e) {
    return null;
  }
}

export async function storageSet(key, value) {
  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { id: key, data: { v: value }, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
    return !error;
  } catch (e) {
    return false;
  }
}

export async function storageDelete(key) {
  try {
    await supabase.from(TABLE).delete().eq("id", key);
  } catch (e) {
    /* ignore */
  }
}
