const samples = {
  fraud: "【社保中心】通知：您的社保卡由于在异地异常消费5000元已被冻结，请立即点击链接 shb-gov.icu 或回复验证码解冻。",
  memory: "我今天早上八点半吃过降压药了。",
  travel: "我要去医院复查，不知道怎么走。",
};

let currentDashboard = null;
let currentLang = getInitialLanguage();

const i18nPairs = [
  ["银发守护服务台", "Senior Care Console"],
  ["服务运行中", "Service online"],
  ["通知中心", "Notification Center"],
  ["全部已读", "Mark all read"],
  ["暂无通知。", "No notifications yet."],
  ["未登录", "Not signed in"],
  ["切换", "Switch"],
  ["账号登录", "Sign in"],
  ["家人长辈分开登录", "Family and senior sign-in"],
  ["家属负责设置吃药、任务和天气关怀，长辈登录后只看今天该做什么。", "Family members set medication, tasks, and weather care. Seniors only see what they need today."],
  ["登录名", "Username"],
  ["密码", "Password"],
  ["登录", "Sign in"],
  ["家属端：caregiver / demo1234", "Family account: caregiver / demo1234"],
  ["长辈端：elder / demo1234", "Senior account: elder / demo1234"],
  ["服务导航", "Service navigation"],
  ["护", "Care"],
  ["张爷爷", "Grandpa Zhang"],
  ["独居老人 · 子女联系人：小丽", "Living alone · Family contact: Lily"],
  ["防骗检测", "Fraud Check"],
  ["血压记录", "Blood Pressure"],
  ["体检分析", "Checkup Review"],
  ["生活记录", "Daily Records"],
  ["出行帮助", "Travel Help"],
  ["告警中心", "Alert Center"],
  ["提醒配置", "Care Setup"],
  ["任务安排", "Tasks"],
  ["天气关怀", "Weather Care"],
  ["健康档案", "Health Records"],
  ["照护记录", "Care Logs"],
  ["成员管理", "Members"],
  ["操作日志", "Activity Log"],
  ["今日守护事项", "Today’s Care Items"],
  ["可疑短信先检测", "Check suspicious messages first"],
  ["吃药、血压随手记", "Record medication and blood pressure"],
  ["出门路线慢慢看", "Review travel routes slowly"],
  ["危险情况自动提醒家人", "Alert family when risk appears"],
  ["长辈工作台", "Senior Workspace"],
  ["今日提醒清单", "Today’s Reminders"],
  ["查看家人设置的提醒，遇到可疑消息和出门安排时从这里处理。", "Review family-set reminders, suspicious messages, and travel plans here."],
  ["高危识别", "High-risk checks"],
  ["告警生成", "Alerts"],
  ["记忆记录", "Records"],
  ["家人设置", "Family setup"],
  ["今日提醒", "Today’s Reminders"],
  ["暂无家人设置的提醒。", "No family reminders yet."],
  ["开启手机提醒", "Enable phone alerts"],
  ["一键联系家属", "Contact family"],
  ["安卓手机建议使用 Chrome 打开并允许通知。", "On Android, use Chrome and allow notifications."],
  ["防骗守护", "Fraud Protection"],
  ["短信粘贴识别", "Paste SMS to check"],
  ["填入示例", "Use sample"],
  ["复制短信后粘贴到这里", "Paste the suspicious SMS here"],
  ["开始检测", "Check now"],
  ["清空", "Clear"],
  ["欺诈评分", "Fraud score"],
  ["等待检测", "Waiting"],
  ["给老人的回复", "Senior-friendly reply"],
  ["输入内容后，小护会用老人听得懂的话说明风险。", "After you paste a message, the assistant explains the risk in simple words."],
  ["风险原因", "Risk reasons"],
  ["暂无检测结果", "No result yet"],
  ["健康记录", "Health Record"],
  ["血压测量", "Blood pressure"],
  ["未记录", "No record"],
  ["高压", "Systolic"],
  ["低压", "Diastolic"],
  ["心率", "Pulse"],
  ["备注", "Note"],
  ["保存血压", "Save blood pressure"],
  ["记录后会显示血压判断和最近趋势。若身体不舒服，请优先联系家人或医生。", "After saving, the app shows a blood pressure assessment and recent trend. If unwell, contact family or a doctor first."],
  ["时间", "Time"],
  ["高压/低压", "Systolic/Diastolic"],
  ["暂无血压记录", "No blood pressure records"],
  ["体检报告分析", "Checkup Report Review"],
  ["拍照上传", "Photo upload"],
  ["拍下体检报告清晰的一页，系统会整理重点项目和建议。分析结果只做健康管理提醒，不能替代医生诊断。", "Upload a clear photo of one checkup report page. The app summarizes key items and suggestions. This is for care reminders only, not medical diagnosis."],
  ["体检报告照片", "Checkup report photo"],
  ["上传并分析", "Upload and review"],
  ["请选择一张清晰照片，上传后会在这里显示建议，也会提醒家属查看。", "Choose a clear photo. Suggestions will appear here and family will be notified."],
  ["亲属看护", "Family Care"],
  ["未触发", "None"],
  ["长辈端遇到高危可疑信息后，这里会生成给亲属的紧急提醒。", "When the senior checks a high-risk message, urgent family alerts appear here."],
  ["暂无告警。请先运行一条高危反诈测试。", "No alerts yet. Try a high-risk fraud sample first."],
  ["手机看护配置", "Mobile Care Setup"],
  ["吃药与出行提醒", "Medication and travel reminders"],
  ["手机优先", "Mobile-first"],
  ["看护人员可以在手机上设置长辈的吃药时间和出行安排。到点或手动发送时，系统会生成亲属提醒，并尝试推送到飞书。", "Caregivers can set medication times and travel plans on mobile. At the scheduled time or by manual send, the app creates family alerts and sends them to Feishu."],
  ["吃药提醒", "Medication reminder"],
  ["药品名称", "Medicine"],
  ["用药时间", "Time"],
  ["说明", "Instructions"],
  ["保存吃药提醒", "Save medication reminder"],
  ["出行看护", "Travel care"],
  ["目的地", "Destination"],
  ["出行时间", "Travel time"],
  ["保存出行提醒", "Save travel reminder"],
  ["手动发送飞书提醒", "Send Feishu reminder manually"],
  ["看护人员可以直接写一段提醒，发送到家人飞书群。机器人地址由后台环境变量管理，页面不再展示。", "Caregivers can write a reminder and send it to the family Feishu group. The bot configuration is kept on the server."],
  ["提醒内容", "Reminder message"],
  ["出行提醒", "Travel reminder"],
  ["健康提醒", "Health reminder"],
  ["发送到飞书群", "Send to Feishu group"],
  ["尚未发送提醒。", "No reminder sent yet."],
  ["吃药计划", "Medication plan"],
  ["暂无吃药提醒。", "No medication reminders."],
  ["出行计划", "Travel plan"],
  ["暂无出行提醒。", "No travel reminders."],
  ["日常安排", "Daily Plan"],
  ["给奶奶下达任务", "Assign tasks"],
  ["完成可追踪", "Trackable"],
  ["任务", "Task"],
  ["日期", "Date"],
  ["保存任务", "Save task"],
  ["暂无任务。", "No tasks yet."],
  ["设置奶奶所在地区", "Set the senior’s location"],
  ["每日生成", "Daily care"],
  ["城市", "City"],
  ["区县", "District"],
  ["关怀时间", "Care time"],
  ["保存天气关怀", "Save weather care"],
  ["今日天气关怀", "Today’s weather care"],
  ["设置地区后会生成适合奶奶看的天气提醒。", "After setting the location, the app creates easy weather care messages."],
  ["血压与体检结果", "Blood pressure and checkup results"],
  ["亲属查看", "Family view"],
  ["暂无体检报告分析。", "No checkup report reviews."],
  ["生活照护", "Daily Care"],
  ["生活事件记录", "Daily event records"],
  ["填入吃药样例", "Use medication sample"],
  ["老人说的话", "What the senior said"],
  ["提取并记录", "Extract and record"],
  ["问：今天吃药了吗", "Ask: medication today?"],
  ["小护回复", "Assistant reply"],
  ["记录后再查询，小护会先看历史记录，再回答老人。", "After saving records, the assistant checks history before answering."],
  ["类型", "Type"],
  ["事件", "Event"],
  ["记录方式", "Source"],
  ["暂无记忆记录", "No records yet"],
  ["家人安排", "Family tasks"],
  ["今日任务", "Today’s Tasks"],
  ["暂无今日任务。", "No tasks today."],
  ["安心出门", "Safer Travel"],
  ["出行规划", "Travel planning"],
  ["填入出行样例", "Use travel sample"],
  ["老人出行需求", "Travel request"],
  ["生成建议", "Generate advice"],
  ["天气情况", "Weather"],
  ["待调用", "Waiting"],
  ["路线建议", "Route"],
  ["小护会优先给少换乘、少走路、好理解的路线。", "The assistant prefers fewer transfers, less walking, and simple instructions."],
  ["长辈生活动态", "Senior daily updates"],
  ["只读查看", "Read only"],
  ["亲属可以查看长辈端保存的用药、血压、吃饭和出门记录，但不能替长辈编造记录。", "Family can view medication, blood pressure, meals, and travel records saved by the senior, but cannot create fake senior records."],
  ["暂无照护记录", "No care records yet"],
  ["家庭成员", "Family Members"],
  ["角色与权限", "Roles and access"],
  ["亲属可设置", "Family can manage"],
  ["姓名", "Name"],
  ["关系", "Relationship"],
  ["角色", "Role"],
  ["长辈", "Senior"],
  ["亲属", "Family"],
  ["添加成员", "Add member"],
  ["成员", "Member"],
  ["可使用功能", "Access"],
  ["通知偏好", "Notification Preferences"],
  ["提醒开关", "Notification switches"],
  ["可单独关闭", "Optional"],
  ["勾选要接收的通知类型，取消勾选可暂时不打扰。飞书开关控制是否推送到飞书群。", "Choose which alerts to receive. The Feishu switch controls group notifications."],
  ["新任务安排", "New task"],
  ["任务到点提醒", "Task due reminder"],
  ["任务已完成", "Task completed"],
  ["吃药已确认", "Medication confirmed"],
  ["血压已记录", "Blood pressure recorded"],
  ["血压异常", "Abnormal blood pressure"],
  ["一键求助", "Help request"],
  ["飞书推送", "Feishu push"],
  ["保存偏好", "Save preferences"],
  ["使用记录", "Activity"],
  ["重置演示数据", "Reset demo data"],
  ["等待开始使用。", "Waiting to start."],
  ["0 项", "0 items"],
  ["例如：降压药", "Example: blood pressure medicine"],
  ["例如：饭后，一片", "Example: after meals, one tablet"],
  ["例如：市大剧院", "Example: City Theater"],
  ["例如：地铁2号线，少换乘", "Example: subway line 2, fewer transfers"],
  ["例如：奶奶今天 21:00 需要服用缬沙坦，麻烦家人留意一下。", "Example: Grandma needs valsartan at 21:00. Please keep an eye on it."],
  ["例如：下午量血压", "Example: measure blood pressure this afternoon"],
  ["例如：量完告诉我结果", "Example: tell me after measuring"],
  ["例如：上海", "Example: Shanghai"],
  ["例如：浦东新区", "Example: Pudong"],
  ["例如：我今天早上八点半吃过降压药了", "Example: I took my blood pressure medicine at 8:30 this morning"],
  ["例如：明天闺女让我去大剧院一趟，我不知道明天天气怎么样，也不知道怎么坐车去啊。", "Example: My daughter asked me to go to the theater tomorrow. I do not know the weather or how to get there."],
  ["例如：王阿姨", "Example: Ms. Wang"],
  ["例如：护工", "Example: caregiver"],
  ["网页不能自动读取手机短信。请把可疑短信复制后粘贴到这里。", "The web app cannot read phone SMS automatically. Please copy and paste suspicious messages here."],
  ["caregiver 或 elder", "caregiver or elder"],
];

