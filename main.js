"use strict";var Y=Object.defineProperty;var H=Object.getOwnPropertyDescriptor;var F=Object.getOwnPropertyNames;var N=Object.prototype.hasOwnProperty;var U=(a,t)=>{for(var e in t)Y(a,e,{get:t[e],enumerable:!0})},B=(a,t,e,s)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of F(t))!N.call(a,n)&&n!==e&&Y(a,n,{get:()=>t[n],enumerable:!(s=H(t,n))||s.enumerable});return a};var O=a=>B(Y({},"__esModule",{value:!0}),a);var Z={};U(Z,{default:()=>L});module.exports=O(Z);var i=require("obsidian"),R={inboxFile:"0. Inbox/0. Inbox.md",shareMarker:"<!-- New iOS-shared links should land BELOW this comment -->",templates:[{linkType:"link",templatePath:"5. System/Templates/Inbox/Link Template.md",hint:"Web articles, tools, tutorials, repos, blog posts \u2014 anything read-once.",defaultDestination:"0. Inbox/Links"},{linkType:"media",templatePath:"5. System/Templates/Inbox/Media Template.md",hint:"Movies, TV shows, books, games, podcasts, albums \u2014 anything to watch/read/play later.",defaultDestination:"0. Inbox/Media"},{linkType:"task",templatePath:"5. System/Templates/Inbox/Task Template.md",hint:"Action items, to-dos, things to fix or set up \u2014 anything that needs doing.",defaultDestination:"0. Inbox/Tasks"}],defaultTemplatePath:"5. System/Templates/Inbox/Link Template.md",openrouterApiKey:"",openrouterModel:"openrouter/auto-beta",openrouterReferer:"https://github.com/BigHoss/obsidian-inboxprocessor-plugin",openrouterAppName:"Link Inbox Processor",llmEnabled:!1,claudeContextPath:"0. Inbox/CLAUDE.md",allowedDestinationRoots:["0. Inbox","1. Projects","2. Areas","3. Resources","4. Archive"],fetchTimeoutSeconds:10,maxLinksPerRun:50,notifyOnError:!1,notifyUrl:"",userAgent:"Mozilla/5.0 (Link-InboxProcessor/0.2)"};async function j(a,t){let e=a.vault.getAbstractFileByPath(t);if(!(e instanceof i.TFile))return"";try{return await a.vault.cachedRead(e)}catch{return""}}function V(a,t){if(!a)return!1;let e=a.replace(/^\.?\//,"").replace(/\/+$/,"");return t.some(s=>{let n=s.replace(/\/+$/,"");return e===n||e.startsWith(n+"/")})}var K=/^\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/,W=/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[^\s)]*)?/i;function C(a){let t=a.match(K);if(t)return{title:t[1].trim(),url:t[2].trim(),raw:a};let e=a.match(W);if(e){let s=e[0];return/^https?:\/\//i.test(s)||(s="https://"+s),{title:null,url:s,raw:a}}return null}function z(a){return a.replace(/[<>:"/\\|?*\x00-\x1F]/g,"").replace(/\s+/g," ").trim().slice(0,120)}function q(){let a=new Date,t=e=>String(e).padStart(2,"0");return a.getFullYear()+t(a.getMonth()+1)+t(a.getDate())+t(a.getHours())+t(a.getMinutes())+t(a.getSeconds())}function M(a){return a.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(t,e)=>{try{return String.fromCodePoint(parseInt(e,10))}catch{return t}})}function D(a,t,e){let s=new RegExp(`<meta[^>]+${t}=["']${e}["'][^>]+content=["']([^"']+)["']`,"i"),n=a.match(s);if(n)return M(n[1]);let o=new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${t}=["']${e}["']`,"i"),p=a.match(o);return p?M(p[1]):null}function _(a){let t=D(a,"property","og:title")??D(a,"name","twitter:title")??a.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()??"",e=D(a,"property","og:description")??D(a,"name","description")??"",s=D(a,"property","og:image")??D(a,"name","twitter:image")??"",n=D(a,"property","og:site_name")??"";return{title:M(t),description:M(e),image:M(s),siteName:M(n)}}async function G(a,t,e,s){if(!t.llmEnabled||!t.openrouterApiKey)return null;let n=t.templates.map(r=>`- "${r.linkType}": ${r.hint} (default: ${r.defaultDestination})`).join(`
`),o=t.allowedDestinationRoots.join(", "),p=await j(a,t.claudeContextPath),l=`You classify URLs for an Obsidian PARA vault. The vault has these PARA folders:
0. Inbox (capture zone), 1. Projects (active outcomes), 2. Areas (ongoing responsibilities),
3. Resources (reference material), 4. Archive (completed/dormant). Within 0. Inbox there are
subfolders: Links/, Media/, Tasks/, Research/, Reference/, Decision Records/, Handoffs/, Dailies/.

Allowed destination roots: ${o}.
Never return a destination outside these roots \u2014 if uncertain, return one of the link-type defaults.

Available link-types:
${n}

`+(p?`## User's classification context (from 0. Inbox/CLAUDE.md)

${p}

`:"")+`Return ONLY a JSON object with these fields:
- refinedTitle: 3-7 words, Title Case, human-readable
- linkType: one of the link-type strings above (e.g. "link", "media", "task")
- suggestedDestination: vault-relative path under one of the allowed roots, e.g. "3. Resources/AI" or "0. Inbox/Tasks"
- suggestedTags: array of 2-5 lower-case tags

No prose, no code fences.`,g=`URL: ${e}
og:title: ${s.title}
og:description: ${s.description}
og:site_name: ${s.siteName}`;try{let r={"Content-Type":"application/json",Authorization:`Bearer ${t.openrouterApiKey}`};t.openrouterReferer&&(r["HTTP-Referer"]=t.openrouterReferer),t.openrouterAppName&&(r["X-Title"]=t.openrouterAppName);let c={url:"https://openrouter.ai/api/v1/chat/completions",method:"POST",headers:r,body:JSON.stringify({model:t.openrouterModel,messages:[{role:"system",content:l},{role:"user",content:g}],temperature:.2}),throw:!1},h=await(0,i.requestUrl)(c);if(h.status<200||h.status>=300)return null;let x=(h.json?.choices?.[0]?.message?.content??"").match(/\{[\s\S]*\}/)?.[0];if(!x)return null;let f=JSON.parse(x),d=String(f.linkType??"").trim(),u=t.templates.find(T=>T.linkType===d)??t.templates[0],y=String(f.suggestedDestination??"").trim(),E=V(y,t.allowedDestinationRoots)?y:u.defaultDestination;return{refinedTitle:String(f.refinedTitle??s.title??"Untitled").trim(),suggestedDestination:E,suggestedTags:Array.isArray(f.suggestedTags)?f.suggestedTags.map(T=>String(T).toLowerCase().trim()).filter(Boolean):[],linkType:u.linkType}}catch{return null}}function J(a,t,e,s,n,o,p){let l=n?.refinedTitle??s.title??t??"Untitled Link",g=n?.suggestedTags??[],r=new Date,c=u=>String(u).padStart(2,"0"),h=o,m=`${r.getFullYear()}-${c(r.getMonth()+1)}-${c(r.getDate())} ${c(r.getHours())}:${c(r.getMinutes())}`,x=`${r.getFullYear()}-${c(r.getMonth()+1)}-${c(r.getDate())}T${c(r.getHours())}:${c(r.getMinutes())}`,f=`${r.getFullYear()}-${c(r.getMonth()+1)}-${c(r.getDate())}`,d=a.replace(/\{\{date:YYYYMMDDHHmmss\}\}/g,h).replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g,m).replace(/\{\{date:YYYY-MM-DDTHH:mm\}\}/g,x).replace(/\{\{date:YYYY-MM-DD\}\}/g,f).replace(/\{\{title\}\}/g,l);return/^destination:\s*$/m.test(d)&&(d=d.replace(/^destination:\s*$/m,`destination: "${p}"`)),/^url:\s*$/m.test(d)&&(d=d.replace(/^url:\s*$/m,`url: ${e}`)),/^tags:\s*\[\]\s*$/m.test(d)&&(d=d.replace(/^tags:\s*\[\]\s*$/m,`tags: [${g.join(", ")}]`)),/^(\s*-\s*)?URL:\s*$/m.test(d)&&(d=d.replace(/^(\s*-\s*)?URL:\s*$/m,`$1URL: ${e}`)),d}async function Q(a,t){if(!(!a.notifyOnError||!a.notifyUrl))try{await(0,i.requestUrl)({url:a.notifyUrl,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Link Inbox Processor",body:t}),throw:!1})}catch{}}var L=class extends i.Plugin{constructor(){super(...arguments);this.settings=R;this.statusBarEl=null}async onload(){this.settings=Object.assign({},R,await this.loadData()),this.addRibbonIcon("inbox","Process inbox now",()=>this.processInbox()),this.addCommand({id:"process-inbox",name:"Process inbox links now",hotkeys:[{modifiers:["Ctrl","Shift"],key:"P"}],callback:()=>this.processInbox()}),this.addCommand({id:"process-current-line",name:"Process the link on the current line",editorCallback:(e,s)=>{let n=e.getLine(e.getCursor().line);this.processSingleLine(n)}}),this.addSettingTab(new A(this.app,this)),this.statusBarEl=this.addStatusBarItem(),this.statusBarEl.setText("Inbox: \u2026"),this.app.workspace.onLayoutReady(()=>this.refreshStatusBar()),this.registerEvent(this.app.workspace.on("file-open",()=>this.refreshStatusBar())),this.registerEvent(this.app.vault.on("modify",e=>{e.path===this.settings.inboxFile&&this.refreshStatusBar()}))}onunload(){this.statusBarEl?.remove()}async refreshStatusBar(){if(!this.statusBarEl)return;let e=await this.countPending();this.statusBarEl.setText(e>0?`Inbox: ${e} pending`:"Inbox: clean")}async countPending(){let e=this.resolveFile(this.settings.inboxFile);if(!e)return 0;let s=await this.app.vault.read(e),n=s.indexOf(this.settings.shareMarker);return n===-1?0:s.slice(n+this.settings.shareMarker.length).split(`
`).map(p=>p.trim()).filter(p=>p.length>0&&C(p)!==null).length}resolveFile(e){let s=this.app.vault.getAbstractFileByPath(e);return s instanceof i.TFile?s:null}async processInbox(){let e=this.resolveFile(this.settings.inboxFile);if(!e){new i.Notice(`Inbox file not found: ${this.settings.inboxFile}`);return}let s=await this.app.vault.read(e),n=s.indexOf(this.settings.shareMarker);if(n===-1){new i.Notice(`Share marker not found in ${this.settings.inboxFile}`);return}let o=s.slice(0,n+this.settings.shareMarker.length),l=s.slice(n+this.settings.shareMarker.length).split(`
`).map(b=>b.trim()).filter(b=>b.length>0);if(l.length===0){new i.Notice("Inbox is clean \u2014 no links to process"),this.refreshStatusBar();return}let g=new Map;for(let b of this.settings.templates){let w=this.resolveFile(b.templatePath);w&&g.set(b.linkType,await this.app.vault.read(w))}let r=this.resolveFile(this.settings.defaultTemplatePath),c=r?await this.app.vault.read(r):$,h=[],m=[],x=0,f=0,d=0,u=!1,y=Math.min(l.length,this.settings.maxLinksPerRun);for(let b=0;b<y;b++){let w=l[b],P=C(w);if(!P){m.push(w);continue}try{let v=await this.processOne(P,g,c);if(v===null)m.push(w),f++;else if(typeof v=="object"&&"abort"in v){for(let k=b;k<y;k++)m.push(l[k]);for(let k=y;k<l.length;k++)m.push(l[k]);u=!0;break}else h.push(w),x++}catch(v){let k=v instanceof Error?v.message:String(v);new i.Notice(`\u2717 ${P.url} \u2014 ${k}`),m.push(w),d++,await Q(this.settings,`Failed: ${P.url}
${k}`)}}if(!u)for(let b=y;b<l.length;b++)m.push(l[b]);let E=m.length>0?`
`+m.join(`
`)+`
`:`
`,T=o+E;await this.app.vault.modify(e,T),new i.Notice(`Inbox: ${x} processed, ${f} skipped, ${d} kept for retry${y<l.length&&!u?`, ${l.length-y} deferred`:""}${u?" (aborted)":""}`),this.refreshStatusBar()}async processSingleLine(e){let s=C(e.trim());if(!s){new i.Notice("Current line is not a recognized link");return}let n=new Map;for(let l of this.settings.templates){let g=this.resolveFile(l.templatePath);g&&n.set(l.linkType,await this.app.vault.read(g))}let o=this.resolveFile(this.settings.defaultTemplatePath),p=o?await this.app.vault.read(o):$;try{let l=await this.processOne(s,n,p);l===null?new i.Notice("Skipped duplicate"):typeof l=="object"&&"abort"in l?new i.Notice("Aborted"):new i.Notice(`\u2713 ${l}`),this.refreshStatusBar()}catch(l){let g=l instanceof Error?l.message:String(l);new i.Notice(`\u2717 ${s.url} \u2014 ${g}`)}}async processOne(e,s,n){let o=await(0,i.requestUrl)({url:e.url,method:"GET",headers:{"User-Agent":this.settings.userAgent},throw:!1});if(o.status<200||o.status>=300)throw new Error(`HTTP ${o.status}`);let p=_(o.text),l=await G(this.app,this.settings,e.url,p),g=this.settings.templates.find(T=>T.linkType===(l?.linkType??""))??this.settings.templates[0],r=s.get(g.linkType)??n,c=(l?.suggestedDestination||g.defaultDestination).trim(),h=e.title??p.title??e.url,m=z(l?.refinedTitle??h),x=q(),f=`${x} - ${m||"Untitled Link"}.md`,d=`${c}/${f}`,u=J(r,h,e.url,p,l,x,c),y=await this.resolveCollision(d,e.url);if(y.kind==="skip")return null;if(y.kind==="abort")return{abort:!0};let E=y.path;return await this.app.vault.create(E,u),E}async resolveCollision(e,s){if(!await this.app.vault.adapter.exists(e))return{kind:"write",path:e};let o=await new Promise(r=>{new S(this.app,{notePath:e,sourceUrl:s,onChoose:c=>r(c)}).open()});if(o==="skip")return new i.Notice(`Skipped duplicate: ${e}`),{kind:"skip"};if(o==="abort")return new i.Notice(`Aborted batch at duplicate: ${e}`),{kind:"abort"};if(o==="overwrite"){let r=this.app.vault.getAbstractFileByPath(e);return r instanceof i.TFile&&await this.app.vault.delete(r),{kind:"write",path:e}}let p=e.includes("/")?e.slice(0,e.lastIndexOf("/")):"",l=".md",g=e.slice(p.length+1,-l.length);for(let r=2;r<1e3;r++){let c=`${p}/${g} - ${r}${l}`;if(!await this.app.vault.adapter.exists(c))return new i.Notice(`Renamed to: ${c}`),{kind:"write",path:c}}return{kind:"write",path:e}}async generateTemplate(e){if(this.app.vault.getAbstractFileByPath(e.templatePath)instanceof i.TFile)return;let n=e.templatePath.split("/").slice(0,-1).join("/");n&&!await this.app.vault.adapter.exists(n)&&await this.app.vault.adapter.mkdir(n);let o=I[e.linkType]??I.custom;await this.app.vault.create(e.templatePath,o)}},$=`---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "\u23F3 To Process"
destination:
url:
tags: []
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## \u{1F517} Source
URL:

## \u{1F4DD} Context

*Quick note about why this is saved*

## \u{1F516} Key Points

*Fill during processing*

## \u{1F517} Related
- 

---

**Captured:** {{date:YYYY-MM-DD HH:mm}}
`,A=class extends i.PluginSettingTab{constructor(t,e){super(t,e),this.plugin=e}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Link Inbox Processor"}),t.createEl("h3",{text:"Vault paths"}),new i.Setting(t).setName("Inbox file").setDesc("Path to the dashboard note that holds the iOS-share marker.").addText(s=>s.setValue(this.plugin.settings.inboxFile).onChange(async n=>{this.plugin.settings.inboxFile=n.trim(),await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("Default template path").setDesc("Used when a link's classified type has no template registered.").addText(s=>s.setValue(this.plugin.settings.defaultTemplatePath).onChange(async n=>{this.plugin.settings.defaultTemplatePath=n.trim(),await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("Share marker").setDesc("The HTML comment that delimits the iOS-shared links block.").addText(s=>s.setValue(this.plugin.settings.shareMarker).onChange(async n=>{this.plugin.settings.shareMarker=n,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Templates (one per link-type)"}),t.createEl("p",{text:"Each link is classified into one of these types by the LLM. The matching template is rendered. Add rows for custom types (e.g. 'shopping', 'paper', 'video').",cls:"setting-item-description"}),t.querySelector("#kip-table-style")||t.createEl("style",{attr:{id:"kip-table-style"},text:`
          .kip-table { display: grid; gap: 6px; margin: 8px 0; }
          .kip-table-header, .kip-table-row {
            display: grid;
            grid-template-columns: 100px 1.4fr 1.6fr 1.2fr 1.4fr;
            gap: 8px;
            align-items: center;
          }
          .kip-table-header {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted);
            padding: 0 4px;
          }
          .kip-table-row {
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            padding: 6px 8px;
          }
          .kip-table-row input[type="text"] {
            width: 100%;
            margin: 0;
            font-size: 12px;
          }
          .kip-table-actions {
            display: flex;
            gap: 4px;
            justify-content: flex-end;
          }
          .kip-table-actions button {
            padding: 2px 8px;
            font-size: 11px;
          }
          @media (max-width: 800px) {
            .kip-table-header { display: none; }
            .kip-table-row { grid-template-columns: 1fr; }
          }
        `});let e=()=>{let s="kip-template-rows",n=t.querySelector(`#${s}`);n&&n.remove();let o=t.createDiv({attr:{id:s,class:"kip-table"}}),p=o.createDiv({cls:"kip-table-header"});p.createEl("div",{text:"linkType"}),p.createEl("div",{text:"Hint (sent to LLM)"}),p.createEl("div",{text:"Template path"}),p.createEl("div",{text:"Default destination"}),p.createEl("div",{text:"Actions",attr:{style:"text-align: right;"}}),this.plugin.settings.templates.forEach((r,c)=>{let h=o.createDiv({cls:"kip-table-row"});h.createEl("input",{attr:{type:"text",placeholder:"link"},value:r.linkType}).addEventListener("change",async d=>{let u=d.target.value;this.plugin.settings.templates[c].linkType=u.trim(),await this.plugin.saveData(this.plugin.settings)}),h.createEl("input",{attr:{type:"text",placeholder:"Web articles, tools, tutorials, repos"},value:r.hint}).addEventListener("change",async d=>{let u=d.target.value;this.plugin.settings.templates[c].hint=u,await this.plugin.saveData(this.plugin.settings)}),h.createEl("input",{attr:{type:"text",placeholder:"5. System/Templates/Inbox/My Template.md"},value:r.templatePath}).addEventListener("change",async d=>{let u=d.target.value;this.plugin.settings.templates[c].templatePath=u.trim(),await this.plugin.saveData(this.plugin.settings)}),h.createEl("input",{attr:{type:"text",placeholder:"0. Inbox/Links"},value:r.defaultDestination}).addEventListener("change",async d=>{let u=d.target.value;this.plugin.settings.templates[c].defaultDestination=u.trim(),await this.plugin.saveData(this.plugin.settings)});let m=h.createDiv({cls:"kip-table-actions"}),x=m.createEl("button",{text:"Generate"});x.title="Write a starter template to the path if no file exists there",x.addEventListener("click",async()=>{await this.plugin.generateTemplate(r),new i.Notice(`Template written to ${r.templatePath}`)});let f=m.createEl("button",{text:"\u2715"});f.title="Remove this link-type",f.addEventListener("click",async()=>{this.plugin.settings.templates.splice(c,1),await this.plugin.saveData(this.plugin.settings),e()})}),o.createDiv({attr:{style:"display: flex; justify-content: flex-end; padding-top: 4px;"}}).createEl("button",{text:"+ Add link-type"}).addEventListener("click",async()=>{this.plugin.settings.templates.push({linkType:"custom",templatePath:"5. System/Templates/Inbox/Custom Template.md",hint:"Describe what this type is for.",defaultDestination:"0. Inbox/Links"}),await this.plugin.saveData(this.plugin.settings),e()})};e(),t.createEl("h3",{text:"Classification context (CLAUDE.md)"}),new i.Setting(t).setName("Path").setDesc("Vault-relative path to the CLAUDE.md the LLM reads as system context.").addText(s=>s.setValue(this.plugin.settings.claudeContextPath).onChange(async n=>{this.plugin.settings.claudeContextPath=n.trim(),await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("Allowed destination roots").setDesc("Comma-separated. The LLM may only suggest destinations under these roots \u2014 anything else falls back to the link-type default.").addText(s=>s.setValue(this.plugin.settings.allowedDestinationRoots.join(", ")).onChange(async n=>{this.plugin.settings.allowedDestinationRoots=n.split(",").map(o=>o.trim()).filter(Boolean),await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("Seed CLAUDE.md (only if file is missing)").setDesc("Drops a starter file that lists your PARA conventions and link-type catalogue. Never overwrites an existing file.").addButton(s=>s.setButtonText("Create if missing").onClick(async()=>{let n=this.plugin.settings.claudeContextPath;if(this.plugin.app.vault.getAbstractFileByPath(n)instanceof i.TFile){new i.Notice(`Already exists: ${n}`);return}let p=n.split("/").slice(0,-1).join("/");p&&!await this.plugin.app.vault.adapter.exists(p)&&await this.plugin.app.vault.adapter.mkdir(p),await this.plugin.app.vault.create(n,X()),new i.Notice(`Created ${n}`)})),t.createEl("h3",{text:"OpenRouter LLM enrichment"}),new i.Setting(t).setName("Enable LLM enrichment").setDesc("Call OpenRouter to classify links, refine titles, suggest destinations, suggest tags.").addToggle(s=>s.setValue(this.plugin.settings.llmEnabled).onChange(async n=>{this.plugin.settings.llmEnabled=n,await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("OpenRouter API key").setDesc("Get one at https://openrouter.ai/keys").addText(s=>{s.inputEl.type="password",s.setPlaceholder("sk-or-...").setValue(this.plugin.settings.openrouterApiKey).onChange(async n=>{this.plugin.settings.openrouterApiKey=n.trim(),await this.plugin.saveData(this.plugin.settings)})}),new i.Setting(t).setName("OpenRouter model").setDesc("Default: openrouter/auto-beta (cheapest routing). Set any model from https://openrouter.ai/models").addText(s=>s.setPlaceholder("openrouter/auto-beta").setValue(this.plugin.settings.openrouterModel).onChange(async n=>{this.plugin.settings.openrouterModel=n.trim(),await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("HTTP-Referer (optional)").setDesc("Recommended by OpenRouter for free-tier rate limits.").addText(s=>s.setPlaceholder("https://github.com/BigHoss/obsidian-inboxprocessor-plugin").setValue(this.plugin.settings.openrouterReferer).onChange(async n=>{this.plugin.settings.openrouterReferer=n.trim(),await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("X-Title (optional)").setDesc("App name shown on openrouter.ai rankings.").addText(s=>s.setValue(this.plugin.settings.openrouterAppName).onChange(async n=>{this.plugin.settings.openrouterAppName=n.trim(),await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Behavior"}),new i.Setting(t).setName("Max links per run").setDesc("Cap to avoid blocking Obsidian if the inbox has hundreds of links.").addText(s=>s.setValue(String(this.plugin.settings.maxLinksPerRun)).onChange(async n=>{let o=parseInt(n,10);this.plugin.settings.maxLinksPerRun=Number.isFinite(o)?o:50,await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("Fetch timeout (seconds)").addText(s=>s.setValue(String(this.plugin.settings.fetchTimeoutSeconds)).onChange(async n=>{let o=parseInt(n,10);this.plugin.settings.fetchTimeoutSeconds=Number.isFinite(o)?o:10,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Notifications"}),new i.Setting(t).setName("Notify on error").addToggle(s=>s.setValue(this.plugin.settings.notifyOnError).onChange(async n=>{this.plugin.settings.notifyOnError=n,await this.plugin.saveData(this.plugin.settings)})),new i.Setting(t).setName("Notify URL (apprise-shaped)").setDesc("e.g. http://10.0.0.202:8000/notify/kuster.inbox").addText(s=>s.setValue(this.plugin.settings.notifyUrl).onChange(async n=>{this.plugin.settings.notifyUrl=n.trim(),await this.plugin.saveData(this.plugin.settings)}))}},S=class extends i.Modal{constructor(t,e){super(t),this.notePath=e.notePath,this.sourceUrl=e.sourceUrl,this.onChoose=e.onChoose}onOpen(){let{contentEl:t}=this;t.empty(),t.createEl("h2",{text:"Note already exists"}),t.createEl("p",{text:"A note with this filename already exists in the destination folder."}),t.createEl("p",{cls:"kip-conflict-path",text:this.notePath}).style.cssText="font-family: var(--font-monospace); font-size: 12px; padding: 6px 8px; background: var(--background-secondary); border-radius: 4px; word-break: break-all;";let e=t.createEl("p");e.createEl("span",{text:"Source: ",cls:"kip-conflict-label"}),e.createEl("span",{text:this.sourceUrl,attr:{style:"word-break: break-all;"}});let s=t.createDiv({cls:"kip-conflict-buttons"});s.style.cssText="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap;";let n=o=>()=>{this.close(),this.onChoose(o)};new i.ButtonComponent(s).setButtonText("Skip").setTooltip("Keep the existing file. This link stays in the inbox for next time.").onClick(n("skip")),new i.ButtonComponent(s).setButtonText("Rename (-2)").setTooltip("Save with an incremented suffix, e.g. '... - 2.md'.").onClick(n("rename")),new i.ButtonComponent(s).setButtonText("Overwrite").setWarning().setTooltip("Delete the existing file and write the new one in its place. Destructive \u2014 cannot be undone.").onClick(n("overwrite")),new i.ButtonComponent(s).setButtonText("Abort batch").setWarning().setTooltip("Stop processing the rest of this batch. Already-processed links are kept.").onClick(n("abort")),t.addEventListener("keydown",o=>{o.key==="Enter"?(o.preventDefault(),n("rename")()):o.key==="Escape"&&(o.preventDefault(),n("skip")())}),setTimeout(()=>{s.querySelector("button")?.focus()},0)}onClose(){let{contentEl:t}=this;t.empty()}},I={link:`---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "\u23F3 To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## \u{1F517} Source
URL: {{url}}

## \u{1F4F8} Screenshot
![[../attachments/{{date:YYYYMMDDHHmmss}}.jpg]]

## \u{1F4DD} Context

*Quick note about why this is saved*

## \u{1F516} Key Points

*Fill during processing*

## \u{1F517} Related
-

---

**Captured:** {{date:YYYY-MM-DD HH:mm}}
`,media:`---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "\u{1F4FA} To Watch"
category: tv-show
rating:
destination:
url:
tags: [media]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

User feedback for the note goes here

## \u{1F4CA} Info

**Year:**
**Director/Author:**
**Genre:**

## \u{1F4AD} Thoughts

*Add notes after watching/reading*

## \u2B50 Rating

*Rate after completion*

---

**Added:** {{date:YYYY-MM-DD}}
`,task:`---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "\u23F3 To Do"
category: task
priority: medium
destination:
url:
tags: [task]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

User feedback for the note goes here

## Steps

- [ ]

## Notes

*Context and details*

## \u{1F517} Related
-

---

**Created:** {{date:YYYY-MM-DD}}
`,custom:`---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "\u23F3 To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## \u{1F517} Source
URL: {{url}}

## \u{1F4DD} Context

*Quick note about why this is saved*

## \u{1F516} Key Points

*Fill during processing*

## \u{1F517} Related
-

---

**Captured:** {{date:YYYY-MM-DD HH:mm}}
`};function X(){return'# Inbox Processor \u2014 Classification Context\n\nThis file is read by the **Link Inbox Processor** plugin and passed to the LLM\nas system context. Anything you write here is treated as guidance for how to\nclassify iOS-shared links into PARA destinations and link-types.\n\n## Vault layout (PARA)\n\n- `0. Inbox/` \u2014 capture zone. Subfolders: `Links/`, `Media/`, `Tasks/`, `Research/`, `Reference/`, `Decision Records/`, `Handoffs/`, `Dailies/`, `Copy Templates/`.\n- `1. Projects/` \u2014 active outcomes with a finish line. One folder per project.\n- `2. Areas/` \u2014 ongoing responsibilities (no finish line). E.g. Health, Finance, Homelab.\n- `3. Resources/` \u2014 reference material grouped by topic.\n- `4. Archive/` \u2014 completed/dormant notes.\n- `5. System/` \u2014 tooling, templates, agents, personas. NEVER classify here.\n\n## Classification rules\n\n1. If the link is a **movie, show, book, game, podcast, or album** \u2192 `linkType: "media"`, destination `0. Inbox/Media/`.\n2. If the link describes **something to do** (a tutorial step, a config to apply, a bug to file, a setup to complete) \u2192 `linkType: "task"`, destination `0. Inbox/Tasks/`.\n3. Otherwise it\'s **a read-once resource** (article, repo, video, blog post, tool page) \u2192 `linkType: "link"`, destination `0. Inbox/Links/`.\n4. After it lands in the inbox, **I** will move it to a final PARA destination (`1. Projects/<Name>/`, `2. Areas/<Name>/`, or `3. Resources/<topic>/`). Don\'t pre-classify into those \u2014 keep the inbox the inbox.\n\n## Inbox checkbox convention (locked by ADR-001)\n\nEvery note that lands in the inbox uses this 2-checkbox pair immediately after the title:\n\n```markdown\n- [ ] read #inbox/pending\n- [ ] processed #inbox/processed\n```\n\n- `read` = the user has read/acknowledged this note\n- `processed` = the plugin has finished with it (moved to final destination, or \u2014 for Media/Reference/Tasks \u2014 marked as settled)\n\nDo not invent other checkbox states. The MSC / Homelab project convention uses a 3-checkbox `read / reviewed / handled` triplet but **that convention does NOT apply to the inbox** \u2014 it\'s project-scoped.\n\n## Tagging guidance\n\n- Prefer 2-5 lower-case tags.\n- Reuse existing tags where possible (e.g. `self-hosting`, `ai`, `3d-printing`, `dotnet`).\n- Don\'t invent compound tags like `ai-tool` \u2014 use `ai` + `tools`.\n- Avoid generic tags like `link`, `article`, `interesting`.\n\n## Examples\n\n| URL | linkType | destination |\n|---|---|---|\n| github.com/some/repo | `link` | `0. Inbox/Links` |\n| imdb.com/title/tt123 | `media` | `0. Inbox/Media` |\n| "how to set up nginx" | `link` | `0. Inbox/Links` |\n| "fix X bug by running Y" | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (tutorial) | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (talk/essay) | `link` | `0. Inbox/Links` |\n'}
