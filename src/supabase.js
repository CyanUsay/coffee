// ─── Supabase 客户端 ─────────────────────────────────────
// 这里的 URL 和 publishable key 都是「可公开」的：publishable key
// 本来就会被打包进前端代码，访问权限由数据库的 RLS 策略控制，不是机密。
// （真正要保密的是 service_role / secret key 和数据库直连密码，那些绝不放这里。）
//
// 默认值直接写死，保证本地和自动部署都能开箱即用；
// 如果以后想换项目，设置环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 即可覆盖。

import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://vjnvgcdlyqchgvjgayov.supabase.co";

const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_2TnI45MhU5q7oDBuMWdxDQ_SPm63n1j";

export const supabase = createClient(url, key);
