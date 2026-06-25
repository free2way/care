const samples = {
  fraud: "【社保中心】通知：您的社保卡由于在异地异常消费5000元已被冻结，请立即点击链接 shb-gov.icu 或回复验证码解冻。",
  memory: "我今天早上八点半吃过降压药了。",
  travel: "我要去医院复查，不知道怎么走。",
};

let currentDashboard = null;

const els = {
  appShell: document.querySelector("#appShell"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  currentRoleChip: document.querySelector("#currentRoleChip"),
  currentRoleName: document.querySelector("#currentRoleName"),
  profileTitle: document.querySelector("#profileTitle"),
  profileSubtitle: document.querySelector("#profileSubtitle"),
  workspaceEyebrow: document.querySelector("#workspaceEyebrow"),
  overviewTitle: document.querySelector("#overview-title"),
  overviewCopy: document.querySelector("#overviewCopy"),
  sidePanelTitle: document.querySelector("#sidePanelTitle"),
  sidePanelList: document.querySelector("#sidePanelList"),
  fraudInput: document.querySelector("#fraudInput"),
  fraudScore: document.querySelector("#fraudScore"),
  fraudMeter: document.querySelector("#fraudMeter"),
  fraudLevel: document.querySelector("#fraudLevel"),
  elderReply: document.querySelector("#elderReply"),
  riskReasons: document.querySelector("#riskReasons"),
  childAlert: document.querySelector("#childAlert"),
  alertState: document.querySelector("#alertState"),
  bpState: document.querySelector("#bpState"),
  bpSystolic: document.querySelector("#bpSystolic"),
  bpDiastolic: document.querySelector("#bpDiastolic"),
  bpPulse: document.querySelector("#bpPulse"),
  bpNote: document.querySelector("#bpNote"),
  bpAdvice: document.querySelector("#bpAdvice"),
  bpChart: document.querySelector("#bpChart"),
  bpList: document.querySelector("#bpList"),
  checkupImage: document.querySelector("#checkupImage"),
  checkupAdvice: document.querySelector("#checkupAdvice"),
  familyBpAdvice: document.querySelector("#familyBpAdvice"),
  familyBpChart: document.querySelector("#familyBpChart"),
  familyBpList: document.querySelector("#familyBpList"),
  familyCheckupList: document.querySelector("#familyCheckupList"),
  memoryInput: document.querySelector("#memoryInput"),
  memoryReply: document.querySelector("#memoryReply"),
  memoryTable: document.querySelector("#memoryTable"),
  familyMemoryTable: document.querySelector("#familyMemoryTable"),
  travelInput: document.querySelector("#travelInput"),
  weatherTrace: document.querySelector("#weatherTrace"),
  routeTrace: document.querySelector("#routeTrace"),
  travelReply: document.querySelector("#travelReply"),
  eventLog: document.querySelector("#eventLog"),
  fraudCount: document.querySelector("#fraudCount"),
  alertCount: document.querySelector("#alertCount"),
  memoryCount: document.querySelector("#memoryCount"),
  todayReminderCount: document.querySelector("#todayReminderCount"),
  elderReminderList: document.querySelector("#elderReminderList"),
  enablePush: document.querySelector("#enablePush"),
  contactCaregiver: document.querySelector("#contactCaregiver"),
  pushStatus: document.querySelector("#pushStatus"),
  medicineName: document.querySelector("#medicineName"),
  medicineTime: document.querySelector("#medicineTime"),
  medicineDose: document.querySelector("#medicineDose"),
  medicineScheduleList: document.querySelector("#medicineScheduleList"),
  travelDestination: document.querySelector("#travelDestination"),
  travelDateTime: document.querySelector("#travelDateTime"),
  travelCareNote: document.querySelector("#travelCareNote"),
  travelPlanList: document.querySelector("#travelPlanList"),
  feishuWebhook: document.querySelector("#feishuWebhook"),
  sendStatus: document.querySelector("#sendStatus"),
  taskTitle: document.querySelector("#taskTitle"),
  taskDate: document.querySelector("#taskDate"),
  taskTime: document.querySelector("#taskTime"),
  taskDescription: document.querySelector("#taskDescription"),
  familyTaskList: document.querySelector("#familyTaskList"),
  elderTaskList: document.querySelector("#elderTaskList"),
  todayTaskCount: document.querySelector("#todayTaskCount"),
  weatherCity: document.querySelector("#weatherCity"),
  weatherDistrict: document.querySelector("#weatherDistrict"),
  weatherCareTime: document.querySelector("#weatherCareTime"),
  weatherCareText: document.querySelector("#weatherCareText"),
  memberName: document.querySelector("#memberName"),
  memberRelation: document.querySelector("#memberRelation"),
  memberRole: document.querySelector("#memberRole"),
  roleTable: document.querySelector("#roleTable"),
};

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: {
        username: els.loginUsername.value.trim(),
        password: els.loginPassword.value,
      },
    });
    els.loginPassword.value = "";
    await loadDashboard();
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

