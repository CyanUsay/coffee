// ─── 一次性数据迁移：localStorage → Supabase ──────────────
// 旧版本把日志存在浏览器 localStorage 里。换成云端存储后，第一次打开
// 新版时，把本机残留的旧日志「合并」上传到云端，确保不丢。
//
// 安全性：
//   • 合并而非覆盖 —— 云端已有的记录绝不会被本机数据冲掉，
//     只补充云端还没有的（按 entry.id 去重）。
//   • 每台设备只跑一次（用一个 localStorage 标记记住）。
//   • 任何一步出错都静默跳过，不影响 app 正常使用。

import { storageGet, storageSet } from "./storage.js";

const DONE_FLAG = "cj_migrated_supabase_v1";

export async function migrateLocalToCloud() {
  try {
    if (localStorage.getItem(DONE_FLAG)) return;

    const localRaw = localStorage.getItem("cj_entries");
    if (!localRaw) {
      localStorage.setItem(DONE_FLAG, "1");
      return;
    }

    const localEntries = JSON.parse(localRaw);
    if (!Array.isArray(localEntries) || localEntries.length === 0) {
      localStorage.setItem(DONE_FLAG, "1");
      return;
    }

    // 取云端现有记录
    const cloudRaw = await storageGet("cj_entries");
    const cloudEntries = cloudRaw ? JSON.parse(cloudRaw.value) : [];
    const cloudIds = new Set(cloudEntries.map((e) => e.id));

    // 合并：只补充云端没有的本机记录（云端优先，不覆盖）
    const toAdd = localEntries.filter((e) => !cloudIds.has(e.id));
    if (toAdd.length === 0) {
      localStorage.setItem(DONE_FLAG, "1");
      return;
    }

    const merged = [...toAdd, ...cloudEntries];
    const ok = await storageSet("cj_entries", JSON.stringify(merged));
    if (!ok) return; // 写失败就不打标记，下次再试

    // 把这些新增记录对应的本机图片也传上去（云端缺哪张补哪张）
    for (const e of toAdd) {
      if (!e.hasImage) continue;
      const img = localStorage.getItem("cj_img_" + e.id);
      if (!img) continue;
      const existing = await storageGet("cj_img_" + e.id);
      if (!existing) await storageSet("cj_img_" + e.id, img);
    }

    localStorage.setItem(DONE_FLAG, "1");
  } catch (e) {
    /* 迁移失败不影响使用，静默跳过 */
  }
}
