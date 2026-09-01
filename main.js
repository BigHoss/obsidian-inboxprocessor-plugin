"use strict";var V=Object.create;var P=Object.defineProperty;var K=Object.getOwnPropertyDescriptor;var W=Object.getOwnPropertyNames;var z=Object.getPrototypeOf,_=Object.prototype.hasOwnProperty;var q=(o,e)=>{for(var t in e)P(o,t,{get:e[t],enumerable:!0})},$=(o,e,t,a)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of W(e))!_.call(o,s)&&s!==t&&P(o,s,{get:()=>e[s],enumerable:!(a=K(e,s))||a.enumerable});return o};var R=(o,e,t)=>(t=o!=null?V(z(o)):{},$(e||!o||!o.__esModule?P(t,"default",{value:o,enumerable:!0}):t,o)),G=o=>$(P({},"__esModule",{value:!0}),o);var oe={};q(oe,{default:()=>C});module.exports=G(oe);var n=require("obsidian"),M=R(require("os")),S=R(require("path")),N={inboxFile:"0. Inbox/0. Inbox.md",shareMarker:"<!-- New iOS-shared links should land BELOW this comment -->",templates:[{linkType:"link",templatePath:"5. System/Templates/Inbox/Link Template.md",hint:"Web articles, tools, tutorials, repos, blog posts \u2014 anything read-once.",defaultDestination:"0. Inbox/Links"},{linkType:"media",templatePath:"5. System/Templates/Inbox/Media Template.md",hint:"Movies, TV shows, books, games, podcasts, albums \u2014 anything to watch/read/play later.",defaultDestination:"0. Inbox/Media"},{linkType:"task",templatePath:"5. System/Templates/Inbox/Task Template.md",hint:"Action items, to-dos, things to fix or set up \u2014 anything that needs doing.",defaultDestination:"0. Inbox/Tasks"}],defaultTemplatePath:"5. System/Templates/Inbox/Link Template.md",openrouterApiKey:"",openrouterModel:"openrouter/auto-beta",openrouterReferer:"https://github.com/BigHoss/obsidian-inboxprocessor-plugin",openrouterAppName:"Link Inbox Processor",llmEnabled:!1,claudeContextPath:"0. Inbox/CLAUDE.md",allowedDestinationRoots:["0. Inbox","1. Projects","2. Areas","3. Resources","4. Archive"],maxLinksPerRun:50,notifyOnError:!1,notifyUrl:"",showFetchNotices:!0};async function J(o,e){let t=o.vault.getAbstractFileByPath(e);if(!(t instanceof n.TFile))return"";try{return await o.vault.cachedRead(t)}catch{return""}}function X(o,e){if(!o)return!1;let t=o.replace(/^\.?\//,"").replace(/\/+$/,"");return e.some(a=>{let s=a.replace(/\/+$/,"");return t===s||t.startsWith(s+"/")})}var Q=/^\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/,Z=/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[^\s)]*)?/i;function A(o){let e=o.match(Q);if(e)return{title:e[1].trim(),url:e[2].trim(),raw:o};let t=o.match(Z);if(t){let a=t[0];return/^https?:\/\//i.test(a)||(a="https://"+a),{title:null,url:a,raw:o}}return null}function ee(o){return o.replace(/[<>:"/\\|?*\x00-\x1F]/g,"").replace(/\s+/g," ").trim().slice(0,120)}function te(){let o=new Date,e=t=>String(t).padStart(2,"0");return o.getFullYear()+e(o.getMonth()+1)+e(o.getDate())+e(o.getHours())+e(o.getMinutes())+e(o.getSeconds())}async function se(o,e,t){if(!e.llmEnabled||!e.openrouterApiKey)return null;let a=e.templates.map(r=>`- "${r.linkType}": ${r.hint} (default: ${r.defaultDestination})`).join(`
`),s=e.allowedDestinationRoots.join(", "),i=await J(o,e.claudeContextPath),p=`You classify URLs for an Obsidian PARA vault. The vault has these PARA folders:
0. Inbox (capture zone), 1. Projects (active outcomes), 2. Areas (ongoing responsibilities),
3. Resources (reference material), 4. Archive (completed/dormant). Within 0. Inbox there are
subfolders: Links/, Media/, Tasks/, Research/, Reference/, Decision Records/, Handoffs/, Dailies/.

Allowed destination roots: ${s}.
Never return a destination outside these roots \u2014 if uncertain, return one of the link-type defaults.

Available link-types:
${a}

`+(i?`## User's classification context (from 0. Inbox/CLAUDE.md)

${i}

`:"")+`## Page fetching
Use your web-fetch / web-search / browser tool to read the URL yourself. If your tool surface does
not include a fetch capability, fall back to whatever you can infer from the URL alone (domain +
path) and set description / siteName to empty strings.

Return ONLY a JSON object with these fields:
- refinedTitle: 3-7 words, Title Case, human-readable (use the page's H1 or <title> if you fetched it)
- linkType: one of the link-type strings above (e.g. "link", "media", "task")
- suggestedDestination: vault-relative path under one of the allowed roots, e.g. "3. Resources/AI" or "0. Inbox/Tasks"
- suggestedTags: array of 2-5 lower-case tags
- description: 1-2 sentence summary of what the page is about (empty string if you could not fetch)
- siteName: the publisher / domain (e.g. "github.com", empty string if you could not fetch)

No prose, no code fences.`,l=`URL: ${t}`;try{let r={"Content-Type":"application/json",Authorization:`Bearer ${e.openrouterApiKey}`};e.openrouterReferer&&(r["HTTP-Referer"]=e.openrouterReferer),e.openrouterAppName&&(r["X-Title"]=e.openrouterAppName);let c={url:"https://openrouter.ai/api/v1/chat/completions",method:"POST",headers:r,body:JSON.stringify({model:e.openrouterModel,messages:[{role:"system",content:p},{role:"user",content:l}],temperature:.2}),throw:!1},d=await(0,n.requestUrl)(c);if(d.status<200||d.status>=300)throw new Error(`OpenRouter HTTP ${d.status}`);let h=(d.json?.choices?.[0]?.message?.content??"").match(/\{[\s\S]*\}/)?.[0];if(!h)throw new Error("LLM returned no JSON in response");let f=JSON.parse(h),u=String(f.linkType??"").trim(),x=e.templates.find(v=>v.linkType===u)??e.templates[0],m=String(f.suggestedDestination??"").trim(),g=X(m,e.allowedDestinationRoots)?m:x.defaultDestination;return{refinedTitle:String(f.refinedTitle??f.title??"Untitled").trim(),suggestedDestination:g,suggestedTags:Array.isArray(f.suggestedTags)?f.suggestedTags.map(v=>String(v).toLowerCase().trim()).filter(Boolean):[],linkType:x.linkType,description:String(f.description??"").trim(),siteName:String(f.siteName??"").trim()}}catch(r){let c=r instanceof Error?r.message:String(r);throw new Error(`LLM enrichment failed: ${c}`)}}function ie(o,e,t,a,s,i){let p=a?.refinedTitle??e??"Untitled Link",l=a?.suggestedTags??[],r=new Date,c=x=>String(x).padStart(2,"0"),d=s,w=`${r.getFullYear()}-${c(r.getMonth()+1)}-${c(r.getDate())} ${c(r.getHours())}:${c(r.getMinutes())}`,h=`${r.getFullYear()}-${c(r.getMonth()+1)}-${c(r.getDate())}T${c(r.getHours())}:${c(r.getMinutes())}`,f=`${r.getFullYear()}-${c(r.getMonth()+1)}-${c(r.getDate())}`,u=o.replace(/\{\{date:YYYYMMDDHHmmss\}\}/g,d).replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g,w).replace(/\{\{date:YYYY-MM-DDTHH:mm\}\}/g,h).replace(/\{\{date:YYYY-MM-DD\}\}/g,f).replace(/\{\{title\}\}/g,p);return/^destination:\s*$/m.test(u)&&(u=u.replace(/^destination:\s*$/m,`destination: "${i}"`)),/^url:\s*$/m.test(u)&&(u=u.replace(/^url:\s*$/m,`url: ${t}`)),/^tags:\s*\[\]\s*$/m.test(u)&&(u=u.replace(/^tags:\s*\[\]\s*$/m,`tags: [${l.join(", ")}]`)),/^(\s*-\s*)?URL:\s*$/m.test(u)&&(u=u.replace(/^(\s*-\s*)?URL:\s*$/m,`$1URL: ${t}`)),u}async function ne(o,e){if(!(!o.notifyOnError||!o.notifyUrl))try{await(0,n.requestUrl)({url:o.notifyUrl,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Link Inbox Processor",body:e}),throw:!1})}catch{}}var C=class extends n.Plugin{constructor(){super(...arguments);this.settings=N;this.statusBarEl=null}async onload(){this.settings=Object.assign({},N,await this.loadData()),this.addRibbonIcon("inbox","Process inbox now",()=>this.processInbox()),this.addCommand({id:"process-inbox",name:"Process inbox links now",hotkeys:[{modifiers:["Ctrl","Shift"],key:"P"}],callback:()=>this.processInbox()}),this.addCommand({id:"process-current-line",name:"Process the link on the current line",editorCallback:(t,a)=>{let s=t.getLine(t.getCursor().line);this.processSingleLine(s)}}),this.addSettingTab(new I(this.app,this)),this.statusBarEl=this.addStatusBarItem(),this.statusBarEl.setText("Inbox: \u2026"),this.statusBarEl.addEventListener("contextmenu",t=>{let a=t;a.preventDefault();let s=new n.Menu;s.addItem(i=>i.setTitle("Process inbox now").setIcon("inbox").onClick(()=>this.processInbox())),s.addItem(i=>i.setTitle("Open inbox file").setIcon("file-text").onClick(async()=>{let p=this.resolveFile(this.settings.inboxFile);p?await this.app.workspace.getLeaf(!1).openFile(p):new n.Notice("Inbox file not found")})),s.addItem(i=>i.setTitle("Refresh pending count").setIcon("refresh-cw").onClick(()=>this.refreshStatusBar())),s.addSeparator(),s.addItem(i=>i.setTitle("View failure log").setIcon("file-warning").onClick(async()=>{if(await U(this.app,this.manifest.dir)===null){new n.Notice("No failures recorded yet");return}let l=await D(this.app,this.manifest.dir);await this.app.workspace.openLinkText(`${l}/process-failures.log`,"",!1)})),s.addItem(i=>i.setTitle("Clear failure log").setIcon("trash").onClick(async()=>{let p=await O(this.app,this.manifest.dir);new n.Notice(p?"Failure log cleared":"Nothing to clear")})),s.showAtMouseEvent(a)}),this.app.workspace.onLayoutReady(()=>this.refreshStatusBar()),this.registerEvent(this.app.workspace.on("file-open",()=>this.refreshStatusBar())),this.registerEvent(this.app.vault.on("modify",t=>{t.path===this.settings.inboxFile&&this.refreshStatusBar()}))}onunload(){this.statusBarEl?.remove()}async refreshStatusBar(){if(!this.statusBarEl)return;let t=await this.countPending();this.statusBarEl.setText(t>0?`Inbox: ${t} pending`:"Inbox: clean")}async countPending(){let t=this.resolveFile(this.settings.inboxFile);if(!t)return 0;let a=await this.app.vault.read(t),s=a.indexOf(this.settings.shareMarker);return s===-1?0:a.slice(s+this.settings.shareMarker.length).split(`
`).map(p=>p.trim()).filter(p=>p.length>0&&A(p)!==null).length}resolveFile(t){let a=this.app.vault.getAbstractFileByPath(t);return a instanceof n.TFile?a:null}async processInbox(){let t=this.resolveFile(this.settings.inboxFile);if(!t){new n.Notice(`Inbox file not found: ${this.settings.inboxFile}`);return}let a=await this.app.vault.read(t),s=a.indexOf(this.settings.shareMarker);if(s===-1){new n.Notice(`Share marker not found in ${this.settings.inboxFile}`);return}let i=a.slice(0,s+this.settings.shareMarker.length),l=a.slice(s+this.settings.shareMarker.length).split(`
`).map(b=>b.trim()).filter(b=>b.length>0);if(l.length===0){new n.Notice("Inbox is clean \u2014 no links to process"),this.refreshStatusBar();return}let r=new Map;for(let b of this.settings.templates){let k=this.resolveFile(b.templatePath);k&&r.set(b.linkType,await this.app.vault.read(k))}let c=this.resolveFile(this.settings.defaultTemplatePath),d=c?await this.app.vault.read(c):F,w=[],h=[],f=0,u=0,x=0,m=!1,g=Math.min(l.length,this.settings.maxLinksPerRun);for(let b=0;b<g;b++){let k=l[b],E=A(k);if(!E){h.push(k);continue}try{let L=this.settings.showFetchNotices?y=>new n.Notice(`Inbox: ${b+1}/${g} \u2014 ${y}`,3e3):void 0,T=await this.processOne(E,r,d,L);if(T===null)h.push(k),u++;else if(typeof T=="object"&&"abort"in T){for(let y=b;y<g;y++)h.push(l[y]);for(let y=g;y<l.length;y++)h.push(l[y]);m=!0;break}else w.push(k),f++}catch(L){let T=L instanceof Error?L.message:String(L);new n.Notice(`\u2717 ${E.url} \u2014 ${T}`,8e3),h.push(k),x++,await B(this.app,this.manifest,E.url,T),await ne(this.settings,`Failed: ${E.url}
${T}`)}}if(!m)for(let b=g;b<l.length;b++)h.push(l[b]);let v=h.length>0?`
`+h.join(`
`)+`
`:`
`,j=i+v;await this.app.vault.modify(t,j),new n.Notice(`Inbox: ${f} processed, ${u} skipped, ${x} kept for retry${g<l.length&&!m?`, ${l.length-g} deferred`:""}${m?" (aborted)":""}`),this.refreshStatusBar()}async processSingleLine(t){let a=A(t.trim());if(!a){new n.Notice("Current line is not a recognized link");return}let s=new Map;for(let l of this.settings.templates){let r=this.resolveFile(l.templatePath);r&&s.set(l.linkType,await this.app.vault.read(r))}let i=this.resolveFile(this.settings.defaultTemplatePath),p=i?await this.app.vault.read(i):F;try{let l=this.settings.showFetchNotices?c=>new n.Notice(c,3e3):void 0,r=await this.processOne(a,s,p,l);r===null?new n.Notice("Skipped duplicate"):typeof r=="object"&&"abort"in r?new n.Notice("Aborted"):new n.Notice(`\u2713 ${r}`),this.refreshStatusBar()}catch(l){let r=l instanceof Error?l.message:String(l);new n.Notice(`\u2717 ${a.url} \u2014 ${r}`,8e3),await B(this.app,this.manifest,a.url,r)}}async processOne(t,a,s,i){i?.(`Fetching ${t.url} via LLM\u2026`);let p=await se(this.app,this.settings,t.url),l=this.settings.templates.find(v=>v.linkType===(p?.linkType??""))??this.settings.templates[0],r=a.get(l.linkType)??s,c=(p?.suggestedDestination||l.defaultDestination).trim(),d=t.title??t.url,w=ee(p?.refinedTitle??d),h=te(),f=`${h} - ${w||"Untitled Link"}.md`,u=`${c}/${f}`,x=ie(r,d,t.url,p,h,c),m=await this.resolveCollision(u,t.url);if(m.kind==="skip")return null;if(m.kind==="abort")return{abort:!0};let g=m.path;return await this.app.vault.create(g,x),g}async resolveCollision(t,a){if(!await this.app.vault.adapter.exists(t))return{kind:"write",path:t};let i=await new Promise(c=>{new Y(this.app,{notePath:t,sourceUrl:a,onChoose:d=>c(d)}).open()});if(i==="skip")return new n.Notice(`Skipped duplicate: ${t}`),{kind:"skip"};if(i==="abort")return new n.Notice(`Aborted batch at duplicate: ${t}`),{kind:"abort"};if(i==="overwrite"){let c=this.app.vault.getAbstractFileByPath(t);return c instanceof n.TFile&&await this.app.vault.delete(c),{kind:"write",path:t}}let p=t.includes("/")?t.slice(0,t.lastIndexOf("/")):"",l=".md",r=t.slice(p.length+1,-l.length);for(let c=2;c<1e3;c++){let d=`${p}/${r} - ${c}${l}`;if(!await this.app.vault.adapter.exists(d))return new n.Notice(`Renamed to: ${d}`),{kind:"write",path:d}}return{kind:"write",path:t}}async generateTemplate(t){if(this.app.vault.getAbstractFileByPath(t.templatePath)instanceof n.TFile)return;let s=t.templatePath.split("/").slice(0,-1).join("/");s&&!await this.app.vault.adapter.exists(s)&&await this.app.vault.adapter.mkdir(s);let i=H[t.linkType]??H.custom;await this.app.vault.create(t.templatePath,i)}},F=`---
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
`,I=class extends n.PluginSettingTab{constructor(e,t){super(e,t),this.plugin=t}display(){let{containerEl:e}=this;e.empty(),e.createEl("h2",{text:"Link Inbox Processor"}),e.createEl("h3",{text:"Vault paths"}),new n.Setting(e).setName("Inbox file").setDesc("Path to the dashboard note that holds the iOS-share marker.").addText(s=>s.setValue(this.plugin.settings.inboxFile).onChange(async i=>{this.plugin.settings.inboxFile=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("Default template path").setDesc("Used when a link's classified type has no template registered.").addText(s=>s.setValue(this.plugin.settings.defaultTemplatePath).onChange(async i=>{this.plugin.settings.defaultTemplatePath=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("Share marker").setDesc("The HTML comment that delimits the iOS-shared links block.").addText(s=>s.setValue(this.plugin.settings.shareMarker).onChange(async i=>{this.plugin.settings.shareMarker=i,await this.plugin.saveData(this.plugin.settings)})),e.createEl("h3",{text:"Templates (one per link-type)"}),e.createEl("p",{text:"Each link is classified into one of these types by the LLM. The matching template is rendered. Add rows for custom types (e.g. 'shopping', 'paper', 'video').",cls:"setting-item-description"}),e.querySelector("#kip-table-style")||e.createEl("style",{attr:{id:"kip-table-style"},text:`
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
        `});let t=()=>{let s="kip-template-rows",i=e.querySelector(`#${s}`);i&&i.remove();let p=e.createDiv({attr:{id:s,class:"kip-table"}}),l=p.createDiv({cls:"kip-table-header"});l.createEl("div",{text:"linkType"}),l.createEl("div",{text:"Hint (sent to LLM)"}),l.createEl("div",{text:"Template path"}),l.createEl("div",{text:"Default destination"}),l.createEl("div",{text:"Actions",attr:{style:"text-align: right;"}}),this.plugin.settings.templates.forEach((d,w)=>{let h=p.createDiv({cls:"kip-table-row"});h.createEl("input",{attr:{type:"text",placeholder:"link"},value:d.linkType}).addEventListener("change",async m=>{let g=m.target.value;this.plugin.settings.templates[w].linkType=g.trim(),await this.plugin.saveData(this.plugin.settings)}),h.createEl("input",{attr:{type:"text",placeholder:"Web articles, tools, tutorials, repos"},value:d.hint}).addEventListener("change",async m=>{let g=m.target.value;this.plugin.settings.templates[w].hint=g,await this.plugin.saveData(this.plugin.settings)}),h.createEl("input",{attr:{type:"text",placeholder:"5. System/Templates/Inbox/My Template.md"},value:d.templatePath}).addEventListener("change",async m=>{let g=m.target.value;this.plugin.settings.templates[w].templatePath=g.trim(),await this.plugin.saveData(this.plugin.settings)}),h.createEl("input",{attr:{type:"text",placeholder:"0. Inbox/Links"},value:d.defaultDestination}).addEventListener("change",async m=>{let g=m.target.value;this.plugin.settings.templates[w].defaultDestination=g.trim(),await this.plugin.saveData(this.plugin.settings)});let f=h.createDiv({cls:"kip-table-actions"}),u=f.createEl("button",{text:"Generate"});u.title="Write a starter template to the path if no file exists there",u.addEventListener("click",async()=>{await this.plugin.generateTemplate(d),new n.Notice(`Template written to ${d.templatePath}`)});let x=f.createEl("button",{text:"\u2715"});x.title="Remove this link-type",x.addEventListener("click",async()=>{this.plugin.settings.templates.splice(w,1),await this.plugin.saveData(this.plugin.settings),t()})}),p.createDiv({attr:{style:"display: flex; justify-content: flex-end; padding-top: 4px;"}}).createEl("button",{text:"+ Add link-type"}).addEventListener("click",async()=>{this.plugin.settings.templates.push({linkType:"custom",templatePath:"5. System/Templates/Inbox/Custom Template.md",hint:"Describe what this type is for.",defaultDestination:"0. Inbox/Links"}),await this.plugin.saveData(this.plugin.settings),t()})};t(),e.createEl("h3",{text:"Classification context (CLAUDE.md)"}),new n.Setting(e).setName("Path").setDesc("Vault-relative path to the CLAUDE.md the LLM reads as system context.").addText(s=>s.setValue(this.plugin.settings.claudeContextPath).onChange(async i=>{this.plugin.settings.claudeContextPath=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("Allowed destination roots").setDesc("Comma-separated. The LLM may only suggest destinations under these roots \u2014 anything else falls back to the link-type default.").addText(s=>s.setValue(this.plugin.settings.allowedDestinationRoots.join(", ")).onChange(async i=>{this.plugin.settings.allowedDestinationRoots=i.split(",").map(p=>p.trim()).filter(Boolean),await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("Seed CLAUDE.md (only if file is missing)").setDesc("Drops a starter file that lists your PARA conventions and link-type catalogue. Never overwrites an existing file.").addButton(s=>s.setButtonText("Create if missing").onClick(async()=>{let i=this.plugin.settings.claudeContextPath;if(this.plugin.app.vault.getAbstractFileByPath(i)instanceof n.TFile){new n.Notice(`Already exists: ${i}`);return}let l=i.split("/").slice(0,-1).join("/");l&&!await this.plugin.app.vault.adapter.exists(l)&&await this.plugin.app.vault.adapter.mkdir(l),await this.plugin.app.vault.create(i,ae()),new n.Notice(`Created ${i}`)})),e.createEl("h3",{text:"OpenRouter LLM enrichment"}),new n.Setting(e).setName("Enable LLM enrichment").setDesc("Call OpenRouter to classify links, refine titles, suggest destinations, suggest tags.").addToggle(s=>s.setValue(this.plugin.settings.llmEnabled).onChange(async i=>{this.plugin.settings.llmEnabled=i,await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("OpenRouter API key").setDesc("Get one at https://openrouter.ai/keys").addText(s=>{s.inputEl.type="password",s.setPlaceholder("sk-or-...").setValue(this.plugin.settings.openrouterApiKey).onChange(async i=>{this.plugin.settings.openrouterApiKey=i.trim(),await this.plugin.saveData(this.plugin.settings)})}),new n.Setting(e).setName("OpenRouter model").setDesc("Default: openrouter/auto-beta (cheapest routing). Set any model from https://openrouter.ai/models").addText(s=>s.setPlaceholder("openrouter/auto-beta").setValue(this.plugin.settings.openrouterModel).onChange(async i=>{this.plugin.settings.openrouterModel=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("HTTP-Referer (optional)").setDesc("Recommended by OpenRouter for free-tier rate limits.").addText(s=>s.setPlaceholder("https://github.com/BigHoss/obsidian-inboxprocessor-plugin").setValue(this.plugin.settings.openrouterReferer).onChange(async i=>{this.plugin.settings.openrouterReferer=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("X-Title (optional)").setDesc("App name shown on openrouter.ai rankings.").addText(s=>s.setValue(this.plugin.settings.openrouterAppName).onChange(async i=>{this.plugin.settings.openrouterAppName=i.trim(),await this.plugin.saveData(this.plugin.settings)})),e.createEl("h3",{text:"Behavior"}),new n.Setting(e).setName("Max links per run").setDesc("Cap to avoid blocking Obsidian if the inbox has hundreds of links.").addText(s=>s.setValue(String(this.plugin.settings.maxLinksPerRun)).onChange(async i=>{let p=parseInt(i,10);this.plugin.settings.maxLinksPerRun=Number.isFinite(p)?p:50,await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("Show per-link fetch notices").setDesc("When enabled, a short Notice appears for each link as the LLM fetches it (e.g. 'Inbox: 3/22 \u2014 Fetching https://\u2026 via LLM\u2026').").addToggle(s=>s.setValue(this.plugin.settings.showFetchNotices).onChange(async i=>{this.plugin.settings.showFetchNotices=i,await this.plugin.saveData(this.plugin.settings)})),e.createEl("h3",{text:"Failure log"}),e.createEl("p",{text:"Per-link failures are appended to a log file outside the vault. Use the buttons below to view or clear it. The path is shown at the bottom.",cls:"setting-item-description"}),new n.Setting(e).setName("View failure log").setDesc("Opens the log in Obsidian if it has any entries.").addButton(s=>s.setButtonText("View").onClick(async()=>{if(await U(this.plugin.app,this.plugin.manifest.dir)===null){new n.Notice("No failures recorded yet");return}let l=`${await D(this.plugin.app,this.plugin.manifest.dir)}/process-failures.log`;await this.plugin.app.workspace.openLinkText(l,"",!1)})).addButton(s=>s.setButtonText("Clear").setWarning().onClick(async()=>{let i=await O(this.plugin.app,this.plugin.manifest.dir);new n.Notice(i?"Failure log cleared":"Nothing to clear")}));let a=new n.Setting(e).setName("Log file location").setDesc("Computed at runtime \u2014 shown for reference.");a.descEl.createEl("code",{text:"(populated when first failure occurs)"}),(async()=>{try{let s=await D(this.plugin.app,this.plugin.manifest.dir);a.descEl.empty(),a.descEl.createEl("code",{text:`${s}/process-failures.log`})}catch{}})(),e.createEl("h3",{text:"Notifications"}),new n.Setting(e).setName("Notify on error").addToggle(s=>s.setValue(this.plugin.settings.notifyOnError).onChange(async i=>{this.plugin.settings.notifyOnError=i,await this.plugin.saveData(this.plugin.settings)})),new n.Setting(e).setName("Notify URL (apprise-shaped)").setDesc("e.g. http://10.0.0.202:8000/notify/kuster.inbox").addText(s=>s.setValue(this.plugin.settings.notifyUrl).onChange(async i=>{this.plugin.settings.notifyUrl=i.trim(),await this.plugin.saveData(this.plugin.settings)}))}},Y=class extends n.Modal{constructor(e,t){super(e),this.notePath=t.notePath,this.sourceUrl=t.sourceUrl,this.onChoose=t.onChoose}onOpen(){let{contentEl:e}=this;e.empty(),e.createEl("h2",{text:"Note already exists"}),e.createEl("p",{text:"A note with this filename already exists in the destination folder."}),e.createEl("p",{cls:"kip-conflict-path",text:this.notePath}).style.cssText="font-family: var(--font-monospace); font-size: 12px; padding: 6px 8px; background: var(--background-secondary); border-radius: 4px; word-break: break-all;";let t=e.createEl("p");t.createEl("span",{text:"Source: ",cls:"kip-conflict-label"}),t.createEl("span",{text:this.sourceUrl,attr:{style:"word-break: break-all;"}});let a=e.createDiv({cls:"kip-conflict-buttons"});a.style.cssText="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap;";let s=i=>()=>{this.close(),this.onChoose(i)};new n.ButtonComponent(a).setButtonText("Skip").setTooltip("Keep the existing file. This link stays in the inbox for next time.").onClick(s("skip")),new n.ButtonComponent(a).setButtonText("Rename (-2)").setTooltip("Save with an incremented suffix, e.g. '... - 2.md'.").onClick(s("rename")),new n.ButtonComponent(a).setButtonText("Overwrite").setWarning().setTooltip("Delete the existing file and write the new one in its place. Destructive \u2014 cannot be undone.").onClick(s("overwrite")),new n.ButtonComponent(a).setButtonText("Abort batch").setWarning().setTooltip("Stop processing the rest of this batch. Already-processed links are kept.").onClick(s("abort")),e.addEventListener("keydown",i=>{i.key==="Enter"?(i.preventDefault(),s("rename")()):i.key==="Escape"&&(i.preventDefault(),s("skip")())}),setTimeout(()=>{a.querySelector("button")?.focus()},0)}onClose(){let{contentEl:e}=this;e.empty()}},H={link:`---
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
`};async function D(o,e){let t=n.Platform.isMobile===!0,a;return t?a=e:process.platform==="win32"?a=`${process.env.APPDATA??S.join(M.homedir(),"AppData","Roaming")}/Link Inbox Processor`:process.platform==="darwin"?a=`${process.env.HOME??M.homedir()}/Library/Application Support/Link Inbox Processor`:a=`${process.env.XDG_CONFIG_HOME??S.join(M.homedir(),".config")}/Link Inbox Processor`,await o.vault.adapter.mkdir(a).catch(()=>{}),a}async function B(o,e,t,a){try{let i=`${await D(o,e.dir)}/process-failures.log`,l=`${new Date().toISOString()} | ${t} | ${a.replace(/\n/g," ").trim()}
`,r=await o.vault.adapter.exists(i)?await o.vault.adapter.read(i):"";await o.vault.adapter.write(i,r+l)}catch{}}async function O(o,e){let a=`${await D(o,e)}/process-failures.log`;return await o.vault.adapter.exists(a)?(await o.vault.adapter.remove(a),!0):!1}async function U(o,e){let a=`${await D(o,e)}/process-failures.log`;return await o.vault.adapter.exists(a)?await o.vault.adapter.read(a):null}function ae(){return'# Inbox Processor \u2014 Classification Context\n\nThis file is read by the **Link Inbox Processor** plugin and passed to the LLM\nas system context. Anything you write here is treated as guidance for how to\nclassify iOS-shared links into PARA destinations and link-types.\n\n## Vault layout (PARA)\n\n- `0. Inbox/` \u2014 capture zone. Subfolders: `Links/`, `Media/`, `Tasks/`, `Research/`, `Reference/`, `Decision Records/`, `Handoffs/`, `Dailies/`, `Copy Templates/`.\n- `1. Projects/` \u2014 active outcomes with a finish line. One folder per project.\n- `2. Areas/` \u2014 ongoing responsibilities (no finish line). E.g. Health, Finance, Homelab.\n- `3. Resources/` \u2014 reference material grouped by topic.\n- `4. Archive/` \u2014 completed/dormant notes.\n- `5. System/` \u2014 tooling, templates, agents, personas. NEVER classify here.\n\n## Classification rules\n\n1. If the link is a **movie, show, book, game, podcast, or album** \u2192 `linkType: "media"`, destination `0. Inbox/Media/`.\n2. If the link describes **something to do** (a tutorial step, a config to apply, a bug to file, a setup to complete) \u2192 `linkType: "task"`, destination `0. Inbox/Tasks/`.\n3. Otherwise it\'s **a read-once resource** (article, repo, video, blog post, tool page) \u2192 `linkType: "link"`, destination `0. Inbox/Links/`.\n4. After it lands in the inbox, **I** will move it to a final PARA destination (`1. Projects/<Name>/`, `2. Areas/<Name>/`, or `3. Resources/<topic>/`). Don\'t pre-classify into those \u2014 keep the inbox the inbox.\n\n## Inbox checkbox convention (locked by ADR-001)\n\nEvery note that lands in the inbox uses this 2-checkbox pair immediately after the title:\n\n```markdown\n- [ ] read #inbox/pending\n- [ ] processed #inbox/processed\n```\n\n- `read` = the user has read/acknowledged this note\n- `processed` = the plugin has finished with it (moved to final destination, or \u2014 for Media/Reference/Tasks \u2014 marked as settled)\n\nDo not invent other checkbox states. The MSC / Homelab project convention uses a 3-checkbox `read / reviewed / handled` triplet but **that convention does NOT apply to the inbox** \u2014 it\'s project-scoped.\n\n## Tagging guidance\n\n- Prefer 2-5 lower-case tags.\n- Reuse existing tags where possible (e.g. `self-hosting`, `ai`, `3d-printing`, `dotnet`).\n- Don\'t invent compound tags like `ai-tool` \u2014 use `ai` + `tools`.\n- Avoid generic tags like `link`, `article`, `interesting`.\n\n## Examples\n\n| URL | linkType | destination |\n|---|---|---|\n| github.com/some/repo | `link` | `0. Inbox/Links` |\n| imdb.com/title/tt123 | `media` | `0. Inbox/Media` |\n| "how to set up nginx" | `link` | `0. Inbox/Links` |\n| "fix X bug by running Y" | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (tutorial) | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (talk/essay) | `link` | `0. Inbox/Links` |\n'}
