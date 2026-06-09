import { useState, useEffect, useRef, useCallback } from "react";
import { storageGet, storageSet, storageDelete } from "./storage.js";

const CATEGORIES = ["美式","拿铁","卡布奇诺","Flat White","Dirty","手冲","冷萃","摩卡","特调","其他"];
const USERS = ["Cyan", "瑶"];
const DEFAULT_RATINGS = {overall:0,aroma:0,flavor:0,environment:0,value:0,revisit:0};
const TEMPS = [{k:"hot",label:"🔥 热",color:"#B87333"},{k:"iced",label:"🧊 冰",color:"#6BA0C8"}];
const SCORE_LABELS = ["","难顶","不咋地","还行","不错","绝了"];
const SCORE_COLORS = ["","#B0A0A0","#CF8E4E","#D4B347","#6BB86B","#C87E33"];
const REVISIT_LABELS = ["","不想去了 🫠","还可以去 🤔","还想再去 💜"];
const REVISIT_COLORS = ["","#B0A0A0","#6BA0C8","#B07ACC"];
const RATINGS_META = [
  { key:"overall", label:"综合口味", emoji:"😋", max:5, tier:1 },
  { key:"aroma", label:"香醇度", emoji:"☕", max:5, tier:2 },
  { key:"flavor", label:"风味度", emoji:"🍎", max:5, tier:2 },
  { key:"environment", label:"环境", emoji:"🏠", max:5, tier:1 },
  { key:"value", label:"性价比", emoji:"💰", max:5, tier:1 },
  { key:"revisit", label:"再访意愿", emoji:"💜", max:3, tier:1 },
];

// 两人的专属颜色：瑶 = 淡紫，Cyan = 青蓝
const USER_COLORS = { "Cyan":"#2E9BC9", "瑶":"#B07ACC" };
const USER_TINT   = { "Cyan":"#E9F4FA", "瑶":"#F3EAFA" };
const userColor = (u)=> USER_COLORS[u] || "#8B7355";
const userTint  = (u)=> USER_TINT[u]  || "#F5EDE5";

// 追评的点赞反应
const REACTIONS = [
  { key:"up",    label:"夯中夯", emoji:"👍🏻" },
  { key:"skull", label:"我不中了", emoji:"💀" },
];

// 日期处理：统一以 ISO(YYYY-MM-DD) 存储，显示成中文；兼容老的中文日期字符串
function todayISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function toISO(s){
  if(!s) return todayISO();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); // 解析「2026年6月9日」
  if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  return todayISO();
}
function fmtDate(s){
  if(/^\d{4}-\d{2}-\d{2}/.test(s||"")){ const [y,mo,d]=s.slice(0,10).split("-"); return `${y}年${+mo}月${+d}日`; }
  return s||""; // 老的中文日期原样显示
}

// 标签：把输入框里的字符串解析成统一带 # 的数组
function parseTags(str){
  if(!str) return [];
  const out=[];
  for(let t of str.split(/[\s,，]+/)){
    t=t.trim().replace(/^#+/,"");
    if(t){ const tag="#"+t; if(!out.includes(tag)) out.push(tag); }
  }
  return out;
}

// ─── 追评（评论树）纯函数工具，全部返回新对象，避免就地修改 ───
const newId = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function addCommentTo(list, parentId, comment){
  if(!parentId) return [...(list||[]), comment];
  return (list||[]).map(c=> c.id===parentId
    ? {...c, replies:[...(c.replies||[]), comment]}
    : {...c, replies:addCommentTo(c.replies, parentId, comment)});
}
function toggleReactionIn(list, id, type, user){
  return (list||[]).map(c=>{
    if(c.id===id){
      const r={up:[],skull:[],...(c.reactions||{})};
      const arr=r[type]||[];
      r[type]= arr.includes(user)? arr.filter(u=>u!==user) : [...arr, user];
      return {...c, reactions:r};
    }
    return {...c, replies:toggleReactionIn(c.replies, id, type, user)};
  });
}
function countComments(list){
  return (list||[]).reduce((n,c)=> n+1+countComments(c.replies), 0);
}
function editCommentIn(list, id, text){
  return (list||[]).map(c=> c.id===id
    ? {...c, text}
    : {...c, replies:editCommentIn(c.replies, id, text)});
}

function compress(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const s = Math.min(1, 480/img.width);
        c.width=img.width*s; c.height=img.height*s;
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        res(c.toDataURL("image/jpeg",0.35));
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  });
}

function entryEmoji(e) {
  const r = e.ratings||{};
  if((r.overall||0)<=2 || r.revisit===1) return "😓 ";
  if((r.overall||0)>=4 || r.revisit===3) return "🥰 ";
  return "";
}

function tempEmoji(e) {
  return e.temp==="iced" ? "🧊 " : e.temp==="hot" ? "🔥 " : "";
}

function scoreColor(v,max=5) { const i=Math.round(v); return max===3 ? (REVISIT_COLORS[i]||"#ddd") : (SCORE_COLORS[i]||"#ddd"); }
function scoreLabel(v,max=5) { const i=Math.round(v); return max===3 ? REVISIT_LABELS[i] : SCORE_LABELS[i]; }

/* ─── Toast ─── */
function Toast({msg}) {
  if(!msg) return null;
  return <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",
    background:"#2C1810",color:"#fff",padding:"10px 22px",borderRadius:14,
    fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,.2)",
    animation:"tIn .3s ease"}}>{msg}</div>;
}

