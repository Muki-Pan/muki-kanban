
const $ = (sel) => document.querySelector(sel);
const Utils = {
    uuid: () => Date.now().toString(36) + Math.random().toString(36).substr(2),
    date: () => new Date().toISOString(),
    escapeCSV: (str) => `"${(str || '').replace(/"/g, '""')}"`,
    escapeHTML(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
};

const Store = {
    getProjects: () => JSON.parse(localStorage.getItem('uidb_projects') || '[]'),
    saveProjects: (data) => localStorage.setItem('uidb_projects', JSON.stringify(data)),
    getTasks: () => JSON.parse(localStorage.getItem('uidb_tasks') || '[]'),
    saveTasks: (data) => localStorage.setItem('uidb_tasks', JSON.stringify(data)),
    getTheme: () => localStorage.getItem('uidb_theme') || '#663399',
    saveTheme: (color) => localStorage.setItem('uidb_theme', color),
    getLastView: () => JSON.parse(localStorage.getItem('uidb_last_view') || 'null'),
    saveLastView: (view) => localStorage.setItem('uidb_last_view', JSON.stringify(view || null))
};

const Toast = {
    show(msg, type = 'success') {
        const container = $('#toast-container');
        const el = document.createElement('div');

        let icon = 'check_circle';
        let color = 'text-green-400';

        if (type === 'error') {
            icon = 'error';
            color = 'text-red-400';
        } else if (type === 'warning') {
            icon = 'warning';
            color = 'text-amber-400';
        } else if (type === 'info') {
            icon = 'info';
            color = 'text-blue-400';
        }

        el.className = `bg-surface border border-border shadow-2xl rounded-full px-5 py-3 flex items-center gap-3 text-sm font-medium text-text toast-enter pointer-events-auto`;
        el.innerHTML = `<span class="material-symbols-outlined text-[20px] ${color}">${icon}</span><span>${msg}</span>`;
        
        container.appendChild(el);
        setTimeout(() => {
            el.classList.remove('toast-enter');
            el.classList.add('toast-exit');
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }
};

const Modal = {
    el: $('#modal-overlay'),
    content: $('#modal-content'),
    _keyHandler: null,  
    show({ title, desc, bodyHTML, actions }) {
        $('#modal-title').textContent = title;
        $('#modal-desc').textContent = desc || '';
        $('#modal-body').innerHTML = bodyHTML || '';
        const actionContainer = $('#modal-actions');
        actionContainer.innerHTML = '';
        actions.forEach((btn, index) => {   
            const b = document.createElement('button');
            b.className = `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${btn.class}`;
            b.textContent = btn.text;
            if (index === actions.length - 1) {
                b.dataset.primary = 'true';
            }
            b.onclick = () => { if(btn.onClick) btn.onClick(); if(btn.close !== false) this.close(); };
            actionContainer.appendChild(b);
        });
        this.el.classList.remove('hidden');
        void this.el.offsetWidth; 
        this.el.classList.remove('opacity-0');
        this.content.classList.remove('scale-95');
        const input = this.content.querySelector('input, textarea');
        if(input) setTimeout(() => input.focus(), 100);

        this._keyHandler = (e) => {
            const tag = document.activeElement?.tagName;
            const isTextarea = tag === 'TEXTAREA';

            if (e.key === 'Enter' && !isTextarea) {
                e.preventDefault();
                const primaryBtn =
                    document.querySelector('#modal-actions button[data-primary="true"]') ||
                    document.querySelector('#modal-actions button:last-child');
                if (primaryBtn) primaryBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    },
    close() {
        this.el.classList.add('opacity-0');
        this.content.classList.add('scale-95');
        setTimeout(() => this.el.classList.add('hidden'), 200);

        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    }
};

const App = {
    currentProjectId: null,
    filterQuery: "",
    history: {
        past: [],
        future: [],
        limit: 20
    },

    init() {
        this.applyTheme(Store.getTheme());

        $('#modal-overlay').addEventListener('click', (e) => {
            if(e.target === $('#modal-overlay')) Modal.close();
        });

        window.onclick = (e) => {
            if (!e.target.matches('.material-symbols-outlined')) {
                document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.add('hidden'));
            }
        };

        this.initThemeMenu();
        this.initStatsTooltip();

        const last = Store.getLastView();
        if (last && last.view === 'board' && last.projectId) {
            const projects = Store.getProjects();
            const project = projects.find(p => p.id === last.projectId);
            if (project) {
                this.navigateTo('board', { id: last.projectId }, { remember: false });
            } else {
                this.navigateTo('projects', {}, { remember: false });
            }
        } else {
            this.navigateTo('projects', {}, { remember: false });
        }

        document.addEventListener('keydown', (e) => {
            const active = document.activeElement;
            const tag = active && active.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            const isCmdOrCtrl = e.metaKey || e.ctrlKey;
            if (!isCmdOrCtrl) return;

            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
            }
        });
    },

    getCurrentProject() {
        const projects = Store.getProjects();
        let project = projects.find(p => p.id === this.currentProjectId);
        if (project && !project.type) {
            project.type = 'kanban';
        }
        return project;
    },

    pushHistory() {
        const snapshot = {
            projects: Store.getProjects(),
            tasks: Store.getTasks(),
            currentProjectId: this.currentProjectId
        };

        this.history.past.push(snapshot);
        if (this.history.past.length > this.history.limit) {
            this.history.past.shift();
        }
        this.history.future = [];
    },

    undo() {
        if (this.history.past.length === 0) {
            Toast.show("Nothing to undo", "info");
            return;
        }

        const current = {
            projects: Store.getProjects(),
            tasks: Store.getTasks(),
            currentProjectId: this.currentProjectId
        };
        this.history.future.push(current);

        const snapshot = this.history.past.pop();
        Store.saveProjects(snapshot.projects);
        Store.saveTasks(snapshot.tasks);
        this.currentProjectId = snapshot.currentProjectId || null;

        if (this.currentProjectId) {
            this.navigateTo('board', { id: this.currentProjectId }, { remember: false });
        } else {
            this.navigateTo('projects', {}, { remember: false });
        }

        Toast.show("Undo", "info");
    },

    redo() {
        if (this.history.future.length === 0) {
            Toast.show("Nothing to redo", "info");
            return;
        }

        const current = {
            projects: Store.getProjects(),
            tasks: Store.getTasks(),
            currentProjectId: this.currentProjectId
        };
        this.history.past.push(current);

        const snapshot = this.history.future.pop();
        Store.saveProjects(snapshot.projects);
        Store.saveTasks(snapshot.tasks);
        this.currentProjectId = snapshot.currentProjectId || null;

        if (this.currentProjectId) {
            this.navigateTo('board', { id: this.currentProjectId }, { remember: false });
        } else {
            this.navigateTo('projects', {}, { remember: false });
        }

        Toast.show("Redo", "info");
    },

    initThemeMenu() {
        const menu = document.getElementById('theme-menu');
        if (!menu) return;
        const wrapper = menu.parentElement;

        wrapper.addEventListener('mouseenter', () => {
            menu.style.left = "50%";
            menu.style.right = "auto";
            menu.style.transform = "translateX(-50%)";

            requestAnimationFrame(() => {
                const rect = menu.getBoundingClientRect();
                const padding = 8;

                if (rect.right > window.innerWidth - padding) {
                    menu.style.left = "auto";
                    menu.style.right = padding + "px";
                    menu.style.transform = "translateX(0)";
                }

                if (rect.left < padding) {
                    menu.style.left = padding + "px";
                    menu.style.right = "auto";
                    menu.style.transform = "translateX(0)";
                }
            });
        });
    },

    initStatsTooltip() {
        const tooltip = $('#stats-tooltip');

        const show = (target) => {
            const stats = target.getAttribute('data-stats') || '';
            if (!stats) return;
            const rect = target.getBoundingClientRect();
            tooltip.textContent = stats;
            tooltip.style.left = (rect.left + rect.width / 2) + 'px';
            tooltip.style.top = (rect.top - 6) + 'px';
            tooltip.style.opacity = '1';
        };

        const hide = () => {
            tooltip.style.opacity = '0';
        };

        document.addEventListener('mouseenter', (e) => {
            const t = e.target;
            if (t && t.nodeType === 1 && t.matches && t.matches('[data-stats]')) show(t);
        }, true);

        document.addEventListener('mouseleave', (e) => {
            const t = e.target;
            if (t && t.nodeType === 1 && t.matches && t.matches('[data-stats]')) hide();
        }, true);
    },

    applyTheme(color) {
    },

    setTheme(hex) {
    },

    navigateTo(view, params = {}, options = { remember: true }) {
        const container = $('#app-container');
        const breadArea = $('#breadcrumb-area');
        const headerActions = $('#header-actions');
        const headerSearch = $('#header-search');
        const headerSummary = $('#header-summary');

        if (options.remember !== false) {
            if (view === 'projects') {
                Store.saveLastView({ view: 'projects' });
            } else if (view === 'board') {
                Store.saveLastView({ view: 'board', projectId: params.id });
            }
        }
        
        if (view === 'projects') {
            this.currentProjectId = null;
            container.innerHTML = ''; 
            breadArea.classList.add('hidden', 'opacity-0');
            breadArea.classList.remove('flex', 'opacity-100');
            headerActions.innerHTML = `
                <button onclick="app.backupAll()" class="flex items-center gap-2 text-muted hover:text-text px-3 py-1.5 rounded-lg transition-all text-xs font-medium border border-transparent hover:bg-white/5 hover:border-border">
                    <span class="material-symbols-outlined text-[18px]">backup</span>
                    Backup
                </button>

                <label class="cursor-pointer flex items-center gap-2 text-muted hover:text-text px-3 py-1.5 rounded-lg transition-all text-xs font-medium border border-transparent hover:bg-white/5 hover:border-border">
                    <span class="material-symbols-outlined text-[18px]">restore</span>
                    Restore
                    <input type="file" accept=".json" class="hidden" onchange="app.restoreBackup(this)">
                </label>
            `; 
            headerSearch.innerHTML = '';
            headerSummary.textContent = '';

            const template = document.getElementById('view-projects').content.cloneNode(true);
            this.renderProjects(template);
            container.appendChild(template);
        } 
        else if (view === 'board') {
            this.currentProjectId = params.id;
            this.filterQuery = "";

            const projects = Store.getProjects();
            let project = projects.find(p => p.id === params.id);
            if (!project) {
                Toast.show("Project not found", "error");
                this.navigateTo('projects');
                return;
            }
            if (!project.type) project.type = 'kanban';

            container.innerHTML = '';
            breadArea.classList.remove('hidden', 'opacity-0');
            breadArea.classList.add('flex', 'opacity-100');
            $('#header-project-name').textContent = project ? project.name : '';

            headerSearch.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-muted absolute left-2 top-1/2 -translate-y-1/2">search</span>
                <input
                    type="text"
                    placeholder="Search..."
                    class="pl-7 pr-2 py-1.5 bg-background/50 border border-border rounded-lg text-xs text-text placeholder-muted/60 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                    oninput="app.setFilterQuery(this.value)"
                />
            `;

            headerActions.innerHTML = `
                <button onclick="app.exportCSV()" class="flex items-center gap-2 text-muted hover:text-text px-3 py-1.5 rounded-lg transition-all text-xs font-medium border border-transparent hover:bg-white/5 hover:border-border">
                    <span class="material-symbols-outlined text-[18px]">download</span> Export CSV
                </button>
            `;

            if (project.type === 'prompt') {
                this.renderPromptBoard(container, project);
            } else {
                this.renderKanbanBoard(container, project);
            }
        }
    },

    renderProjects(container) {
        const raw = Store.getProjects();
        const projects = raw
            .map(p => ({ ...p, type: p.type || 'kanban' }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const kanbans = projects.filter(p => p.type === 'kanban');
        const prompts = projects.filter(p => p.type === 'prompt');

        const kanbanRoot = container.querySelector('#kanban-section');
        const promptRoot = container.querySelector('#prompt-section');

        if (!kanbanRoot || !promptRoot) return;

        kanbanRoot.innerHTML = this.uiProjectSection({
            title: "Kanbans",
            subtitle: "Track issues, reviews, and debug tasks.",
            type: "kanban",
            projects: kanbans,
            showImport: true
        });

        promptRoot.innerHTML = this.uiProjectSection({
            title: "Prompts",
            subtitle: "Save and reuse frequently used snippets.",
            type: "prompt",
            projects: prompts,
            showImport: true
        });
    },

    createProject(type) {
        Modal.show({
            title: "Create Project",
            desc: type === 'prompt'
                ? "Create a lightweight Prompt index to store frequently used snippets."
                : "Create a Kanban board for debugging or task tracking.",
            bodyHTML: `
                <label class="text-xs text-muted block mb-2">Project name</label>
                <input id="new-proj-input" class="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:ring-1 focus:ring-primary outline-none" placeholder="${type === 'prompt' ? 'e.g. Prompt Library – Alt Studio' : 'e.g. Debug – Q1 Website Launch'}">
            `,
            actions: [
                { text: "Cancel", class: "text-muted hover:text-text" },
                { text: "Create", class: "bg-primary text-white hover:bg-primary/80", onClick: () => {
                    const val = $('#new-proj-input').value.trim();
                    if(val) {
                        this.pushHistory();
                        const projects = Store.getProjects();
                        const newId = Utils.uuid();
                        projects.push({ id: newId, name: val, type, createdAt: Utils.date() });
                        Store.saveProjects(projects);
                        this.navigateTo('board', { id: newId });
                        Toast.show("Project created", "success");
                    }
                }}
            ]
        });
    },

    renameProject(id) {
        const projects = Store.getProjects();
        const project = projects.find(p => p.id === id);
        if (!project) return;

        Modal.show({
            title: "Rename Project",
            bodyHTML: `<input id="rename-proj-input" class="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:ring-1 focus:ring-primary outline-none" value="${project.name}">`,
            actions: [
                { text: "Cancel", class: "text-muted hover:text-text" },
                { 
                    text: "Save", 
                    class: "bg-primary text-white hover:bg-primary/80", 
                    onClick: () => {
                        const val = $('#rename-proj-input').value.trim();
                        if (val) {
                            project.name = val;
                            Store.saveProjects(projects);
                            this.navigateTo('projects');
                            Toast.show("Project renamed");
                        }
                    }
                }
            ]
        });
        setTimeout(() => $('#rename-proj-input').select(), 100);
    },

    deleteProject(id) {
        Modal.show({
            title: "Delete Project?",
            desc: "This will remove the project and all its cards permanently.",
            actions: [
                { text: "Cancel", class: "text-muted hover:text-text" },
                { text: "Delete", class: "bg-danger text-white hover:bg-red-600", onClick: () => {
                    this.pushHistory();
                    const projects = Store.getProjects().filter(p => p.id !== id);
                    const tasks = Store.getTasks().filter(t => t.projectId !== id);
                    Store.saveProjects(projects);
                    Store.saveTasks(tasks);
                    this.navigateTo('projects');
                    Toast.show("Project deleted", "warning");
                }}
            ]
        });
    },


    uiProjectSection({ title, subtitle, type, projects, showImport }) {
  const createLabel = type === "kanban" ? "New Kanban Board" : "New Prompt Library";
  const importLabel = "Import CSV";

  const emptyIcon = type === "kanban" ? "view_kanban" : "description";
  const emptyTitle = type === "kanban" ? "No kanban boards yet" : "No prompt libraries yet";
  const emptyDesc = type === "kanban"
    ? "Create a board to track UI issues or tasks."
    : "Create a library to store prompt snippets.";

  return `
    <div class="flex flex-col gap-4">
      <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-text tracking-tight">${title}</h1>
          <p class="text-xs text-muted mt-1">${subtitle}</p>
        </div>

        <div class="flex flex-wrap items-center gap-2 justify-start md:justify-end">
          ${
            showImport
              ? `
              <label class="cursor-pointer inline-flex items-center gap-2 bg-surface hover:bg-surface_hover border border-border text-muted hover:text-text px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm">
                <span class="material-symbols-outlined text-[18px]">upload_file</span>
                <span>${importLabel}</span>
                <input type="file" accept=".csv" class="hidden" onchange="app.importCSV(this, '${type}')">
              </label>
              `
              : ""
          }

          <button
            onclick="app.createProject('${type}')"
            class="flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-transparent shadow-sm transition-all hover:brightness-110"
            style="background-color: ${type === "kanban" ? "var(--kanban-accent)" : "var(--prompt-accent)"};"
          >
            <span class="material-symbols-outlined text-[16px]">add</span>
            <span>${createLabel}</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        ${
          projects.length === 0
            ? `
            <div class="col-span-full text-center text-muted py-16 bg-surface/30 rounded-3xl border border-dashed border-border">
              <span class="material-symbols-outlined text-4xl mb-4 opacity-30">${emptyIcon}</span>
              <p class="text-base">${emptyTitle}</p>
              <p class="text-xs mt-2 text-muted/80">${emptyDesc}</p>
            </div>
            `
            : projects.map(p => this.uiProjectCard(p)).join("")
        }
      </div>
    </div>
  `;
},

uiProjectCard(p) {
  return `
    <div class="group relative bg-surface border border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 rounded-2xl p-6 transition-all duration-300 cursor-pointer"
         onclick="app.navigateTo('board', {id: '${p.id}'})">
      <div class="flex justify-between items-start mb-4">
        <div class="flex flex-col gap-1 pr-8 min-w-0">
          <h3 class="text-xl font-bold text-text tracking-tight group-hover:text-primary transition-colors truncate">
            ${p.name}
          </h3>
        </div>

        <div class="absolute top-6 right-6" onclick="event.stopPropagation()">
          <button onclick="this.nextElementSibling.classList.toggle('hidden')"
                  class="w-8 h-8 flex items-center justify-center text-muted hover:text-text rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all">
            <span class="material-symbols-outlined text-[20px]">more_vert</span>
          </button>
          <div class="dropdown-menu absolute right-0 top-9 z-20 w-32 hidden bg-surface border border-border shadow-2xl rounded-lg py-1 backdrop-blur-xl">
            <button onclick="app.renameProject('${p.id}')"
                    class="w-full text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2">
              <span class="material-symbols-outlined text-[14px]">edit</span> Rename
            </button>
            <button onclick="app.deleteProject('${p.id}')"
                    class="w-full text-left px-3 py-2 text-xs text-danger hover:bg-white/5 flex items-center gap-2">
              <span class="material-symbols-outlined text-[14px]">delete</span> Delete
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 text-xs text-muted font-mono">
        <span class="w-1.5 h-1.5 rounded-full bg-border group-hover:bg-primary transition-colors"></span>
        Created: ${new Date(p.createdAt).toLocaleString()}
      </div>
    </div>
  `;
},


    setFilterQuery(value) {
        this.filterQuery = (value || "").toLowerCase();

        const input = document.querySelector('#header-search input');
        if (this.filterQuery) {
            input.style.borderColor = 'var(--color-primary)';
            input.style.boxShadow = '0 0 0 1px var(--color-primary)';
        } else {
            input.style.borderColor = '';
            input.style.boxShadow = '';
        }

        const project = this.getCurrentProject();
        if (!project) return;
        if (project.type === 'prompt') {
            this.renderPromptBoardLists();
        } else {
            this.renderKanbanBoardLists();
        }
    },

    /* ---------- KANBAN VIEW ---------- */
    renderKanbanBoard(container, project) {
        container.innerHTML = `
            <div class="h-full overflow-x-auto overflow-y-hidden pt-4 lg:pt-4 px-4 lg:px-8 pb-4">
                <div class="grid h-full min-w-[1000px] grid-cols-3 gap-6">
                    ${['low', 'medium', 'high'].map(type => {
                        const colorClass = type === 'low' ? 'bg-green-500' : type === 'medium' ? 'bg-yellow-500' : 'bg-red-500';
                        return `
                    <div class="flex flex-col bg-surface rounded-xl border border-border h-full max-h-full min-h-0 shadow-sm overflow-hidden relative">
                        <div class="relative h-1 w-full bg-white/10">
                            <div id="progress-${type}" class="progress-bar absolute left-0 top-0 h-full" style="width: 0%; background-color: var(--color-primary)"></div>
                        </div>

                        <div class="p-4 border-b border-border flex justify-between items-center shrink-0">
                            <div class="flex items-center gap-2 font-bold capitalize text-text tracking-wide">
                                <span class="w-2.5 h-2.5 rounded-full ${colorClass}"></span> ${type}
                            </div>
                            <span id="count-${type}" class="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded text-muted relative cursor-default" data-stats="">0</span>
                        </div>
                        <div id="list-${type}" class="flex-grow overflow-y-auto p-3 space-y-2 ui-scrollbar relative" 
                                ondrop="app.drop(event, '${type}')" 
                                ondragover="app.allowDrop(event)"></div>
                        <div class="p-3 border-t border-border shrink-0 bg-surface z-10 sticky bottom-0">
                            <textarea rows="1" placeholder="+ Add task" 
                                class="w-full bg-background/50 border border-transparent rounded-lg px-3 py-2.5 text-sm text-text placeholder-muted/50 focus:bg-surface_hover focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none overflow-hidden transition-all"
                                oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                                onkeydown="app.handleAddKanbanTask(event, '${type}')"></textarea>
                        </div>
                    </div>`;
                    }).join('')}
                </div>
            </div>
        `;
        this.renderKanbanBoardLists();
    },

    renderKanbanBoardLists() {
        const project = this.getCurrentProject();
        if (!project) return;

        const allTasks = Store.getTasks().filter(t => t.projectId === this.currentProjectId);
        const query = this.filterQuery;
        let totalAll = 0;
        let doneAll = 0;

        ['low', 'medium', 'high'].forEach(priority => {
            const listEl = document.getElementById(`list-${priority}`);
            const countEl = document.getElementById(`count-${priority}`);
            const progressEl = document.getElementById(`progress-${priority}`);
            if(!listEl) return;

            const colAll = allTasks.filter(t => t.priority === priority);
            const doneCount = colAll.filter(t => t.status === 'done').length;
            const totalCount = colAll.length;
            totalAll += totalCount;
            doneAll += doneCount;

            colAll.sort((a, b) => {
                if (a.status === b.status) return new Date(b.createdAt) - new Date(a.createdAt);
                return (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
            });

            const colVisible = query
                ? colAll.filter(t => (t.content || "").toLowerCase().includes(query))
                : colAll;
            
            const todoCount = totalCount - doneCount;
            countEl.textContent = todoCount;
            countEl.setAttribute('data-stats', `Total: ${totalCount} / Done: ${doneCount}`);
            
            const percentage = totalCount === 0 ? 0 : (doneCount / totalCount) * 100;
            progressEl.style.width = `${percentage}%`;

            if (colVisible.length === 0) {
                listEl.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-muted/20 select-none pointer-events-none">
                    <span class="material-symbols-outlined text-4xl mb-2">inbox</span>
                    <span class="text-xs font-medium">${query ? 'No tasks match search' : 'No tasks yet...'}</span>
                </div>`;
            } else {
                listEl.innerHTML = colVisible.map(t => this.createKanbanTaskHTML(t)).join('');
            }
        });

        const headerSummary = $('#header-summary');
        if (headerSummary) {
            if (totalAll === 0) {
                headerSummary.textContent = '';
            } else {
                headerSummary.textContent = `Tasks: ${totalAll} · Done: ${doneAll}`;
            }
        }
    },

    createKanbanTaskHTML(task) {
        const isDone = task.status === 'done';
        return `
            <div id="${task.id}" class="task-card group relative bg-white/5 border ${isDone ? 'border-transparent opacity-40' : 'border-white/5 hover:border-muted/30'} rounded-lg p-3 cursor-move mb-2 select-none"
                draggable="true" 
                ondragstart="app.drag(event, '${task.id}')">
            <div class="flex justify-between items-start gap-3">
                <div class="flex-grow cursor-pointer pt-0.5 task-main" onclick="app.toggleTaskStatus('${task.id}')">
                <p class="task-text break-anywhere ${isDone ? 'line-through text-muted decoration-muted/50' : 'text-text'} text-sm font-medium leading-relaxed whitespace-pre-wrap">${Utils.escapeHTML(task.content)}</p>
                </div>
                <div class="relative shrink-0">
                <button onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden')" class="w-6 h-6 flex items-center justify-center text-muted/50 hover:text-text rounded-md hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all">
                    <span class="material-symbols-outlined text-[16px]">more_horiz</span>
                </button>
                <div class="dropdown-menu absolute right-0 top-6 z-50 w-36 hidden bg-surface border border-border shadow-2xl rounded-lg py-1 backdrop-blur-xl">
                    <button onclick="app.editTask('${task.id}')" class="w-full text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2">
                    <span class="material-symbols-outlined text-[14px]">edit</span> Edit
                    </button>
                    <button onclick="app.deleteTask('${task.id}')" class="w-full text-left px-3 py-2 text-xs text-danger hover:bg-white/5 flex items-center gap-2">
                    <span class="material-symbols-outlined text-[14px]">delete</span> Delete
                    </button>
                </div>
                </div>
            </div>
            </div>
        `;
    },

    handleAddKanbanTask(e, priority) {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const content = e.target.value.trim();
            if(!content) return;
            const newTask = { 
                id: Utils.uuid(), 
                projectId: this.currentProjectId, 
                content, 
                priority, 
                status: 'todo', 
                createdAt: Utils.date() 
            };
            const tasks = Store.getTasks();
            this.pushHistory();
            tasks.push(newTask);
            Store.saveTasks(tasks);
            
            this.renderKanbanBoardLists();
            e.target.value = '';
            e.target.style.height = 'auto'; 
        }
    },

    toggleTaskStatus(id) {
        const tasks = Store.getTasks();
        const task = tasks.find(t => t.id === id);
        if (task) {
            this.pushHistory();
            task.status = task.status === 'todo' ? 'done' : 'todo';
            Store.saveTasks(tasks);
            const project = this.getCurrentProject();
            if (project && project.type === 'prompt') {
                this.renderPromptBoardLists();
            } else {
                this.renderKanbanBoardLists();
            }
        }
    },

    /* ---------- PROMPT VIEW（瀑布流） ---------- */
    renderPromptBoard(container, project) {
    container.innerHTML = `
        <div class="h-full overflow-y-auto pt-6 px-4 lg:px-8 pb-10">
        <div class="mx-auto max-w-6xl">

            <!-- Command input (Spotlight style) -->
            <div class="sticky top-0 z-10 pt-2 pb-4">
            <div class="mx-auto max-w-[720px]">
                <div class="flex items-start gap-2 px-4 py-3">
                    <textarea
                    id="prompt-input"
                    rows="2"
                    placeholder="+ Add a prompt…"
                    class="w-full max-w-[760px] mx-auto bg-surface/90 border border-border rounded-2xl px-4 py-3 text-sm text-text placeholder-muted/60
                            focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none
                            min-h-[56px] max-h-[220px] overflow-y-auto"
                    oninput="app.autoGrow(this)"
                    onkeydown="app.handleAddPromptCard(event)"
                    ></textarea>
                </div> 
            </div>
            </div>

            <!-- Masonry list -->
            <div
            id="prompt-grid"
             class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 items-start"
            ></div>
        </div>
        </div>
    `;

    // 初始聚焦（更像工具）
    setTimeout(() => {
        const el = document.getElementById("prompt-input");
        if (el) el.focus();
    }, 80);

    this.renderPromptBoardLists();
    },
    
    autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
    },
    
    renderPromptBoardLists() {
        const project = this.getCurrentProject();
        if (!project) return;

        const allTasks = Store.getTasks().filter(t => t.projectId === this.currentProjectId);
        const query = this.filterQuery;

        let visible = query
            ? allTasks.filter(t => (t.content || "").toLowerCase().includes(query))
            : allTasks;

        visible.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const grid = document.getElementById("prompt-grid");
        if (!grid) return;

        if (visible.length === 0) {
            grid.innerHTML = `
            <div class="prompt-card-wrap mb-3">
                <div class="h-28 flex flex-col items-center justify-center text-muted/40 text-xs border border-dashed border-border rounded-2xl bg-surface/20">
                <span class="material-symbols-outlined text-3xl mb-1 opacity-40">note_add</span>
                <span>${query ? "No prompts match search" : "No prompts yet. Add your first snippet above."}</span>
                </div>
            </div>
            `;
        } else {
            grid.innerHTML = visible.map(t => this.createPromptCardHTML(t)).join("");
        }

        const headerSummary = document.getElementById("header-summary");
        if (headerSummary) {
            headerSummary.textContent = allTasks.length === 0 ? "" : `Prompts: ${allTasks.length}`;
        }
        },

    createPromptCardHTML(task) {
        return `
            <div class="prompt-card-wrap mb-3">
            <div
                id="${task.id}"
                class="prompt-card group relative bg-white/5 border border-white/5 hover:border-primary/50 hover:bg-white/[0.03] rounded-2xl p-3 transition-all cursor-pointer"
                onclick="app.copyPrompt('${task.id}')"
                role="button"
                tabindex="0"
                onkeydown="if(event.key==='Enter'){ app.copyPrompt('${task.id}') }"
            >
                <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0"><div class="prompt-main text-[13px] leading-5 text-text whitespace-pre-wrap break-words h-[160px] overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
                onmousedown="event.stopPropagation()"
                onmousemove="event.stopPropagation()"
                onwheel="event.stopPropagation()"
                >${Utils.escapeHTML(task.content)}</div>
                </div>

                <div class="relative shrink-0" onclick="event.stopPropagation()">
                    <button
                    onclick="this.nextElementSibling.classList.toggle('hidden')"
                    class="w-7 h-7 flex items-center justify-center text-muted/60 hover:text-text rounded-xl hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="More"
                    >
                    <span class="material-symbols-outlined text-[16px]">more_horiz</span>
                    </button>

                    <div class="dropdown-menu absolute right-0 top-8 z-50 w-36 hidden bg-surface border border-border shadow-2xl rounded-xl py-1 backdrop-blur-xl">
                    <button onclick="app.editPrompt('${task.id}')" class="w-full text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[14px]">edit</span> Edit
                    </button>
                    <button onclick="app.deleteTask('${task.id}')" class="w-full text-left px-3 py-2 text-xs text-danger hover:bg-white/5 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[14px]">delete</span> Delete
                    </button>
                    </div>
                </div>
                </div>
            </div>
            </div>
        `;
        },


    autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    const max = 220;
    const next = Math.min(textarea.scrollHeight, max);
    textarea.style.height = next + "px";
    textarea.style.overflowY = textarea.scrollHeight > max ? "auto" : "hidden";
    },

    handleAddPromptCard(e) {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const content = e.target.value.trim();
            if (!content) return;
            const tasks = Store.getTasks();
            this.pushHistory();
            tasks.push({
                id: Utils.uuid(),
                projectId: this.currentProjectId,
                content,
                column: 1,
                createdAt: Utils.date()
            });
            Store.saveTasks(tasks);
            this.renderPromptBoardLists();
            e.target.value = '';
            e.target.style.height = 'auto';
        }
    },

    copyPrompt(id) {
        const tasks = Store.getTasks();
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        navigator.clipboard.writeText(task.content).then(() => {
            const card = document.getElementById(id);
            if (card) {
            card.classList.add("is-copied");
            setTimeout(() => card.classList.remove("is-copied"), 650);
            }
            Toast.show("Copied", "success");
        }).catch(() => {
            Toast.show("Copy failed", "error");
        });
    },

    movePrompt(id) {
        const tasks = Store.getTasks();
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        Modal.show({
            title: "Move Prompt",
            desc: "Choose a new column for this prompt.",
            bodyHTML: `
                <div class="flex flex-col gap-2 mt-2 text-xs text-muted">
                    <label class="inline-flex items-center gap-2">
                        <input type="radio" name="prompt-col" value="1" class="accent-primary" ${task.column === 1 ? 'checked' : ''}> Column 1
                    </label>
                    <label class="inline-flex items-center gap-2">
                        <input type="radio" name="prompt-col" value="2" class="accent-primary" ${task.column === 2 ? 'checked' : ''}> Column 2
                    </label>
                    <label class="inline-flex items-center gap-2">
                        <input type="radio" name="prompt-col" value="3" class="accent-primary" ${task.column === 3 ? 'checked' : ''}> Column 3
                    </label>
                    <label class="inline-flex items-center gap-2">
                        <input type="radio" name="prompt-col" value="4" class="accent-primary" ${task.column === 4 ? 'checked' : ''}> Column 4
                    </label>
                    <label class="inline-flex items-center gap-2">
                        <input type="radio" name="prompt-col" value="5" class="accent-primary" ${task.column === 5 ? 'checked' : ''}> Column 5
                    </label>
                </div>
            `,
            actions: [
                { text: "Cancel", class: "text-muted hover:text-text" },
                { text: "Move", class: "bg-primary text-white hover:bg-primary/80", onClick: () => {
                    const checked = document.querySelector('input[name="prompt-col"]:checked');
                    if (!checked) return;
                    const col = parseInt(checked.value, 10);
                    if (col >= 1 && col <= 5) {
                        this.pushHistory();
                        task.column = col;
                        Store.saveTasks(tasks);
                        this.renderPromptBoardLists();
                        Toast.show("Prompt moved", "info");
                    }
                }}
            ]
        });
    },

    /* ---------- Shared card edit / delete ---------- */
    
    
    editTask(id) {
    const project = this.getCurrentProject();
    if (!project) return;

    if (project.type === 'prompt') {
        this.editPrompt(id);
    } else {
        this.editKanbanTask(id);
    }
    },
    
    editKanbanTask(id) {
        const tasks = Store.getTasks();
        const task = tasks.find(t => t.id === id);
        if(!task) return;

        const card = document.getElementById(id);
        if (!card) return;

        const isKanbanCard = !!card.closest('#list-low, #list-medium, #list-high');
        const main =
            card.querySelector('.task-main') ||
            card.querySelector('.prompt-main') ||
            card.querySelector('p.text-sm')?.parentElement;
        const dropdown = card.querySelector('.dropdown-menu');
        if (dropdown) dropdown.classList.add('hidden');
        if (!main) return;

        main.onclick = null;

        main.innerHTML = `
            <textarea
                class="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text focus:ring-1 focus:ring-primary outline-none resize-none mb-2"
                style="overflow-y: hidden;"
            >${task.content}</textarea>
            <div class="flex justify-end gap-2 text-[11px]">
                <button type="button" data-role="cancel" class="px-2 py-1 rounded-md bg-surface_hover text-muted hover:text-text">Cancel</button>
                <button type="button" data-role="save" class="px-2 py-1 rounded-md bg-primary text-white hover:bg-primary/80">Save</button>
            </div>
        `;

        const textarea = main.querySelector('textarea');
        const cancelBtn = main.querySelector('[data-role="cancel"]');
        const saveBtn = main.querySelector('[data-role="save"]');

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const autoResize = () => {
            textarea.style.height = 'auto';
            const max = isKanbanCard ? 200 : 240;
            const newHeight = Math.min(textarea.scrollHeight, max);
            textarea.style.height = newHeight + 'px';
            textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
        };

        setTimeout(autoResize, 0);
        textarea.addEventListener('input', autoResize);

        const finish = (save) => {
            if (save) {
                const val = textarea.value.trim();
                if (val) {
                    this.pushHistory();
                    task.content = val;
                    Store.saveTasks(tasks);
                }
            }
            const project = this.getCurrentProject();
            if (project && project.type === 'prompt') {
                this.renderPromptBoardLists();
            } else {
                this.renderKanbanBoardLists();
            }
        };

        cancelBtn.onclick = () => finish(false);
        saveBtn.onclick = () => finish(true);

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finish(true);
            }
        });
    },

    editPrompt(id) {
        const tasks = Store.getTasks();
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        const dropdown = document.querySelector(`#${CSS.escape(id)} .dropdown-menu`);
        if (dropdown) dropdown.classList.add('hidden');

        Modal.show({
            title: "Edit Prompt",
            bodyHTML: `
                <textarea
                    id="edit-prompt-input"
                    class="w-full min-h-[220px] max-h-[60vh] bg-background border border-border rounded-xl px-4 py-3 text-sm text-text focus:ring-1 focus:ring-primary outline-none resize-none"
                >${Utils.escapeHTML(task.content)}</textarea>
            `,
            actions: [
                { text: "Cancel", class: "text-muted hover:text-text" },
                {
                    text: "Save",
                    class: "bg-primary text-white hover:bg-primary/80",
                    onClick: () => {
                        const textarea = $('#edit-prompt-input');
                        if (!textarea) return;

                        const val = textarea.value.trim();
                        if (!val) {
                            Toast.show("Prompt cannot be empty", "warning");
                            return;
                        }

                        this.pushHistory();
                        task.content = val;
                        Store.saveTasks(tasks);
                        this.renderPromptBoardLists();
                        Modal.close();
                        Toast.show("Prompt updated", "success");
                    },
                    close: false
                }
            ]
        });

        const textarea = $('#edit-prompt-input');
        if (textarea) {
            this.autoResizeTextarea(textarea);
            textarea.addEventListener('input', () => this.autoResizeTextarea(textarea));
        }
    },




    deleteTask(id) {
        this.pushHistory();
        const tasks = Store.getTasks().filter(t => t.id !== id);
        Store.saveTasks(tasks);
        const project = this.getCurrentProject();
        if (project && project.type === 'prompt') {
            this.renderPromptBoardLists();
        } else {
            this.renderKanbanBoardLists();
        }
        Toast.show("Card deleted", "warning");
    },
    
    /* ---------- Drag & Drop (Kanban only) ---------- */
    drag(ev, id) { 
        ev.dataTransfer.setData("text", id); 
        ev.target.classList.add('is-dragging'); 
    },
    allowDrop(ev) { 
        ev.preventDefault(); 
        ev.currentTarget.classList.add('is-drop-target'); 
    },
    drop(ev, newPriority) {
        ev.preventDefault();
        document.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
        const taskId = ev.dataTransfer.getData("text");
        const tasks = Store.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task && task.priority !== newPriority) {
            this.pushHistory();
            task.priority = newPriority;
            Store.saveTasks(tasks);
            this.renderKanbanBoardLists();
        }
    },


    /* ---------- backup & restore ---------- */

    backupAll() {
        const data = {
            version: "waterfall-1",
            exportedAt: new Date().toISOString(),
            projects: Store.getProjects(),
            tasks: Store.getTasks()
        };

        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: "application/json" }
        );

        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        link.href = URL.createObjectURL(blob);
        link.download = `waterfall-backup-${timestamp}.json`;
        link.click();

        URL.revokeObjectURL(link.href);
        Toast.show("Backup exported", "success");
    },


    restoreBackup(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result || "{}");

            if (
                !data ||
                !Array.isArray(data.projects) ||
                !Array.isArray(data.tasks)
            ) {
                Toast.show("Invalid backup file", "error");
                input.value = "";
                return;
            }

            Modal.show({
                title: "Restore backup?",
                desc: "This will replace all current projects and tasks.",
                actions: [
                    { text: "Cancel", class: "text-muted hover:text-text" },
                    {
                        text: "Restore",
                        class: "bg-primary text-white hover:bg-primary/80",
                        onClick: () => {
                            this.pushHistory();
                            Store.saveProjects(data.projects);
                            Store.saveTasks(data.tasks);
                            this.currentProjectId = null;
                            this.navigateTo('projects');
                            Toast.show("Backup restored", "success");
                            input.value = "";
                        }
                    }
                ]
            });
        } catch (err) {
            Toast.show("Invalid JSON file", "error");
            input.value = "";
        }
    };
    reader.readAsText(file);
    },  

    /* ---------- Export / Import ---------- */
    exportCSV() {
        const project = this.getCurrentProject();
        if (!project) return;

        const tasks = Store.getTasks().filter(t => t.projectId === this.currentProjectId);
        if (project.type === 'prompt') {
            let csv = "\uFEFFID,Project,Content,Column,Created At\n";
            tasks.forEach(t => { 
                const col = t.column || 1;
                csv += `${t.id},"${project.name.replace(/"/g, '""')}",${Utils.escapeCSV(t.content)},${col},${t.createdAt}\n`; 
            });
            const link = document.createElement("a");
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
            link.download = `PROMPT_${project.name}_${timestamp}.csv`;
            link.click();
            Toast.show("Export CSV downloaded", "success");
        } else {
            let csv = "\uFEFFID,Project,Content,Priority,Status,Created At\n";
            tasks.forEach(t => { 
                csv += `${t.id},"${project.name.replace(/"/g, '""')}",${Utils.escapeCSV(t.content)},${t.priority},${t.status},${t.createdAt}\n`; 
            });
            const link = document.createElement("a");
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
            link.download = `KANBAN_${project.name}_${timestamp}.csv`;
            link.click();
            Toast.show("Export CSV downloaded", "success");
        }
    },


    importCSV(input, type = "kanban") {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result || "";
            const lines = text.split(/\r?\n/).filter(Boolean);
            if (lines.length <= 1) {
            Toast.show("CSV is empty", "warning");
            input.value = "";
            return;
            }

        const header = lines[0].toLowerCase();
        const rows = lines.slice(1);

        this.pushHistory();

        const pid = Utils.uuid();
        const projects = Store.getProjects();
        const tasks = Store.getTasks();

        const projectNamePrefix = type === "prompt" ? "Imported Prompts" : "Imported Kanban";
        projects.push({
        id: pid,
        name: `${projectNamePrefix} ${new Date().toLocaleDateString()}`,
        type,
        createdAt: Utils.date()
        });

        let count = 0;

        rows.forEach((r) => {
        if (!r.trim()) return;

        // ⚠️ 仍然是轻量 split（你的原实现也是）
        // 如果后面你要支持“内容里有逗号”，我建议换 CSV parser（PapaParse）
        const parts = r.split(",");

        // 兼容你旧导出：第 3 列为 content（带引号）
        let rawContent = (parts[2] || "").trim();
        if (rawContent.startsWith('"') && rawContent.endsWith('"')) {
            rawContent = rawContent.slice(1, -1).replace(/""/g, '"');
        }
        const content = rawContent;
        if (!content) return;

        if (type === "prompt") {
            // prompt: column 可选
            let col = 1;
            const maybeCol = parts[3] ? parseInt(parts[3].replace(/"/g, "").trim(), 10) : 1;
            if (!Number.isNaN(maybeCol) && maybeCol >= 1 && maybeCol <= 5) col = maybeCol;

            tasks.push({
            id: Utils.uuid(),
            projectId: pid,
            content,
            column: col,
            createdAt: (parts[4] || "").replace(/"/g, "").trim() || Utils.date()
            });
            count++;
            return;
        }

        // kanban
        let priorityFromCSV = parts[3] ? parts[3].toLowerCase().replace(/"/g, "").trim() : "medium";
        if (!["low", "medium", "high"].includes(priorityFromCSV)) priorityFromCSV = "medium";

        let statusFromCSV = parts[4] ? parts[4].toLowerCase().replace(/"/g, "").trim() : "todo";
        if (!["todo", "done"].includes(statusFromCSV)) statusFromCSV = "todo";

        let createdAt = parts[5] ? parts[5].replace(/"/g, "").trim() : Utils.date();

        tasks.push({
            id: Utils.uuid(),
            projectId: pid,
            content,
            priority: priorityFromCSV,
            status: statusFromCSV,
            createdAt: createdAt || Utils.date()
        });
        count++;
        });

        Store.saveProjects(projects);
        Store.saveTasks(tasks);

        this.navigateTo("projects");
        Toast.show(`Imported ${count} ${type === "prompt" ? "prompts" : "tasks"}`, "success");
        input.value = "";
    };
  reader.readAsText(file);
},

}; 

window.app = App;
window.onload = () => App.init();