const zhToEn = new Map(i18nPairs);
const enToZh = new Map(i18nPairs.map(([zh, en]) => [en, zh]));

const copy = {
  zh: {
    languageButton: "English",
    loggedIn: (name) => `${name}已登录`,
    caregiverProfile: (name, elderName) => ({
      title: name,
      subtitle: `亲属端 | 正在照护 ${elderName}`,
      eyebrow: "亲属看护台",
      headline: "今日看护安排",
      copy: "设置吃药、任务、天气和出行提醒，完成情况会回到这里。",
      sideTitle: "今日看护",
      sideItems: ["设置吃药时间", "安排今日任务", "查看完成情况", "配置飞书提醒"],
    }),
    elderProfile: (name) => ({
      title: name,
      subtitle: "老人端 | 今日提醒、短信识别、出行帮助",
      eyebrow: "长辈工作台",
      headline: "今日提醒清单",
      copy: "看吃药、做任务、查短信、问出行，不用找很多地方。",
      sideTitle: "今日提醒",
      sideItems: ["按时吃药", "完成家人任务", "出门看天气", "可疑短信先粘贴识别"],
    }),
    items: (count) => `${count} 项`,
    noMedication: "暂无吃药提醒。",
    noTask: "暂无今日任务。",
    noAlert: "暂无告警。",
    hasAlert: "有提醒",
    defaultDose: "按家人设置服用",
    noExtra: "无额外说明",
    completedMedication: "我已吃药",
    completedTask: "完成了",
    statusDone: "已完成",
    statusMissed: "已错过",
    statusPending: "待完成",
    roleFamily: "亲属",
    roleSelf: "本人",
    roleSenior: "长辈",
    accessFamily: "配置和查看",
    accessSenior: "查看和确认",
    seniorAccess: "今日提醒、短信识别、出行帮助",
    reportRows: {
      medication: "吃药",
      today: (count) => `今日 ${count} 项`,
      done: (count) => `${count} 项已完成`,
      reminder: "提醒确认",
      task: "任务",
      arranged: "家人安排",
      bp: "血压",
      totalTimes: (count) => `累计 ${count} 次`,
      healthFile: "健康档案",
      checkup: "体检",
      totalReports: (count) => `累计 ${count} 份`,
      notUploaded: "未上传",
      reportReview: "报告分析",
      weather: "天气",
      unset: "未设置",
      none: "无",
      weatherCare: "天气关怀",
    },
    noBp: "暂无血压记录。",
    pulseUnit: (pulse) => `${pulse} 次/分`,
    notFilled: "未填",
    empty: "无",
    noBpCurve: "暂无血压曲线",
    systolic: "高压",
    diastolic: "低压",
    noCheckups: "暂无体检报告分析。",
    reportName: "体检报告",
    analysisMode: (source, risk) => `分析方式：${source === "openai" ? "图片整理" : "基础建议"} · ${risk}`,
    fallbackSuggestion: "请让家人或医生查看原报告。",
    disclaimer: "仅作健康管理提示，不替代医生诊断。",
    noRisk: "没有命中明显高危特征。",
    notificationSaved: "通知偏好已保存。",
  },
  en: {
    languageButton: "中文",
    loggedIn: (name) => `${name} signed in`,
    caregiverProfile: (name, elderName) => ({
      title: name,
      subtitle: `Family view | Caring for ${elderName}`,
      eyebrow: "Family Care Desk",
      headline: "Today’s Care Plan",
      copy: "Set medication, tasks, weather care, and travel reminders. Progress comes back here.",
      sideTitle: "Today’s Care",
      sideItems: ["Set medication times", "Assign today’s tasks", "Review completion", "Send Feishu alerts"],
    }),
    elderProfile: (name) => ({
      title: name,
      subtitle: "Senior view | Reminders, SMS safety, travel help",
      eyebrow: "Senior Workspace",
      headline: "Today’s Reminders",
      copy: "Medication, tasks, suspicious SMS checks, and travel help are all in one place.",
      sideTitle: "Today’s Reminders",
      sideItems: ["Take medicine on time", "Finish family tasks", "Check weather before going out", "Paste suspicious SMS first"],
    }),
    items: (count) => `${count} item${count === 1 ? "" : "s"}`,
    noMedication: "No medication reminders.",
    noTask: "No tasks today.",
    noAlert: "No alerts yet.",
    hasAlert: "Alert active",
    defaultDose: "Take as family set",
    noExtra: "No extra notes",
    completedMedication: "Taken",
    completedTask: "Done",
    statusDone: "Done",
    statusMissed: "Missed",
    statusPending: "Pending",
    roleFamily: "Family",
    roleSelf: "Self",
    roleSenior: "Senior",
    accessFamily: "Configure and review",
    accessSenior: "View and confirm",
    seniorAccess: "Reminders, SMS checks, travel help",
    reportRows: {
      medication: "Medication",
      today: (count) => `Today: ${count}`,
      done: (count) => `${count} done`,
      reminder: "Reminder confirmation",
      task: "Tasks",
      arranged: "Family assigned",
      bp: "Blood pressure",
      totalTimes: (count) => `${count} records`,
      healthFile: "Health file",
      checkup: "Checkup",
      totalReports: (count) => `${count} reports`,
      notUploaded: "Not uploaded",
      reportReview: "Report review",
      weather: "Weather",
      unset: "Not set",
      none: "None",
      weatherCare: "Weather care",
    },
    noBp: "No blood pressure records.",
    pulseUnit: (pulse) => `${pulse} bpm`,
    notFilled: "Not entered",
    empty: "None",
    noBpCurve: "No blood pressure chart",
    systolic: "Systolic",
    diastolic: "Diastolic",
    noCheckups: "No checkup report reviews.",
    reportName: "Checkup report",
    analysisMode: (source, risk) => `Analysis: ${source === "openai" ? "image review" : "basic advice"} · ${risk}`,
    fallbackSuggestion: "Please ask family or a doctor to review the original report.",
    disclaimer: "For care management only. Not a medical diagnosis.",
    noRisk: "No obvious high-risk signs found.",
    notificationSaved: "Notification preferences saved.",
  },
};