/* ─── Star Rating (tier 1 = big, tier 2 = small) ─── */
/* 支持半星：点星星左半 = .5，右半 = 整星（3.5 / 4 / 4.5 这样） */
function Stars({value,max=5,onChange,tier=1}) {
  const [hover,setHover]=useState(0);
  const big = tier===1;
  const display = hover||value;
  const size = big?28:18;
  const fs = big?24:15;
  const col = scoreColor(display,max);
  return (
    <div style={{display:"flex",alignItems:"center",gap:big?2:1}}>
      <div style={{display:"flex",gap:big?2:1}}>
        {Array.from({length:max},(_,i)=>{
          const full = display >= i+1;
          const half = !full && display >= i+0.5;
          return (
            <div key={i} style={{position:"relative",width:size,height:size,lineHeight:1,
              cursor:onChange?"pointer":"default"}}>
              {/* 底层空心星 */}
              <span style={{position:"absolute",inset:0,fontSize:fs,color:"#E0D5CA",
                display:"flex",alignItems:"center",justifyContent:"center"}}>★</span>
              {/* 上层实心星：满星 100% 宽，半星裁到 50% */}
              {(full||half) && (
                <span style={{position:"absolute",top:0,left:0,height:"100%",overflow:"hidden",
                  width:full?"100%":"50%"}}>
                  <span style={{display:"flex",alignItems:"center",justifyContent:"center",
                    width:size,height:"100%",fontSize:fs,color:col}}>★</span>
                </span>
              )}
              {/* 点击 / 悬停热区：左半选 .5，右半选整数 */}
              {onChange && <>
                <button aria-label={`${i+0.5}分`} onClick={()=>onChange(i+0.5)}
                  onMouseEnter={()=>setHover(i+0.5)} onMouseLeave={()=>setHover(0)}
                  style={{position:"absolute",left:0,top:0,width:"50%",height:"100%",
                    border:"none",background:"none",padding:0,cursor:"pointer"}}/>
                <button aria-label={`${i+1}分`} onClick={()=>onChange(i+1)}
                  onMouseEnter={()=>setHover(i+1)} onMouseLeave={()=>setHover(0)}
                  style={{position:"absolute",right:0,top:0,width:"50%",height:"100%",
                    border:"none",background:"none",padding:0,cursor:"pointer"}}/>
              </>}
            </div>
          );
        })}
      </div>
      {value>0 && <span style={{fontSize:big?12:10,fontWeight:600,
        color:scoreColor(value,max),marginLeft:4,whiteSpace:"nowrap",
      }}>{scoreLabel(value,max)} {value}</span>}
    </div>
  );
}

/* ─── Revisit Buttons ─── */
function RevisitPicker({value,onChange}) {
  return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
    {[1,2,3].map(v=><button key={v} onClick={()=>onChange?.(v)} style={{
      padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,
      cursor:onChange?"pointer":"default",transition:"all .2s",
      background:value===v?REVISIT_COLORS[v]:"#F5EDE5",
      color:value===v?"#fff":"#A09080",
      border:value===v?`2px solid ${REVISIT_COLORS[v]}`:"2px solid #E8DDD4",
    }}>{REVISIT_LABELS[v]}</button>)}
  </div>;
}

/* ─── Clickable Dots (tier 2 sub-ratings) ─── */
function ClickDots({value,max=5,onChange}) {
  const [hover,setHover]=useState(0);
  const display=hover||value;
  return (
    <div style={{display:"flex",alignItems:"center",gap:3}}>
      <div style={{display:"flex",gap:3}}>
        {Array.from({length:max},(_,i)=>{
          const on=i<display;
          return <button key={i} onClick={()=>onChange?.(i+1)}
            onMouseEnter={()=>onChange&&setHover(i+1)} onMouseLeave={()=>setHover(0)}
            style={{width:14,height:14,borderRadius:"50%",border:"none",padding:0,
              background:on?"#B87333":"#E8DDD4",
              cursor:onChange?"pointer":"default",transition:"all .15s",
              transform:on?"scale(1.1)":"scale(.85)",
            }}/>;
        })}
      </div>
      {value>0 && <span style={{fontSize:10,fontWeight:600,
        color:"#B87333",marginLeft:3,whiteSpace:"nowrap",
      }}>{scoreLabel(value,max)}</span>}
    </div>
  );
}

/* ─── Dots (display only, 支持半格) ─── */
function Dots({value,max=5,size=8}) {
  const col = scoreColor(value,max);
  return <div style={{display:"flex",gap:2}}>
    {Array.from({length:max},(_,i)=>{
      const full = value>=i+1;
      const half = !full && value>=i+0.5;
      return <div key={i} style={{position:"relative",width:size,height:size,borderRadius:"50%",
        background:"#E8DDD4",overflow:"hidden"}}>
        {(full||half) && <div style={{position:"absolute",left:0,top:0,height:"100%",
          width:full?"100%":"50%",background:col,transition:"all .2s"}}/>}
      </div>;
    })}
  </div>;
}

/* ═══════════════ CARD ═══════════════ */
function Card({entry,onClick}) {
  const ov = entry.ratings?.overall||0;
  const avg = entry.ratings ? (Number.isInteger(ov) ? String(ov) : ov.toFixed(1)) : "–";
  return (
    <div onClick={onClick} style={{background:"#fff",borderRadius:16,overflow:"hidden",
      boxShadow:"0 2px 16px rgba(44,24,16,.07)",cursor:"pointer",transition:"all .25s",
      border:"1px solid rgba(184,115,51,.08)",
    }}
    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(44,24,16,.12)";}}
    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 16px rgba(44,24,16,.07)";}}
    >
      <div style={{height:120,background:entry.image?`url(${entry.image}) center/cover`
        :"linear-gradient(135deg,#D4A574,#8B6F4E)",position:"relative"}}>
        <div style={{position:"absolute",bottom:6,left:8,background:"rgba(44,24,16,.6)",
          backdropFilter:"blur(4px)",borderRadius:16,padding:"2px 8px",
          color:"#fff",fontSize:10,fontWeight:500}}>{tempEmoji(entry)}{entry.category}</div>
        <div style={{position:"absolute",bottom:6,right:8,background:"rgba(255,255,255,.85)",
          borderRadius:16,padding:"2px 8px",color:"#B87333",fontSize:10,fontWeight:600,
        }}>{entry.author}</div>
      </div>
      <div style={{padding:"12px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,
              color:"#2C1810",lineHeight:1.25,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
            }}>{entryEmoji(entry)}{entry.shopName}</div>
            <div style={{fontSize:11,color:"#A08B7A",marginTop:2}}>{fmtDate(entry.date)}</div>
            {entry.station && <div style={{fontSize:10,color:"#B8A898",marginTop:1}}>🚇 {entry.station}</div>}
          </div>
          <div style={{background:`linear-gradient(135deg,${scoreColor(entry.ratings?.overall||3)},${scoreColor(Math.min(5,(entry.ratings?.overall||3)+1))})`,
            color:"#fff",borderRadius:10,padding:"3px 9px",fontSize:15,fontWeight:700,
            fontFamily:"'Playfair Display',serif",flexShrink:0,
          }}>{avg}</div>
        </div>
        {entry.specificName && <div style={{fontSize:11,color:"#8B7355",marginTop:5,
          fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
        }}>"{entry.specificName}"</div>}
      </div>
    </div>
  );
}

