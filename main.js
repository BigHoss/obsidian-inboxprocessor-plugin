"use strict";var P=Object.defineProperty;var I=Object.getOwnPropertyDescriptor;var $=Object.getOwnPropertyNames;var C=Object.prototype.hasOwnProperty;var H=(i,t)=>{for(var n in t)P(i,n,{get:t[n],enumerable:!0})},N=(i,t,n,s)=>{if(t&&typeof t=="object"||typeof t=="function")for(let e of $(t))!C.call(i,e)&&e!==n&&P(i,e,{get:()=>t[e],enumerable:!(s=I(t,e))||s.enumerable});return i};var F=i=>N(P({},"__esModule",{value:!0}),i);var J={};H(J,{default:()=>D});module.exports=F(J);var a=require("obsidian"),R={inboxFile:"0. Inbox/0. Inbox.md",shareMarker:"<!-- New iOS-shared links should land BELOW this comment -->",templates:[{linkType:"link",templatePath:"5. System/Templates/Inbox/Link Template.md",hint:"Web articles, tools, tutorials, repos, blog posts \u2014 anything read-once.",defaultDestination:"0. Inbox/Links"},{linkType:"media",templatePath:"5. System/Templates/Inbox/Media Template.md",hint:"Movies, TV shows, books, games, podcasts, albums \u2014 anything to watch/read/play later.",defaultDestination:"0. Inbox/Media"},{linkType:"task",templatePath:"5. System/Templates/Inbox/Task Template.md",hint:"Action items, to-dos, things to fix or set up \u2014 anything that needs doing.",defaultDestination:"0. Inbox/Tasks"}],defaultTemplatePath:"5. System/Templates/Inbox/Link Template.md",openrouterApiKey:"",openrouterModel:"openrouter/auto-beta",openrouterReferer:"https://github.com/BigHoss/obsidian-inboxprocessor-plugin",openrouterAppName:"Link Inbox Processor",llmEnabled:!1,claudeContextPath:"0. Inbox/CLAUDE.md",allowedDestinationRoots:["0. Inbox","1. Projects","2. Areas","3. Resources","4. Archive"],fetchTimeoutSeconds:10,maxLinksPerRun:50,notifyOnError:!1,notifyUrl:"",userAgent:"Mozilla/5.0 (Link-InboxProcessor/0.2)"};async function U(i,t){let n=i.vault.getAbstractFileByPath(t);if(!(n instanceof a.TFile))return"";try{return await i.vault.cachedRead(n)}catch{return""}}function B(i,t){if(!i)return!1;let n=i.replace(/^\.?\//,"").replace(/\/+$/,"");return t.some(s=>{let e=s.replace(/\/+$/,"");return n===e||n.startsWith(e+"/")})}var O=/^\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/,j=/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[^\s)]*)?/i;function E(i){let t=i.match(O);if(t)return{title:t[1].trim(),url:t[2].trim(),raw:i};let n=i.match(j);if(n){let s=n[0];return/^https?:\/\//i.test(s)||(s="https://"+s),{title:null,url:s,raw:i}}return null}function V(i){return i.replace(/[<>:"/\\|?*\x00-\x1F]/g,"").replace(/\s+/g," ").trim().slice(0,120)}function K(){let i=new Date,t=n=>String(n).padStart(2,"0");return i.getFullYear()+t(i.getMonth()+1)+t(i.getDate())+t(i.getHours())+t(i.getMinutes())+t(i.getSeconds())}function T(i){return i.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(t,n)=>{try{return String.fromCodePoint(parseInt(n,10))}catch{return t}})}function k(i,t,n){let s=new RegExp(`<meta[^>]+${t}=["']${n}["'][^>]+content=["']([^"']+)["']`,"i"),e=i.match(s);if(e)return T(e[1]);let r=new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${t}=["']${n}["']`,"i"),p=i.match(r);return p?T(p[1]):null}function z(i){let t=k(i,"property","og:title")??k(i,"name","twitter:title")??i.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()??"",n=k(i,"property","og:description")??k(i,"name","description")??"",s=k(i,"property","og:image")??k(i,"name","twitter:image")??"",e=k(i,"property","og:site_name")??"";return{title:T(t),description:T(n),image:T(s),siteName:T(e)}}async function _(i,t,n,s){if(!t.llmEnabled||!t.openrouterApiKey)return null;let e=t.templates.map(o=>`- "${o.linkType}": ${o.hint} (default: ${o.defaultDestination})`).join(`
`),r=t.allowedDestinationRoots.join(", "),p=await U(i,t.claudeContextPath),c=`You classify URLs for an Obsidian PARA vault. The vault has these PARA folders:
0. Inbox (capture zone), 1. Projects (active outcomes), 2. Areas (ongoing responsibilities),
3. Resources (reference material), 4. Archive (completed/dormant). Within 0. Inbox there are
subfolders: Links/, Media/, Tasks/, Research/, Reference/, Decision Records/, Handoffs/, Dailies/.

Allowed destination roots: ${r}.
Never return a destination outside these roots \u2014 if uncertain, return one of the link-type defaults.

Available link-types:
${e}

`+(p?`## User's classification context (from 0. Inbox/CLAUDE.md)

${p}

`:"")+`Return ONLY a JSON object with these fields:
- refinedTitle: 3-7 words, Title Case, human-readable
- linkType: one of the link-type strings above (e.g. "link", "media", "task")
- suggestedDestination: vault-relative path under one of the allowed roots, e.g. "3. Resources/AI" or "0. Inbox/Tasks"
- suggestedTags: array of 2-5 lower-case tags

No prose, no code fences.`,m=`URL: ${n}
og:title: ${s.title}
og:description: ${s.description}
og:site_name: ${s.siteName}`;try{let o={"Content-Type":"application/json",Authorization:`Bearer ${t.openrouterApiKey}`};t.openrouterReferer&&(o["HTTP-Referer"]=t.openrouterReferer),t.openrouterAppName&&(o["X-Title"]=t.openrouterAppName);let d={url:"https://openrouter.ai/api/v1/chat/completions",method:"POST",headers:o,body:JSON.stringify({model:t.openrouterModel,messages:[{role:"system",content:c},{role:"user",content:m}],temperature:.2}),throw:!1},u=await(0,a.requestUrl)(d);if(u.status<200||u.status>=300)return null;let b=(u.json?.choices?.[0]?.message?.content??"").match(/\{[\s\S]*\}/)?.[0];if(!b)return null;let f=JSON.parse(b),l=String(f.linkType??"").trim(),g=t.templates.find(x=>x.linkType===l)??t.templates[0],w=String(f.suggestedDestination??"").trim(),h=B(w,t.allowedDestinationRoots)?w:g.defaultDestination;return{refinedTitle:String(f.refinedTitle??s.title??"Untitled").trim(),suggestedDestination:h,suggestedTags:Array.isArray(f.suggestedTags)?f.suggestedTags.map(x=>String(x).toLowerCase().trim()).filter(Boolean):[],linkType:g.linkType}}catch{return null}}function q(i,t,n,s,e,r,p){let c=e?.refinedTitle??s.title??t??"Untitled Link",m=e?.suggestedTags??[],o=new Date,d=g=>String(g).padStart(2,"0"),u=r,y=`${o.getFullYear()}-${d(o.getMonth()+1)}-${d(o.getDate())} ${d(o.getHours())}:${d(o.getMinutes())}`,b=`${o.getFullYear()}-${d(o.getMonth()+1)}-${d(o.getDate())}T${d(o.getHours())}:${d(o.getMinutes())}`,f=`${o.getFullYear()}-${d(o.getMonth()+1)}-${d(o.getDate())}`,l=i.replace(/\{\{date:YYYYMMDDHHmmss\}\}/g,u).replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g,y).replace(/\{\{date:YYYY-MM-DDTHH:mm\}\}/g,b).replace(/\{\{date:YYYY-MM-DD\}\}/g,f).replace(/\{\{title\}\}/g,c);return/^destination:\s*$/m.test(l)&&(l=l.replace(/^destination:\s*$/m,`destination: "${p}"`)),/^url:\s*$/m.test(l)&&(l=l.replace(/^url:\s*$/m,`url: ${n}`)),/^tags:\s*\[\]\s*$/m.test(l)&&(l=l.replace(/^tags:\s*\[\]\s*$/m,`tags: [${m.join(", ")}]`)),/^(\s*-\s*)?URL:\s*$/m.test(l)&&(l=l.replace(/^(\s*-\s*)?URL:\s*$/m,`$1URL: ${n}`)),l}async function W(i,t){if(!(!i.notifyOnError||!i.notifyUrl))try{await(0,a.requestUrl)({url:i.notifyUrl,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Link Inbox Processor",body:t}),throw:!1})}catch{}}var D=class extends a.Plugin{constructor(){super(...arguments);this.settings=R;this.statusBarEl=null}async onload(){this.settings=Object.assign({},R,await this.loadData()),this.addRibbonIcon("inbox","Process inbox now",()=>this.processInbox()),this.addCommand({id:"process-inbox",name:"Process inbox links now",hotkeys:[{modifiers:["Ctrl","Shift"],key:"P"}],callback:()=>this.processInbox()}),this.addCommand({id:"process-current-line",name:"Process the link on the current line",editorCallback:(n,s)=>{let e=n.getLine(n.getCursor().line);this.processSingleLine(e)}}),this.addSettingTab(new L(this.app,this)),this.statusBarEl=this.addStatusBarItem(),this.statusBarEl.setText("Inbox: \u2026"),this.app.workspace.onLayoutReady(()=>this.refreshStatusBar()),this.registerEvent(this.app.workspace.on("file-open",()=>this.refreshStatusBar())),this.registerEvent(this.app.vault.on("modify",n=>{n.path===this.settings.inboxFile&&this.refreshStatusBar()}))}onunload(){this.statusBarEl?.remove()}async refreshStatusBar(){if(!this.statusBarEl)return;let n=await this.countPending();this.statusBarEl.setText(n>0?`Inbox: ${n} pending`:"Inbox: clean")}async countPending(){let n=this.resolveFile(this.settings.inboxFile);if(!n)return 0;let s=await this.app.vault.read(n),e=s.indexOf(this.settings.shareMarker);return e===-1?0:s.slice(e+this.settings.shareMarker.length).split(`
`).map(p=>p.trim()).filter(p=>p.length>0&&E(p)!==null).length}resolveFile(n){let s=this.app.vault.getAbstractFileByPath(n);return s instanceof a.TFile?s:null}async processInbox(){let n=this.resolveFile(this.settings.inboxFile);if(!n){new a.Notice(`Inbox file not found: ${this.settings.inboxFile}`);return}let s=await this.app.vault.read(n),e=s.indexOf(this.settings.shareMarker);if(e===-1){new a.Notice(`Share marker not found in ${this.settings.inboxFile}`);return}let r=s.slice(0,e+this.settings.shareMarker.length),c=s.slice(e+this.settings.shareMarker.length).split(`
`).map(h=>h.trim()).filter(h=>h.length>0);if(c.length===0){new a.Notice("Inbox is clean \u2014 no links to process"),this.refreshStatusBar();return}let m=new Map;for(let h of this.settings.templates){let x=this.resolveFile(h.templatePath);x&&m.set(h.linkType,await this.app.vault.read(x))}let o=this.resolveFile(this.settings.defaultTemplatePath),d=o?await this.app.vault.read(o):A,u=[],y=[],b=0,f=0,l=Math.min(c.length,this.settings.maxLinksPerRun);for(let h=0;h<l;h++){let x=c[h],v=E(x);if(!v){y.push(x);continue}try{await this.processOne(v,m,d),u.push(x),b++}catch(M){let Y=M instanceof Error?M.message:String(M);new a.Notice(`\u2717 ${v.url} \u2014 ${Y}`),y.push(x),f++,await W(this.settings,`Failed: ${v.url}
${Y}`)}}for(let h=l;h<c.length;h++)y.push(c[h]);let g=y.length>0?`
`+y.join(`
`)+`
`:`
`,w=r+g;await this.app.vault.modify(n,w),new a.Notice(`Inbox: ${b} processed, ${f} kept for retry${l<c.length?`, ${c.length-l} deferred`:""}`),this.refreshStatusBar()}async processSingleLine(n){let s=E(n.trim());if(!s){new a.Notice("Current line is not a recognized link");return}let e=new Map;for(let c of this.settings.templates){let m=this.resolveFile(c.templatePath);m&&e.set(c.linkType,await this.app.vault.read(m))}let r=this.resolveFile(this.settings.defaultTemplatePath),p=r?await this.app.vault.read(r):A;try{let c=await this.processOne(s,e,p);new a.Notice(`\u2713 ${c}`),this.refreshStatusBar()}catch(c){let m=c instanceof Error?c.message:String(c);new a.Notice(`\u2717 ${s.url} \u2014 ${m}`)}}async processOne(n,s,e){let r=await(0,a.requestUrl)({url:n.url,method:"GET",headers:{"User-Agent":this.settings.userAgent},throw:!1});if(r.status<200||r.status>=300)throw new Error(`HTTP ${r.status}`);let p=z(r.text),c=await _(this.app,this.settings,n.url,p),m=this.settings.templates.find(w=>w.linkType===(c?.linkType??""))??this.settings.templates[0],o=s.get(m.linkType)??e,d=(c?.suggestedDestination||m.defaultDestination).trim(),u=n.title??p.title??n.url,y=V(c?.refinedTitle??u),b=K(),f=`${b} - ${y||"Untitled Link"}.md`,l=`${d}/${f}`,g=q(o,u,n.url,p,c,b,d);return await this.app.vault.create(l,g),l}async generateTemplate(n){if(this.app.vault.getAbstractFileByPath(n.templatePath)instanceof a.TFile)return;let e=n.templatePath.split("/").slice(0,-1).join("/");e&&!await this.app.vault.adapter.exists(e)&&await this.app.vault.adapter.mkdir(e);let r=S[n.linkType]??S.custom;await this.app.vault.create(n.templatePath,r)}},A=`---
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
`,L=class extends a.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Link Inbox Processor"}),t.createEl("h3",{text:"Vault paths"}),new a.Setting(t).setName("Inbox file").setDesc("Path to the dashboard note that holds the iOS-share marker.").addText(s=>s.setValue(this.plugin.settings.inboxFile).onChange(async e=>{this.plugin.settings.inboxFile=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Default template path").setDesc("Used when a link's classified type has no template registered.").addText(s=>s.setValue(this.plugin.settings.defaultTemplatePath).onChange(async e=>{this.plugin.settings.defaultTemplatePath=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Share marker").setDesc("The HTML comment that delimits the iOS-shared links block.").addText(s=>s.setValue(this.plugin.settings.shareMarker).onChange(async e=>{this.plugin.settings.shareMarker=e,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Templates (one per link-type)"}),t.createEl("p",{text:"Each link is classified into one of these types by the LLM. The matching template is rendered. Add rows for custom types (e.g. 'shopping', 'paper', 'video').",cls:"setting-item-description"}),t.querySelector("#kip-table-style")||t.createEl("style",{attr:{id:"kip-table-style"},text:`
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
        `});let n=()=>{let s="kip-template-rows",e=t.querySelector(`#${s}`);e&&e.remove();let r=t.createDiv({attr:{id:s,class:"kip-table"}}),p=r.createDiv({cls:"kip-table-header"});p.createEl("div",{text:"linkType"}),p.createEl("div",{text:"Hint (sent to LLM)"}),p.createEl("div",{text:"Template path"}),p.createEl("div",{text:"Default destination"}),p.createEl("div",{text:"Actions",attr:{style:"text-align: right;"}}),this.plugin.settings.templates.forEach((o,d)=>{let u=r.createDiv({cls:"kip-table-row"});u.createEl("input",{attr:{type:"text",placeholder:"link"},value:o.linkType}).addEventListener("change",async l=>{let g=l.target.value;this.plugin.settings.templates[d].linkType=g.trim(),await this.plugin.saveData(this.plugin.settings)}),u.createEl("input",{attr:{type:"text",placeholder:"Web articles, tools, tutorials, repos"},value:o.hint}).addEventListener("change",async l=>{let g=l.target.value;this.plugin.settings.templates[d].hint=g,await this.plugin.saveData(this.plugin.settings)}),u.createEl("input",{attr:{type:"text",placeholder:"5. System/Templates/Inbox/My Template.md"},value:o.templatePath}).addEventListener("change",async l=>{let g=l.target.value;this.plugin.settings.templates[d].templatePath=g.trim(),await this.plugin.saveData(this.plugin.settings)}),u.createEl("input",{attr:{type:"text",placeholder:"0. Inbox/Links"},value:o.defaultDestination}).addEventListener("change",async l=>{let g=l.target.value;this.plugin.settings.templates[d].defaultDestination=g.trim(),await this.plugin.saveData(this.plugin.settings)});let y=u.createDiv({cls:"kip-table-actions"}),b=y.createEl("button",{text:"Generate"});b.title="Write a starter template to the path if no file exists there",b.addEventListener("click",async()=>{await this.plugin.generateTemplate(o),new a.Notice(`Template written to ${o.templatePath}`)});let f=y.createEl("button",{text:"\u2715"});f.title="Remove this link-type",f.addEventListener("click",async()=>{this.plugin.settings.templates.splice(d,1),await this.plugin.saveData(this.plugin.settings),n()})}),r.createDiv({attr:{style:"display: flex; justify-content: flex-end; padding-top: 4px;"}}).createEl("button",{text:"+ Add link-type"}).addEventListener("click",async()=>{this.plugin.settings.templates.push({linkType:"custom",templatePath:"5. System/Templates/Inbox/Custom Template.md",hint:"Describe what this type is for.",defaultDestination:"0. Inbox/Links"}),await this.plugin.saveData(this.plugin.settings),n()})};n(),t.createEl("h3",{text:"Classification context (CLAUDE.md)"}),new a.Setting(t).setName("Path").setDesc("Vault-relative path to the CLAUDE.md the LLM reads as system context.").addText(s=>s.setValue(this.plugin.settings.claudeContextPath).onChange(async e=>{this.plugin.settings.claudeContextPath=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Allowed destination roots").setDesc("Comma-separated. The LLM may only suggest destinations under these roots \u2014 anything else falls back to the link-type default.").addText(s=>s.setValue(this.plugin.settings.allowedDestinationRoots.join(", ")).onChange(async e=>{this.plugin.settings.allowedDestinationRoots=e.split(",").map(r=>r.trim()).filter(Boolean),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Seed CLAUDE.md (only if file is missing)").setDesc("Drops a starter file that lists your PARA conventions and link-type catalogue. Never overwrites an existing file.").addButton(s=>s.setButtonText("Create if missing").onClick(async()=>{let e=this.plugin.settings.claudeContextPath;if(this.plugin.app.vault.getAbstractFileByPath(e)instanceof a.TFile){new a.Notice(`Already exists: ${e}`);return}let p=e.split("/").slice(0,-1).join("/");p&&!await this.plugin.app.vault.adapter.exists(p)&&await this.plugin.app.vault.adapter.mkdir(p),await this.plugin.app.vault.create(e,G()),new a.Notice(`Created ${e}`)})),t.createEl("h3",{text:"OpenRouter LLM enrichment"}),new a.Setting(t).setName("Enable LLM enrichment").setDesc("Call OpenRouter to classify links, refine titles, suggest destinations, suggest tags.").addToggle(s=>s.setValue(this.plugin.settings.llmEnabled).onChange(async e=>{this.plugin.settings.llmEnabled=e,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("OpenRouter API key").setDesc("Get one at https://openrouter.ai/keys").addText(s=>{s.inputEl.type="password",s.setPlaceholder("sk-or-...").setValue(this.plugin.settings.openrouterApiKey).onChange(async e=>{this.plugin.settings.openrouterApiKey=e.trim(),await this.plugin.saveData(this.plugin.settings)})}),new a.Setting(t).setName("OpenRouter model").setDesc("Default: openrouter/auto-beta (cheapest routing). Set any model from https://openrouter.ai/models").addText(s=>s.setPlaceholder("openrouter/auto-beta").setValue(this.plugin.settings.openrouterModel).onChange(async e=>{this.plugin.settings.openrouterModel=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("HTTP-Referer (optional)").setDesc("Recommended by OpenRouter for free-tier rate limits.").addText(s=>s.setPlaceholder("https://github.com/BigHoss/obsidian-inboxprocessor-plugin").setValue(this.plugin.settings.openrouterReferer).onChange(async e=>{this.plugin.settings.openrouterReferer=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("X-Title (optional)").setDesc("App name shown on openrouter.ai rankings.").addText(s=>s.setValue(this.plugin.settings.openrouterAppName).onChange(async e=>{this.plugin.settings.openrouterAppName=e.trim(),await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Behavior"}),new a.Setting(t).setName("Max links per run").setDesc("Cap to avoid blocking Obsidian if the inbox has hundreds of links.").addText(s=>s.setValue(String(this.plugin.settings.maxLinksPerRun)).onChange(async e=>{let r=parseInt(e,10);this.plugin.settings.maxLinksPerRun=Number.isFinite(r)?r:50,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Fetch timeout (seconds)").addText(s=>s.setValue(String(this.plugin.settings.fetchTimeoutSeconds)).onChange(async e=>{let r=parseInt(e,10);this.plugin.settings.fetchTimeoutSeconds=Number.isFinite(r)?r:10,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Notifications"}),new a.Setting(t).setName("Notify on error").addToggle(s=>s.setValue(this.plugin.settings.notifyOnError).onChange(async e=>{this.plugin.settings.notifyOnError=e,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Notify URL (apprise-shaped)").setDesc("e.g. http://10.0.0.202:8000/notify/kuster.inbox").addText(s=>s.setValue(this.plugin.settings.notifyUrl).onChange(async e=>{this.plugin.settings.notifyUrl=e.trim(),await this.plugin.saveData(this.plugin.settings)}))}},S={link:`---
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
`};function G(){return'# Inbox Processor \u2014 Classification Context\n\nThis file is read by the **Link Inbox Processor** plugin and passed to the LLM\nas system context. Anything you write here is treated as guidance for how to\nclassify iOS-shared links into PARA destinations and link-types.\n\n## Vault layout (PARA)\n\n- `0. Inbox/` \u2014 capture zone. Subfolders: `Links/`, `Media/`, `Tasks/`, `Research/`, `Reference/`, `Decision Records/`, `Handoffs/`, `Dailies/`, `Copy Templates/`.\n- `1. Projects/` \u2014 active outcomes with a finish line. One folder per project.\n- `2. Areas/` \u2014 ongoing responsibilities (no finish line). E.g. Health, Finance, Homelab.\n- `3. Resources/` \u2014 reference material grouped by topic.\n- `4. Archive/` \u2014 completed/dormant notes.\n- `5. System/` \u2014 tooling, templates, agents, personas. NEVER classify here.\n\n## Classification rules\n\n1. If the link is a **movie, show, book, game, podcast, or album** \u2192 `linkType: "media"`, destination `0. Inbox/Media/`.\n2. If the link describes **something to do** (a tutorial step, a config to apply, a bug to file, a setup to complete) \u2192 `linkType: "task"`, destination `0. Inbox/Tasks/`.\n3. Otherwise it\'s **a read-once resource** (article, repo, video, blog post, tool page) \u2192 `linkType: "link"`, destination `0. Inbox/Links/`.\n4. After it lands in the inbox, **I** will move it to a final PARA destination (`1. Projects/<Name>/`, `2. Areas/<Name>/`, or `3. Resources/<topic>/`). Don\'t pre-classify into those \u2014 keep the inbox the inbox.\n\n## Inbox checkbox convention (locked by ADR-001)\n\nEvery note that lands in the inbox uses this 2-checkbox pair immediately after the title:\n\n```markdown\n- [ ] read #inbox/pending\n- [ ] processed #inbox/processed\n```\n\n- `read` = the user has read/acknowledged this note\n- `processed` = the plugin has finished with it (moved to final destination, or \u2014 for Media/Reference/Tasks \u2014 marked as settled)\n\nDo not invent other checkbox states. The MSC / Homelab project convention uses a 3-checkbox `read / reviewed / handled` triplet but **that convention does NOT apply to the inbox** \u2014 it\'s project-scoped.\n\n## Tagging guidance\n\n- Prefer 2-5 lower-case tags.\n- Reuse existing tags where possible (e.g. `self-hosting`, `ai`, `3d-printing`, `dotnet`).\n- Don\'t invent compound tags like `ai-tool` \u2014 use `ai` + `tools`.\n- Avoid generic tags like `link`, `article`, `interesting`.\n\n## Examples\n\n| URL | linkType | destination |\n|---|---|---|\n| github.com/some/repo | `link` | `0. Inbox/Links` |\n| imdb.com/title/tt123 | `media` | `0. Inbox/Media` |\n| "how to set up nginx" | `link` | `0. Inbox/Links` |\n| "fix X bug by running Y" | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (tutorial) | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (talk/essay) | `link` | `0. Inbox/Links` |\n'}
