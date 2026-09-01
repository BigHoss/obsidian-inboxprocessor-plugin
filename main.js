"use strict";var z=Object.create;var R=Object.defineProperty;var Z=Object.getOwnPropertyDescriptor;var G=Object.getOwnPropertyNames;var J=Object.getPrototypeOf,X=Object.prototype.hasOwnProperty;var Q=(o,t)=>{for(var e in t)R(o,e,{get:t[e],enumerable:!0})},O=(o,t,e,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of G(t))!X.call(o,s)&&s!==e&&R(o,s,{get:()=>t[s],enumerable:!(n=Z(t,s))||n.enumerable});return o};var B=(o,t,e)=>(e=o!=null?z(J(o)):{},O(t||!o||!o.__esModule?R(e,"default",{value:o,enumerable:!0}):e,o)),tt=o=>O(R({},"__esModule",{value:!0}),o);var gt={};Q(gt,{default:()=>L});module.exports=tt(gt);var a=require("obsidian"),C=B(require("os")),H=B(require("path")),U={inboxFile:"0. Inbox/0. Inbox.md",shareMarker:"<!-- New iOS-shared links should land BELOW this comment -->",templates:[{linkType:"link",templatePath:"5. System/Templates/Inbox/Link Template.md",hint:"Web articles, tools, tutorials, repos, blog posts \u2014 anything read-once.",defaultDestination:"0. Inbox/Links"},{linkType:"media",templatePath:"5. System/Templates/Inbox/Media Template.md",hint:"Movies, TV shows, books, games, podcasts, albums \u2014 anything to watch/read/play later.",defaultDestination:"0. Inbox/Media"},{linkType:"task",templatePath:"5. System/Templates/Inbox/Task Template.md",hint:"Action items, to-dos, things to fix or set up \u2014 anything that needs doing.",defaultDestination:"0. Inbox/Tasks"}],defaultTemplatePath:"5. System/Templates/Inbox/Link Template.md",openrouterApiKey:"",openrouterModel:"openrouter/auto-beta",openrouterReferer:"https://github.com/BigHoss/obsidian-inboxprocessor-plugin",openrouterAppName:"Link Inbox Processor",llmEnabled:!1,claudeContextPath:"0. Inbox/CLAUDE.md",allowedDestinationRoots:["0. Inbox","1. Projects","2. Areas","3. Resources","4. Archive"],maxLinksPerRun:50,notifyOnError:!1,notifyUrl:"",showFetchNotices:!0,cronEnabled:!1,cronIntervalMinutes:15,cronRunOnStartup:!1,archiveRoot:"4. Archive",projectsRoot:"1. Projects",templateScriptPath:"5. System/Templates/Project Folder Template/scripts/init-project.py"};async function et(o,t){let e=o.vault.getAbstractFileByPath(t);if(!(e instanceof a.TFile))return"";try{return await o.vault.cachedRead(e)}catch{return""}}function st(o,t){if(!o)return!1;let e=o.replace(/^\.?\//,"").replace(/\/+$/,"");return t.some(n=>{let s=n.replace(/\/+$/,"");return e===s||e.startsWith(s+"/")})}var nt=/^\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/,it=/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[^\s)]*)?/i;function M(o){let t=o.match(nt);if(t)return{title:t[1].trim(),url:t[2].trim(),raw:o};let e=o.match(it);if(e){let n=e[0];return/^https?:\/\//i.test(n)||(n="https://"+n),{title:null,url:n,raw:o}}return null}function at(o){return o.replace(/[<>:"/\\|?*\x00-\x1F]/g,"").replace(/\s+/g," ").trim().slice(0,120)}function V(o){if(!o)return"";let t=String(o).trim(),e="";for(;e!==t;){e=t;let n=t.match(/^\s*([\[\{\(])\s*(.+?)\s*([\]\}\)])\s*$/);(n&&n[1]==="["&&n[3]==="]"||n&&n[1]==="("&&n[3]===")"||n&&n[1]==="{"&&n[3]==="}")&&(t=n[2])}if(t=t.replace(/\?[^\s]*/g,""),t=t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu,""),t=t.replace(/\s*[\|—–\-]\s*(github|reddit|printables|thingiverse|youtube|twitter|x|imdb|hacker\s*news|medium|stackoverflow|stack\s*overflow|producthunt|ycombinator)\.?(com)?\s*$/i,""),t=t.replace(/\s+/g," ").trim(),t.length>100){let n=t.slice(0,100),s=n.lastIndexOf(" ");t=s>40?n.slice(0,s):n,t=t.trim()}return t}function ot(){let o=new Date,t=e=>String(e).padStart(2,"0");return o.getFullYear()+t(o.getMonth()+1)+t(o.getDate())+t(o.getHours())+t(o.getMinutes())+t(o.getSeconds())}async function rt(o,t,e){if(!t.llmEnabled||!t.openrouterApiKey)return null;let n=t.templates.map(c=>`- "${c.linkType}": ${c.hint} (default: ${c.defaultDestination})`).join(`
`),s=t.allowedDestinationRoots.join(", "),i=await et(o,t.claudeContextPath),l=`You classify URLs for an Obsidian PARA vault. The vault has these PARA folders:
0. Inbox (capture zone), 1. Projects (active outcomes), 2. Areas (ongoing responsibilities),
3. Resources (reference material), 4. Archive (completed/dormant). Within 0. Inbox there are
subfolders: Links/, Media/, Tasks/, Research/, Reference/, Decision Records/, Handoffs/, Dailies/.

Allowed destination roots: ${s}.
Never return a destination outside these roots \u2014 if uncertain, return one of the link-type defaults.

Available link-types:
${n}

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

No prose, no code fences.`,r=`URL: ${e}`;try{let c={"Content-Type":"application/json",Authorization:`Bearer ${t.openrouterApiKey}`};t.openrouterReferer&&(c["HTTP-Referer"]=t.openrouterReferer),t.openrouterAppName&&(c["X-Title"]=t.openrouterAppName);let p={url:"https://openrouter.ai/api/v1/chat/completions",method:"POST",headers:c,body:JSON.stringify({model:t.openrouterModel,messages:[{role:"system",content:l},{role:"user",content:r}],temperature:.2}),throw:!1},d=await(0,a.requestUrl)(p);if(d.status<200||d.status>=300)throw new Error(`OpenRouter HTTP ${d.status}`);let y=(d.json?.choices?.[0]?.message?.content??"").match(/\{[\s\S]*\}/)?.[0];if(!y)throw new Error("LLM returned no JSON in response");let m=JSON.parse(y),h=String(m.linkType??"").trim(),f=t.templates.find(x=>x.linkType===h)??t.templates[0],u=String(m.suggestedDestination??"").trim(),g=st(u,t.allowedDestinationRoots)?u:f.defaultDestination;return{refinedTitle:String(m.refinedTitle??m.title??"Untitled").trim(),suggestedDestination:g,suggestedTags:Array.isArray(m.suggestedTags)?m.suggestedTags.map(x=>String(x).toLowerCase().trim()).filter(Boolean):[],linkType:f.linkType,description:String(m.description??"").trim(),siteName:String(m.siteName??"").trim()}}catch(c){let p=c instanceof Error?c.message:String(c);throw new Error(`LLM enrichment failed: ${p}`)}}function lt(o,t,e,n,s,i){let l=n?.refinedTitle??t??"Untitled Link",r=n?.suggestedTags??[],c=new Date,p=f=>String(f).padStart(2,"0"),d=s,b=`${c.getFullYear()}-${p(c.getMonth()+1)}-${p(c.getDate())} ${p(c.getHours())}:${p(c.getMinutes())}`,y=`${c.getFullYear()}-${p(c.getMonth()+1)}-${p(c.getDate())}T${p(c.getHours())}:${p(c.getMinutes())}`,m=`${c.getFullYear()}-${p(c.getMonth()+1)}-${p(c.getDate())}`,h=o.replace(/\{\{date:YYYYMMDDHHmmss\}\}/g,d).replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g,b).replace(/\{\{date:YYYY-MM-DDTHH:mm\}\}/g,y).replace(/\{\{date:YYYY-MM-DD\}\}/g,m).replace(/\{\{title\}\}/g,l);return/^destination:\s*$/m.test(h)&&(h=h.replace(/^destination:\s*$/m,`destination: "${i}"`)),/^url:\s*$/m.test(h)&&(h=h.replace(/^url:\s*$/m,`url: ${e}`)),/^tags:\s*\[\]\s*$/m.test(h)&&(h=h.replace(/^tags:\s*\[\]\s*$/m,`tags: [${r.join(", ")}]`)),/^(\s*-\s*)?URL:\s*$/m.test(h)&&(h=h.replace(/^(\s*-\s*)?URL:\s*$/m,`$1URL: ${e}`)),h}async function ct(o,t){if(!(!o.notifyOnError||!o.notifyUrl))try{await(0,a.requestUrl)({url:o.notifyUrl,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Link Inbox Processor",body:t}),throw:!1})}catch{}}var L=class extends a.Plugin{constructor(){super(...arguments);this.settings=U;this.statusBarEl=null;this.cronIntervalId=null;this.lastRunAt=null}async onload(){this.settings=Object.assign({},U,await this.loadData()),this.addRibbonIcon("inbox","Process inbox now",()=>this.processInbox()),this.addCommand({id:"process-inbox",name:"Process inbox links now",hotkeys:[{modifiers:["Ctrl","Shift"],key:"P"}],callback:()=>this.processInbox()}),this.addCommand({id:"process-current-line",name:"Process the link on the current line",editorCallback:(e,n)=>{let s=e.getLine(e.getCursor().line);this.processSingleLine(s)}}),this.addCommand({id:"create-project-from-selection",name:"Create project from selection",editorCallback:async(e,n)=>{let s=e.getSelection();await this.createProjectFromSelection(s)}}),this.addCommand({id:"move-to-archive",name:"Move to archive (with archivedAt timestamp)",checkCallback:e=>{let n=this.app.workspace.getActiveFile(),s=n instanceof a.TFile&&!n.path.startsWith(this.settings.archiveRoot+"/");if(e)return s;s&&this.moveToArchive(n)}}),this.registerEvent(this.app.workspace.on("file-menu",(e,n)=>{n instanceof a.TFile&&(n.path.startsWith(this.settings.archiveRoot+"/")||e.addItem(s=>s.setTitle("Move to archive (with archivedAt timestamp)").setIcon("archive").onClick(async()=>{await this.moveToArchive(n)})))})),this.addSettingTab(new Y(this.app,this)),this.statusBarEl=this.addStatusBarItem(),this.statusBarEl.setText("Inbox: \u2026"),this.statusBarEl.addEventListener("contextmenu",e=>{let n=e;n.preventDefault();let s=new a.Menu;s.addItem(i=>i.setTitle("Process inbox now").setIcon("inbox").onClick(()=>this.processInbox())),s.addItem(i=>i.setTitle("Open inbox file").setIcon("file-text").onClick(async()=>{let l=this.resolveFile(this.settings.inboxFile);l?await this.app.workspace.getLeaf(!1).openFile(l):new a.Notice("Inbox file not found")})),s.addItem(i=>i.setTitle("Refresh pending count").setIcon("refresh-cw").onClick(()=>this.refreshStatusBar())),s.addSeparator(),s.addItem(i=>i.setTitle("View failure log").setIcon("file-warning").onClick(async()=>{if(await _(this.app,this.manifest.dir)===null){new a.Notice("No failures recorded yet");return}let r=await E(this.app,this.manifest.dir);await this.app.workspace.openLinkText(`${r}/process-failures.log`,"",!1)})),s.addItem(i=>i.setTitle("Clear failure log").setIcon("trash").onClick(async()=>{let l=await q(this.app,this.manifest.dir);new a.Notice(l?"Failure log cleared":"Nothing to clear")})),s.showAtMouseEvent(n)}),this.app.workspace.onLayoutReady(()=>this.refreshStatusBar()),this.registerEvent(this.app.workspace.on("file-open",()=>this.refreshStatusBar())),this.registerEvent(this.app.vault.on("modify",e=>{e.path===this.settings.inboxFile&&this.refreshStatusBar()})),this.settings.cronEnabled&&(this.applyCron(),this.settings.cronRunOnStartup&&this.processInbox({silent:!0}))}applyCron(){if(this.cronIntervalId!==null&&(window.clearInterval(this.cronIntervalId),this.cronIntervalId=null),!this.settings.cronEnabled)return;let e=Math.max(1,this.settings.cronIntervalMinutes)*60*1e3;this.cronIntervalId=window.setInterval(()=>{this.processInbox({silent:!0})},e)}onunload(){this.statusBarEl?.remove()}async refreshStatusBar(){if(!this.statusBarEl)return;let e=await this.countPending(),n=e>0?`${e} pending`:"clean",s=this.lastRunAt!==null?` (last: ${ut(new Date(this.lastRunAt))})`:"";this.statusBarEl.setText(`Inbox: ${n}${s}`)}async countPending(){let e=this.resolveFile(this.settings.inboxFile);if(!e)return 0;let n=await this.app.vault.read(e),s=n.indexOf(this.settings.shareMarker);return s===-1?0:n.slice(s+this.settings.shareMarker.length).split(`
`).map(l=>l.trim()).filter(l=>l.length>0&&M(l)!==null).length}resolveFile(e){let n=this.app.vault.getAbstractFileByPath(e);return n instanceof a.TFile?n:null}async processInbox(e){let n=e?.silent===!0,s=this.resolveFile(this.settings.inboxFile);if(!s){new a.Notice(`Inbox file not found: ${this.settings.inboxFile}`);return}let i=await this.app.vault.read(s),l=i.indexOf(this.settings.shareMarker);if(l===-1){new a.Notice(`Share marker not found in ${this.settings.inboxFile}`);return}let r=i.slice(0,l+this.settings.shareMarker.length),p=i.slice(l+this.settings.shareMarker.length).split(`
`).map(w=>w.trim()).filter(w=>w.length>0);if(p.length===0){new a.Notice("Inbox is clean \u2014 no links to process"),this.refreshStatusBar();return}let d=new Map;for(let w of this.settings.templates){let v=this.resolveFile(w.templatePath);v&&d.set(w.linkType,await this.app.vault.read(v))}let b=this.resolveFile(this.settings.defaultTemplatePath),y=b?await this.app.vault.read(b):W,m=[],h=[],f=0,u=0,g=0,x=!1,T=Math.min(p.length,this.settings.maxLinksPerRun);for(let w=0;w<T;w++){let v=p[w],A=M(v);if(!A){h.push(v);continue}try{let S=this.settings.showFetchNotices&&!n?k=>new a.Notice(`Inbox: ${w+1}/${T} \u2014 ${k}`,3e3):void 0,P=await this.processOne(A,d,y,S);if(P===null)h.push(v),u++;else if(typeof P=="object"&&"abort"in P){for(let k=w;k<T;k++)h.push(p[k]);for(let k=T;k<p.length;k++)h.push(p[k]);x=!0;break}else m.push(v),f++}catch(S){let P=S instanceof Error?S.message:String(S);n||new a.Notice(`\u2717 ${A.url} \u2014 ${P}`,8e3),h.push(v),g++,await $(this.app,this.manifest,A.url,P),await ct(this.settings,`Failed: ${A.url}
${P}`)}}if(!x)for(let w=T;w<p.length;w++)h.push(p[w]);let D=h.length>0?`
`+h.join(`
`)+`
`:`
`,I=r+D;await this.app.vault.modify(s,I),this.lastRunAt=Date.now(),n||new a.Notice(`Inbox: ${f} processed, ${u} skipped, ${g} kept for retry${T<p.length&&!x?`, ${p.length-T} deferred`:""}${x?" (aborted)":""}`),this.refreshStatusBar()}async processSingleLine(e){let n=M(e.trim());if(!n){new a.Notice("Current line is not a recognized link");return}let s=new Map;for(let r of this.settings.templates){let c=this.resolveFile(r.templatePath);c&&s.set(r.linkType,await this.app.vault.read(c))}let i=this.resolveFile(this.settings.defaultTemplatePath),l=i?await this.app.vault.read(i):W;try{let r=this.settings.showFetchNotices?p=>new a.Notice(p,3e3):void 0,c=await this.processOne(n,s,l,r);c===null?new a.Notice("Skipped duplicate"):typeof c=="object"&&"abort"in c?new a.Notice("Aborted"):new a.Notice(`\u2713 ${c}`),this.refreshStatusBar()}catch(r){let c=r instanceof Error?r.message:String(r);new a.Notice(`\u2717 ${n.url} \u2014 ${c}`,8e3),await $(this.app,this.manifest,n.url,c)}}async processOne(e,n,s,i){i?.(`Fetching ${e.url} via LLM\u2026`);let l=await rt(this.app,this.settings,e.url),r=this.settings.templates.find(x=>x.linkType===(l?.linkType??""))??this.settings.templates[0],c=n.get(r.linkType)??s,p=(l?.suggestedDestination||r.defaultDestination).trim(),d=e.title??e.url,b=at(V(l?.refinedTitle)||V(d)||""),y=ot(),m=`${y} - ${b||"Untitled Link"}.md`,h=`${p}/${m}`,f=lt(c,d,e.url,l,y,p),u=await this.resolveCollision(h,e.url);if(u.kind==="skip")return null;if(u.kind==="abort")return{abort:!0};let g=u.path;return await this.app.vault.create(g,f),g}async resolveCollision(e,n){if(!await this.app.vault.adapter.exists(e))return{kind:"write",path:e};let i=await new Promise(p=>{new F(this.app,{notePath:e,sourceUrl:n,onChoose:d=>p(d)}).open()});if(i==="skip")return new a.Notice(`Skipped duplicate: ${e}`),{kind:"skip"};if(i==="abort")return new a.Notice(`Aborted batch at duplicate: ${e}`),{kind:"abort"};if(i==="overwrite"){let p=this.app.vault.getAbstractFileByPath(e);return p instanceof a.TFile&&await this.app.vault.delete(p),{kind:"write",path:e}}let l=e.includes("/")?e.slice(0,e.lastIndexOf("/")):"",r=".md",c=e.slice(l.length+1,-r.length);for(let p=2;p<1e3;p++){let d=`${l}/${c} - ${p}${r}`;if(!await this.app.vault.adapter.exists(d))return new a.Notice(`Renamed to: ${d}`),{kind:"write",path:d}}return{kind:"write",path:e}}async listProjectTypes(){let e=this.app.vault.adapter,n=this.settings.projectsRoot.replace(/\/+$/,"");if(!await e.exists(n))return[];let s=await e.list(n);return(await Promise.all(s.map(async r=>{let c=r.isDirectory===!0||await e.exists(r.path);return{p:r,isDir:c}}))).filter(({isDir:r})=>r).map(({p:r})=>r).filter(r=>/^\d+\./.test(r.name)).sort((r,c)=>{let p=parseInt(r.name,10),d=parseInt(c.name,10);return p-d}).map(r=>({label:r.name,value:r.name,absPath:r.path}))}async createProjectFromSelection(e){let n=await this.listProjectTypes();if(n.length===0){new a.Notice(`No numbered subfolders under "${this.settings.projectsRoot}/". Add at least one (e.g. "1. Coding") and retry.`,1e4);return}let s=await new Promise(u=>{new N(this.app,{types:n,projectsRoot:this.settings.projectsRoot,templateScriptPath:this.settings.templateScriptPath,initialPlan:e,onDone:g=>u(g)}).open()});if(!s)return;let i=`${this.settings.projectsRoot}/${s.typeValue}/${s.name}`;new a.Notice(`Scaffolding ${i}\u2026`,5e3);let l=await dt();if(!l){new a.Notice("Could not find Python (tried: python, python3, py -3). Install Python or update PATH, then retry.",1e4),await $(this.app,this.manifest,"create-project-from-selection","Python not found on PATH");return}let r=this.app.vault.adapter.basePath.replace(/[/\\]+$/,""),c=r.includes("\\")?"\\":"/",d=[this.settings.templateScriptPath.startsWith(r)?this.settings.templateScriptPath:`${r}${c}${this.settings.templateScriptPath.replace(/\//g,c)}`,"--name",s.name,"--key",s.key,"--dst",i],b="",y="",m=-1;try{let u=await new Promise((g,x)=>{let D=require("child_process").spawn(l.bin,[...l.args,...d],{cwd:this.app.vault.adapter.basePath,env:{...process.env,OBSIDIAN_VAULT_PATH:this.app.vault.adapter.basePath},shell:l.shell}),I="",w="";D.stdout.on("data",v=>{I+=v.toString()}),D.stderr.on("data",v=>{w+=v.toString()}),D.on("error",v=>x(v)),D.on("close",v=>g({code:v??-1,stdout:I,stderr:w}))});m=u.code,b=u.stdout,y=u.stderr}catch(u){let g=u instanceof Error?u.message:String(u);new a.Notice(`Spawn failed: ${g}`,1e4),await $(this.app,this.manifest,"create-project-from-selection",`spawn failed: ${g}`);return}if(m!==0){let u=(y||b).slice(-800);new a.Notice(`init-project.py exited ${m}: ${u}`,12e3),await $(this.app,this.manifest,"create-project-from-selection",`exit ${m}: ${u}`);return}let h=`${i}/${s.name}.md`,f=this.app.vault.getAbstractFileByPath(h);f instanceof a.TFile?(await this.app.workspace.getLeaf(!1).openFile(f),new a.Notice(`Created ${i}`)):new a.Notice(`Scaffold succeeded but couldn't find ${h} \u2014 check the folder manually.`)}async moveToArchive(e){if(e.path.startsWith(this.settings.archiveRoot+"/")){new a.Notice(`Already in ${this.settings.archiveRoot}: ${e.path}`);return}let n=`${this.settings.archiveRoot}/${e.path}`;if(this.app.vault.getAbstractFileByPath(n)){new a.Notice(`Archive destination already exists: ${n}`);return}let i=await this.app.vault.read(e),l=this.injectArchivedAt(i);l!==i&&await this.app.vault.modify(e,l);let r=n.includes("/")?n.slice(0,n.lastIndexOf("/")):"";r&&!await this.app.vault.adapter.exists(r)&&await this.app.vault.adapter.mkdir(r);try{await this.app.fileManager.renameFile(e,n),new a.Notice(`Archived \u2192 ${n}`)}catch(c){let p=c instanceof Error?c.message:String(c);new a.Notice(`Archive failed: ${p}`,8e3)}}injectArchivedAt(e){let s=`archivedAt: ${new Date().toISOString().replace(/\.\d+Z$/,"Z")}`,i=e.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!i)return`---
${s}
---

${e}`;let l=i[1],r=e.slice(i[0].length);return/^archivedAt\s*:/m.test(l)?`---
${l.replace(/^archivedAt\s*:.*$/m,s)}
---${r}`:`---
${l.endsWith(`
`)?l.slice(0,-1):l}
${s}
---${r}`}async generateTemplate(e){if(this.app.vault.getAbstractFileByPath(e.templatePath)instanceof a.TFile)return;let s=e.templatePath.split("/").slice(0,-1).join("/");s&&!await this.app.vault.adapter.exists(s)&&await this.app.vault.adapter.mkdir(s);let i=K[e.linkType]??K.custom;await this.app.vault.create(e.templatePath,i)}},W=`---
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
`,Y=class extends a.PluginSettingTab{constructor(t,e){super(t,e),this.plugin=e}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Link Inbox Processor"}),t.createEl("h3",{text:"Vault paths"}),new a.Setting(t).setName("Inbox file").setDesc("Path to the dashboard note that holds the iOS-share marker.").addText(s=>s.setValue(this.plugin.settings.inboxFile).onChange(async i=>{this.plugin.settings.inboxFile=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Default template path").setDesc("Used when a link's classified type has no template registered.").addText(s=>s.setValue(this.plugin.settings.defaultTemplatePath).onChange(async i=>{this.plugin.settings.defaultTemplatePath=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Share marker").setDesc("The HTML comment that delimits the iOS-shared links block.").addText(s=>s.setValue(this.plugin.settings.shareMarker).onChange(async i=>{this.plugin.settings.shareMarker=i,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Templates (one per link-type)"}),t.createEl("p",{text:"Each link is classified into one of these types by the LLM. The matching template is rendered. Add rows for custom types (e.g. 'shopping', 'paper', 'video').",cls:"setting-item-description"}),t.querySelector("#kip-table-style")||t.createEl("style",{attr:{id:"kip-table-style"},text:`
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
        `});let e=()=>{let s="kip-template-rows",i=t.querySelector(`#${s}`);i&&i.remove();let l=t.createDiv({attr:{id:s,class:"kip-table"}}),r=l.createDiv({cls:"kip-table-header"});r.createEl("div",{text:"linkType"}),r.createEl("div",{text:"Hint (sent to LLM)"}),r.createEl("div",{text:"Template path"}),r.createEl("div",{text:"Default destination"}),r.createEl("div",{text:"Actions",attr:{style:"text-align: right;"}}),this.plugin.settings.templates.forEach((d,b)=>{let y=l.createDiv({cls:"kip-table-row"});y.createEl("input",{attr:{type:"text",placeholder:"link"},value:d.linkType}).addEventListener("change",async u=>{let g=u.target.value;this.plugin.settings.templates[b].linkType=g.trim(),await this.plugin.saveData(this.plugin.settings)}),y.createEl("input",{attr:{type:"text",placeholder:"Web articles, tools, tutorials, repos"},value:d.hint}).addEventListener("change",async u=>{let g=u.target.value;this.plugin.settings.templates[b].hint=g,await this.plugin.saveData(this.plugin.settings)}),y.createEl("input",{attr:{type:"text",placeholder:"5. System/Templates/Inbox/My Template.md"},value:d.templatePath}).addEventListener("change",async u=>{let g=u.target.value;this.plugin.settings.templates[b].templatePath=g.trim(),await this.plugin.saveData(this.plugin.settings)}),y.createEl("input",{attr:{type:"text",placeholder:"0. Inbox/Links"},value:d.defaultDestination}).addEventListener("change",async u=>{let g=u.target.value;this.plugin.settings.templates[b].defaultDestination=g.trim(),await this.plugin.saveData(this.plugin.settings)});let m=y.createDiv({cls:"kip-table-actions"}),h=m.createEl("button",{text:"Generate"});h.title="Write a starter template to the path if no file exists there",h.addEventListener("click",async()=>{await this.plugin.generateTemplate(d),new a.Notice(`Template written to ${d.templatePath}`)});let f=m.createEl("button",{text:"\u2715"});f.title="Remove this link-type",f.addEventListener("click",async()=>{this.plugin.settings.templates.splice(b,1),await this.plugin.saveData(this.plugin.settings),e()})}),l.createDiv({attr:{style:"display: flex; justify-content: flex-end; padding-top: 4px;"}}).createEl("button",{text:"+ Add link-type"}).addEventListener("click",async()=>{this.plugin.settings.templates.push({linkType:"custom",templatePath:"5. System/Templates/Inbox/Custom Template.md",hint:"Describe what this type is for.",defaultDestination:"0. Inbox/Links"}),await this.plugin.saveData(this.plugin.settings),e()})};e(),t.createEl("h3",{text:"Classification context (CLAUDE.md)"}),new a.Setting(t).setName("Path").setDesc("Vault-relative path to the CLAUDE.md the LLM reads as system context.").addText(s=>s.setValue(this.plugin.settings.claudeContextPath).onChange(async i=>{this.plugin.settings.claudeContextPath=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Allowed destination roots").setDesc("Comma-separated. The LLM may only suggest destinations under these roots \u2014 anything else falls back to the link-type default.").addText(s=>s.setValue(this.plugin.settings.allowedDestinationRoots.join(", ")).onChange(async i=>{this.plugin.settings.allowedDestinationRoots=i.split(",").map(l=>l.trim()).filter(Boolean),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Seed CLAUDE.md (only if file is missing)").setDesc("Drops a starter file that lists your PARA conventions and link-type catalogue. Never overwrites an existing file.").addButton(s=>s.setButtonText("Create if missing").onClick(async()=>{let i=this.plugin.settings.claudeContextPath;if(this.plugin.app.vault.getAbstractFileByPath(i)instanceof a.TFile){new a.Notice(`Already exists: ${i}`);return}let r=i.split("/").slice(0,-1).join("/");r&&!await this.plugin.app.vault.adapter.exists(r)&&await this.plugin.app.vault.adapter.mkdir(r),await this.plugin.app.vault.create(i,ht()),new a.Notice(`Created ${i}`)})),t.createEl("h3",{text:"OpenRouter LLM enrichment"}),new a.Setting(t).setName("Enable LLM enrichment").setDesc("Call OpenRouter to classify links, refine titles, suggest destinations, suggest tags.").addToggle(s=>s.setValue(this.plugin.settings.llmEnabled).onChange(async i=>{this.plugin.settings.llmEnabled=i,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("OpenRouter API key").setDesc("Get one at https://openrouter.ai/keys").addText(s=>{s.inputEl.type="password",s.setPlaceholder("sk-or-...").setValue(this.plugin.settings.openrouterApiKey).onChange(async i=>{this.plugin.settings.openrouterApiKey=i.trim(),await this.plugin.saveData(this.plugin.settings)})}),new a.Setting(t).setName("OpenRouter model").setDesc("Default: openrouter/auto-beta (cheapest routing). Set any model from https://openrouter.ai/models").addText(s=>s.setPlaceholder("openrouter/auto-beta").setValue(this.plugin.settings.openrouterModel).onChange(async i=>{this.plugin.settings.openrouterModel=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("HTTP-Referer (optional)").setDesc("Recommended by OpenRouter for free-tier rate limits.").addText(s=>s.setPlaceholder("https://github.com/BigHoss/obsidian-inboxprocessor-plugin").setValue(this.plugin.settings.openrouterReferer).onChange(async i=>{this.plugin.settings.openrouterReferer=i.trim(),await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("X-Title (optional)").setDesc("App name shown on openrouter.ai rankings.").addText(s=>s.setValue(this.plugin.settings.openrouterAppName).onChange(async i=>{this.plugin.settings.openrouterAppName=i.trim(),await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Behavior"}),new a.Setting(t).setName("Max links per run").setDesc("Cap to avoid blocking Obsidian if the inbox has hundreds of links.").addText(s=>s.setValue(String(this.plugin.settings.maxLinksPerRun)).onChange(async i=>{let l=parseInt(i,10);this.plugin.settings.maxLinksPerRun=Number.isFinite(l)?l:50,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Show per-link fetch notices").setDesc("When enabled, a short Notice appears for each link as the LLM fetches it (e.g. 'Inbox: 3/22 \u2014 Fetching https://\u2026 via LLM\u2026').").addToggle(s=>s.setValue(this.plugin.settings.showFetchNotices).onChange(async i=>{this.plugin.settings.showFetchNotices=i,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Cron (automatic processing)"}),t.createEl("p",{text:"Off by default. When enabled, the plugin processes the inbox every N minutes. Notices are suppressed during cron runs (failures still go to the failure log). Reload Obsidian after changing these settings.",cls:"setting-item-description"}),new a.Setting(t).setName("Enable cron").addToggle(s=>s.setValue(this.plugin.settings.cronEnabled).onChange(async i=>{this.plugin.settings.cronEnabled=i,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Interval (minutes)").addText(s=>s.setValue(String(this.plugin.settings.cronIntervalMinutes)).onChange(async i=>{let l=parseInt(i,10);this.plugin.settings.cronIntervalMinutes=Number.isFinite(l)&&l>0?l:15,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Run on startup").setDesc("Fire a processInbox immediately when Obsidian loads with cron enabled.").addToggle(s=>s.setValue(this.plugin.settings.cronRunOnStartup).onChange(async i=>{this.plugin.settings.cronRunOnStartup=i,await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Archive"}),t.createEl("p",{text:"The 'Move to archive' right-click command mirrors the source path under this root. Example: 1. Projects/Homelab Manager/Plan.md \u2192 4. Archive/1. Projects/Homelab Manager/Plan.md. Adds an `archivedAt` ISO timestamp to the note's frontmatter.",cls:"setting-item-description"}),new a.Setting(t).setName("Archive root").addText(s=>s.setValue(this.plugin.settings.archiveRoot).onChange(async i=>{this.plugin.settings.archiveRoot=i.trim()||"4. Archive",await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Project scaffold"}),t.createEl("p",{text:"Used by 'Create project from selection'. The command reads numbered subfolders under the projects root live, asks which type + name, then shells out to init-project.py.",cls:"setting-item-description"}),new a.Setting(t).setName("Projects root").addText(s=>s.setValue(this.plugin.settings.projectsRoot).onChange(async i=>{this.plugin.settings.projectsRoot=i.trim()||"1. Projects",await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("init-project.py path (vault-relative)").addText(s=>s.setValue(this.plugin.settings.templateScriptPath).onChange(async i=>{this.plugin.settings.templateScriptPath=i.trim(),await this.plugin.saveData(this.plugin.settings)})),t.createEl("h3",{text:"Failure log"}),t.createEl("p",{text:"Per-link failures are appended to a log file outside the vault. Use the buttons below to view or clear it. The path is shown at the bottom.",cls:"setting-item-description"}),new a.Setting(t).setName("View failure log").setDesc("Opens the log in Obsidian if it has any entries.").addButton(s=>s.setButtonText("View").onClick(async()=>{if(await _(this.plugin.app,this.plugin.manifest.dir)===null){new a.Notice("No failures recorded yet");return}let r=`${await E(this.plugin.app,this.plugin.manifest.dir)}/process-failures.log`;await this.plugin.app.workspace.openLinkText(r,"",!1)})).addButton(s=>s.setButtonText("Clear").setWarning().onClick(async()=>{let i=await q(this.plugin.app,this.plugin.manifest.dir);new a.Notice(i?"Failure log cleared":"Nothing to clear")}));let n=new a.Setting(t).setName("Log file location").setDesc("Computed at runtime \u2014 shown for reference.");n.descEl.createEl("code",{text:"(populated when first failure occurs)"}),(async()=>{try{let s=await E(this.plugin.app,this.plugin.manifest.dir);n.descEl.empty(),n.descEl.createEl("code",{text:`${s}/process-failures.log`})}catch{}})(),t.createEl("h3",{text:"Notifications"}),new a.Setting(t).setName("Notify on error").addToggle(s=>s.setValue(this.plugin.settings.notifyOnError).onChange(async i=>{this.plugin.settings.notifyOnError=i,await this.plugin.saveData(this.plugin.settings)})),new a.Setting(t).setName("Notify URL (apprise-shaped)").setDesc("e.g. http://10.0.0.202:8000/notify/kuster.inbox").addText(s=>s.setValue(this.plugin.settings.notifyUrl).onChange(async i=>{this.plugin.settings.notifyUrl=i.trim(),await this.plugin.saveData(this.plugin.settings)}))}},F=class extends a.Modal{constructor(t,e){super(t),this.notePath=e.notePath,this.sourceUrl=e.sourceUrl,this.onChoose=e.onChoose}onOpen(){let{contentEl:t}=this;t.empty(),t.createEl("h2",{text:"Note already exists"}),t.createEl("p",{text:"A note with this filename already exists in the destination folder."}),t.createEl("p",{cls:"kip-conflict-path",text:this.notePath}).style.cssText="font-family: var(--font-monospace); font-size: 12px; padding: 6px 8px; background: var(--background-secondary); border-radius: 4px; word-break: break-all;";let e=t.createEl("p");e.createEl("span",{text:"Source: ",cls:"kip-conflict-label"}),e.createEl("span",{text:this.sourceUrl,attr:{style:"word-break: break-all;"}});let n=t.createDiv({cls:"kip-conflict-buttons"});n.style.cssText="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap;";let s=i=>()=>{this.close(),this.onChoose(i)};new a.ButtonComponent(n).setButtonText("Skip").setTooltip("Keep the existing file. This link stays in the inbox for next time.").onClick(s("skip")),new a.ButtonComponent(n).setButtonText("Rename (-2)").setTooltip("Save with an incremented suffix, e.g. '... - 2.md'.").onClick(s("rename")),new a.ButtonComponent(n).setButtonText("Overwrite").setWarning().setTooltip("Delete the existing file and write the new one in its place. Destructive \u2014 cannot be undone.").onClick(s("overwrite")),new a.ButtonComponent(n).setButtonText("Abort batch").setWarning().setTooltip("Stop processing the rest of this batch. Already-processed links are kept.").onClick(s("abort")),t.addEventListener("keydown",i=>{i.key==="Enter"?(i.preventDefault(),s("rename")()):i.key==="Escape"&&(i.preventDefault(),s("skip")())}),setTimeout(()=>{n.querySelector("button")?.focus()},0)}onClose(){let{contentEl:t}=this;t.empty()}},N=class extends a.Modal{constructor(e,n){super(e);this.selectedTypeIdx=0;this.app=e,this.types=n.types,this.projectsRoot=n.projectsRoot,this.templateScriptPath=n.templateScriptPath,this.initialPlan=n.initialPlan,this.onDone=n.onDone}onOpen(){let{contentEl:e}=this;if(e.empty(),e.createEl("h2",{text:"Create project from selection"}),this.types.length===0){e.createEl("p",{text:`No project-type subfolders found under "${this.projectsRoot}/". Create at least one (e.g. "1. Coding", "2. Personal", etc.) and try again.`}),e.createEl("button",{text:"Close"}).addEventListener("click",()=>{this.close(),this.onDone(null)});return}let s=new a.Setting(e).setName("Project type").setDesc("Subfolders of "+this.projectsRoot+"/ \u2014 read live from vault.").controlEl.createEl("select");this.types.forEach((f,u)=>{let g=s.createEl("option",{text:f.label,value:String(u)});u===this.selectedTypeIdx&&(g.selected=!0)}),s.addEventListener("change",()=>{this.selectedTypeIdx=parseInt(s.value,10)||0});let i=new a.Setting(e).setName("Project name"),l="",r="";i.addText(f=>{f.setPlaceholder("My New Project").onChange(u=>{l=u,r=pt(u),p.value=r,d.setText(this.previewPath())})});let p=new a.Setting(e).setName("Project key").setDesc("Auto-derived from name (^[A-Z][A-Z0-9-]{1,15}$). Edit if you want.").controlEl.createEl("input",{type:"text",attr:{value:""}});p.style.width="100%",p.addEventListener("change",()=>{r=p.value});let d=e.createEl("p");d.style.cssText="font-family: var(--font-monospace); font-size: 12px; padding: 6px 8px; background: var(--background-secondary); border-radius: 4px; margin-top: 8px;",d.setText(this.previewPath());let b=e.createEl("p",{text:this.initialPlan.length>0?`Selected text (${this.initialPlan.length} chars) will seed the v0.1 plan.`:"No text was selected in the inbox. The new project's plan will start empty.",cls:"setting-item-description"}),y=e.createDiv({attr:{style:"display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;"}});y.createEl("button",{text:"Cancel"}).addEventListener("click",()=>{this.close(),this.onDone(null)}),y.createEl("button",{text:"Create project"}).addEventListener("click",()=>{let f=this.types[this.selectedTypeIdx];if(!l.trim()){new a.Notice("Project name is required");return}if(!/^[A-Z][A-Z0-9-]{1,15}$/.test(r)){new a.Notice("Project key must match ^[A-Z][A-Z0-9-]{1,15}$");return}this.close(),this.onDone({typeValue:f.value,name:l.trim(),key:r,initialPlan:this.initialPlan})}),setTimeout(()=>{i.controlEl.querySelector("input[type='text']")?.focus()},0)}onClose(){let{contentEl:e}=this;e.empty()}previewPath(){let e=this.types[this.selectedTypeIdx];return e?`${this.projectsRoot}/${e.value}/<name>/`:"(select a project type)"}};function pt(o){return o.toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,16)}function ut(o){let t=e=>String(e).padStart(2,"0");return`${t(o.getHours())}:${t(o.getMinutes())}`}var K={link:`---
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
`};async function E(o,t){let e=a.Platform.isMobile===!0,n;return e?n=t:process.platform==="win32"?n=`${process.env.APPDATA??H.join(C.homedir(),"AppData","Roaming")}/Link Inbox Processor`:process.platform==="darwin"?n=`${process.env.HOME??C.homedir()}/Library/Application Support/Link Inbox Processor`:n=`${process.env.XDG_CONFIG_HOME??H.join(C.homedir(),".config")}/Link Inbox Processor`,await o.vault.adapter.mkdir(n).catch(()=>{}),n}async function $(o,t,e,n){try{let i=`${await E(o,t.dir)}/process-failures.log`,r=`${new Date().toISOString()} | ${e} | ${n.replace(/\n/g," ").trim()}
`,c=await o.vault.adapter.exists(i)?await o.vault.adapter.read(i):"";await o.vault.adapter.write(i,c+r)}catch{}}async function q(o,t){let n=`${await E(o,t)}/process-failures.log`;return await o.vault.adapter.exists(n)?(await o.vault.adapter.remove(n),!0):!1}async function _(o,t){let n=`${await E(o,t)}/process-failures.log`;return await o.vault.adapter.exists(n)?await o.vault.adapter.read(n):null}var j=null;async function dt(){if(j)return j;let o=process.platform==="win32"?[{bin:"py",args:["-3"],shell:!0},{bin:"python",args:[],shell:!0},{bin:"python3",args:[],shell:!0}]:[{bin:"python3",args:[],shell:!1},{bin:"python",args:[],shell:!1}];for(let t of o)try{if(await new Promise(n=>{let i=require("child_process").spawn(t.bin,[...t.args,"--version"],{shell:t.shell,windowsHide:!0});i.on("error",()=>n(!1)),i.on("close",l=>n(l===0)),setTimeout(()=>{try{i.kill()}catch{}n(!1)},3e3)}))return j=t,t}catch{}return null}function ht(){return'# Inbox Processor \u2014 Classification Context\n\nThis file is read by the **Link Inbox Processor** plugin and passed to the LLM\nas system context. Anything you write here is treated as guidance for how to\nclassify iOS-shared links into PARA destinations and link-types.\n\n## Vault layout (PARA)\n\n- `0. Inbox/` \u2014 capture zone. Subfolders: `Links/`, `Media/`, `Tasks/`, `Research/`, `Reference/`, `Decision Records/`, `Handoffs/`, `Dailies/`, `Copy Templates/`.\n- `1. Projects/` \u2014 active outcomes with a finish line. One folder per project.\n- `2. Areas/` \u2014 ongoing responsibilities (no finish line). E.g. Health, Finance, Homelab.\n- `3. Resources/` \u2014 reference material grouped by topic.\n- `4. Archive/` \u2014 completed/dormant notes.\n- `5. System/` \u2014 tooling, templates, agents, personas. NEVER classify here.\n\n## Classification rules\n\n1. If the link is a **movie, show, book, game, podcast, or album** \u2192 `linkType: "media"`, destination `0. Inbox/Media/`.\n2. If the link describes **something to do** (a tutorial step, a config to apply, a bug to file, a setup to complete) \u2192 `linkType: "task"`, destination `0. Inbox/Tasks/`.\n3. Otherwise it\'s **a read-once resource** (article, repo, video, blog post, tool page) \u2192 `linkType: "link"`, destination `0. Inbox/Links/`.\n4. After it lands in the inbox, **I** will move it to a final PARA destination (`1. Projects/<Name>/`, `2. Areas/<Name>/`, or `3. Resources/<topic>/`). Don\'t pre-classify into those \u2014 keep the inbox the inbox.\n\n## Inbox checkbox convention (locked by ADR-001)\n\nEvery note that lands in the inbox uses this 2-checkbox pair immediately after the title:\n\n```markdown\n- [ ] read #inbox/pending\n- [ ] processed #inbox/processed\n```\n\n- `read` = the user has read/acknowledged this note\n- `processed` = the plugin has finished with it (moved to final destination, or \u2014 for Media/Reference/Tasks \u2014 marked as settled)\n\nDo not invent other checkbox states. The MSC / Homelab project convention uses a 3-checkbox `read / reviewed / handled` triplet but **that convention does NOT apply to the inbox** \u2014 it\'s project-scoped.\n\n## Tagging guidance\n\n- Prefer 2-5 lower-case tags.\n- Reuse existing tags where possible (e.g. `self-hosting`, `ai`, `3d-printing`, `dotnet`).\n- Don\'t invent compound tags like `ai-tool` \u2014 use `ai` + `tools`.\n- Avoid generic tags like `link`, `article`, `interesting`.\n\n## Examples\n\n| URL | linkType | destination |\n|---|---|---|\n| github.com/some/repo | `link` | `0. Inbox/Links` |\n| imdb.com/title/tt123 | `media` | `0. Inbox/Media` |\n| "how to set up nginx" | `link` | `0. Inbox/Links` |\n| "fix X bug by running Y" | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (tutorial) | `task` | `0. Inbox/Tasks` |\n| youtube.com/watch?v=\u2026 (talk/essay) | `link` | `0. Inbox/Links` |\n'}