/* ═══════════════ 追评 COMMENTS ═══════════════ */
function Composer({currentUser,onSubmit,onCancel,placeholder,compact}) {
  const [author,setAuthor]=useState(currentUser||USERS[0]);
  const [text,setText]=useState("");
  const submit=()=>{ const t=text.trim(); if(!t) return; onSubmit(author,t); setText(""); };
  return (
    <div style={{background:compact?"transparent":"#fff",borderRadius:14,padding:compact?0:14,
      marginTop:compact?8:0,boxShadow:compact?"none":"0 2px 12px rgba(44,24,16,.05)",
      border:compact?"none":"1px solid rgba(184,115,51,.06)"}}>
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        {USERS.map(u=><button key={u} onClick={()=>setAuthor(u)} style={{
          padding:"4px 12px",borderRadius:14,fontSize:12,fontWeight:700,cursor:"pointer",
          transition:"all .2s",border:`1.5px solid ${author===u?userColor(u):"#E0D5CA"}`,
          background:author===u?userColor(u):"transparent",
          color:author===u?"#fff":"#8B7355"}}>{u}</button>)}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={compact?1:2}
          placeholder={placeholder||"写条追评..."}
          style={{flex:1,padding:"8px 12px",border:"1.5px solid #E0D5CA",borderRadius:10,
            fontSize:13,color:"#2C1810",outline:"none",background:"#FEFCFA",resize:"vertical",
            fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor=userColor(author)}
          onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
        <button onClick={submit} disabled={!text.trim()} style={{
          background:text.trim()?userColor(author):"#E0D5CA",color:"#fff",border:"none",
          borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,
          cursor:text.trim()?"pointer":"default",flexShrink:0}}>发送</button>
        {onCancel && <button onClick={onCancel} style={{background:"none",border:"none",
          color:"#A08B7A",fontSize:12,cursor:"pointer",flexShrink:0}}>取消</button>}
      </div>
    </div>
  );
}

// 点赞条：默认只显示一个 👍🏻，点开才出现「夯中夯 / 我不中了」选项；只显示数量
function ReactionBar({reactions,currentUser,onToggle,big}) {
  const [open,setOpen]=useState(false);
  const r=reactions||{};
  const active = REACTIONS.filter(rx=>(r[rx.key]||[]).length>0);
  const pad = big?"6px 12px":"4px 10px";
  const fs  = big?14:13;
  const pick=(k)=>{ onToggle(k); setOpen(false); };

  if(open){
    return (
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        {REACTIONS.map(rx=>{
          const users=r[rx.key]||[]; const me=users.includes(currentUser);
          return <button key={rx.key} onClick={()=>pick(rx.key)} style={{
            display:"flex",alignItems:"center",gap:4,padding:pad,borderRadius:16,
            fontSize:fs-1,fontWeight:600,cursor:"pointer",transition:"all .15s",
            border:`1px solid ${me?"#B87333":"#E8DDD4"}`,
            background:me?"#FBEFE2":"#fff",color:me?"#B87333":"#8B7355"}}>
            <span>{rx.emoji}</span><span>{rx.label}</span>
            {users.length>0 && <span style={{fontWeight:700}}>{users.length}</span>}
          </button>;
        })}
        <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",
          color:"#B0A090",fontSize:16,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>×</button>
      </div>
    );
  }

  // 收起态：没人点 → 只一个 👍🏻；已有反应 → 直接显示带文字的反应胶囊（如「👍🏻 夯中夯 1」）
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      {active.length===0 ? (
        <button onClick={()=>setOpen(true)} style={{
          display:"flex",alignItems:"center",gap:3,padding:pad,borderRadius:16,
          fontSize:fs,cursor:"pointer",transition:"all .15s",
          border:"1px solid #E8DDD4",background:"#fff"}}>👍🏻</button>
      ) : active.map(rx=>{
        const users=r[rx.key]; const me=users.includes(currentUser);
        return <button key={rx.key} onClick={()=>setOpen(true)} style={{
          display:"flex",alignItems:"center",gap:4,padding:pad,borderRadius:16,
          fontSize:fs-1,fontWeight:600,cursor:"pointer",transition:"all .15s",
          border:`1px solid ${me?"#B87333":"#E8DDD4"}`,
          background:me?"#FBEFE2":"#fff",color:me?"#B87333":"#8B7355"}}>
          <span>{rx.emoji}</span><span>{rx.label}</span>
          <span style={{fontWeight:700}}>{users.length}</span>
        </button>;
      })}
    </div>
  );
}