document.querySelector("#logoutRole").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  currentDashboard = null;
  renderLoggedOut();
});

document.querySelector("#loadFraudSample").addEventListener("click", () => {
  els.fraudInput.value = samples.fraud;
  logEvent("已填入社保诈骗示例。");
});

document.querySelector("#loadMemorySample").addEventListener("click", () => {
  els.memoryInput.value = samples.memory;
  logEvent("已填入吃药记录示例。");
});

document.querySelector("#loadTravelSample").addEventListener("click", () => {
  els.travelInput.value = samples.travel;
  logEvent("已填入出行帮助示例。");
});

document.querySelector("#analyzeFraud").addEventListener("click", async () => {
  const text = els.fraudInput.value.trim();
  if (!text) {
    setElderReply("奶奶，您先把可疑短信复制后粘贴到这里，我帮您看看。");
    return;
  }
  const { result } = await api("/api/fraud/check", { method: "POST", body: { text } });
  renderFraudResult(result);
  logEvent(result.score >= 80 ? `短信识别：高危，评分 ${result.score}。` : `短信识别：评分 ${result.score}。`);
  await loadDashboard();
});

document.querySelector("#clearFraud").addEventListener("click", () => {
  els.fraudInput.value = "";
  els.fraudScore.textContent = "--";
  els.fraudMeter.style.width = "0%";
  els.fraudLevel.textContent = "等待检测";
  els.riskReasons.innerHTML = "<li>暂无检测结果</li>";
  setElderReply("复制短信后粘贴到这里，小护会用简单的话说明风险。");
});

document.querySelector("#addMedicineSchedule").addEventListener("click", async () => {
  try {
    await api("/api/medications", {
      method: "POST",
      body: {
        medicineName: els.medicineName.value.trim(),
        timeOfDay: els.medicineTime.value,
        doseNote: els.medicineDose.value.trim(),
      },
    });
    els.medicineName.value = "";
    els.medicineTime.value = "";
    els.medicineDose.value = "";
    logEvent("吃药安排：已保存。");
    await loadDashboard();
  } catch (error) {
    updateSendStatus(error.message, "warning");
  }
});

document.querySelector("#addTravelPlan").addEventListener("click", async () => {
  const title = `出行：${els.travelDestination.value.trim()}`;
  const dateTime = els.travelDateTime.value;
  if (!els.travelDestination.value.trim() || !dateTime) {
    updateSendStatus("请先填写目的地和出行时间。", "warning");
    return;
  }
  await api("/api/tasks", {
    method: "POST",
    body: {
      title,
      description: els.travelCareNote.value.trim(),
      dueDate: dateTime.slice(0, 10),
      dueTime: dateTime.slice(11, 16),
    },
  });
  els.travelDestination.value = "";
  els.travelDateTime.value = "";
  els.travelCareNote.value = "";
  logEvent("出行安排：已保存为今日任务。");
  await loadDashboard();
});