const els = {
  appShell: document.querySelector("#appShell"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  languageToggle: document.querySelector("#languageToggle"),
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
  feishuMessage: document.querySelector("#feishuMessage"),
  sendFeishuMessage: document.querySelector("#sendFeishuMessage"),
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
  notifBell: document.querySelector("#notifBell"),
  notifBadge: document.querySelector("#notifBadge"),
  notifDropdown: document.querySelector("#notifDropdown"),
  notifList: document.querySelector("#notifList"),
  prefGrid: document.querySelector("#prefGrid"),
  toastContainer: document.querySelector("#toastContainer"),
};

function getInitialLanguage() {
  const queryLang = new URLSearchParams(window.location.search).get("lang");
  const hashLang = window.location.hash === "#/en" ? "en" : "";
  const savedLang = localStorage.getItem("techguard_lang");
  return queryLang === "en" || hashLang === "en" || savedLang === "en" ? "en" : "zh";
}

function activeCopy() {
  return copy[currentLang] || copy.zh;
}

function displayNameFor(name) {
  if (currentLang !== "en") return name;
  const demoNames = {
    家属账号: "Family Account",
    长辈账号: "Senior Account",
    胡钧桐: "Family Account",
    胡钧桐奶奶: "Grandma",
  };
  return demoNames[name] || name;
}

function translateValue(value) {
  const text = String(value || "").trim();
  if (!text) return value;
  return currentLang === "en" ? zhToEn.get(text) || value : enToZh.get(text) || value;
}

function translateTextNodes(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest("script, style, textarea")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const translated = translateValue(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  });
}