function CommentNode({c,depth,currentUser,onReply,onReact,onEdit}) {
  const [replying,setReplying]=useState(false);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(c.text);
  const col=userColor(c.author);
  return (
    <div style={{marginTop:10,marginLeft:depth>0?14:0,
      paddingLeft:depth>0?10:0,borderLeft:depth>0?`2px solid ${col}33`:"none"}}>
      <div style={{background:userTint(c.author),borderRadius:12,padding:"8px 12px"}}>
        <div style={{fontSize:12,fontWeight:700,color:col,marginBottom:2}}>{c.author}</div>
        {editing ? (
          <div>
            <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2} autoFocus
              style={{width:"100%",padding:"6px 10px",border:`1.5px solid ${col}`,borderRadius:8,
                fontSize:13,color:"#2C1810",outline:"none",background:"#fff",resize:"vertical",
                fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button onClick={()=>{ const t=draft.trim(); if(t){onEdit(c.id,t);} setEditing(false); }}
                disabled={!draft.trim()} style={{background:draft.trim()?col:"#E0D5CA",color:"#fff",
                border:"none",borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,
                cursor:draft.trim()?"pointer":"default"}}>保存</button>
              <button onClick={()=>{setDraft(c.text);setEditing(false);}} style={{background:"none",
                border:"none",color:"#A08B7A",fontSize:12,cursor:"pointer"}}>取消</button>
            </div>
          </div>
        ) : (
          <div style={{fontSize:13,color:"#3A2A1E",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{c.text}</div>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:5,flexWrap:"wrap"}}>
        <ReactionBar reactions={c.reactions} currentUser={currentUser} onToggle={(t)=>onReact(c.id,t)}/>
        <button onClick={()=>setReplying(v=>!v)} style={{background:"none",border:"none",
          fontSize:12,color:"#A08B7A",fontWeight:600,cursor:"pointer"}}>回复</button>
        <button onClick={()=>{setDraft(c.text);setEditing(v=>!v);setReplying(false);}} style={{background:"none",border:"none",
          fontSize:12,color:"#A08B7A",fontWeight:600,cursor:"pointer"}}>编辑</button>
      </div>
      {replying && <Composer compact currentUser={currentUser} placeholder={`回复 ${c.author}...`}
        onCancel={()=>setReplying(false)}
        onSubmit={(author,text)=>{ onReply(c.id,author,text); setReplying(false); }}/>}
      {(c.replies||[]).map(r=><CommentNode key={r.id} c={r} depth={depth+1}
        currentUser={currentUser} onReply={onReply} onReact={onReact} onEdit={onEdit}/>)}
    </div>
  );
}

function Comments({comments,currentUser,onChange}) {
  const list = comments||[];
  const addReply=(parentId,author,text)=>{
    onChange(addCommentTo(list, parentId, {id:newId(),author,text,ts:Date.now(),reactions:{up:[],skull:[]},replies:[]}));
  };
  const react=(id,type)=> onChange(toggleReactionIn(list, id, type, currentUser));
  const edit=(id,text)=> onChange(editCommentIn(list, id, text));
  return (
    <div style={{marginTop:4,marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:700,color:"#2C1810",marginBottom:8}}>
        追评 {list.length>0 && <span style={{color:"#A08B7A",fontWeight:600}}>({countComments(list)})</span>}
      </div>
      {list.map(c=><CommentNode key={c.id} c={c} depth={0}
        currentUser={currentUser} onReply={addReply} onReact={react} onEdit={edit}/>)}
      <div style={{marginTop:list.length>0?12:0}}>
        <Composer currentUser={currentUser} onSubmit={(author,text)=>addReply(null,author,text)}/>
      </div>
    </div>
  );
}

/* ═══════════════ DETAIL ═══════════════ */
function Detail({entry,entries,onBack,onDelete,onEdit,onAgain,onTag,onUpdateEntry,currentUser}) {
  const sameShop = entries.filter(e=>e.id!==entry.id && e.shopName===entry.shopName);
  const [confirmDel,setConfirmDel] = useState(false);
  const toggleLike=(type)=>{
    const r={up:[],skull:[],...(entry.likes||{})};
    const arr=r[type]||[];
    r[type]= arr.includes(currentUser)? arr.filter(u=>u!==currentUser) : [...arr, currentUser];
    onUpdateEntry && onUpdateEntry({...entry, likes:r});
  };
  return (
    <div style={{minHeight:"100vh",background:"#FBF7F2"}}>
      <div style={{height:200,background:entry.image?`url(${entry.image}) center/cover`
        :"linear-gradient(135deg,#D4A574,#8B6F4E)",position:"relative"}}>
        <button onClick={onBack} style={{position:"absolute",top:14,left:14,
          background:"rgba(255,255,255,.85)",backdropFilter:"blur(6px)",border:"none",
          borderRadius:"50%",width:36,height:36,cursor:"pointer",fontSize:16,color:"#2C1810",
          display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div style={{position:"absolute",top:14,right:14,display:"flex",gap:6}}>
          <button onClick={onEdit} style={{background:"rgba(255,255,255,.85)",backdropFilter:"blur(6px)",
            border:"none",borderRadius:"50%",width:36,height:36,cursor:"pointer",
            fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button>
          <button onClick={()=>setConfirmDel(true)} style={{background:"rgba(180,60,60,.78)",backdropFilter:"blur(6px)",
            border:"none",borderRadius:18,height:36,padding:"0 14px",cursor:"pointer",
            fontSize:13,fontWeight:600,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>删除</button>
        </div>
        <div style={{position:"absolute",bottom:0,left:0,right:0,
          background:"linear-gradient(transparent,rgba(44,24,16,.55))",padding:"36px 18px 14px"}}>
          <div style={{display:"flex",gap:6,marginBottom:4}}>
            <span style={{background:"rgba(255,255,255,.2)",borderRadius:16,padding:"2px 8px",
              fontSize:11,color:"#fff"}}>{tempEmoji(entry)}{entry.category}</span>
            <span style={{background:"rgba(255,255,255,.2)",borderRadius:16,padding:"2px 8px",
              fontSize:11,color:"#fff"}}>{entry.author}</span>
          </div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,
            color:"#fff",textShadow:"0 2px 6px rgba(0,0,0,.3)"}}>
            {entryEmoji(entry)}{entry.shopName}</div>
          {entry.specificName && <div style={{fontSize:12,color:"rgba(255,255,255,.8)",
            marginTop:2,fontStyle:"italic"}}>"{entry.specificName}"</div>}
        </div>
      </div>

      <div style={{padding:"16px 18px 100px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,fontSize:12,color:"#A08B7A",marginBottom:4}}>
          <span>{fmtDate(entry.date)}</span>
          {entry.price && <span style={{color:"#B87333",fontWeight:600}}>¥{entry.price}</span>}
        </div>
        {entry.station && <div style={{fontSize:12,color:"#8B7355",marginBottom:10}}>🚇 {entry.station}</div>}
        {entry.tags && entry.tags.length>0 && <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
          {entry.tags.map(t=><button key={t} onClick={()=>onTag&&onTag(t)} style={{
            background:"#F0E6DD",border:"1px solid #E0D0C0",borderRadius:14,padding:"3px 10px",
            fontSize:12,color:"#8B6F4E",fontWeight:600,cursor:"pointer"}}>{t}</button>)}
        </div>}

        <div style={{background:"#fff",borderRadius:16,padding:18,
          boxShadow:"0 2px 12px rgba(44,24,16,.05)",border:"1px solid rgba(184,115,51,.06)",marginBottom:12}}>
          {RATINGS_META.map(r=>{
            const v = entry.ratings?.[r.key]||0;
            return (
              <div key={r.key} style={{
                padding:r.tier===1?"10px 0":"4px 0 4px 24px",
                borderBottom:r.key!=="revisit"?"1px solid #F5EDE5":"none",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:r.tier===1?14:12,color:r.tier===1?"#2C1810":"#8B7355"}}>
                    {r.emoji} {r.label}
                  </span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {r.key==="revisit"
                      ? <span style={{fontSize:12,fontWeight:600,color:REVISIT_COLORS[v]}}>{REVISIT_LABELS[v]||"–"}</span>
                      : <>
                          <Dots value={v} max={r.max} size={r.tier===1?9:6}/>
                          <span style={{fontSize:r.tier===1?13:11,fontWeight:600,
                            color:scoreColor(v,r.max)}}>{v}/{r.max}</span>
                        </>
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {entry.nextDrink && <div style={{background:"#fff",borderRadius:16,padding:14,marginBottom:12,
          boxShadow:"0 2px 12px rgba(44,24,16,.05)",border:"1px solid rgba(184,115,51,.06)"}}>
          <span style={{fontSize:12,color:"#A08B7A"}}>下次想喝 →</span>
          <span style={{fontSize:14,color:"#2C1810",fontWeight:600,marginLeft:6}}>{entry.nextDrink}</span>
        </div>}

        {/* 笔记 + 点赞（每条日志都能赞，只显示数量） */}
        <div style={{background:"#fff",borderRadius:16,padding:14,marginBottom:12,
          boxShadow:"0 2px 12px rgba(44,24,16,.05)",border:"1px solid rgba(184,115,51,.06)"}}>
          {entry.notes ? <>
            <div style={{fontSize:11,color:"#A08B7A",marginBottom:4,fontWeight:600}}>笔记</div>
            <div style={{fontSize:13,color:"#5C4A3A",lineHeight:1.6,whiteSpace:"pre-wrap",marginBottom:10}}>{entry.notes}</div>
          </> : null}
          <ReactionBar big reactions={entry.likes} currentUser={currentUser} onToggle={toggleLike}/>
        </div>

        {/* 追评 */}
        <Comments comments={entry.comments} currentUser={currentUser}
          onChange={(next)=> onUpdateEntry && onUpdateEntry({...entry, comments:next})}/>

        <button onClick={onAgain} style={{width:"100%",padding:"14px 0",borderRadius:14,
          background:"linear-gradient(135deg,#B87333,#D4A574)",color:"#fff",border:"none",
          fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8,
          boxShadow:"0 4px 16px rgba(184,115,51,.25)"}}>
          ☕ 再喝一次
        </button>

        {sameShop.length>0 && <>
          <div style={{fontSize:13,fontWeight:700,color:"#2C1810",marginTop:24,marginBottom:10}}>
            这家店的其他记录
          </div>
          {sameShop.map(e=><div key={e.id} style={{background:"#fff",borderRadius:12,padding:"10px 14px",
            marginBottom:8,boxShadow:"0 1px 6px rgba(44,24,16,.04)",
            border:"1px solid rgba(184,115,51,.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#2C1810"}}>{entryEmoji(e)}{e.specificName||e.category}</div>
              <div style={{fontSize:11,color:"#A08B7A"}}>{e.date} · {e.author}</div>
            </div>
            <Dots value={e.ratings?.overall||0} max={5} size={7}/>
          </div>)}
        </>}
      </div>

      {confirmDel && (
        <div onClick={()=>setConfirmDel(false)} style={{position:"fixed",inset:0,zIndex:1000,
          background:"rgba(44,24,16,.45)",backdropFilter:"blur(2px)",
          display:"flex",alignItems:"center",justifyContent:"center",padding:24,
          animation:"tIn .2s ease"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,
            padding:"22px 20px 16px",maxWidth:300,width:"100%",
            boxShadow:"0 12px 40px rgba(0,0,0,.25)"}}>
            <div style={{fontSize:16,fontWeight:700,color:"#2C1810",marginBottom:6}}>删除这条记录？</div>
            <div style={{fontSize:13,color:"#8B7355",lineHeight:1.6,marginBottom:18}}>
              「{entry.shopName}」这一杯会被永久删除，无法恢复。
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDel(false)} style={{flex:1,padding:"11px 0",
                borderRadius:12,border:"1.5px solid #E8DDD4",background:"#F5EDE5",
                color:"#8B7355",fontSize:14,fontWeight:600,cursor:"pointer"}}>取消</button>
              <button onClick={()=>{setConfirmDel(false);onDelete();}} style={{flex:1,padding:"11px 0",
                borderRadius:12,border:"none",background:"#C0453C",
                color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════ ADD / EDIT FORM ═══════════════ */
function Form({initial,onSave,onBack,currentUser,isEdit}) {
  const fileRef = useRef();
  // 合并默认值，保证 form 永远是完整结构。
  // 关键修复：「再喝一次」传进来的 initial 只有店名/地铁站等几项，
  // 没有 ratings —— 不补全的话渲染评分时会读到 undefined 直接崩溃白屏。
  const [form,setForm] = useState(() => ({
    shopName:"",category:"拿铁",specificName:"",station:"",notes:"",
    image:null,author:currentUser,nextDrink:"",temp:"hot",price:"",
    ...(initial||{}),
    date: toISO(initial?.date),          // 默认今天，可改；编辑时兼容老的中文日期
    price: (initial&&initial.price)||"",
    ratings:{...DEFAULT_RATINGS, ...((initial&&initial.ratings)||{})},
  }));
  const [tagInput,setTagInput] = useState(()=> ((initial&&initial.tags)||[]).join(" "));
  const [saving,setSaving] = useState(false);
  const [ratingToast,setRatingToast] = useState("");

  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const setR=(k,v)=>{
    setForm(p=>({...p,ratings:{...p.ratings,[k]:v}}));
    const meta = RATINGS_META.find(m=>m.key===k);
    if(meta) {
      const label = meta.max===3 ? REVISIT_LABELS[v] : SCORE_LABELS[v];
      if(label) { setRatingToast(`${meta.emoji} ${label}`); setTimeout(()=>setRatingToast(""),1200); }
    }
  };

  async function handleImg(e) {
    const f=e.target.files?.[0]; if(!f) return;
    const c = await compress(f); set("image",c);
  }

  async function handleSave() {
    if(!form.shopName.trim()) return;
    setSaving(true);
    const common = {...form, date:toISO(form.date), price:(form.price||"").trim(), tags:parseTags(tagInput)};
    const entry = isEdit ? common : { ...common, id:newId() };
    await onSave(entry);
    setSaving(false);
  }

  const inp = {width:"100%",padding:"10px 14px",border:"1.5px solid #E0D5CA",
    borderRadius:10,fontSize:14,color:"#2C1810",outline:"none",
    background:"#FEFCFA",boxSizing:"border-box",transition:"border-color .2s"};

  return (
    <div style={{minHeight:"100vh",background:"#FBF7F2"}}>
      {ratingToast && <Toast msg={ratingToast}/>}
      <div style={{padding:"14px 18px",display:"flex",alignItems:"center",
        justifyContent:"space-between",borderBottom:"1px solid #F0E8DF",
        background:"rgba(251,247,242,.95)",backdropFilter:"blur(8px)",
        position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",fontSize:15,
          cursor:"pointer",color:"#B87333",fontWeight:600}}>← 返回</button>
        <span style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,
          color:"#2C1810"}}>{isEdit?"编辑":"新的一杯"}</span>
        <button onClick={handleSave} disabled={saving||!form.shopName.trim()} style={{
          background:form.shopName.trim()?"linear-gradient(135deg,#B87333,#D4A574)":"#E0D5CA",
          color:"#fff",border:"none",borderRadius:20,padding:"6px 16px",
          fontSize:13,fontWeight:600,cursor:form.shopName.trim()?"pointer":"default",
        }}>{saving?"…":"保存"}</button>
      </div>

      <div style={{padding:18}}>
        {/* Image */}
        <div style={{position:"relative",marginBottom:18}}>
          <div onClick={()=>fileRef.current?.click()} style={{
            height:150,borderRadius:14,overflow:"hidden",cursor:"pointer",
            background:form.image?`url(${form.image}) center/cover`:"linear-gradient(135deg,#E8DDD4,#D4C8BB)",
            display:"flex",alignItems:"center",justifyContent:"center",
            border:"2px dashed #C8B9A8",
          }}>
            {!form.image && <div style={{textAlign:"center",color:"#A08B7A"}}>
              <div style={{fontSize:26,marginBottom:2}}>📷</div>
              <div style={{fontSize:12}}>点击上传照片</div>
            </div>}
          </div>
          {form.image && <button onClick={(e)=>{e.stopPropagation();set("image",null);}} style={{
            position:"absolute",top:8,right:8,background:"rgba(180,60,60,.8)",
            border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",
            color:"#fff",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",
          }}>✕</button>}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImg} style={{display:"none"}}/>
        </div>

        {/* Shop name */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>店名 *</label>
          <input value={form.shopName} onChange={e=>set("shopName",e.target.value)}
            placeholder="叫什么名字" style={inp}
            onFocus={e=>e.target.style.borderColor="#B87333"}
            onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
        </div>

        {/* Category + name */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1}}>
            <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>品类</label>
            <select value={form.category} onChange={e=>set("category",e.target.value)}
              style={{...inp,appearance:"none",cursor:"pointer"}}>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>
              具体名称 <span style={{fontWeight:400,color:"#C0B0A0"}}>选填</span></label>
            <input value={form.specificName} onChange={e=>set("specificName",e.target.value)}
              placeholder="冰摇燕麦拿铁" style={inp}
              onFocus={e=>e.target.style.borderColor="#B87333"}
              onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
          </div>
        </div>

        {/* 温度（占一半） + 价格（另一半，选填） */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1}}>
            <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>温度</label>
            <div style={{display:"flex",gap:6}}>
              {TEMPS.map(t=>{
                const on = form.temp===t.k;
                return <button key={t.k} onClick={()=>set("temp",t.k)} style={{
                  flex:1,padding:"9px 0",borderRadius:10,fontSize:13,fontWeight:600,
                  cursor:"pointer",transition:"all .2s",
                  background:on?t.color:"#F5EDE5",
                  color:on?"#fff":"#8B7355",
                  border:on?`1.5px solid ${t.color}`:"1.5px solid #E0D5CA",
                }}>{t.label}</button>;
              })}
            </div>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>
              价格 <span style={{fontWeight:400,color:"#C0B0A0"}}>选填</span></label>
            <input type="number" inputMode="decimal" value={form.price}
              onChange={e=>set("price",e.target.value)} placeholder="¥ 多少钱" style={inp}
              onFocus={e=>e.target.style.borderColor="#B87333"}
              onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
          </div>
        </div>

        {/* Station */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>
            🚇 最近地铁站 <span style={{fontWeight:400,color:"#C0B0A0"}}>选填</span></label>
          <input value={form.station} onChange={e=>set("station",e.target.value)}
            placeholder="XX站" style={inp}
            onFocus={e=>e.target.style.borderColor="#B87333"}
            onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
        </div>

        {/* 日期（默认今天，可改） */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>📅 日期</label>
          <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={inp}
            onFocus={e=>e.target.style.borderColor="#B87333"}
            onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
        </div>

        {/* Ratings */}
        <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:14,
          boxShadow:"0 2px 10px rgba(44,24,16,.04)",border:"1px solid rgba(184,115,51,.06)"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#2C1810",marginBottom:12,letterSpacing:1}}>评分</div>
          {RATINGS_META.map((r,i)=>(
            <div key={r.key} style={{
              padding:r.tier===1?"10px 0":"6px 0 6px 20px",
              borderBottom:i<RATINGS_META.length-1?"1px solid #F5EDE5":"none",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:r.tier===1?13:12,fontWeight:r.tier===1?600:500,
                  color:r.tier===1?"#2C1810":"#8B7355"}}>
                  {r.emoji} {r.label}
                </span>
                {r.key==="revisit"
                  ? <RevisitPicker value={form.ratings.revisit} onChange={v=>setR("revisit",v)}/>
                  : r.tier===2
                    ? <ClickDots value={form.ratings[r.key]} max={r.max} onChange={v=>setR(r.key,v)}/>
                    : <Stars value={form.ratings[r.key]} max={r.max} onChange={v=>setR(r.key,v)} tier={r.tier}/>
                }
              </div>
            </div>
          ))}
        </div>

        {/* Next drink (if revisit >= 3) */}
        {form.ratings.revisit>=3 && <div style={{marginBottom:14,
          animation:"tIn .3s ease"}}>
          <label style={{fontSize:11,fontWeight:600,color:"#B07ACC",marginBottom:5,display:"block"}}>
            💜 下次想喝的是...</label>
          <input value={form.nextDrink} onChange={e=>set("nextDrink",e.target.value)}
            placeholder="下回试试..." style={{...inp,borderColor:"#D4C0E8"}}
            onFocus={e=>e.target.style.borderColor="#B07ACC"}
            onBlur={e=>e.target.style.borderColor="#D4C0E8"}/>
        </div>}

        {/* 标签 */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>
            🏷 标签 <span style={{fontWeight:400,color:"#C0B0A0"}}>选填 · 空格分隔，如 #狗 #打工</span></label>
          <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
            placeholder="#狗 #续命" style={inp}
            onFocus={e=>e.target.style.borderColor="#B87333"}
            onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
          {parseTags(tagInput).length>0 && <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
            {parseTags(tagInput).map(t=><span key={t} style={{background:"#F0E6DD",borderRadius:14,
              padding:"2px 10px",fontSize:12,color:"#8B6F4E",fontWeight:600}}>{t}</span>)}
          </div>}
        </div>

        {/* Notes */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:5,display:"block"}}>
            笔记 <span style={{fontWeight:400,color:"#C0B0A0"}}>选填</span></label>
          <textarea value={form.notes} onChange={e=>set("notes",e.target.value)}
            placeholder="想记下什么..." rows={3}
            style={{...inp,resize:"vertical",fontFamily:"inherit",lineHeight:1.6}}
            onFocus={e=>e.target.style.borderColor="#B87333"}
            onBlur={e=>e.target.style.borderColor="#E0D5CA"}/>
        </div>

        {/* Author */}
        <div style={{marginBottom:24}}>
          <label style={{fontSize:11,fontWeight:600,color:"#8B7355",marginBottom:6,display:"block"}}>记录者</label>
          <div style={{display:"flex",gap:8}}>
            {USERS.map(u=><button key={u} onClick={()=>set("author",u)} style={{
              flex:1,padding:"10px 0",borderRadius:10,fontSize:14,fontWeight:600,
              cursor:"pointer",transition:"all .2s",
              background:form.author===u?"linear-gradient(135deg,#B87333,#D4A574)":"#F5EDE5",
              color:form.author===u?"#fff":"#8B7355",
              border:form.author===u?"1.5px solid #B87333":"1.5px solid #E0D5CA",
            }}>{u}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ MAIN ═══════════════ */
export default function CafeJournal() {
  const [view,setView]=useState("list");
  const [entries,setEntries]=useState([]);
  const [sel,setSel]=useState(null);
  const [editEntry,setEditEntry]=useState(null);
  const [prefill,setPrefill]=useState(null);
  const [user,setUser]=useState("Cyan");
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [toast,setToast]=useState("");
  const [storageOk,setStorageOk]=useState(null);

  const flash=useCallback((m)=>{setToast(m);setTimeout(()=>setToast(""),2200);},[]);

  // Test & load storage
  useEffect(()=>{
    (async()=>{
      // Test storage
      let ok=false;
      try {
        const testResult = await storageSet("_test","1");
        if(testResult) {
          const g = await storageGet("_test");
          ok = g && g.value==="1";
          try{await storageDelete("_test");}catch(e){}
        }
      } catch(e){ ok=false; }
      setStorageOk(ok);

      // Load entries
      if(ok) {
        try {
          const r = await storageGet("cj_entries");
          if(r) {
            const parsed = JSON.parse(r.value);
            // Hydrate images
            const hydrated = await Promise.all(parsed.map(async e=>{
              if(e.hasImage) {
                try {
                  const imgR = await storageGet("cj_img_"+e.id);
                  return {...e, image: imgR?.value || null};
                } catch(err) { return {...e, image:null}; }
              }
              return e;
            }));
            setEntries(hydrated);
          }
        } catch(e) {}
      }
      setLoading(false);
    })();
  },[]);

  async function persist(newEntries) {
    setEntries(newEntries);
    if(!storageOk) { flash("⚠️ 存储不可用，重启后数据会丢失"); return false; }
    try {
      // Strip images, store separately
      const stripped = newEntries.map(e=>({...e, image:undefined, hasImage:!!e.image}));
      const result = await storageSet("cj_entries", JSON.stringify(stripped));
      if(!result) { flash("❌ 保存失败"); return false; }
      // Verify
      const verify = await storageGet("cj_entries");
      if(!verify) { flash("❌ 验证失败"); return false; }
      // Save images
      for(const e of newEntries) {
        if(e.image && !e.image.startsWith("cj_")) {
          try { await storageSet("cj_img_"+e.id, e.image); } catch(err){}
        }
      }
      return true;
    } catch(e) { flash("❌ 保存出错了"); return false; }
  }

  async function addEntry(entry) {
    const updated = [entry,...entries];
    if(await persist(updated)) { flash("☕ 记下来了"); setView("list"); setPrefill(null); }
  }

  async function updateEntry(entry) {
    const updated = entries.map(e=>e.id===entry.id?entry:e);
    if(await persist(updated)) { flash("✏️ 已更新"); setSel(entry); setView("detail"); setEditEntry(null); }
  }

  async function deleteEntry(id) {
    const updated = entries.filter(e=>e.id!==id);
    await persist(updated);
    try{await storageDelete("cj_img_"+id);}catch(e){}
    flash("🗑 删掉了"); setView("list"); setSel(null);
  }

  async function updateEntryInline(entry) {
    setSel(entry);                                   // 立刻反映到详情页（追评等）
    const updated = entries.map(e=>e.id===entry.id?entry:e);
    await persist(updated);
  }

  const q = search.trim().toLowerCase();
  const matchQ = (e)=> !q || [e.station,e.shopName,e.specificName,e.category,...(e.tags||[])]
    .some(x=>(x||"").toLowerCase().includes(q));
  const filtered = (filter==="all"?entries:entries.filter(e=>e.author===filter))
    .filter(matchQ)
    .slice()
    .sort((a,b)=> toISO(b.date).localeCompare(toISO(a.date))); // 按日期新→旧

  // ─── EDIT VIEW ───
  if(view==="edit" && editEntry) {
    return <Form initial={editEntry} isEdit onSave={updateEntry}
      onBack={()=>{setView("detail");setEditEntry(null);}} currentUser={user}/>;
  }

  // ─── ADD VIEW ───
  if(view==="add") {
    return <Form initial={prefill} onSave={addEntry}
      onBack={()=>{setView("list");setPrefill(null);}} currentUser={user}/>;
  }

  // ─── DETAIL VIEW ───
  if(view==="detail" && sel) {
    return <Detail entry={sel} entries={entries} onBack={()=>setView("list")} currentUser={user}
      onDelete={()=>deleteEntry(sel.id)}
      onEdit={()=>{setEditEntry(sel);setView("edit");}}
      onUpdateEntry={updateEntryInline}
      onTag={(t)=>{setSearch(t.replace(/^#/,""));setFilter("all");setView("list");}}
      onAgain={()=>{setPrefill({shopName:sel.shopName,station:sel.station,
        category:sel.category,temp:sel.temp,author:user});setView("add");}}/>;
  }

  // ─── LIST VIEW ───
  return (
    <div style={{minHeight:"100vh",background:"#FBF7F2"}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet"/>
      <style>{`@keyframes tIn{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {toast && <Toast msg={toast}/>}

      <div style={{padding:"22px 18px 10px",position:"sticky",top:0,zIndex:10,
        background:"rgba(251,247,242,.92)",backdropFilter:"blur(10px)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,
              color:"#2C1810",lineHeight:1}}>Café Journal</div>
            <div style={{fontSize:11,color:"#A08B7A",marginTop:3,letterSpacing:2}}>
              {entries.length} 杯记忆
              {storageOk===false && <span style={{color:"#CF6B4E",marginLeft:6}}>· 存储不可用</span>}
              {storageOk===true && <span style={{color:"#6BB86B",marginLeft:6}}>· ✓</span>}
            </div>
          </div>
          <button onClick={()=>setView("add")} style={{
            background:"linear-gradient(135deg,#B87333,#D4A574)",color:"#fff",border:"none",
            borderRadius:"50%",width:42,height:42,fontSize:22,cursor:"pointer",
            boxShadow:"0 4px 14px rgba(184,115,51,.3)",
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>+</button>
        </div>

        {/* Search */}
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 搜店名 / 咖啡 / #标签 / 地铁站..."
          style={{width:"100%",padding:"8px 14px",border:"1.5px solid #E8DDD4",
            borderRadius:10,fontSize:13,color:"#2C1810",outline:"none",marginTop:12,
            background:"#FEFCFA",boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor="#B87333"}
          onBlur={e=>e.target.style.borderColor="#E8DDD4"}/>

        {/* Filters */}
        <div style={{display:"flex",gap:6,marginTop:10}}>
          {[{key:"all",label:"全部"},...USERS.map(u=>({key:u,label:u}))].map(f=>
            <button key={f.key} onClick={()=>setFilter(f.key)} style={{
              padding:"4px 12px",borderRadius:18,fontSize:12,fontWeight:600,
              cursor:"pointer",transition:"all .2s",
              background:filter===f.key?"#2C1810":"transparent",
              color:filter===f.key?"#FBF7F2":"#8B7355",
              border:filter===f.key?"1.5px solid #2C1810":"1.5px solid #D4C8BB",
            }}>{f.label}</button>
          )}
        </div>
      </div>

      <div style={{padding:"6px 18px 80px"}}>
        {loading ? (
          <div style={{textAlign:"center",padding:50,color:"#B0A090"}}>
            <div style={{fontSize:22,marginBottom:6}}>☕</div>加载中...</div>
        ) : filtered.length===0 ? (
          <div style={{textAlign:"center",padding:50,color:"#B0A090"}}>
            <div style={{fontSize:36,marginBottom:8,opacity:.4}}>☕</div>
            <div style={{fontSize:14,fontWeight:500}}>{entries.length===0?"还没有记录":"没有匹配的结果"}</div>
            <div style={{fontSize:12,color:"#C0B0A0",marginTop:3}}>
              {entries.length===0?"点右上角 + 记下第一杯":"试试其他关键词？"}</div>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {filtered.map(e=><Card key={e.id} entry={e}
              onClick={()=>{setSel(e);setView("detail");}}/>)}
          </div>
        )}
      </div>

      {/* User switcher */}
      <div style={{position:"fixed",bottom:18,left:"50%",transform:"translateX(-50%)",
        background:"rgba(44,24,16,.85)",backdropFilter:"blur(10px)",
        borderRadius:26,padding:"5px 6px",display:"flex",gap:3,
        boxShadow:"0 4px 18px rgba(44,24,16,.2)"}}>
        {USERS.map(u=><button key={u} onClick={()=>setUser(u)} style={{
          padding:"7px 16px",borderRadius:20,fontSize:12,fontWeight:600,
          cursor:"pointer",transition:"all .2s",
          background:user===u?"#B87333":"transparent",
          color:user===u?"#fff":"rgba(255,255,255,.45)",border:"none",
        }}>{u}</button>)}
      </div>
    </div>
  );
}