document.querySelector("#addTask").addEventListener("click", async () => {
  try {
    await api("/api/tasks", {
      method: "POST",
      body: {
        title: els.taskTitle.value.trim(),
        description: els.taskDescription.value.trim(),
        dueDate: els.taskDate.value || todayDate(),
        dueTime: els.taskTime.value || "09:00",
      },
    });
    els.taskTitle.value = "";
    els.taskDescription.value = "";
    logEvent("任务安排：已保存。");
    await loadDashboard();
  } catch (error) {
    updateSendStatus(error.message, "warning");
  }
});

document.querySelector("#saveWeather").addEventListener("click", async () => {
  try {
    await api("/api/weather/settings", {
      method: "POST",
      body: {
        city: els.weatherCity.value.trim(),
        district: els.weatherDistrict.value.trim(),
        careTime: els.weatherCareTime.value || "07:30",
      },
    });
    logEvent("天气关怀：地区已保存。");
    await loadDashboard();
  } catch (error) {
    updateSendStatus(error.message, "warning");
  }
});

document.querySelector("#saveFeishu").addEventListener("click", async () => {
  await api("/api/feishu/config", { method: "POST", body: { webhook: els.feishuWebhook.value.trim() } });
  updateSendStatus("飞书地址已保存。", "safe");
});

document.querySelector("#testFeishu").addEventListener("click", async () => {
  const { result } = await api("/api/feishu/test", { method: "POST" });
  updateSendStatus(result.ok ? "测试提醒已发送到飞书。" : `已生成本地提醒，飞书未发送：${result.message}`, result.ok ? "safe" : "warning");
  await loadDashboard();
});

document.querySelector("#saveBloodPressure").addEventListener("click", async () => {
  try {
    await api("/api/blood-pressure", {
      method: "POST",
      body: {
        systolic: els.bpSystolic.value,
        diastolic: els.bpDiastolic.value,
        pulse: els.bpPulse.value,
        note: els.bpNote.value.trim(),
      },
    });
    els.bpSystolic.value = "";
    els.bpDiastolic.value = "";
    els.bpPulse.value = "";
    els.bpNote.value = "";
    logEvent("血压记录：已保存。");
    await loadDashboard();
  } catch (error) {
    els.bpAdvice.textContent = error.message;
    els.bpAdvice.dataset.tone = "warning";
  }
});

document.querySelector("#analyzeCheckup").addEventListener("click", async () => {
  const file = els.checkupImage.files?.[0];
  if (!file) {
    els.checkupAdvice.textContent = "奶奶，您先选择一张体检报告照片，我再帮您整理。";
    els.checkupAdvice.dataset.tone = "warning";
    return;
  }
  try {
    els.checkupAdvice.textContent = "正在分析照片，请稍等一下。";
    els.checkupAdvice.dataset.tone = "pending";
    const imageData = await fileToDataUrl(file);
    const { report } = await api("/api/checkups/analyze", { method: "POST", body: { imageData, fileName: file.name } });
    els.checkupAdvice.innerHTML = renderCheckupAdvice(report);
    els.checkupAdvice.dataset.tone = report.source === "openai" ? "safe" : "warning";
    els.checkupImage.value = "";
    logEvent("体检报告：已上传并生成建议。");
    await loadDashboard();
  } catch (error) {
    els.checkupAdvice.textContent = error.message;
    els.checkupAdvice.dataset.tone = "warning";
  }
});

els.enablePush.addEventListener("click", enableAndroidNotification);
els.contactCaregiver.addEventListener("click", async () => {
  await api("/api/help/contact-caregiver", { method: "POST" });
  updatePushStatus("已提醒家属关注长辈的求助。", "safe");
  await loadDashboard();
});

els.elderTaskList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-complete-task]");
  if (!button) return;
  await api(`/api/tasks/${button.dataset.completeTask}/complete`, { method: "POST", body: { note: "" } });
  await loadDashboard();
});