function translateAttributes(root = document) {
  root.querySelectorAll("[placeholder], [aria-label]").forEach((node) => {
    ["placeholder", "aria-label"].forEach((attr) => {
      if (!node.hasAttribute(attr)) return;
      const translated = translateValue(node.getAttribute(attr));
      if (translated !== node.getAttribute(attr)) node.setAttribute(attr, translated);
    });
  });
}

function applyLanguage() {
  document.documentElement.lang = currentLang === "en" ? "en" : "zh-CN";
  document.title = currentLang === "en" ? "TechGuard Senior Care Console" : "TechGuard 银发守护服务台";
  if (els.languageToggle) els.languageToggle.textContent = activeCopy().languageButton;
  translateTextNodes();
  translateAttributes();
}

function setLanguage(nextLang) {
  currentLang = nextLang === "en" ? "en" : "zh";
  localStorage.setItem("techguard_lang", currentLang);
  const url = new URL(window.location.href);
  if (currentLang === "en") url.searchParams.set("lang", "en");
  else url.searchParams.delete("lang");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  if (currentDashboard) renderDashboard(currentDashboard);
  else renderLoggedOut();
  applyLanguage();
}

els.languageToggle?.addEventListener("click", () => {
  setLanguage(currentLang === "en" ? "zh" : "en");
});

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

