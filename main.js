"use strict";var M=Object.defineProperty;var $=Object.getOwnPropertyDescriptor;var E=Object.getOwnPropertyNames;var I=Object.prototype.hasOwnProperty;var N=(i,t)=>{for(var n in t)M(i,n,{get:t[n],enumerable:!0})},H=(i,t,n,s)=>{if(t&&typeof t=="object"||typeof t=="function")for(let e of E(t))!I.call(i,e)&&e!==n&&M(i,e,{get:()=>t[e],enumerable:!(s=$(t,e))||s.enumerable});return i};var F=i=>H(M({},"__esModule",{value:!0}),i);var J={};N(J,{default:()=>v});module.exports=F(J);var a=require("obsidian"),A={inboxFile:"0. Inbox/0. Inbox.md",shareMarker:"<!-- New iOS-shared links should land BELOW this comment -->",templates:[{linkType:"link",templatePath:"5. System/Templates/Inbox/Link Template.md",hint:"Web articles, tools, tutorials, repos, blog posts \u2014 anything read-once.",defaultDestination:"0. Inbox/Links"},{linkType:"media",templatePath:"5. System/Templates/Inbox/Media Template.md",hint:"Movies, TV shows, books, games, podcasts, albums \u2014 anything to watch/read/play later.",defaultDestination:"0. Inbox/Media"},{linkType:"task",templatePath:"5. System/Templates/Inbox/Task Template.md",hint:"Action items, to-dos, things to fix or set up \u2014 anything that needs doing.",defaultDestination:"0. Inbox/Tasks"}],defaultTemplatePath:"5. System/Templates/Inbox/Link Template.md",openrouterApiKey:"",openrouterModel:"openrouter/auto-beta",openrouterReferer:"https://github.com/BigHoss/obsidian-inboxprocessor-plugin",openrouterAppName:"Kuster Inbox Processor",llmEnabled:!1,claudeContextPath:"0. Inbox/CLAUDE.md",allowedDestinationRoots:["0. Inbox","1. Projects","2. Areas","3. Resources","4. Archive"],fetchTimeoutSeconds:10,maxLinksPerRun:50,notifyOnError:!1,notifyUrl:"",userAgent:"Mozilla/5.0 (Kuster-InboxProcessor/0.1)"};async function U(i,t){let n=i.vault.getAbstractFileByPath(t);if(!(n instanceof a.TFile))return"";try{return await i.vault.cachedRead(n)}catch{return""}}function B(i,t){if(!i)return!1;let n=i.replace(/^\.?\//,"").replace(/\/+$/,"");return t.some(s=>{let e=s.replace(/\/+$/,"");return n===e||n.startsWith(e+"/")})}var O=/^\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/,V=/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[^\s)]*)?/i;function Y(i){let t=i.match(O);if(t)return{title:t[1].trim(),url:t[2].trim(),raw:i};let n=i.match(V);if(n){let s=n[0];return/^https?:\/\//i.test(s)||(s="https://"+s),{title:null,url:s,raw:i}}return null}function K(i){return i.replace(/[<>:"/\\|?*\x00-\x1F]/g,"").replace(/\s+/g," ").trim().slice(0,120)}function j(){let i=new Date,t=n=>String(n).padStart(2,"0");return i.getFullYear()+t(i.getMonth()+1)+t(i.getDate())+t(i.getHours())+t(i.getMinutes())+t(i.getSeconds())}function k(i){return i.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(t,n)=>{try{return String.fromCodePoint(parseInt(n,10))}catch{return t}})}function T(i,t,n){let s=new RegExp(`<meta[^>]+${t}=["']${n}["'][^>]+content=["']([^"']+)["']`,"i"),e=i.match(s);if(e)return k(e[1]);let l=new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${t}=["']${n}["']`,"i"),p=i.match(l);return p?k(p[1]):null}function W(i){let t=T(i,"property","og:title")??T(i,"name","twitter:title")??i.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()??"",n=T(i,"property","og:description")??T(i,"name","description")??"",s=T(i,"property","og:image")??T(i,"name","twitter:image")??"",e=T(i,"property","og:site_name")??"";return{title:k(t),description:k(n),image:k(s),siteName:k(e)}}async function _(i,t,n,s){if(!t.llmEnabled||!t.openrouterApiKey)return null;let e=t.templates.map(r=>`- "${r.linkType}": ${r.hint} (default: ${r.defaultDestination})`).join(`
`),l=t.allowedDestinationRoots.join(", "),p=await U(i,t.claudeContextPath),o=`You classify URLs for an Obsidian PARA vault. The vault has these PARA folders:
0. Inbox (capture zone), 1. Projects (active outcomes), 2. Areas (ongoing responsibilities),
3. Resources (reference material), 4. Archive (completed/dormant). Within 0. Inbox there are
subfolders: Links/, Media/, Tasks/, Research/, Reference/, Decision Records/, Handoffs/, Dailies/.

Allowed destination roots: ${l}.
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

No prose, no code fences.`,g=`URL: ${n}
og:title: ${s.title}
og:description: ${s.description}
og:site_name: ${s.siteName}`;try{let r={"Content-Type":"application/json",Authorization:`Bearer ${t.openrouterApiKey}`};t.openrouterReferer&&(r["HTTP-Referer"]=t.openrouterReferer),t.openrouterAppName&&(r["X-Title"]=t.openrouterAppName);let d={url:"https://openrouter.ai/api/v1/chat/completions",method:"POST",headers:r,body:JSON.stringify({model:t.openrouterModel,messages:[{role:"system",content:o},{role:"user",content:g}],temperature:.2}),throw:!1},f=await(0,a.requestUrl)(d);if(f.status<200||f.status>=300)return null;let h=(f.json?.choices?.[0]?.message?.content??"").match(/\{[\s\S]*\}/)?.[0];if(!h)return null;let y=JSON.parse(h),u=String(y.linkType??"").trim(),w=t.templates.find(b=>b.linkType===u)??t.templates[0],x=String(y.suggestedDestination??"").trim(),m=B(x,t.allowedDestinationRoots)?x:w.defaultDestination;return{refinedTitle:String(y.refinedTitle??s.title??"Untitled").trim(),suggestedDestination:m,suggestedTags:Array.isArray(y.suggestedTags)?y.suggestedTags.map(b=>String(b).toLowerCase().trim()).filter(Boolean):[],linkType:w.linkType}}catch{return null}}function q(i,t,n,s,e,l,p){let o=e?.refinedTitle??s.title??t??"Untitled Link",g=e?.suggestedTags??[],r=new Date,d=w=>String(w).padStart(2,"0"),f=l,c=`${r.getFullYear()}-${d(r.getMonth()+1)}-${d(r.getDate())} ${d(r.getHours())}:${d(r.getMinutes())}`,h=`${r.getFullYear()}-${d(r.getMonth()+1)}-${d(r.getDate())}T${d(r.getHours())}:${d(r.getMinutes())}`,y=`${r.getFullYear()}-${d(r.getMonth()+1)}-${d(r.getDate())}`,u=i.replace(/\{\{date:YYYYMMDDHHmmss\}\}/g,f).replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g,c).replace(/\{\{date:YYYY-MM-DDTHH:mm\}\}/g,h).replace(/\{\{date:YYYY-MM-DD\}\}/g,y).replace(/\{\{title\}\}/g,o);return/^destination:\s*$/m.test(u)&&(u=u.replace(/^destination:\s*$/m,`destination: "${p}"`)),/^url:\s*$/m.test(u)&&(u=u.replace(/^url:\s*$/m,`url: ${n}`)),/^tags:\s*\[\]\s*$/m.test(u)&&(u=u.replace(/^tags:\s*\[\]\s*$/m,`tags: [${g.join(", ")}]`)),/^(\s*-\s*)?URL:\s*$/m.test(u)&&(u=u.replace(/^(\s*-\s*)?URL:\s*$/m,`$1URL: ${n}`)),u}async function z(i,t){if(!(!i.notifyOnError||!i.notifyUrl))try{await(0,a.requestUrl)({url:i.notifyUrl,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Kuster Inbox Processor",body:t}),throw:!1})}catch{}}var v=class extends a.Plugin{constructor(){super(...arguments);this.settings=A;this.statusBarEl=null}async onload(){this.settings=Object.assign({},A,await this.loadData()),this.addRibbonIcon("inbox","Process inbox now",()=>this.processInbox()),this.addCommand({id:"process-inbox",name:"Process inbox links now",hotkeys:[{modifiers:["Ctrl","Shift"],key:"P"}],callback:()=>this.processInbox()}),this.addCommand({id:"process-current-line",name:"Process the link on the current line",editorCallback:(n,s)=>{let e=n.getLine(n.getCursor().line);this.processSingleLine(e)}}),this.addSettingTab(new R(this.app,this)),this.statusBarEl=this.addStatusBarItem(),this.statusBarEl.setText("Inbox: \u2026"),this.app.workspace.onLayoutReady(()=>this.refreshStatusBar()),this.registerEvent(this.app.workspace.on("file-open",()=>this.refreshStatusBar())),this.registerEvent(this.app.vault.on("modify",n=>{n.path===this.settings.inboxFile&&this.refreshStatusBar()}))}onunload(){this.statusBarEl?.remove()}async refreshStatusBar(){if(!this.statusBarEl)return;let n=await this.countPending();this.statusBarEl.setText(n>0?`Inbox: ${n} pending`:"Inbox: clean")}async countPending(){let n=this.resolveFile(this.settings.inboxFile);if(!n)return 0;let s=await this.app.vault.read(n),e=s.indexOf(this.settings.shareMarker);return e===-1?0:s.slice(e+this.settings.shareMarker.length).split(`
`).map(p=>p.trim()).filter(p=>p.length>0&&Y(p)!==null).length}resolveFile(n){let s=this.app.vault.getAbstractFileByPath(n);return s instanceof a.TFile?s:null}async processInbox(){let n=this.resolveFile(this.settings.inboxFile);if(!n){new a.Notice(`Inbox file not found: ${this.settings.inboxFile}`);return}let s=await this.app.vault.read(n),e=s.indexOf(this.settings.shareMarker);if(e===-1){new a.Notice(`Share marker not found in ${this.settings.inboxFile}`);return}let l=s.slice(0,e+this.settings.shareMarker.length),o=s.slice(e+this.settings.shareMarker.length).split(`
`).map(m=>m.trim()).filter(m=>m.length>0);if(o.length===0){new a.Notice("Inbox is clean \u2014 no links to process"),this.refreshStatusBar();return}let g=new Map;for(let m of this.settings.templates){let b=this.resolveFile(m.templatePath);b&&g.set(m.linkType,await this.app.vault.read(b))}let r=this.resolveFile(this.settings.defaultTemplatePath),d=r?await this.app.vault.read(r):L,f=[],c=[],h=0,y=0,u=Math.min(o.length,this.settings.maxLinksPerRun);for(let m=0;m<u;m++){let b=o[m],D=Y(b);if(!D){c.push(b);continue}try{await this.processOne(D,g,d),f.push(b),h++}catch(P){let S=P instanceof Error?P.message:String(P);new a.Notice(`\u2717 ${D.url} \u2014 ${S}`),c.push(b),y++,await z(this.settings,`Failed: ${D.url}
${S}`)}}for(let m=u;m<o.length;m++)c.push(o[m]);let w=c.length>0?`
`+c.join(`
`)+`
`:`
`,x=l+w;await this.app.vault.modify(n,x),new a.Notice(`Inbox: ${h} processed, ${y} kept for retry${u<o.length?`, ${o.length-u} deferred`:""}`),this.refreshStatusBar()}async processSingleLine(n){let s=Y(n.trim());if(!s){new a.Notice("Current line is not a recognized link");return}let e=new Map;for(let o of this.settings.templates){let g=this.resolveFile(o.templatePath);g&&e.set(o.linkType,await this.app.vault.read(g))}let l=this.resolveFile(this.settings.defaultTemplatePath),p=l?await this.app.vault.read(l):L;try{let o=await this.processOne(s,e,p);new a.Notice(`\u2713 ${o}`),this.refreshStatusBar()}catch(o){let g=o instanceof Error?o.message:String(o);new a.Notice(`\u2717 ${s.url} \u2014 ${g}`)}}async processOne(n,s,e){let l=await(0,a.requestUrl)({url:n.url,method:"GET",headers:{"User-Agent":this.settings.userAgent},throw:!1});if(l.status<200||l.status>=300)throw new Error(`HTTP ${l.status}`);let p=W(l.text),o=await _(this.app,this.settings,n.url,p),g=this.settings.templates.find(x=>x.linkType===(o?.linkType??""))??this.settings.templates[0],r=s.get(g.linkType)??e,d=(o?.suggestedDestination||g.defaultDestination).trim(),f=n.title??p.title??n.url,c=K(o?.refinedTitle??f),h=j(),y=`${h} - ${c||"Untitled Link"}.md`,u=`${d}/${y}`,w=q(r,f,n.url,p,o,h,d);return await this.app.vault.create(u,w),u}async generateTemplate(n){if(this.app.vault.getAbstractFileByPath(n.templatePath)instanceof a.TFile)return;let e=n.templatePath.split("/").slice(0,-1).join("/");e&&!await this.app.vault.adapter.exists(e)&&await this.app.vault.adapter.mkdir(e);let l=C[n.linkType]??C.custom;await this.app.vault.create(n.templatePath,l)}},L=`---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "\u23F3 To Process"
destination: 
url: 
tags: []
---

# {{title}}

- [ ] {{title}} #inbox/pending

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
`,R=class extends a.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Kuster Inbox Processor"}),t.createEl("h3",{text:"Vault paths"}),new a.Setting(t).setName("Inbox file").setDesc("Path to the dashboard note that holds the iOS-share marker.").addText(s=>s.setValue(this.plugin.settings.inboxFile).onChange(async e=>{this.plugin.settings.inboxFile=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Default template path").setDesc("Used when a link's classified type has no template registered.").addText(s=>s.setValue(this.plugin.settings.defaultTemplatePath).onChange(async e=>{this.plugin.settings.defaultTemplatePath=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Share marker").setDesc("The HTML comment that delimits the iOS-shared links block.").addText(s=>s.setValue(this.plugin.settings.shareMarker).onChange(async e=>{this.plugin.settings.shareMarker=e,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Templates (one per link-type)"}),t.createEl("p",{text:"Each link is classified into one of these types by the LLM. The matching template is rendered. Add rows for custom types (e.g. 'shopping', 'paper', 'video').",cls:"setting-item-description"});let n=()=>{let s="kip-template-rows",e=t.querySelector(`#${s}`);e&&e.remove();let l=t.createDiv({attr:{id:s}});this.plugin.settings.templates.forEach((o,g)=>{let r=l.createDiv({cls:"kip-template-row"}),d=new a.Setting(r).setName(`Type #${g+1}: linkType`).addText(c=>c.setPlaceholder("link").setValue(o.linkType).onChange(async h=>{this.plugin.settings.templates[g].linkType=h.trim(),await this.plugin.saveData(this.plugin.settings)}));new a.Setting(r).setName("Hint (sent to the LLM)").addText(c=>c.setPlaceholder("Web articles, tools, tutorials, repos, blog posts").setValue(o.hint).onChange(async h=>{this.plugin.settings.templates[g].hint=h,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(r).setName("Template path").addText(c=>c.setPlaceholder("5. System/Templates/Inbox/My Template.md").setValue(o.templatePath).onChange(async h=>{this.plugin.settings.templates[g].templatePath=h.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(r).setName("Default destination").addText(c=>c.setPlaceholder("0. Inbox/Links").setValue(o.defaultDestination).onChange(async h=>{this.plugin.settings.templates[g].defaultDestination=h.trim(),await this.plugin.saveData(this.plugin.settings)}));let f=new a.Setting(r);f.addButton(c=>c.setButtonText("Generate default template").setWarning().onClick(async()=>{await this.plugin.generateTemplate(o),new a.Notice(`Template written to ${o.templatePath}`)})),f.addButton(c=>c.setButtonText("Remove").setWarning().onClick(async()=>{this.plugin.settings.templates.splice(g,1),await this.plugin.saveData(this.plugin.settings),n()}))});let p=new a.Setting(l).addButton(o=>o.setButtonText("+ Add link-type").onClick(async()=>{this.plugin.settings.templates.push({linkType:"custom",templatePath:"5. System/Templates/Inbox/Custom Template.md",hint:"Describe what this type is for.",defaultDestination:"0. Inbox/Links"}),await this.plugin.saveData(this.plugin.settings),n()}));linkTypeSetting};n(),t.createEl("h3",{text:"Classification context (CLAUDE.md)"}),new a.Setting(t).setName("Path").setDesc("Vault-relative path to the CLAUDE.md the LLM reads as system context.").addText(s=>s.setValue(this.plugin.settings.claudeContextPath).onChange(async e=>{this.plugin.settings.claudeContextPath=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Allowed destination roots").setDesc("Comma-separated. The LLM may only suggest destinations under these roots \u2014 anything else falls back to the link-type default.").addText(s=>s.setValue(this.plugin.settings.allowedDestinationRoots.join(", ")).onChange(async e=>{this.plugin.settings.allowedDestinationRoots=e.split(",").map(l=>l.trim()).filter(Boolean),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Seed CLAUDE.md (only if file is missing)").setDesc("Drops a starter file that lists your PARA conventions and link-type catalogue. Never overwrites an existing file.").addButton(s=>s.setButtonText("Create if missing").onClick(async()=>{let e=this.plugin.settings.claudeContextPath;if(this.plugin.app.vault.getAbstractFileByPath(e)instanceof a.TFile){new a.Notice(`Already exists: ${e}`);return}let p=e.split("/").slice(0,-1).join("/");p&&!await this.plugin.app.vault.adapter.exists(p)&&await this.plugin.app.vault.adapter.mkdir(p),await this.plugin.app.vault.create(e,G()),new a.Notice(`Created ${e}`)})),t.createEl("h3",{text:"OpenRouter LLM enrichment"}),new a.Setting(t).setName("Enable LLM enrichment").setDesc("Call OpenRouter to classify links, refine titles, suggest destinations, suggest tags.").addToggle(s=>s.setValue(this.plugin.settings.llmEnabled).onChange(async e=>{this.plugin.settings.llmEnabled=e,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("OpenRouter API key").setDesc("Get one at https://openrouter.ai/keys").addText(s=>{s.inputEl.type="password",s.setPlaceholder("sk-or-...").setValue(this.plugin.settings.openrouterApiKey).onChange(async e=>{this.plugin.settings.openrouterApiKey=e.trim(),await this.plugin.saveData(this.plugin.settings)})}),new a.Setting(t).setName("OpenRouter model").setDesc("Default: openrouter/auto-beta (cheapest routing). Set any model from https://openrouter.ai/models").addText(s=>s.setPlaceholder("openrouter/auto-beta").setValue(this.plugin.settings.openrouterModel).onChange(async e=>{this.plugin.settings.openrouterModel=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("HTTP-Referer (optional)").setDesc("Recommended by OpenRouter for free-tier rate limits.").addText(s=>s.setPlaceholder("https://github.com/BigHoss/obsidian-inboxprocessor-plugin").setValue(this.plugin.settings.openrouterReferer).onChange(async e=>{this.plugin.settings.openrouterReferer=e.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("X-Title (optional)").setDesc("App name shown on openrouter.ai rankings.").addText(s=>s.setValue(this.plugin.settings.openrouterAppName).onChange(async e=>{this.plugin.settings.openrouterAppName=e.trim(),await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Behavior"}),new a.Setting(t).setName("Max links per run").setDesc("Cap to avoid blocking Obsidian if the inbox has hundreds of links.").addText(s=>s.setValue(String(this.plugin.settings.maxLinksPerRun)).onChange(async e=>{let l=parseInt(e,10);this.plugin.settings.maxLinksPerRun=Number.isFinite(l)?l:50,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Fetch timeout (seconds)").addText(s=>s.setValue(String(this.plugin.settings.fetchTimeoutSeconds)).onChange(async e=>{let l=parseInt(e,10);this.plugin.settings.fetchTimeoutSeconds=Number.isFinite(l)?l:10,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Notifications"}),new a.Setting(t).setName("Notify on error").addToggle(s=>s.setValue(this.plugin.settings.notifyOnError).onChange(async e=>{this.plugin.settings.notifyOnError=e,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Notify URL (apprise-shaped)").setDesc("e.g. http://10.0.0.202:8000/notify/kuster.inbox").addText(s=>s.setValue(this.plugin.settings.notifyUrl).onChange(async e=>{this.plugin.settings.notifyUrl=e.trim(),await this.plugin.saveData(this.plugin.settings)}))}},C={link:`---
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "\u23F3 To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] reviewed #inbox/reviewed
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
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "\u{1F4FA} To Watch"
category: # tv-show | movie | book | game | podcast
rating:
destination:
url:
tags: [media]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

Users feedback for the note goes here

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
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "\u23F3 To Do"
category: task
priority: # high | medium | low
destination:
url:
tags: [task]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

Users feedback for the note goes here

## Steps

- [ ]

## Notes

*Context and details*

## \u{1F517} Related
-

---

**Created:** {{date:YYYY-MM-DD}}
`,custom:`---
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "\u23F3 To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] reviewed #inbox/reviewed
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
`};function G(){return'# Inbox Processor \u2014 Classification Context\n\nThis file is read by the **Kuster Inbox Processor** plugin and passed to the LLM\nas system context. Anything you write here is treated as guidance for how to\nclassify iOS-shared links into PARA destinations and link-types.\n\n## Vault layout (PARA)\n\n- `0. Inbox/` \u2014 capture zone. Subfolders: `Links/`, `Media/`, `Tasks/`, `Research/`, `Reference/`, `Decision Records/`, `Handoffs/`, `Dailies/`, `Copy Templates/`.\n- `1. Projects/` \u2014 active outcomes with a finish line. One folder per project.\n- `2. Areas/` \u2014 ongoing responsibilities (no finish line). E.g. Health, Finance, Homelab.\n- `3. Resources/` \u2014 reference material grouped by topic.\n- `4. Archive/` \u2014 completed/dormant notes.\n- `5. System/` \u2014 tooling, templates, agents, personas. NEVER classify here.\n\n## Classification rules\n\n1. If the link is a **movie, show, book, game, podcast, or album** \u2192 `linkType: "media"`, destination `0. Inbox/Media/`.\n2. If the link describes **something to do** (a tutorial step, a config to apply, a bug to file, a setup to complete) \u2192 `linkType: "task"`, destination `0. Inbox/Tasks/`.\n3. Otherwise it\'s **a read-once resource** (article, repo, video, blog post, tool page) \u2192 `linkType: "link"`, destination `0. Inbox/Links/`.\n4. After it lands in the inbox, **I** will move it to a final PARA destination (`1. Projects/<Name>/`, `2. Areas/<Name>/`, or `3. Resources/<topic>/`). Don\'t pre-classify into those \u2014 keep the inbox the inbox.\n\n## Tagging guidance\n\n- Prefer 2-5 lower-case tags.\n- Reuse existing tags where possible (e.g. `self-hosting`, `ai`, `3d-printing`, `dotnet`).\n- Don\'t invent compound tags like `ai-tool` \u2014 use `ai` + `tools`.\n- Avoid generic tags like `link`, `article`, `interesting`.\n\n## Examples\n\n| URL | linkType | destination |\n|---|---|---|\n| github.com/some/repo | `link` | `0. Inbox/Links` |\n| imdb.com/title/tt123 | `media` | `0. Inbox/Media` |\n| "how to set up nginx" | `link` | `0. Inbox/Links` |\n| "fix X bug by running Y" | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (tutorial) | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (talk/essay) | `link` | `0. Inbox/Links` |\n'}