els.elderReminderList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-complete-medication]");
  if (!button) return;
  await api(`/api/medications/${button.dataset.completeMedication}/complete`, { method: "POST", body: { note: "老人确认已吃药" } });
  await loadDashboard();
});

document.querySelector("#planTravel").addEventListener("click", async () => {
  const query = els.travelInput.value.trim();
  if (!query) {
    els.travelReply.textContent = "奶奶，您告诉我想什么时候、去哪里，我帮您慢慢安排。";
    return;
  }
  const { plan } = await api("/api/travel/plan", { method: "POST", body: { query } });
  els.weatherTrace.textContent = plan.risk_level === "medium" ? "需要留意天气" : "天气平稳";
  els.routeTrace.textContent = plan.route_summary || `前往${plan.destination}`;
  els.travelReply.textContent = plan.reply_for_elder;
  await loadDashboard();
});

document.querySelector("#saveMemory").addEventListener("click", () => {
  els.memoryReply.textContent = "这部分已升级为吃药确认和任务完成记录。日常记录会在下一步接入 SQLite 明细表。";
});

document.querySelector("#askMedication").addEventListener("click", () => {
  const pending = currentDashboard?.medications?.filter((item) => item.status !== "done") || [];
  els.memoryReply.textContent = pending.length
    ? `奶奶，今天还有 ${pending.length} 个吃药提醒没有确认。`
    : "奶奶，今天的吃药提醒都已经确认啦。";
});

document.querySelector("#resetDemo").addEventListener("click", async () => {
  logEvent("当前版本数据在 SQLite 中保存，重置请删除 data/techguard.db 后重启服务。");
});

async function loadDashboard() {
  try {
    currentDashboard = await api("/api/dashboard");
    renderDashboard(currentDashboard);
  } catch {
    renderLoggedOut();
  }
}

function renderDashboard(data) {
  const viewRole = data.user.role === "caregiver" ? "family" : "elder";
  const profile = roleProfile(data.user, data.elder);

  els.loginScreen.classList.add("is-hidden");
  els.appShell.classList.remove("is-hidden");
  els.currentRoleChip.classList.remove("is-hidden");
  els.currentRoleName.textContent = `${data.user.displayName}已登录`;
  els.profileTitle.textContent = profile.title;
  els.profileSubtitle.textContent = profile.subtitle;
  els.workspaceEyebrow.textContent = profile.eyebrow;
  els.overviewTitle.textContent = profile.headline;
  els.overviewCopy.textContent = profile.copy;
  els.sidePanelTitle.textContent = profile.sideTitle;
  els.sidePanelList.innerHTML = profile.sideItems.map((item) => `<li>${item}</li>`).join("");

  document.querySelectorAll("[data-role-view]").forEach((section) => {
    section.classList.toggle("is-hidden", section.dataset.roleView !== viewRole);
  });
  document.querySelectorAll("[data-nav-role]").forEach((item) => {
    const navRole = item.dataset.navRole;
    item.classList.toggle("is-hidden", navRole !== viewRole && navRole !== "shared");
  });

  renderMedications(data.medications);
  renderTasks(data.tasks);
  renderAlerts(data.alerts);
  renderWeather(data.weather, data.weatherCare);
  renderBloodPressure(data.bloodPressure || [], data.bloodPressureSummary);
  renderCheckups(data.checkups || []);
  renderMetrics(data);
  renderMembers(data);
  renderLogs(["已连接 SQLite 后台。"]);
}

function renderLoggedOut() {
  els.loginScreen.classList.remove("is-hidden");
  els.appShell.classList.add("is-hidden");
  els.currentRoleChip.classList.add("is-hidden");
}

