const today = new Date();
const todayKey = toDateKey(today);
const storeKey = "ai-video-team-board-v2";
const collabConfigKey = "ai-video-team-board-collab-v1";
const localChannel = "BroadcastChannel" in window ? new BroadcastChannel("ai-video-team-board-sync") : null;
const collabClientId = crypto.randomUUID();
let syncing = false;
let supabaseClient = null;
let collabChannel = null;
let collabRoom = "";

const state = loadState();
let boardMode = "daily";
let selectedWorkMember = "";
const els = {
  currentDate: document.querySelector("#currentDate"),
  workForm: document.querySelector("#workForm"),
  workMemberSelect: document.querySelector("#workMemberSelect"),
  newMemberField: document.querySelector("#newMemberField"),
  deleteMember: document.querySelector("#deleteMember"),
  workRole: document.querySelector("#workRole"),
  customRoleField: document.querySelector("#customRoleField"),
  workMemberTabs: document.querySelector("#workMemberTabs"),
  workMemberPanel: document.querySelector("#workMemberPanel"),
  dramaForm: document.querySelector("#dramaForm"),
  dramaTitleSelect: document.querySelector("#dramaTitleSelect"),
  newDramaTitleField: document.querySelector("#newDramaTitleField"),
  dramaOwnerSelect: document.querySelector("#dramaOwnerSelect"),
  newDramaOwnerField: document.querySelector("#newDramaOwnerField"),
  toolForm: document.querySelector("#toolForm"),
  toolSelect: document.querySelector("#toolSelect"),
  newToolField: document.querySelector("#newToolField"),
  dramaTable: document.querySelector("#dramaTable"),
  toolTable: document.querySelector("#toolTable"),
  avgProgress: document.querySelector("#avgProgress"),
  avgProgressHint: document.querySelector("#avgProgressHint"),
  todayTaskCount: document.querySelector("#todayTaskCount"),
  weeklyTokens: document.querySelector("#weeklyTokens"),
  activeDramaCount: document.querySelector("#activeDramaCount"),
  toolChart: document.querySelector("#toolChart"),
  memberBoard: document.querySelector("#memberBoard"),
  seedDemo: document.querySelector("#seedDemo"),
  boardButtons: document.querySelectorAll("[data-board]"),
  exportDramaExcel: document.querySelector("#exportDramaExcel"),
  weeklyMemberChart: document.querySelector("#weeklyMemberChart"),
  weeklyTrendChart: document.querySelector("#weeklyTrendChart"),
  weeklyTokenChart: document.querySelector("#weeklyTokenChart"),
  collabForm: document.querySelector("#collabForm"),
  collabUrl: document.querySelector("#collabUrl"),
  collabAnonKey: document.querySelector("#collabAnonKey"),
  collabRoom: document.querySelector("#collabRoom"),
  collabStatus: document.querySelector("#collabStatus"),
  collabDisconnect: document.querySelector("#collabDisconnect"),
  copyCollabLink: document.querySelector("#copyCollabLink"),
  liveStatusBar: document.querySelector("#liveStatusBar"),
  liveStatusText: document.querySelector("#liveStatusText"),
};

init();