document.querySelectorAll("[data-feishu-template]").forEach((button) => {
  button.addEventListener("click", () => {
    const templates = {
      medication: "奶奶今天 21:00 需要服用缬沙坦，麻烦家人留意一下。",
      travel: "奶奶准备从四惠东去朝阳公园，请家人关注出发和到达时间。",
      health: "奶奶刚记录了血压，请家人稍后看一下健康档案里的最新结果。",
    };
    els.feishuMessage.value = templates[button.dataset.feishuTemplate] || "";
    updateSendStatus("已填入常用提醒，可以修改后发送。", "pending");
  });
});

els.sendFeishuMessage.addEventListener("click", async () => {
  const message = els.feishuMessage.value.trim();
  if (!message) {
    updateSendStatus("请先填写要发送到飞书群的提醒内容。", "warning");
    return;
  }
  try {
    updateSendStatus("正在发送到飞书群...", "pending");
    const { result } = await api("/api/feishu/send", { method: "POST", body: { message } });
    updateSendStatus(result.ok ? "已发送到飞书群。" : `发送失败：${result.message}`, result.ok ? "safe" : "warning");
    if (result.ok) els.feishuMessage.value = "";
    await loadDashboard();
  } catch (error) {
    updateSendStatus(error.message, "warning");
  }
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
  els.memoryReply.textContent = "这部分已整理到今日吃药确认和任务完成记录里，家人可以在照护动态中查看。";
});