function roleProfile(user, elder) {
  if (user.role === "caregiver") {
    return {
      title: user.displayName,
      subtitle: `亲属端 | 正在照护 ${elder.displayName}`,
      eyebrow: "亲属看护台",
      headline: "安排好每天的小事，长辈打开手机就知道该做什么。",
      copy: "设置吃药、任务、天气和出行提醒，完成情况会回到这里。",
      sideTitle: "今日看护",
      sideItems: ["设置吃药时间", "安排今日任务", "查看完成情况", "配置飞书提醒"],
    };
  }
  return {
    title: user.displayName,
    subtitle: "老人端 | 今日提醒、短信识别、出行帮助",
    eyebrow: "长辈工作台",
    headline: "今天该做的事，都放在这里。",
    copy: "看吃药、做任务、查短信、问出行，不用找很多地方。",
    sideTitle: "今日提醒",
    sideItems: ["按时吃药", "完成家人任务", "出门看天气", "可疑短信先粘贴识别"],
  };
}

function renderMedications(items) {
  const count = items.length;
  els.todayReminderCount.textContent = `${count} 项`;
  if (!count) {
    els.elderReminderList.innerHTML = '<p class="muted">暂无吃药提醒。</p>';
    els.medicineScheduleList.innerHTML = '<p class="muted">暂无吃药提醒。</p>';
    return;
  }
  els.elderReminderList.innerHTML = items
    .map(
      (item) => `
      <article class="reminder-item">
        <div>
          <strong>${item.time_of_day} · ${item.medicine_name}</strong>
          <span>${item.dose_note || "按家人设置服用"} · ${statusLabel(item.status)}</span>
        </div>
        ${item.status === "done" ? "" : `<button class="primary-button" type="button" data-complete-medication="${item.log_id}">我已吃药</button>`}
      </article>`
    )
    .join("");
  els.medicineScheduleList.innerHTML = items
    .map(
      (item) => `
      <article class="reminder-item">
        <div>
          <strong>${item.time_of_day} · ${item.medicine_name}</strong>
          <span>${item.dose_note || "无额外说明"} · ${statusLabel(item.status)}</span>
        </div>
      </article>`
    )
    .join("");
}

function renderTasks(items) {
  els.todayTaskCount.textContent = `${items.length} 项`;
  const empty = '<p class="muted">暂无今日任务。</p>';
  if (!items.length) {
    els.elderTaskList.innerHTML = empty;
    els.familyTaskList.innerHTML = empty;
    return;
  }
  const html = items
    .map(
      (item) => `
      <article class="reminder-item">
        <div>
          <strong>${item.due_time} · ${item.title}</strong>
          <span>${item.description || "无额外说明"} · ${statusLabel(item.status)}</span>
        </div>
        ${item.status === "done" ? "" : `<button class="primary-button" type="button" data-complete-task="${item.id}">完成了</button>`}
      </article>`
    )
    .join("");
  els.elderTaskList.innerHTML = html;
  els.familyTaskList.innerHTML = html.replaceAll("data-complete-task", "data-read-task");
}

function renderAlerts(alerts) {
  els.alertCount.textContent = alerts.length;
  if (!alerts.length) {
    els.alertState.textContent = "未触发";
    els.childAlert.classList.remove("active");
    els.childAlert.textContent = "暂无告警。";
    return;
  }
  const latest = alerts[0];
  els.alertState.textContent = "有提醒";
  els.childAlert.classList.add("active");
  els.childAlert.textContent = `${latest.title}\n${formatTime(latest.created_at)}\n\n${latest.message}`;
}

function renderWeather(weather, care) {
  if (weather) {
    els.weatherCity.value = weather.city || "";
    els.weatherDistrict.value = weather.district || "";
    els.weatherCareTime.value = weather.care_time || "07:30";
  }
  els.weatherCareText.textContent = care?.text || "设置地区后会生成适合长辈看的天气提醒。";
}

function renderMetrics(data) {
  els.fraudCount.textContent = data.alerts.filter((item) => item.type === "fraud").length;
  els.memoryCount.textContent = (data.bloodPressure || []).length;
}