function init() {
  els.currentDate.textContent = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(today);

  for (const input of document.querySelectorAll('input[type="date"]')) {
    input.value = todayKey;
  }

  els.workForm.addEventListener("submit", handleWorkSubmit);
  els.workMemberSelect.addEventListener("change", syncMemberField);
  els.deleteMember.addEventListener("click", deleteSelectedMember);
  els.workRole.addEventListener("change", syncCustomRoleField);
  els.dramaForm.addEventListener("submit", handleDramaSubmit);
  els.dramaTitleSelect.addEventListener("change", syncDramaTitleField);
  els.dramaOwnerSelect.addEventListener("change", syncDramaOwnerField);
  els.toolForm.addEventListener("submit", handleToolSubmit);
  els.toolSelect.addEventListener("change", syncToolField);
  els.seedDemo.addEventListener("click", seedDemoData);
  els.exportDramaExcel.addEventListener("click", exportDramaExcel);
  els.boardButtons.forEach((button) => {
    button.addEventListener("click", () => {
      boardMode = button.dataset.board;
      els.boardButtons.forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });
  window.addEventListener("storage", syncFromStorage);
  if (localChannel) {
    localChannel.addEventListener("message", syncFromChannel);
  }
  els.collabForm.addEventListener("submit", handleCollabConnect);
  els.collabDisconnect.addEventListener("click", handleCollabDisconnect);
  els.copyCollabLink?.addEventListener("click", handleCopyCollabLink);

  syncMemberList();
  syncMemberField();
  syncDramaTitleList();
  syncDramaTitleField();
  syncDramaOwnerList();
  syncDramaOwnerField();
  syncToolField();
  syncCustomRoleField();
  hydrateCollabForm();
  render();
}

function handleWorkSubmit(event) {
  event.preventDefault();
  const values = formValues(event.currentTarget);
  const member = selectedFormMember(values);
  if (!member) {
    event.currentTarget.member.focus();
    return;
  }
  const role = values.role === "自定义" ? values.customRole.trim() : values.role;
  if (!role) {
    event.currentTarget.customRole.focus();
    return;
  }

  state.work.unshift({
    id: crypto.randomUUID(),
    member,
    role,
    date: values.date,
    task: values.task,
    estimatedHours: Math.max(0.5, Number(values.estimatedHours || 0)),
    priority: values.priority,
    progress: values.status === "已完成" ? 100 : 0,
    status: values.status,
  });

  addMember(member);
  if (values.date === todayKey) {
    selectedWorkMember = member;
  }

  event.currentTarget.reset();
  event.currentTarget.date.value = todayKey;
  event.currentTarget.estimatedHours.value = 2;
  els.workMemberSelect.value = member;
  syncMemberList(member);
  syncMemberField();
  syncCustomRoleField();
  saveAndRender();
}

function handleDramaSubmit(event) {
  event.preventDefault();
  const values = formValues(event.currentTarget);
  const title = selectedDramaTitle(values);
  if (!title) {
    if (values.titleSelect === "__new__") {
      event.currentTarget.title.focus();
    }
    return;
  }
  const owner = selectedDramaOwner(values);
  if (!owner) {
    if (values.ownerSelect === "__new__") {
      event.currentTarget.owner.focus();
    }
    return;
  }
  state.dramas.unshift({
    id: crypto.randomUUID(),
    title,
    episode: Number(values.episode),
    stage: values.stage,
    owner,
    deadline: values.deadline,
    progress: clamp(Number(values.progress), 0, 100),
  });
  addMember(owner);
  event.currentTarget.reset();
  event.currentTarget.deadline.value = todayKey;
  event.currentTarget.episode.value = 1;
  event.currentTarget.progress.value = 0;
  syncDramaTitleList(title);
  syncDramaTitleField();
  syncDramaOwnerList(owner);
  syncDramaOwnerField();
  saveAndRender();
}

function handleToolSubmit(event) {
  event.preventDefault();
  const values = formValues(event.currentTarget);
  const tool = selectedTool(values);
  if (!tool) {
    if (values.toolSelect === "__new__") {
      event.currentTarget.tool.focus();
    }
    return;
  }
  state.tools.unshift({
    id: crypto.randomUUID(),
    date: values.date,
    member: values.member,
    tool,
    purpose: values.purpose,
    tokens: Math.max(0, Number(values.tokens)),
  });
  addMember(values.member.trim());
  event.currentTarget.reset();
  event.currentTarget.date.value = todayKey;
  event.currentTarget.tokens.value = 2000;
  syncToolField();
  saveAndRender();
}

function render() {
  syncDramaTitleList();
  syncDramaOwnerList();
  renderWork();
  renderDramas();
  renderTools();
  renderMetrics();
  renderBoard();
  renderWeeklyVisualization();
}

function renderWork() {
  const todayWork = state.work.filter((item) => item.date === todayKey);
  const members = [...new Set(todayWork.map((item) => item.member).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));

  if (!members.length) {
    selectedWorkMember = "";
    els.workMemberTabs.innerHTML = "";
    els.workMemberPanel.innerHTML = `<div class="empty board-empty">还没有今日工作记录，团队成员可以从上方表单开始填写。</div>`;
    return;
  }

  if (!members.includes(selectedWorkMember)) {
    selectedWorkMember = members[0];
  }

  els.workMemberTabs.innerHTML = members
    .map((member) => {
      const count = todayWork.filter((item) => item.member === member).length;
      return `<button class="${member === selectedWorkMember ? "active" : ""}" type="button" onclick="selectWorkMember(decodeURIComponent('${encodeURIComponent(member)}'))"><span class="member-avatar" aria-hidden="true">${escapeHtml(memberInitial(member))}</span>${escapeHtml(member)}<span>${count}</span></button>`;
    })
    .join("");

  const items = todayWork.filter((item) => item.member === selectedWorkMember);
  const average = items.length ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length) : 0;
  const done = items.filter((item) => item.status === "已完成").length;
  const hours = items.reduce((sum, item) => sum + Number(item.estimatedHours || 0), 0);

  els.workMemberPanel.innerHTML = `
    <article class="member-work-card">
      <header>
        <div>
          <p class="eyebrow">Member Board</p>
          <h3 class="member-title"><span class="member-avatar" aria-hidden="true">${escapeHtml(memberInitial(selectedWorkMember))}</span>${escapeHtml(selectedWorkMember)}</h3>
          <span>今日 ${items.length} 项工作，已完成 ${done} 项，预计制作 ${hours.toFixed(1)} 小时</span>
        </div>
        <div class="member-score">${average}%</div>
      </header>
      ${progressMarkup(average)}
      <div class="work-item-list">
        ${items.map((item, index) => workItemMarkup(item, index)).join("")}
      </div>
    </article>
  `;
}

function renderDramas() {
  if (!state.dramas.length) {
    els.dramaTable.innerHTML = emptyRow(7, "还没有剧集制作记录，可以按剧名、集数和阶段逐条维护。");
    return;
  }

  els.dramaTable.innerHTML = state.dramas
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.title)}</td>
          <td>第${escapeHtml(item.episode)}集</td>
          <td>${escapeHtml(item.stage)}</td>
          <td>${escapeHtml(item.owner)}</td>
          <td>${escapeHtml(item.deadline)}</td>
          <td class="progress-cell">
            <div class="inline-progress-editor">
              ${progressMarkup(item.progress)}
              <input type="number" min="0" max="100" value="${item.progress}" onchange="updateDramaProgress('${item.id}', this.value)" />
            </div>
          </td>
          <td><button class="delete-btn" type="button" onclick="removeItem('dramas', '${item.id}')">删除</button></td>
        </tr>
      `,
    )
    .join("");
}

function renderTools() {
  if (!state.tools.length) {
    els.toolTable.innerHTML = emptyRow(6, "还没有工具使用记录，Token 消耗会在这里自动汇总。");
  } else {
    els.toolTable.innerHTML = state.tools
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.date)}</td>
            <td>${escapeHtml(item.member)}</td>
            <td>${escapeHtml(item.tool)}</td>
            <td>${escapeHtml(item.purpose)}</td>
            <td>${formatNumber(item.tokens)}</td>
            <td><button class="delete-btn" type="button" onclick="removeItem('tools', '${item.id}')">删除</button></td>
          </tr>
        `,
      )
      .join("");
  }

  const totals = groupTotals(state.tools, "tool", "tokens");
  const max = Math.max(1, ...Object.values(totals));
  els.toolChart.innerHTML = Object.keys(totals).length
    ? Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([tool, tokens]) => `
            <div class="bar-item">
              <div class="bar-top"><strong>${escapeHtml(tool)}</strong><span>${formatNumber(tokens)}</span></div>
              <div class="bar-track"><span style="width:${(tokens / max) * 100}%"></span></div>
            </div>
          `,
        )
        .join("")
    : `<div class="empty">暂无工具数据</div>`;
}