document.querySelector("#askMedication").addEventListener("click", () => {
  const pending = currentDashboard?.medications?.filter((item) => item.status !== "done") || [];
  els.memoryReply.textContent = pending.length
    ? `奶奶，今天还有 ${pending.length} 个吃药提醒没有确认。`
    : "奶奶，今天的吃药提醒都已经确认啦。";
});

document.querySelector("#resetDemo").addEventListener("click", async () => {
  logEvent("演示数据已保留，刷新页面后可以继续体验。");
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
  els.currentRoleName.textContent = activeCopy().loggedIn(displayNameFor(data.user.displayName));
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
  renderLogs(["已连接照护服务。"]);
  applyLanguage();
}

function renderLoggedOut() {
  els.loginScreen.classList.remove("is-hidden");
  els.appShell.classList.add("is-hidden");
  els.currentRoleChip.classList.add("is-hidden");
}

function roleProfile(user, elder) {
  if (user.role === "caregiver") {
    return activeCopy().caregiverProfile(displayNameFor(user.displayName), displayNameFor(elder.displayName));
  }
  return activeCopy().elderProfile(displayNameFor(user.displayName));
}

function renderMedications(items) {
  const count = items.length;
  els.todayReminderCount.textContent = activeCopy().items(count);
  if (!count) {
    els.elderReminderList.innerHTML = `<p class="muted">${activeCopy().noMedication}</p>`;
    els.medicineScheduleList.innerHTML = `<p class="muted">${activeCopy().noMedication}</p>`;
    return;
  }
  els.elderReminderList.innerHTML = items
    .map(
      (item) => `
      <article class="reminder-item">
        <div>
          <strong>${item.time_of_day} · ${item.medicine_name}</strong>
          <span>${item.dose_note || activeCopy().defaultDose} · ${statusLabel(item.status)}</span>
        </div>
        ${item.status === "done" ? "" : `<button class="primary-button" type="button" data-complete-medication="${item.log_id}">${activeCopy().completedMedication}</button>`}
      </article>`
    )
    .join("");
  els.medicineScheduleList.innerHTML = items
    .map(
      (item) => `
      <article class="reminder-item">
        <div>
          <strong>${item.time_of_day} · ${item.medicine_name}</strong>
          <span>${item.dose_note || activeCopy().noExtra} · ${statusLabel(item.status)}</span>
        </div>
      </article>`
    )
    .join("");
}

function renderTasks(items) {
  els.todayTaskCount.textContent = activeCopy().items(items.length);
  const empty = `<p class="muted">${activeCopy().noTask}</p>`;
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
          <span>${item.description || activeCopy().noExtra} · ${statusLabel(item.status)}</span>
        </div>
        ${item.status === "done" ? "" : `<button class="primary-button" type="button" data-complete-task="${item.id}">${activeCopy().completedTask}</button>`}
      </article>`
    )
    .join("");
  els.elderTaskList.innerHTML = html;
  els.familyTaskList.innerHTML = html.replaceAll("data-complete-task", "data-read-task");
}

function renderAlerts(alerts) {
  els.alertCount.textContent = alerts.length;
  if (!alerts.length) {
    els.alertState.textContent = translateValue("未触发");
    els.childAlert.classList.remove("active");
    els.childAlert.textContent = activeCopy().noAlert;
    return;
  }
  const latest = alerts[0];
  els.alertState.textContent = activeCopy().hasAlert;
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
    <tr><td>${displayNameFor(data.user.displayName)}</td><td>${data.user.role === "caregiver" ? activeCopy().roleFamily : activeCopy().roleSelf}</td><td><span class="role-tag">${data.user.role === "caregiver" ? activeCopy().roleFamily : activeCopy().roleSenior}</span></td><td>${data.user.role === "caregiver" ? activeCopy().accessFamily : activeCopy().accessSenior}</td></tr>
    <tr><td>${displayNameFor(data.elder.displayName)}</td><td>${activeCopy().roleSenior}</td><td><span class="role-tag">${activeCopy().roleSenior}</span></td><td>${activeCopy().seniorAccess}</td></tr>
  `;
  els.memoryTable.innerHTML = renderReportRows(data);
  els.familyMemoryTable.innerHTML = renderReportRows(data);
}

function renderReportRows(data) {
  const labels = activeCopy().reportRows;
  const rows = [
    [labels.medication, labels.today(data.medications.length), labels.done(data.medications.filter((item) => item.status === "done").length), labels.reminder],
    [labels.task, labels.today(data.tasks.length), labels.done(data.tasks.filter((item) => item.status === "done").length), labels.arranged],
    [labels.bp, labels.totalTimes((data.bloodPressure || []).length), translateValue(data.bloodPressureSummary?.label || "未记录"), labels.healthFile],
    [labels.checkup, labels.totalReports((data.checkups || []).length), data.checkups?.[0]?.summary || labels.notUploaded, labels.reportReview],
    [labels.weather, data.weather?.city || labels.unset, data.weatherCare?.text || labels.none, labels.weatherCare],
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
    : activeCopy().noBp;
  els.familyBpAdvice.dataset.tone = summary?.level === "danger" || summary?.level === "warning" ? "warning" : "safe";
  const rows = items
    .slice()
    .reverse()
    .map(
      (item) => `
      <tr>
        <td>${formatTime(item.measured_at)}</td>
        <td>${item.systolic}/${item.diastolic} mmHg</td>
        <td>${item.pulse ? activeCopy().pulseUnit(item.pulse) : activeCopy().notFilled}</td>
        <td>${escapeHtml(item.note || activeCopy().empty)}</td>
      </tr>`
    )
    .join("");
  const empty = `<tr><td colspan="4">${activeCopy().noBp}</td></tr>`;
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
    ctx.fillText(activeCopy().noBpCurve, pad, height / 2);
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
  ctx.fillText(activeCopy().systolic, width - 150, 27);
  ctx.fillStyle = "#0b665b";
  ctx.fillRect(width - 98, 16, 12, 12);
  ctx.fillStyle = "#17211d";
  ctx.fillText(activeCopy().diastolic, width - 80, 27);
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
    els.familyCheckupList.innerHTML = `<p class="muted">${activeCopy().noCheckups}</p>`;
    return;
  }
  els.familyCheckupList.innerHTML = items
    .map(
      (item) => `
      <article class="report-item">
        <strong>${escapeHtml(item.file_name || activeCopy().reportName)} · ${formatTime(item.created_at)}</strong>
        <span>${escapeHtml(item.summary)}</span>
        <small>${escapeHtml(activeCopy().analysisMode(item.source, item.risk_level))}</small>
      </article>`
    )
    .join("");
}

function renderCheckupAdvice(report) {
  const suggestions = report.suggestions?.length ? report.suggestions : [activeCopy().fallbackSuggestion];
  return `
    <strong>${escapeHtml(report.summary)}</strong>
    <ul>${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <small>${escapeHtml(report.disclaimer || activeCopy().disclaimer)}</small>
  `;
}

function renderFraudResult(result) {
  els.fraudScore.textContent = result.score;
  els.fraudMeter.style.width = `${result.score}%`;
  els.fraudMeter.style.background = result.score >= 80 ? "var(--danger)" : result.score >= 41 ? "var(--warn)" : "var(--safe)";
  els.fraudLevel.textContent = `${result.level} · ${result.type}`;
  els.riskReasons.innerHTML = result.reasons.length ? result.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : `<li>${activeCopy().noRisk}</li>`;
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
  if (status === "done") return activeCopy().statusDone;
  if (status === "missed") return activeCopy().statusMissed;
  return activeCopy().statusPending;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "";
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

// ===== 通知中心 =====
let lastUnreadCount = 0;

async function loadNotifications() {
  if (!els.notifBell) return;
  try {
    const { notifications, unreadCount, preferences } = await api("/api/notifications");
    els.notifBell.classList.remove("is-hidden");
    renderNotifications(notifications);
    renderNotifBadge(unreadCount);
    renderPreferences(preferences);
    if (unreadCount > lastUnreadCount && lastUnreadCount !== 0) {
      const latest = notifications[0];
      if (latest) showToast(`${latest.title}：${latest.body}`, "info");
    }
    lastUnreadCount = unreadCount;
  } catch {
    els.notifBell.classList.add("is-hidden");
  }
}

function renderNotifBadge(count) {
  if (count > 0) {
    els.notifBadge.textContent = count > 99 ? "99+" : String(count);
    els.notifBadge.classList.remove("is-hidden");
  } else {
    els.notifBadge.classList.add("is-hidden");
  }
}

function renderNotifications(notifications) {
  if (!notifications?.length) {
    els.notifList.innerHTML = '<p class="muted" style="padding:16px;text-align:center;">暂无通知。</p>';
    return;
  }
  els.notifList.innerHTML = notifications
    .map(
      (item) => `
      <article class="notif-item ${item.is_read ? "" : "is-unread"}" data-notif-id="${item.id}">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.body)}</p>
        <time>${formatTime(item.created_at)}</time>
      </article>`
    )
    .join("");
}

function renderPreferences(prefs) {
  if (!prefs || !els.prefGrid) return;
  els.prefGrid.querySelectorAll("input[data-pref]").forEach((input) => {
    const key = input.dataset.pref;
    input.checked = prefs[key] === 1 || prefs[key] === true;
  });
}

if (els.notifBell) {
  els.notifBell.addEventListener("click", (event) => {
    event.stopPropagation();
    els.notifDropdown.classList.toggle("is-hidden");
    if (!els.notifDropdown.classList.contains("is-hidden")) {
      markAllNotificationsRead();
    }
  });

  document.addEventListener("click", (event) => {
    if (!els.notifDropdown.contains(event.target) && !els.notifBell.contains(event.target)) {
      els.notifDropdown.classList.add("is-hidden");
    }
  });
}

if (els.notifList) {
  els.notifList.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-notif-id]");
    if (!item) return;
    await api("/api/notifications/read", { method: "POST", body: { id: item.dataset.notifId } });
    item.classList.remove("is-unread");
    await loadNotifications();
  });
}