function renderMembers(data) {
  els.roleTable.innerHTML = `
    <tr><td>${data.user.displayName}</td><td>${data.user.role === "caregiver" ? "亲属" : "本人"}</td><td><span class="role-tag">${data.user.role === "caregiver" ? "亲属" : "长辈"}</span></td><td>${data.user.role === "caregiver" ? "配置和查看" : "查看和确认"}</td></tr>
    <tr><td>${data.elder.displayName}</td><td>老人</td><td><span class="role-tag">长辈</span></td><td>今日提醒、短信识别、出行帮助</td></tr>
  `;
  els.memoryTable.innerHTML = renderReportRows(data);
  els.familyMemoryTable.innerHTML = renderReportRows(data);
}

function renderReportRows(data) {
  const rows = [
    ["吃药", `今日 ${data.medications.length} 项`, `${data.medications.filter((item) => item.status === "done").length} 项已完成`, "SQLite"],
    ["任务", `今日 ${data.tasks.length} 项`, `${data.tasks.filter((item) => item.status === "done").length} 项已完成`, "SQLite"],
    ["血压", `累计 ${(data.bloodPressure || []).length} 次`, data.bloodPressureSummary?.label || "未记录", "健康档案"],
    ["体检", `累计 ${(data.checkups || []).length} 份`, data.checkups?.[0]?.summary || "未上传", "报告分析"],
    ["天气", data.weather?.city || "未设置", data.weatherCare?.text || "无", "天气关怀"],
  ];
  return rows.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`).join("");
}

function renderBloodPressure(items, summary) {
  const advice = summary?.advice || "量完血压后记在这里，我会帮您看今天有没有需要留意的变化。";
  const label = summary?.label || "未记录";
  els.bpState.textContent = label;
  els.bpAdvice.textContent = summary?.latest ? `${label}：${advice}` : advice;
  els.bpAdvice.dataset.tone = summary?.level === "danger" || summary?.level === "warning" ? "warning" : "safe";
  els.familyBpAdvice.textContent = summary?.latest
    ? `最近一次 ${summary.latest.systolic}/${summary.latest.diastolic} mmHg。${advice}`
    : "暂无血压记录。";
  els.familyBpAdvice.dataset.tone = summary?.level === "danger" || summary?.level === "warning" ? "warning" : "safe";
  const rows = items
    .slice()
    .reverse()
    .map(
      (item) => `
      <tr>
        <td>${formatTime(item.measured_at)}</td>
        <td>${item.systolic}/${item.diastolic} mmHg</td>
        <td>${item.pulse ? `${item.pulse} 次/分` : "未填"}</td>
        <td>${escapeHtml(item.note || "无")}</td>
      </tr>`
    )
    .join("");
  const empty = '<tr><td colspan="4">暂无血压记录</td></tr>';
  els.bpList.innerHTML = rows || empty;
  els.familyBpList.innerHTML = rows || empty;
  drawBloodPressureChart(els.bpChart, items);
  drawBloodPressureChart(els.familyBpChart, items);
}

function drawBloodPressureChart(canvas, items) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdfb";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d8e1dd";
  ctx.lineWidth = 1;
  const pad = 36;
  for (let i = 0; i < 4; i += 1) {
    const y = pad + ((height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
  if (!items.length) {
    ctx.fillStyle = "#65736d";
    ctx.font = "16px sans-serif";
    ctx.fillText("暂无血压曲线", pad, height / 2);
    return;
  }
  const points = items.slice(-14);
  const values = points.flatMap((item) => [item.systolic, item.diastolic]);
  const max = Math.max(160, ...values) + 10;
  const min = Math.min(50, ...values) - 5;
  const xFor = (index) => pad + (points.length === 1 ? 0 : ((width - pad * 2) * index) / (points.length - 1));
  const yFor = (value) => height - pad - ((value - min) / (max - min)) * (height - pad * 2);
  drawLine(ctx, points.map((item, index) => [xFor(index), yFor(item.systolic)]), "#b42318");
  drawLine(ctx, points.map((item, index) => [xFor(index), yFor(item.diastolic)]), "#0b665b");
  ctx.fillStyle = "#b42318";
  ctx.fillRect(width - 168, 16, 12, 12);
  ctx.fillStyle = "#17211d";
  ctx.font = "13px sans-serif";
  ctx.fillText("高压", width - 150, 27);
  ctx.fillStyle = "#0b665b";
  ctx.fillRect(width - 98, 16, 12, 12);
  ctx.fillStyle = "#17211d";
  ctx.fillText("低压", width - 80, 27);
}

function drawLine(ctx, points, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  points.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderCheckups(items) {
  if (!items.length) {
    els.familyCheckupList.innerHTML = '<p class="muted">暂无体检报告分析。</p>';
    return;
  }
  els.familyCheckupList.innerHTML = items
    .map(
      (item) => `
      <article class="report-item">
        <strong>${escapeHtml(item.file_name || "体检报告")} · ${formatTime(item.created_at)}</strong>
        <span>${escapeHtml(item.summary)}</span>
        <small>来源：${item.source === "openai" ? "图片分析" : "本地建议"} · ${escapeHtml(item.risk_level)}</small>
      </article>`
    )
    .join("");
}

function renderCheckupAdvice(report) {
  const suggestions = report.suggestions?.length ? report.suggestions : ["请让家人或医生查看原报告。"];
  return `
    <strong>${escapeHtml(report.summary)}</strong>
    <ul>${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <small>${escapeHtml(report.disclaimer || "仅作健康管理提示，不替代医生诊断。")}</small>
  `;
}

function renderFraudResult(result) {
  els.fraudScore.textContent = result.score;
  els.fraudMeter.style.width = `${result.score}%`;
  els.fraudMeter.style.background = result.score >= 80 ? "var(--danger)" : result.score >= 41 ? "var(--warn)" : "var(--safe)";
  els.fraudLevel.textContent = `${result.level} · ${result.type}`;
  els.riskReasons.innerHTML = result.reasons.length ? result.reasons.map((reason) => `<li>${reason}</li>`).join("") : "<li>没有命中明显高危特征。</li>";
  setElderReply(result.reply_for_elder);
}

async function enableAndroidNotification() {
  if (!("Notification" in window)) {
    updatePushStatus("当前浏览器不支持通知。建议使用安卓 Chrome。", "warning");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    updatePushStatus("通知权限没有开启，无法弹出安卓提醒。", "warning");
    return;
  }
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/sw.js").catch(() => null);
  }
  await api("/api/push/subscribe", {
    method: "POST",
    body: { endpoint: "local-demo", p256dh: "", auth: "", userAgent: navigator.userAgent },
  });
  new Notification("TechGuard 手机提醒已开启", { body: "吃药和出行提醒会优先在这里显示。" });
  updatePushStatus("手机提醒已开启。当前版本已保存订阅，后台 Web Push 发送将在下一步接入。", "safe");
}

function setElderReply(message) {
  els.elderReply.textContent = message;
}

function updateSendStatus(message, tone) {
  els.sendStatus.textContent = message;
  els.sendStatus.dataset.tone = tone;
}

function updatePushStatus(message, tone) {
  els.pushStatus.textContent = message;
  els.pushStatus.dataset.tone = tone;
}

function renderLogs(logs) {
  els.eventLog.innerHTML = logs.map((item) => `<li>${item}</li>`).join("");
}

function logEvent(message) {
  renderLogs([`${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${message}`]);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 4_000_000) {
      reject(new Error("图片太大，请先裁剪或压缩到 4MB 以内。"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片失败，请重新选择照片。"));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || "请求失败");
  return data;
}

function statusLabel(status) {
  if (status === "done") return "已完成";
  if (status === "missed") return "已错过";
  return "待完成";
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "";
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

els.taskDate.value = todayDate();
loadDashboard();