function renderMetrics() {
  const todayWork = state.work.filter((item) => item.date === todayKey);
  const average = todayWork.length ? Math.round(todayWork.reduce((sum, item) => sum + item.progress, 0) / todayWork.length) : 0;
  els.avgProgress.textContent = `${average}%`;
  els.avgProgressHint.textContent = todayWork.length ? "基于今日工作记录" : "等待团队填写";
  els.todayTaskCount.textContent = String(todayWork.length);
  els.weeklyTokens.textContent = formatNumber(
    state.tools
      .filter((item) => inCurrentWeek(item.date))
      .reduce((sum, item) => sum + item.tokens, 0),
  );
  els.activeDramaCount.textContent = String(state.dramas.filter((item) => item.progress < 100).length);
}

function renderBoard() {
  const work = boardMode === "daily" ? state.work.filter((item) => item.date === todayKey) : state.work.filter((item) => inCurrentWeek(item.date));
  const members = [...new Set(work.map((item) => item.member).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (!members.length) {
    els.memberBoard.innerHTML = `<div class="empty board-empty">暂无${boardMode === "daily" ? "今日" : "本周"}成员记录</div>`;
    return;
  }

  els.memberBoard.innerHTML = members
    .map((member) => {
      const items = work.filter((item) => item.member === member);
      const average = items.length ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length) : 0;
      const done = items.filter((item) => item.status === "已完成").length;
      return `
        <article class="member-card">
          <header>
            <div>
              <h3>${member}</h3>
              <p>${boardMode === "daily" ? "今日" : "本周"} ${items.length} 项，已完成 ${done} 项</p>
            </div>
            <div class="member-score">${average}%</div>
          </header>
          ${progressMarkup(average)}
          <div class="task-list">
            ${
              items.length
                ? items
                    .slice(0, 4)
                    .map((item) => `<div class="task-pill">${escapeHtml(workRole(item))} · ${escapeHtml(item.task)} · ${escapeHtml(item.priority || "中")}优先 · ${item.progress}%</div>`)
                    .join("")
                : `<div class="task-pill">暂无记录</div>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderWeeklyVisualization() {
  const weeklyWork = state.work.filter((item) => inCurrentWeek(item.date));
  const memberGroups = groupItems(weeklyWork, "member");
  const memberStats = Object.entries(memberGroups)
    .map(([member, items]) => {
      const avg = Math.round(items.reduce((sum, item) => sum + Number(item.progress || 0), 0) / items.length);
      return { member, avg };
    })
    .sort((a, b) => b.avg - a.avg);
  const maxMember = Math.max(1, ...memberStats.map((item) => item.avg));

  els.weeklyMemberChart.innerHTML = memberStats.length
    ? memberStats
        .map(
          (item) => `
            <div class="bar-item">
              <div class="bar-top"><strong>${escapeHtml(item.member)}</strong><span>${item.avg}%</span></div>
              <div class="bar-track"><span style="width:${(item.avg / maxMember) * 100}%"></span></div>
            </div>
          `,
        )
        .join("")
    : `<div class="empty">本周暂无成员进度数据</div>`;

  const dayGroups = groupItems(weeklyWork, "date");
  const trendData = Object.entries(dayGroups)
    .map(([date, items]) => ({ date, count: items.length, avg: Math.round(items.reduce((sum, item) => sum + Number(item.progress || 0), 0) / items.length) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const maxCount = Math.max(1, ...trendData.map((item) => item.count));

  els.weeklyTrendChart.innerHTML = trendData.length
    ? trendData
        .map(
          (item) => `
            <div class="trend-item">
              <span class="trend-date">${escapeHtml(item.date)}</span>
              <div class="trend-track"><span style="width:${(item.count / maxCount) * 100}%"></span></div>
              <span class="trend-meta">${item.count}项 / ${item.avg}%</span>
            </div>
          `,
        )
        .join("")
    : `<div class="empty">本周暂无任务趋势数据</div>`;

  const weeklyTools = state.tools.filter((item) => inCurrentWeek(item.date));
  const tokenByMember = groupTotals(weeklyTools, "member", "tokens");
  const maxToken = Math.max(1, ...Object.values(tokenByMember));

  els.weeklyTokenChart.innerHTML = Object.keys(tokenByMember).length
    ? Object.entries(tokenByMember)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([member, tokens]) => `
            <div class="bar-item">
              <div class="bar-top"><strong>${escapeHtml(member)}</strong><span>${formatNumber(tokens)}</span></div>
              <div class="bar-track"><span style="width:${(tokens / maxToken) * 100}%"></span></div>
            </div>
          `,
        )
        .join("")
    : `<div class="empty">本周暂无Token消耗数据</div>`;
}

function progressMarkup(value) {
  const progress = clamp(Number(value), 0, 100);
  return `
    <div class="progress-label"><span>进度</span><strong>${progress}%</strong></div>
    <div class="progress-line" aria-label="完成度 ${progress}%"><span style="width:${progress}%"></span></div>
  `;
}

function statusMarkup(status) {
  const className = status === "有风险" ? "risk" : status === "已完成" ? "done" : "";
  return `<span class="status ${className}">${escapeHtml(status)}</span>`;
}

function seedDemoData() {
  state.members = ["小林", "小周", "阿宁", "小陈", "小赵", "小唐"];
  state.work = [
    { id: crypto.randomUUID(), date: todayKey, member: "小林", role: "剧本", task: "审核第8集节奏与镜头连贯性", estimatedHours: 2, priority: "高", progress: 80, status: "待审核" },
    { id: crypto.randomUUID(), date: todayKey, member: "小周", role: "脚本", task: "补齐第9集反转台词与结尾钩子", estimatedHours: 3, priority: "高", progress: 65, status: "进行中" },
    { id: crypto.randomUUID(), date: todayKey, member: "阿宁", role: "分镜", task: "拆分第8集32个镜头并标注景别", estimatedHours: 2.5, priority: "中", progress: 100, status: "已完成" },
    { id: crypto.randomUUID(), date: todayKey, member: "小陈", role: "抽卡", task: "生成主角室内对话镜头并重绘手部", estimatedHours: 4, priority: "高", progress: 55, status: "有风险" },
    { id: crypto.randomUUID(), date: todayKey, member: "小赵", role: "视频剪辑", task: "第7集粗剪、字幕和节奏点校准", estimatedHours: 3.5, priority: "中", progress: 72, status: "进行中" },
    { id: crypto.randomUUID(), date: todayKey, member: "小唐", role: "运营", task: "整理本周发布排期与封面A/B标题", estimatedHours: 1.5, priority: "低", progress: 90, status: "待审核" },
  ];
  state.dramas = [
    { id: crypto.randomUUID(), title: "赛博茶馆", episode: 8, stage: "剪辑", owner: "剪辑", deadline: todayKey, progress: 72 },
    { id: crypto.randomUUID(), title: "月球便利店", episode: 3, stage: "画面生成", owner: "画面生成", deadline: todayKey, progress: 48 },
    { id: crypto.randomUUID(), title: "反派下班后", episode: 12, stage: "发布", owner: "运营", deadline: todayKey, progress: 95 },
  ];
  state.tools = [
    { id: crypto.randomUUID(), date: todayKey, member: "小周", tool: "ChatGPT", purpose: "剧本润色与提示词扩写", tokens: 18600 },
    { id: crypto.randomUUID(), date: todayKey, member: "小陈", tool: "Midjourney", purpose: "角色定妆图", tokens: 5200 },
    { id: crypto.randomUUID(), date: todayKey, member: "小陈", tool: "可灵", purpose: "镜头转视频", tokens: 9400 },
    { id: crypto.randomUUID(), date: todayKey, member: "小赵", tool: "Runway", purpose: "背景延展与补帧", tokens: 4300 },
  ];
  syncMemberList();
  syncMemberField();
  saveAndRender();
}

function syncCustomRoleField() {
  const isCustom = els.workRole.value === "自定义";
  els.customRoleField.hidden = !isCustom;
  els.customRoleField.querySelector("input").required = isCustom;
}

function syncMemberList(preferredMember = els.workMemberSelect.value) {
  const members = memberNames();
  const selected = members.includes(preferredMember) ? preferredMember : members[0] || "__new__";
  els.workMemberSelect.innerHTML = [
    ...members.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`),
    `<option value="__new__">新增成员</option>`,
  ].join("");
  els.workMemberSelect.value = selected;
}

function syncMemberField() {
  const isNew = els.workMemberSelect.value === "__new__";
  els.newMemberField.hidden = !isNew;
  els.newMemberField.querySelector("input").required = isNew;
  els.deleteMember.disabled = isNew;
}

function syncDramaTitleList(preferredTitle = els.dramaTitleSelect.value) {
  const titles = dramaTitles();
  const selected = titles.includes(preferredTitle) ? preferredTitle : "__new__";
  els.dramaTitleSelect.innerHTML = [
    ...titles.map((title) => `<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`),
    `<option value="__new__">新增剧名</option>`,
  ].join("");
  els.dramaTitleSelect.value = selected;
}

function syncDramaTitleField() {
  const isNew = els.dramaTitleSelect.value === "__new__";
  els.newDramaTitleField.hidden = !isNew;
  els.newDramaTitleField.querySelector("input").required = isNew;
}

function syncDramaOwnerList(preferredOwner = els.dramaOwnerSelect.value) {
  const members = memberNames();
  const selected = members.includes(preferredOwner) ? preferredOwner : members[0] || "__new__";
  els.dramaOwnerSelect.innerHTML = [
    ...members.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`),
    `<option value="__new__">新增负责人</option>`,
  ].join("");
  els.dramaOwnerSelect.value = selected;
}

function syncDramaOwnerField() {
  const isNew = els.dramaOwnerSelect.value === "__new__";
  els.newDramaOwnerField.hidden = !isNew;
  els.newDramaOwnerField.querySelector("input").required = isNew;
}

function syncToolField() {
  const isNew = els.toolSelect.value === "__new__";
  els.newToolField.hidden = !isNew;
  els.newToolField.querySelector("input").required = isNew;
}

function selectedFormMember(values) {
  return values.memberSelect === "__new__" ? values.member.trim() : values.memberSelect.trim();
}

function selectedDramaTitle(values) {
  return values.titleSelect === "__new__" ? values.title.trim() : values.titleSelect.trim();
}

function selectedDramaOwner(values) {
  return values.ownerSelect === "__new__" ? values.owner.trim() : values.ownerSelect.trim();
}

function selectedTool(values) {
  return values.toolSelect === "__new__" ? values.tool.trim() : values.toolSelect.trim();
}

function addMember(member) {
  if (!state.members.includes(member)) {
    state.members.push(member);
    state.members.sort((a, b) => a.localeCompare(b, "zh-CN"));
  }
}

function deleteSelectedMember() {
  const member = els.workMemberSelect.value;
  if (!member || member === "__new__") {
    return;
  }
  state.members = state.members.filter((item) => item !== member);
  if (selectedWorkMember === member) {
    selectedWorkMember = "";
  }
  syncMemberList();
  syncMemberField();
  saveAndRender();
}

function memberNames() {
  return [...new Set(state.members.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function dramaTitles() {
  return [...new Set(state.dramas.map((item) => String(item.title || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function workRole(item) {
  return item.role || item.member || "未填写";
}

function memberInitial(member) {
  const text = String(member || "").trim();
  return text ? text.charAt(0) : "人";
}

function workItemMarkup(item, index) {
  const roleColors = {
    "剧本": "#8b5cf6",
    "脚本": "#3b82f6",
    "分镜": "#10b981",
    "抽卡": "#f59e0b",
    "视频剪辑": "#ef4444",
    "运营": "#ec4899",
    "自定义": "#6b7280"
  };
  const statusColors = {
    "进行中": "#3b82f6",
    "待审核": "#f59e0b",
    "已完成": "#10b981",
    "有风险": "#ef4444"
  };
  const roleColor = roleColors[item.role] || roleColors["自定义"];
  const statusColor = statusColors[item.status] || statusColors["进行中"];
  
  return `
    <div class="work-card" style="border-top: 3px solid ${roleColor}">
      <div class="work-card-header">
        <span class="work-num">${index + 1}</span>
        <span class="work-role-tag" style="background: ${roleColor}20; color: ${roleColor}">${escapeHtml(item.role)}</span>
      </div>
      <p class="work-card-task">${escapeHtml(item.task)}</p>
      <div class="work-card-footer">
        <span class="work-status-dot" style="background: ${statusColor}" title="${escapeHtml(item.status)}"></span>
        <span class="work-card-progress">${item.progress}%</span>
      </div>
      <div class="work-card-actions">
        <input type="number" min="0" max="100" value="${item.progress}" onchange="updateWorkProgress('${item.id}', this.value)" title="完成度" />
        <select onchange="updateWorkStatus('${item.id}', this.value)" title="状态">
          <option value="进行中" ${item.status === "进行中" ? "selected" : ""}>进行中</option>
          <option value="待审核" ${item.status === "待审核" ? "selected" : ""}>待审核</option>
          <option value="已完成" ${item.status === "已完成" ? "selected" : ""}>已完成</option>
          <option value="有风险" ${item.status === "有风险" ? "selected" : ""}>有风险</option>
        </select>
        <button type="button" onclick="removeItem('work', '${item.id}')" title="删除">×</button>
      </div>
    </div>
  `;
}

function selectWorkMember(member) {
  selectedWorkMember = member;
  renderWork();
}

function removeItem(collection, id) {
  state[collection] = state[collection].filter((item) => item.id !== id);
  saveAndRender();
}

function updateWorkProgress(id, value) {
  const item = state.work.find((work) => work.id === id);
  if (!item) {
    return;
  }
  item.progress = clamp(Number(value), 0, 100);
  if (item.progress === 100) {
    item.status = "已完成";
  }
  saveAndRender();
}

function updateDramaProgress(id, value) {
  const item = state.dramas.find((drama) => drama.id === id);
  if (!item) {
    return;
  }
  item.progress = clamp(Number(value), 0, 100);
  saveAndRender();
}

function updateWorkStatus(id, value) {
  const item = state.work.find((work) => work.id === id);
  if (!item) {
    return;
  }
  item.status = value;
  if (value === "已完成") {
    item.progress = 100;
  }
  saveAndRender();
}

function exportDramaExcel() {
  const headers = ["剧名", "集数", "阶段", "负责人", "截止日期", "进度(%)"];
  const rows = state.dramas
    .slice()
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .map((item) => [item.title, item.episode, item.stage, item.owner, item.deadline, item.progress]);

  const csv = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\ufeff${csv}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `剧集制作记录_${todayKey}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function saveAndRender() {
  syncing = true;
  localStorage.setItem(storeKey, JSON.stringify(state));
  if (localChannel) {
    localChannel.postMessage({ type: "sync" });
  }
  broadcastCollabState();
  render();
  syncing = false;
}

function syncFromStorage(event) {
  if (event.key !== storeKey || syncing || !event.newValue) {
    return;
  }
  try {
    const latest = normalizeState(JSON.parse(event.newValue));
    replaceState(latest);
    render();
  } catch {
    // ignore malformed payloads
  }
}

function syncFromChannel(message) {
  if (syncing || !message?.data || message.data.type !== "sync") {
    return;
  }
  const raw = localStorage.getItem(storeKey);
  if (!raw) {
    return;
  }
  try {
    const latest = normalizeState(JSON.parse(raw));
    replaceState(latest);
    render();
  } catch {
    // ignore malformed payloads
  }
}

function hydrateCollabForm() {
  const queryConfig = loadCollabConfigFromQuery();
  if (queryConfig.url && queryConfig.anonKey && queryConfig.room) {
    saveCollabConfig(queryConfig);
    stripCollabQueryParams();
  }
  const config = queryConfig.url && queryConfig.anonKey && queryConfig.room ? queryConfig : loadCollabConfig();
  els.collabUrl.value = config.url || "";
  els.collabAnonKey.value = config.anonKey || "";
  els.collabRoom.value = config.room || "";
  if (config.url && config.anonKey && config.room) {
    connectCollab(config).catch(() => {
      setCollabStatus("连接失败", "risk");
    });
  } else {
    setCollabStatus("未连接", "");
  }
}

function handleCollabConnect(event) {
  event.preventDefault();
  const values = formValues(event.currentTarget);
  const config = {
    url: String(values.url || "").trim(),
    anonKey: String(values.anonKey || "").trim(),
    room: String(values.room || "").trim(),
  };
  if (!config.url || !config.anonKey || !config.room) {
    setCollabStatus("配置不完整", "risk");
    return;
  }
  saveCollabConfig(config);
  connectCollab(config).catch(() => {
    setCollabStatus("连接失败", "risk");
  });
}

async function handleCollabDisconnect() {
  await disconnectCollab();
  setCollabStatus("未连接", "");
}

async function handleCopyCollabLink() {
  const config = {
    url: String(els.collabUrl?.value || "").trim(),
    anonKey: String(els.collabAnonKey?.value || "").trim(),
    room: String(els.collabRoom?.value || "").trim(),
  };
  if (!config.url || !config.anonKey || !config.room) {
    setCollabStatus("请先填写配置", "risk");
    return;
  }
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set("sbUrl", config.url);
  shareUrl.searchParams.set("sbKey", config.anonKey);
  shareUrl.searchParams.set("room", config.room);
  try {
    await navigator.clipboard.writeText(shareUrl.toString());
    setCollabStatus("协同链接已复制", "done");
  } catch {
    setCollabStatus("复制失败，请手动复制地址", "risk");
  }
}

function loadCollabConfig() {
  const raw = localStorage.getItem(collabConfigKey);
  if (!raw) {
    return { url: "", anonKey: "", room: "" };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      url: String(parsed.url || "").trim(),
      anonKey: String(parsed.anonKey || "").trim(),
      room: String(parsed.room || "").trim(),
    };
  } catch {
    return { url: "", anonKey: "", room: "" };
  }
}

function loadCollabConfigFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    url: String(params.get("sbUrl") || "").trim(),
    anonKey: String(params.get("sbKey") || "").trim(),
    room: String(params.get("room") || "").trim(),
  };
}

function stripCollabQueryParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("sbUrl");
  url.searchParams.delete("sbKey");
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url.toString());
}

function saveCollabConfig(config) {
  localStorage.setItem(collabConfigKey, JSON.stringify(config));
}

async function connectCollab(config) {
  if (!window.supabase?.createClient) {
    setCollabStatus("SDK未加载", "risk");
    return;
  }
  await disconnectCollab();
  supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  collabRoom = config.room;
  collabChannel = supabaseClient.channel(`team-board:${collabRoom}`, {
    config: { broadcast: { self: false } },
  });
  collabChannel.on("broadcast", { event: "state-sync" }, ({ payload }) => {
    if (!payload || payload.sender === collabClientId || syncing) {
      return;
    }
    try {
      const latest = normalizeState(payload.state || {});
      replaceState(latest);
      localStorage.setItem(storeKey, JSON.stringify(state));
      render();
      setCollabStatus("在线协同中", "live");
    } catch {
      // ignore malformed payload
    }
  });
  await collabChannel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      setCollabStatus("在线协同中", "live");
      broadcastCollabState();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      setCollabStatus("连接异常", "risk");
    } else if (status === "CLOSED") {
      setCollabStatus("已断开", "");
    }
  });
}

async function disconnectCollab() {
  if (collabChannel && supabaseClient) {
    await supabaseClient.removeChannel(collabChannel);
  }
  collabChannel = null;
  supabaseClient = null;
  collabRoom = "";
}

function broadcastCollabState() {
  if (!collabChannel || !collabRoom) {
    return;
  }
  collabChannel.send({
    type: "broadcast",
    event: "state-sync",
    payload: {
      sender: collabClientId,
      room: collabRoom,
      updatedAt: Date.now(),
      state,
    },
  });
}

function setCollabStatus(text, stateClass) {
  if (!els.collabStatus) {
    return;
  }
  els.collabStatus.textContent = text;
  els.collabStatus.classList.remove("risk", "done", "live");
  if (stateClass) {
    els.collabStatus.classList.add(stateClass);
  }
  if (els.liveStatusText) {
    els.liveStatusText.textContent = text;
  }
  if (els.liveStatusBar) {
    els.liveStatusBar.classList.remove("is-live", "is-risk");
    if (stateClass === "live") {
      els.liveStatusBar.classList.add("is-live");
    }
    if (stateClass === "risk") {
      els.liveStatusBar.classList.add("is-risk");
    }
  }
}

function replaceState(nextState) {
  state.members = nextState.members;
  state.work = nextState.work;
  state.dramas = nextState.dramas;
  state.tools = nextState.tools;
}

function loadState() {
  const savedV2 = localStorage.getItem(storeKey);
  const savedV1 = localStorage.getItem("ai-video-team-board-v1");
  const raw = savedV2 || savedV1;
  if (!raw) {
    return { members: [], work: [], dramas: [], tools: [] };
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return { members: [], work: [], dramas: [], tools: [] };
  }
}

function normalizeState(saved) {
  const work = (Array.isArray(saved.work) ? saved.work : []).map((item) => ({
    ...item,
    estimatedHours: item.estimatedHours == null ? 2 : Number(item.estimatedHours),
    priority: ["高", "中", "低"].includes(item.priority) ? item.priority : "中",
    progress: clamp(Number(item.progress == null ? 0 : item.progress), 0, 100),
  }));
  const dramas = (Array.isArray(saved.dramas) ? saved.dramas : []).map((item) => ({ ...item, progress: clamp(Number(item.progress || 0), 0, 100) }));
  const tools = Array.isArray(saved.tools) ? saved.tools : [];
  const members = (
    Array.isArray(saved.members) ? saved.members : []
  )
    .filter(Boolean)
    .map((member) => String(member).trim())
    .filter(Boolean);

  return { members: [...new Set(members)].sort((a, b) => a.localeCompare(b, "zh-CN")), work, dramas, tools };
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function groupTotals(items, labelKey, valueKey) {
  return items.reduce((result, item) => {
    result[item[labelKey]] = (result[item[labelKey]] || 0) + Number(item[valueKey] || 0);
    return result;
  }, {});
}

function groupItems(items, key) {
  return items.reduce((result, item) => {
    const groupKey = item[key] || "未分组";
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
}

function inCurrentWeek(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const start = new Date(today);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}" class="empty">${text}</td></tr>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.removeItem = removeItem;
window.selectWorkMember = selectWorkMember;
window.updateWorkProgress = updateWorkProgress;
window.updateWorkStatus = updateWorkStatus;
window.updateDramaProgress = updateDramaProgress;