const markAllReadBtn = document.querySelector("#markAllRead");
if (markAllReadBtn) {
  markAllReadBtn.addEventListener("click", markAllNotificationsRead);
}

async function markAllNotificationsRead() {
  try {
    await api("/api/notifications/read", { method: "POST", body: { all: true } });
    await loadNotifications();
  } catch {
    // 静默处理
  }
}

if (els.prefGrid) {
  els.prefGrid.addEventListener("change", async (event) => {
    const input = event.target.closest("input[data-pref]");
    if (!input) return;
    const prefs = {};
    els.prefGrid.querySelectorAll("input[data-pref]").forEach((el) => {
      prefs[el.dataset.pref] = el.checked ? 1 : 0;
    });
    try {
      await api("/api/notifications/preferences", { method: "POST", body: prefs });
      showToast("通知偏好已保存。", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

// ===== Toast 提示系统 =====
function showToast(message, type = "info", duration = 4000) {
  if (!els.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

applyLanguage();
els.taskDate.value = todayDate();
loadDashboard();
loadNotifications();
setInterval(loadNotifications, 30000);

// Navigation scroll-spy: highlight the current section in the sidebar
const navLinks = Array.from(document.querySelectorAll(".nav-list a[data-nav-target]"));
const navSections = navLinks
  .map((link) => document.querySelector(link.dataset.navTarget))
  .filter(Boolean);

if (navSections.length && "IntersectionObserver" in window) {
  const setActive = (id) => {
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.navTarget === `#${id}`);
    });
  };
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    },
    { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] }
  );
  navSections.forEach((section) => observer.observe(section));
}
