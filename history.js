const storeKey = "ai-video-team-board-v2";
const fallbackKey = "ai-video-team-board-v1";
const todayKey = toDateKey(new Date());

const historyFilter = {
  member: "",
  startDate: "",
  endDate: "",
};

const state = loadState();

const els = {
  historyBoard: document.querySelector("#historyBoard"),
  exportExcel: document.querySelector("#exportExcel"),
  historyFilterForm: document.querySelector("#historyFilterForm"),
  historyMemberFilter: document.querySelector("#historyMemberFilter"),
  historyStartDate: document.querySelector("#historyStartDate"),
  historyEndDate: document.querySelector("#historyEndDate"),
  resetHistoryFilter: document.querySelector("#resetHistoryFilter"),
};

init();

function init() {
  els.exportExcel.addEventListener("click", exportExcel);
  els.historyFilterForm.addEventListener("input", handleHistoryFilterChange);
  els.resetHistoryFilter.addEventListener("click", resetHistoryFilter);

  syncHistoryFilterOptions();
  renderHistoryBoard();
}

function renderHistoryBoard() {
  const sorted = [...getFilteredHistoryWork()].sort((a, b) => (a.date === b.date ? a.member.localeCompare(b.member, "zh-CN") : b.date.localeCompare(a.date)));
  if (!sorted.length) {
    els.historyBoard.innerHTML = `<div class="empty board-empty">筛选条件下暂无历史记录</div>`;
    return;
  }

  const grouped = sorted.reduce((result, item) => {
    const key = item.date;
    if (!result[key]) result[key] = [];
    result[key].push(item);
    return result;
  }, {});

  els.historyBoard.innerHTML = Object.entries(grouped)
    .map(([date, items]) => {
      const avg = Math.round(items.reduce((sum, item) => sum + Number(item.progress || 0), 0) / items.length);
      return `
        <article class="history-card">
          <header>
            <h3>${escapeHtml(date)}</h3>
            <span>平均完成度 ${avg}%</span>
          </header>
          <div class="history-items">
            ${items
              .map(
                (item) => `
                  <div class="history-item">
                    <strong>${escapeHtml(item.member)}</strong>
                    <span>${escapeHtml(item.role || "未填写")} · ${escapeHtml(item.task)}</span>
                    <span>${escapeHtml(item.priority || "中")}优先 · ${Number(item.estimatedHours || 0).toFixed(1)}h · ${item.progress}%</span>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function exportExcel() {
  const headers = ["日期", "成员", "流程角色", "工作内容", "状态", "优先级", "预计制作时间(小时)", "完成度(%)"];
  const rows = getFilteredHistoryWork()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => [item.date, item.member, item.role || "", item.task, item.status || "", item.priority || "中", Number(item.estimatedHours || 0).toFixed(1), item.progress]);

  const csv = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\ufeff${csv}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `每日工作记录历史_${todayKey}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function handleHistoryFilterChange() {
  historyFilter.member = els.historyMemberFilter.value.trim();
  historyFilter.startDate = els.historyStartDate.value;
  historyFilter.endDate = els.historyEndDate.value;
  renderHistoryBoard();
}

function resetHistoryFilter() {
  historyFilter.member = "";
  historyFilter.startDate = "";
  historyFilter.endDate = "";
  els.historyMemberFilter.value = "";
  els.historyStartDate.value = "";
  els.historyEndDate.value = "";
  renderHistoryBoard();
}

function syncHistoryFilterOptions() {
  const members = [...new Set(state.work.map((item) => String(item.member || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.historyMemberFilter.innerHTML = [`<option value="">全部成员</option>`, ...members.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`)].join("");
}

function getFilteredHistoryWork() {
  return state.work.filter((item) => {
    const byMember = historyFilter.member ? item.member === historyFilter.member : true;
    const byStartDate = historyFilter.startDate ? item.date >= historyFilter.startDate : true;
    const byEndDate = historyFilter.endDate ? item.date <= historyFilter.endDate : true;
    return byMember && byStartDate && byEndDate;
  });
}

function loadState() {
  const raw = localStorage.getItem(storeKey) || localStorage.getItem(fallbackKey);
  if (!raw) return { work: [] };
  try {
    const parsed = JSON.parse(raw);
    return { work: Array.isArray(parsed.work) ? parsed.work : [] };
  } catch {
    return { work: [] };
  }
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
