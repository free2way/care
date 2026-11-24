const samples = {
  fraud: "【社保中心】通知：您的社保卡由于在异地异常消费5000元已被冻结，请立即点击链接 shb-gov.icu 或回复验证码解冻。",
  memory: "我今天早上八点半吃过降压药了。",
  travel: "我想从四惠东去朝阳公园，怎么坐车最稳妥？",
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
  ["账号登录", "Account sign-in"],
  ["家人长辈分开登录", "Family and senior sign-in"],
  ["家属负责设置吃药、任务和天气关怀，长辈登录后只看今天该做什么。", "Family members set medication, tasks, and weather care. Seniors only see what they need today."],
  ["登录名", "Username"],
  ["密码", "Password"],
  ["登录", "Sign in"],
  ["接受邀请", "Accept invitation"],
  ["加入照护", "Join the care team"],
  ["您的称呼", "Your name"],
  ["设置登录名", "Choose a username"],
  ["设置密码", "Choose a password"],
  ["接受邀请并登录", "Accept and sign in"],
  ["先不加入，返回登录", "Not now, back to sign in"],
  ["对方与长辈的关系", "Relationship to the senior"],
  ["生成邀请链接", "Create invite link"],
  ["复制", "Copy"],
  ["把这个链接发给对方，7 天内有效、只能使用一次。关闭后无法再次查看，请立即复制。", "Send this link to them. It is valid for 7 days and can be used once. You will not be able to see it again after closing, so copy it now."],
  ["家属端：caregiver / demo1234", "Family account: caregiver / demo1234"],
  ["长辈端：elder / demo1234", "Senior account: elder / demo1234"],
  ["服务导航", "Service navigation"],
  ["护", "Care"],
  ["张爷爷", "Grandpa Zhang"],
  ["独居老人 · 子女联系人：小丽", "Living alone · Family contact: Lily"],
  ["防骗检测", "Fraud Check"],
  ["今日安排", "Today"],
  ["今天的安排", "Today’s plan"],
  ["今天要做的事", "Today’s Plan"],
  ["今天还没有安排。", "Nothing scheduled today."],
  ["遇到急事，先告诉家人", "If something is urgent, tell family"],
  ["身体不舒服、摔倒，或者有人催您转钱，点下面的按钮，家人马上会收到消息。", "If you feel unwell, fall down, or someone pressures you for money, tap the button below and your family will be alerted right away."],
  ["今日天气", "Today’s weather"],  ["血压记录", "Blood Pressure"],
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
  ["今日提醒清单", "Today’s checklist"],
  ["查看家人设置的提醒，遇到可疑消息和出门安排时从这里处理。", "Review family-set reminders, suspicious messages, and travel plans here."],
  ["高危识别", "High-risk checks"],
  ["告警生成", "Alerts"],
  ["记忆记录", "Records"],
  ["家人设置", "Family setup"],
  ["今日提醒", "Today’s Reminders"],
  ["暂无家人设置的提醒。", "No family reminders yet."],
  ["开启手机提醒", "Enable phone alerts"],
  ["一键联系家人", "Contact family"],
  ["我没事，报个平安", "I am fine, check in"],
  ["读给我听", "Read it to me"],
  ["字太小？", "Text too small?"],
  ["标准", "Normal"],
  ["大", "Large"],
  ["特大", "Extra large"],
  ["打电话给家人", "Call family"],
  ["我的联系电话", "My contact number"],
  ["填上之后，长辈端求助条里会出现「打电话给家人」按钮，长辈点一下就直接拨号。\n                  飞书没配好的时候，这是最可靠的求助方式。", "Once set, a “Call family” button appears on the senior’s help bar and dials you in one tap. This is the most reliable fallback when Feishu is not configured."],
  ["手机号码", "Mobile number"],
  ["保存电话", "Save number"],
  ["还没有填写联系电话。", "No contact number yet."],
  ["老人说的话", "What the senior said"],
  ["提取并记录", "Extract and record"],
  ["说一句今天做了什么，小护会记下来，家人也能看到。", "Say what you did today and it will be recorded for your family to see."],
  ["身体不舒服这类记录会自动提醒家人查看。", "Records about feeling unwell automatically alert your family."],
  ["暂无生活记录", "No daily records"],
  ["我吃过药了", "I took my medicine"],
  ["我吃过饭了", "I have eaten"],
  ["我出去走走", "I am going out"],
  ["我不舒服", "I do not feel well"],
  ["今日概览", "Today’s overview"],
  ["看病用", "For doctor visits"],
  ["药量管理", "Medication stock"],
  ["体检指标趋势", "Checkup indicator trends"],
  ["添加指标", "Add indicator"],
  ["照着体检报告把关键数字录进来，就能看出每次是好转还是恶化。", "Enter the key numbers from each checkup report to see whether things are improving."],
  ["参考范围是成人常用值，请以报告上标注的范围为准。", "The reference ranges are common adult values. Always follow the range printed on your report."],
  ["检查日期", "Test date"],
  ["再加一项", "Add another"],
  ["正在加载…", "Loading…"],
  ["登记每盒药还剩多少片，长辈确认吃药时会自动扣减。快吃完时这里会标红，并提醒您去开药。\n                按药名归集，所以一天吃几次的药只需要登记一次。", "Record how many units are left in each box. Confirmations deduct automatically. When it runs low this turns red and you get a reminder to refill. Grouped by medicine name, so a medicine taken several times a day only needs one entry."],
  ["正在加载…", "Loading…"],
  ["复诊摘要", "Visit Summary"],
  ["可打印", "Printable"],
  ["带长辈去医院时，把最近一段时间的用药、血压、漏服和体检要点打出来给医生看，不用举着手机翻。", "Before a doctor visit, print the recent medication, blood pressure, missed doses and checkup highlights instead of scrolling on a phone."],
  ["统计范围", "Period"],
  ["最近 7 天", "Last 7 days"],
  ["最近 30 天", "Last 30 days"],
  ["最近 90 天", "Last 90 days"],
  ["最近 180 天", "Last 180 days"],
  ["生成摘要", "Generate"],
  ["打印 / 另存为 PDF", "Print / Save as PDF"],
  ["正在准备…", "Preparing…"],
  ["长辈自己记录的用药、吃饭、睡觉、出门和身体情况。亲属只能查看和删除记错的条目，不能替长辈编造记录。", "Medication, meals, sleep, outings and how the senior feels, recorded by the senior. Family can only view and delete mistakes, not create records on their behalf."],
  ["正在照护", "Caring for"],
  ["长辈报平安", "Senior check-in"],
  ["还没有开启。开启后到点会直接弹出通知，不用一直开着这个页面。", "Not enabled yet. Once enabled, you get a popup at the right time without keeping this page open."],
  ["防骗守护", "Fraud Protection"],
  ["短信粘贴识别", "Paste SMS to check"],
  ["填入示例", "Use sample"],
  ["复制短信后粘贴到这里", "Paste the suspicious SMS here"],
  ["语音输入", "Voice input"],
  ["语音输入短信内容", "Voice input for SMS content"],
  ["语音输入血压备注", "Voice input for blood pressure note"],
  ["语音输入生活记录", "Voice input for daily record"],
  ["语音输入出行需求", "Voice input for travel request"],
  ["点击后直接说话，识别内容会自动填入上面的文字框。", "Tap, speak, and the recognized text will be placed above."],
  ["可以说“早饭后，刚散步回来”。", "You can say “after breakfast, just came back from a walk.”"],
  ["可以直接说“我今天早上八点半吃过降压药了”。", "You can say “I took my blood pressure medicine at 8:30 this morning.”"],
  ["说出想去哪里、什么时候出门，小护会整理成文字。", "Say where and when you want to go, and the assistant will turn it into text."],
  ["开始检测", "Check now"],
  ["清空", "Clear"],
  ["欺诈评分", "Fraud score"],
  ["等待检测", "Waiting for check"],
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
  ["最近一周漏服", "Missed doses this week"],
  ["没有漏服记录。", "No missed doses."],
  ["未触发", "None"],
  ["长辈端遇到高危可疑信息后，这里会生成给亲属的紧急提醒。", "When the senior checks a high-risk message, urgent family alerts appear here."],
  ["暂无告警。请先运行一条高危反诈测试。", "No alerts yet. Try a high-risk fraud sample first."],
  ["手机看护配置", "Mobile Care Setup"],
  ["吃药与出行提醒", "Medication and travel reminders"],
  ["手机优先", "Mobile-first"],
  ["看护人员可以在手机上设置长辈的吃药时间和出行安排。到点或手动发送时，系统会生成亲属提醒，并尝试推送到飞书。", "Caregivers can set medication times and travel plans on mobile. At the scheduled time or by manual send, the app creates family alerts and sends them to Feishu."],
  ["吃药提醒", "Medication reminder"],
  ["药品名称", "Medicine"],
  ["用药时间", "Medication time"],
  ["用药时间（可选多个）", "Times (you can pick several)"],
  ["早上 08:00", "Morning 08:00"],
  ["中午 12:30", "Noon 12:30"],
  ["晚上 18:00", "Evening 18:00"],
  ["睡前 21:00", "Bedtime 21:00"],
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
  ["待调用", "Idle"],
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
const voiceCopies = {
  zh: {
    idle: "语音输入",
    listening: "正在听",
    starting: "正在打开麦克风，请开始说话。",
    interim: (text) => `正在识别：${text}`,
    done: "已经填入识别到的内容，可以再检查一下。",
    unsupported: "当前浏览器不支持语音输入，可继续手工输入。安卓手机建议使用 Chrome。",
    insecure: "语音输入需要 HTTPS 页面或本地调试环境。",
    noSpeech: "刚才没有听清楚，您可以再点一次说话。",
    denied: "麦克风权限没有打开，请在浏览器里允许麦克风后再试。",
    error: "语音输入暂时不可用，请先手工输入。",
  },
  en: {
    idle: "Voice input",
    listening: "Listening",
    starting: "Opening the microphone. Please start speaking.",
    interim: (text) => `Recognizing: ${text}`,
    done: "Recognized text has been added. Please check it once.",
    unsupported: "Voice input is not supported in this browser. On Android, Chrome is recommended.",
    insecure: "Voice input needs an HTTPS page or a local development page.",
    noSpeech: "I did not hear that clearly. Please tap again and speak.",
    denied: "Microphone permission is blocked. Please allow microphone access in the browser.",
    error: "Voice input is temporarily unavailable. Please type for now.",
  },
};

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
      subtitle: "老人端 | 今天要做的事都在这里",
      eyebrow: "长辈工作台",
      headline: "今天慢慢来，不着急",
      copy: "吃药、量血压、出门的事，都按时间排在下面。做完一件，点一下按钮就行。",
      sideTitle: "今天要注意",
      sideItems: ["按时吃药", "完成家人交办的事", "出门前看一眼天气", "陌生短信先粘贴识别"],
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
    todayBoard: {
      count: (done, total) => `${total} 项，已完成 ${done} 项`,
      pending: (count) => `还有 ${count} 项要做`,
      allDone: "今天的都做完了",
      now: (dateText, time) => `现在是 ${dateText} ${time}`,
      empty: "今天还没有安排。家人在手机上给您设好提醒后，会显示在这里。",
      overdue: (text) => `已经超时 ${text}了，请尽快做`,
      dueNow: "现在该做了",
      dueIn: (text) => `还有 ${text}`,
      done: "已完成",
      missed: "今天已错过",
      takeMedicine: (name) => `吃 ${name}`,
      measureBp: "量血压",
      bpDone: (count) => `今天已经量过 ${count} 次`,
      bpPending: "今天还没有量血压",
      bpAction: "去记录",
      medicationAction: "我已吃药",
      taskAction: "做完了",
      weatherLabel: "今日天气",
      doneToast: "记下了，家人能看到。",
      anyTime: "随时",
      carriedTitle: (count) => `前几天还没做的（${count} 项）`,
      carried: (dateText) => `${dateText}那天没做`,
    },
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
    actionFailed: "操作没有成功，请稍后再点一次。",
    connectedLog: "已连接照护服务。",
    weatherNotLiveHint: "注意：这不是实时天气，是拿不到天气数据时的通用提醒。",
    routeNotLiveHint: "注意：这不是实时导航结果，出发前请让家人再确认一次路线。",
    weatherUnknown: "天气情况暂时取不到",
    inviteNone: "还没有待处理的邀请。",
    invitePendingTitle: "等待对方接受：",
    inviteExpires: (day) => `${day} 前有效`,
    inviteRevoke: "撤销",
    inviteRevoked: "邀请已撤销。",
    inviteNeedRelation: "请先填写对方与长辈的关系，例如「女儿」。",
    inviteCopied: "邀请链接已复制，发给对方就可以了。",
    inviteCopyManual: "无法自动复制，链接已选中，请手动复制。",
    inviteIntro: (relation, elderName) => `您被邀请作为${relation}，一起照护${elderName}。`,
    inviteInvalid: "这个邀请链接无效或已过期，请让家属重新生成一个。",
    notifEmpty: "暂无通知。",
    indicatorNameLabel: "指标名称",
    indicatorValueLabel: "指标数值",
    indicatorUnitLabel: "指标单位",
    removeTimeLabel: (time) => `删除 ${time}`,
    bpAdviceEmpty: "量完血压后记在这里，我会帮您看今天有没有需要留意的变化。",
    bpNoRecord: "未记录",
    askPending: (name, count) => `${name}，今天还有 ${count} 个吃药提醒没有确认。`,
    askAllDone: (name) => `${name}，今天的吃药提醒都已经确认啦。`,
    prefsSaved: "通知偏好已保存。",
    networkError: "网络连接失败，请检查网络后重试。",
    requestTimeout: "请求超时了，请检查网络后重试。",
    loadFailed: "内容加载失败，请稍后再试。",
    needMedicineName: "请先填写药品名称。",
    needMedicineTime: "请至少选择一个用药时间。",
    noMissed: "最近一周没有漏服记录。",
    missedTag: "漏服",
    sosSent: "已经通知家人了，请留在原地等家人联系您。",
    sosSentHint: "已提醒家属关注长辈的求助。",
    sosSentInApp: "已经记下了，家人打开应用能看到。如果很急，请直接打电话。",
    checkInSent: "已经通过飞书告诉家人您平安了。",
    checkInSentInApp: "已经记下了，家人打开应用就能看到。",
    checkInAlready: "今天已经报过平安了，不用重复点。",
    pushOn: "手机提醒已开启",
    pushOff: "开启手机提醒",
    pushNeedHttps: "手机提醒需要 HTTPS 网页才能开启。请让家人用 https 地址打开。",
    pushUnsupported: "这个浏览器不支持手机提醒。安卓手机请用 Chrome 打开。",
    pushIosInstall: "苹果手机需要先「添加到主屏幕」：点浏览器底部的分享按钮，选「添加到主屏幕」，再从桌面图标打开这个应用，然后回来开启提醒。",
    pushServerDisabled: "服务端还没有配置推送密钥，手机提醒暂时无法开启。请让家人联系管理员设置 VAPID 密钥。",
    pushDenied: "通知权限被拒绝了。请在浏览器的网站设置里允许通知，再回来试一次。",
    pushEnabledHint: "手机提醒已开启，到点会直接弹出通知，手机不用停在这个页面。",
    pushOffHint: "还没有开启。开启后到点会直接弹出通知，不用一直开着这个页面。",
    pushEnabledToast: "手机提醒已开启，到点会自动弹出通知。",
    pushOffToast: "手机提醒已关闭。",
    pushFailed: "手机提醒没有开成功，请稍后再试一次。",
    pushNoService: "这个浏览器现在连不上手机推送服务，通知开不了。请检查网络，不要用无痕模式，或换用安卓 Chrome / 把应用添加到苹果手机主屏幕后再试。",
    pushNudge: "到点提醒还没开启，手机不会响。点这里开启。",
    editLabel: "编辑",
    deleteLabel: "删除",
    saveLabel: "保存",
    callAria: (name, phone) => `打电话给${name}，号码${phone}`,
    phoneSaved: (phone) => `已经保存：${phone}。长辈端的求助条里会出现拨号按钮。`,
    phoneEmptyHint: "还没有填写联系电话，长辈端不会显示拨号按钮。",
    phoneSavedToast: "联系电话已保存。",
    lifeKinds: { medication: "吃药", meal: "吃饭", sleep: "睡觉", outing: "出门", unwell: "身体不适", mood: "心情", other: "其他" },
    lifeSourceVoice: "语音",
    lifeSourceText: "手写",
    lifeUnknownTime: "时间未记录",
    noLifeEvents: "还没有生活记录。",
    lifeNeedText: "请先说一句今天做了什么。",
    lifeSaved: (kind, time) => `记下了：${kind}${time ? `，时间是 ${time}` : ""}。家人能在照护记录里看到。`,
    lifeSavedUnwell: (time) => `记下了：身体不适${time ? `（${time}）` : ""}。已经提醒家人查看，如果难受请马上打电话给家人。`,
    lifeSavedToast: "已经记下来了。",
    lifeUnwellToast: "已经记下，并且通知家人了。如果很难受，请直接打电话。",
    confirmDeleteLifeEvent: "确定删除这条生活记录吗？",
    stockRemaining: (units, perDose) => `剩余 ${units} 片 · 每次 ${perDose} 片`,
    stockDaysLeft: (days) => `大约还能吃 ${days} 天`,
    stockRunOut: "今天就要吃完了，请尽快开药",
    stockNoPlan: "当前没有启用的用药计划",
    stockNotTracked: "还没有登记剩余数量",
    stockRegister: "登记库存",
    stockEdit: "修改",
    stockStop: "停止追踪",
    stockEmpty: "还没有用药计划，先在下面添加吃药提醒。",
    stockUnitsLabel: "还剩多少片",
    stockPerDoseLabel: "每次吃几片",
    stockNeedUnits: "请填写剩余数量。",
    confirmDeleteStock: "停止追踪这个药的剩余数量？已登记的库存会被删除，之后的吃药确认不再扣减。",
    indicatorOutOfRange: "超出范围",
    indicatorInRange: "正常",
    indicatorRefLabel: "参考范围：",
    indicatorEmpty: "还没有录入指标。点上面的「添加指标」，照着体检报告把关键数字填进来。",
    indicatorPrevious: (day, value) => `上次 ${value}（${day}）`,
    indicatorNeedValue: "请至少填写一项指标的数值。",
    indicatorValuePlaceholder: "数值",
    confirmDeleteIndicator: "删除这条指标记录？",
    visitTitle: "复诊摘要",
    visitPeriod: (days, start) => `统计范围：最近 ${days} 天（自 ${start} 起）`,
    visitGenerated: (time) => `生成时间：${time}`,
    visitSectionMedication: "一、当前用药",
    visitSectionBp: "二、血压记录",
    visitSectionAdherence: "三、用药完成情况",
    visitSectionUnwell: "四、身体不适记录",
    visitSectionCheckup: "五、体检报告要点",
    visitSectionIndicators: "六、关键体检指标趋势",
    visitIndicatorName: "指标",
    visitIndicatorLatest: "最近数值",
    visitIndicatorRef: "参考范围",
    visitIndicatorTrend: "较上次变化",
    visitTime: "时间",
    visitMedicine: "药品",
    visitDose: "用法用量",
    visitStopped: "已停用",
    visitNoMedication: "暂无用药计划",
    visitPulse: "心率",
    visitBpValue: "血压",
    visitBpCount: "记录次数",
    visitBpAverage: "平均血压",
    visitBpAbnormal: "异常次数",
    visitBpLatest: "最近一次",
    visitBpLevel: "总体判断",
    visitAdherenceTotal: "应服总次数",
    visitAdherenceDone: "已确认",
    visitAdherenceMissed: "漏服",
    visitAdherenceRate: "完成率",
    visitMissedDetail: "漏服明细：",
    visitNone: "无记录",
    visitFooter: "本页数据由 TechGuard 银发守护自动汇总，仅供医生参考，不能替代诊断。",
    phoneClearedToast: "联系电话已清除。",
    familyLabel: "家人",
    switchedToast: "已经切换照护的长辈。",
    cancelLabel: "取消",
    enableLabel: "启用",
    disableLabel: "停用",
    disabledTag: "已停用",
    savedToast: "已经保存了。",
    deletedToast: "已经删除了。",
    enabledToast: "已经重新启用，会继续提醒。",
    disabledToast: "已经停用，不会再提醒，但历史记录还在。",
    confirmDeleteMedication: (name) => `确定要删除「${name}」的吃药提醒吗？删除后这条计划和它的记录都会消失。如果只是暂时不吃，建议用「停用」。`,
    confirmDeleteTask: (title) => `确定要删除任务「${title}」吗？`,
    needTaskTitle: "请先填写任务名称。",
    medicineNameLabel: "药品名称",
    taskLabel: "任务",
    dateLabel: "日期",
    timeLabel: "时间",
    noteLabel: "说明",
    speech: {
      listen: "读给我听",
      stop: "停止朗读",
      unsupported: "这个浏览器不能朗读。可以请家人念给您听。",
      nothing: "还没有可以读的内容。",
      now: (dateText, timeText) => `现在是 ${dateText} ${timeText}。`,
      summary: (total, pending) => `今天一共 ${total} 件事，还有 ${pending} 件没有做。`,
      allDone: "今天的事情都做完了，很好。",
      empty: "今天还没有安排。",
      item: (timeText, title, note, stateText) => `${timeText}，${title}${note ? `，${note.replace(/[（(].*?[）)]/g, "")}` : ""}。${stateText}`,
      done: "已经完成了。",
      missed: "今天已经错过了。",
      dueNow: "现在就该做。",
      dueIn: (text) => `还有 ${text}。`,
      overdue: (text) => `已经超时 ${text}了，请尽快做。`,
      carriedOn: (dayText) => `${dayText}那天没有做。`,
      carried: (count) => `另外，前几天还有 ${count} 件事没有做完。`,
      weather: (text) => `今天天气：${text}`,
      reasons: (text) => `原因是：${text}。`,
      anyTime: "随时",
    },
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
      subtitle: "Senior view | Everything for today is here",
      eyebrow: "Senior Workspace",
      headline: "Take today slowly",
      copy: "Medication, blood pressure, and going out are listed below in time order. Tap the button when you finish each one.",
      sideTitle: "Things to remember",
      sideItems: ["Take medicine on time", "Finish what family asked", "Check the weather before going out", "Paste unknown messages first"],
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
    todayBoard: {
      count: (done, total) => `${total} item${total === 1 ? "" : "s"}, ${done} done`,
      pending: (count) => `${count} left to do`,
      allDone: "All done for today",
      now: (dateText, time) => `It is ${time}, ${dateText}`,
      empty: "Nothing scheduled today yet. Family reminders will appear here.",
      overdue: (text) => `Overdue by ${text}. Please do it soon.`,
      dueNow: "Do this now",
      dueIn: (text) => `In ${text}`,
      done: "Done",
      missed: "Missed today",
      takeMedicine: (name) => `Take ${name}`,
      measureBp: "Measure blood pressure",
      bpDone: (count) => `Measured ${count} time(s) today`,
      bpPending: "Not measured yet today",
      bpAction: "Record now",
      medicationAction: "I took it",
      taskAction: "Finished",
      weatherLabel: "Today’s weather",
      doneToast: "Saved. Your family can see it.",
      anyTime: "Any time",
      carriedTitle: (count) => `Still not done from earlier days (${count})`,
      carried: (dateText) => `Not done on ${dateText}`,
    },
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
    actionFailed: "That did not go through. Please try once more.",
    connectedLog: "Connected to the care service.",
    weatherNotLiveHint: "Note: this is not live weather — it is general advice because the weather service is unavailable.",
    routeNotLiveHint: "Note: this is not live navigation. Please have family confirm the route before leaving.",
    weatherUnknown: "Weather is unavailable right now",
    inviteNone: "No pending invitations.",
    invitePendingTitle: "Waiting to be accepted:",
    inviteExpires: (day) => `valid until ${day}`,
    inviteRevoke: "Revoke",
    inviteRevoked: "Invitation revoked.",
    inviteNeedRelation: "Please fill in the relationship first, for example \"daughter\".",
    inviteCopied: "Invite link copied — just send it over.",
    inviteCopyManual: "Could not copy automatically. The link is selected, please copy it manually.",
    inviteIntro: (relation, elderName) => `You have been invited as ${relation} to help care for ${elderName}.`,
    inviteInvalid: "This invitation link is invalid or has expired. Please ask the family to create a new one.",
    notifEmpty: "No notifications yet.",
    indicatorNameLabel: "Indicator name",
    indicatorValueLabel: "Indicator value",
    indicatorUnitLabel: "Indicator unit",
    removeTimeLabel: (time) => `Remove ${time}`,
    bpAdviceEmpty: "Log blood pressure here and I will help you spot anything worth noting today.",
    bpNoRecord: "No record",
    askPending: (name, count) =>
      count === 1
        ? `${name}, 1 medication reminder today is still unconfirmed.`
        : `${name}, ${count} medication reminders today are still unconfirmed.`,
    askAllDone: (name) => `${name}, all of today's medication reminders are confirmed.`,
    prefsSaved: "Notification preferences saved.",
    networkError: "Connection failed. Please check your network and try again.",
    requestTimeout: "The request timed out. Please check your network and try again.",
    loadFailed: "Could not load the content. Please try again later.",
    needMedicineName: "Please enter the medicine name first.",
    needMedicineTime: "Please pick at least one time.",
    noMissed: "No missed doses in the past week.",
    missedTag: "Missed",
    sosSent: "Your family has been notified. Please stay where you are and wait for them to contact you.",
    sosSentHint: "Your family has been alerted to your request.",
    sosSentInApp: "This was recorded and your family will see it in the app. If it is urgent, please call them.",
    checkInSent: "Your family has been told through Feishu that you are fine.",
    checkInSentInApp: "This was recorded and your family will see it in the app.",
    checkInAlready: "You already checked in today.",
    pushOn: "Phone alerts on",
    pushOff: "Enable phone alerts",
    pushNeedHttps: "Phone alerts need an HTTPS page. Please ask your family to open the https address.",
    pushUnsupported: "This browser does not support phone alerts. On Android, use Chrome.",
    pushIosInstall: "On iPhone, first add this app to the Home Screen: tap Share, choose “Add to Home Screen”, open it from the icon, then come back and enable alerts.",
    pushServerDisabled: "The server has no push keys configured yet, so phone alerts cannot be enabled. Please ask your family to set the VAPID keys.",
    pushDenied: "Notification permission was denied. Please allow notifications in the browser site settings and try again.",
    pushEnabledHint: "Phone alerts are on. You will get a popup at the right time; the page does not need to stay open.",
    pushOffHint: "Not enabled yet. Once enabled, you get a popup at the right time without keeping this page open.",
    pushEnabledToast: "Phone alerts are on. You will get a popup at the right time.",
    pushOffToast: "Phone alerts turned off.",
    pushFailed: "Phone alerts could not be enabled. Please try again later.",
    pushNoService: "This browser cannot reach the phone push service right now, so alerts cannot be enabled. Check the network, leave private/incognito mode, or switch to Chrome on Android / add the app to the iPhone Home Screen and try again.",
    pushNudge: "Timed alerts are off, so your phone will not ring. Tap to turn them on.",
    editLabel: "Edit",
    deleteLabel: "Delete",
    saveLabel: "Save",
    callAria: (name, phone) => `Call ${name} at ${phone}`,
    phoneSaved: (phone) => `Saved: ${phone}. A call button will appear on the senior’s help bar.`,
    phoneEmptyHint: "No phone number yet, so the senior will not see a call button.",
    phoneSavedToast: "Contact number saved.",
    lifeKinds: { medication: "Medication", meal: "Meal", sleep: "Sleep", outing: "Outing", unwell: "Feeling unwell", mood: "Mood", other: "Other" },
    lifeSourceVoice: "Voice",
    lifeSourceText: "Typed",
    lifeUnknownTime: "time not recorded",
    noLifeEvents: "No daily records yet.",
    lifeNeedText: "Please say what you did today first.",
    lifeSaved: (kind, time) => `Saved: ${kind}${time ? ` at ${time}` : ""}. Your family can see it in the care log.`,
    lifeSavedUnwell: (time) => `Saved: feeling unwell${time ? ` (${time})` : ""}. Your family has been alerted. If it is serious, please call them right away.`,
    lifeSavedToast: "Recorded.",
    lifeUnwellToast: "Recorded and your family has been alerted. Please call them if it is serious.",
    confirmDeleteLifeEvent: "Delete this daily record?",
    stockRemaining: (units, perDose) => `${units} left · ${perDose} per dose`,
    stockDaysLeft: (days) => `about ${days} days left`,
    stockRunOut: "runs out today — please refill soon",
    stockNoPlan: "no active medication plan",
    stockNotTracked: "remaining amount not recorded yet",
    stockRegister: "Record stock",
    stockEdit: "Edit",
    stockStop: "Stop tracking",
    stockEmpty: "No medication plan yet. Add a reminder below first.",
    stockUnitsLabel: "Units left",
    stockPerDoseLabel: "Units per dose",
    stockNeedUnits: "Please enter the remaining amount.",
    confirmDeleteStock: "Stop tracking the remaining amount for this medicine? The recorded stock will be deleted and future confirmations will not deduct.",
    indicatorOutOfRange: "Out of range",
    indicatorInRange: "In range",
    indicatorRefLabel: "Reference range: ",
    indicatorEmpty: "No indicators recorded yet. Tap “Add indicator” and enter the key numbers from the checkup report.",
    indicatorPrevious: (day, value) => `Previous: ${value} (${day})`,
    indicatorNeedValue: "Please enter a value for at least one indicator.",
    indicatorValuePlaceholder: "Value",
    confirmDeleteIndicator: "Delete this indicator record?",
    visitTitle: "Visit Summary",
    visitPeriod: (days, start) => `Period: last ${days} days (from ${start})`,
    visitGenerated: (time) => `Generated: ${time}`,
    visitSectionMedication: "1. Current medication",
    visitSectionBp: "2. Blood pressure",
    visitSectionAdherence: "3. Medication adherence",
    visitSectionUnwell: "4. Reported discomfort",
    visitSectionCheckup: "5. Checkup report highlights",
    visitSectionIndicators: "6. Key lab indicator trends",
    visitIndicatorName: "Indicator",
    visitIndicatorLatest: "Latest",
    visitIndicatorRef: "Reference",
    visitIndicatorTrend: "Change",
    visitTime: "Time",
    visitMedicine: "Medicine",
    visitDose: "Dose",
    visitStopped: "stopped",
    visitNoMedication: "No medication plan",
    visitPulse: "Pulse",
    visitBpValue: "Blood pressure",
    visitBpCount: "Readings",
    visitBpAverage: "Average",
    visitBpAbnormal: "Abnormal readings",
    visitBpLatest: "Latest",
    visitBpLevel: "Overall",
    visitAdherenceTotal: "Doses expected",
    visitAdherenceDone: "Confirmed",
    visitAdherenceMissed: "Missed",
    visitAdherenceRate: "Completion rate",
    visitMissedDetail: "Missed doses:",
    visitNone: "None",
    visitFooter: "This page is generated by TechGuard for doctor reference only. It is not a medical diagnosis.",
    phoneClearedToast: "Contact number cleared.",
    familyLabel: "family",
    switchedToast: "Switched to another senior.",
    cancelLabel: "Cancel",
    enableLabel: "Enable",
    disableLabel: "Disable",
    disabledTag: "disabled",
    savedToast: "Saved.",
    deletedToast: "Deleted.",
    enabledToast: "Enabled again. Reminders will continue.",
    disabledToast: "Disabled. No more reminders, but the history is kept.",
    confirmDeleteMedication: (name) => `Delete the medication reminder “${name}”? The schedule and its records will be removed. If it is only paused, use Disable instead.`,
    confirmDeleteTask: (title) => `Delete the task “${title}”?`,
    needTaskTitle: "Please enter a task name first.",
    medicineNameLabel: "Medicine",
    taskLabel: "Task",
    dateLabel: "Date",
    timeLabel: "Time",
    noteLabel: "Note",
    speech: {
      listen: "Read it to me",
      stop: "Stop reading",
      unsupported: "This browser cannot read aloud. You can ask your family to read it to you.",
      nothing: "There is nothing to read yet.",
      now: (dateText, timeText) => `It is ${timeText}, ${dateText}.`,
      summary: (total, pending) => `There are ${total} things today, and ${pending} of them are not done yet.`,
      allDone: "Everything for today is done. Well done.",
      empty: "Nothing is scheduled today.",
      item: (timeText, title, note, stateText) => `${timeText}, ${title}${note ? `, ${note.replace(/[（(].*?[）)]/g, "")}` : ""}. ${stateText}`,
      done: "Already done.",
      missed: "Missed today.",
      dueNow: "This one is due now.",
      dueIn: (text) => `Due in ${text}.`,
      overdue: (text) => `Overdue by ${text}. Please do it soon.`,
      carriedOn: (dayText) => `Not done on ${dayText}.`,
      carried: (count) => `There are also ${count} things from earlier days that are still not done.`,
      weather: (text) => `Today’s weather: ${text}`,
      reasons: (text) => `Because: ${text}.`,
      anyTime: "any time",
    },
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
  missedList: document.querySelector("#missedList"),
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
  saveMemory: document.querySelector("#saveMemory"),
  memoryReply: document.querySelector("#memoryReply"),
  memoryTable: document.querySelector("#memoryTable"),
  dailySummaryTable: document.querySelector("#dailySummaryTable"),
  visitSheet: document.querySelector("#visitSheet"),
  stockList: document.querySelector("#stockList"),
  indicatorList: document.querySelector("#indicatorList"),
  indicatorForm: document.querySelector("#indicatorForm"),
  indicatorDate: document.querySelector("#indicatorDate"),
  indicatorRows: document.querySelector("#indicatorRows"),
  toggleIndicatorForm: document.querySelector("#toggleIndicatorForm"),
  addIndicatorRow: document.querySelector("#addIndicatorRow"),
  saveIndicators: document.querySelector("#saveIndicators"),
  cancelIndicators: document.querySelector("#cancelIndicators"),
  visitSummaryDays: document.querySelector("#visitSummaryDays"),
  loadVisitSummary: document.querySelector("#loadVisitSummary"),
  printVisitSummary: document.querySelector("#printVisitSummary"),
  familyMemoryTable: document.querySelector("#familyMemoryTable"),
  travelInput: document.querySelector("#travelInput"),
  weatherTrace: document.querySelector("#weatherTrace"),
  routeTrace: document.querySelector("#routeTrace"),
  travelReply: document.querySelector("#travelReply"),
  travelSourceNote: document.querySelector("#travelSourceNote"),
  eventLog: document.querySelector("#eventLog"),
  fraudCount: document.querySelector("#fraudCount"),
  alertCount: document.querySelector("#alertCount"),
  memoryCount: document.querySelector("#memoryCount"),
  todayBoardCount: document.querySelector("#todayBoardCount"),
  todayClock: document.querySelector("#todayClock"),
  todayList: document.querySelector("#todayList"),
  todayWeather: document.querySelector("#todayWeather"),
  todayWeatherText: document.querySelector("#todayWeatherText"),
  enablePush: document.querySelector("#enablePush"),
  pushNudge: document.querySelector("#pushNudge"),
  callCaregiver: document.querySelector("#callCaregiver"),
  callCaregiverNumber: document.querySelector("#callCaregiverNumber"),
  elderSwitcher: document.querySelector("#elderSwitcher"),
  elderSwitcherSelect: document.querySelector("#elderSwitcherSelect"),
  caregiverPhone: document.querySelector("#caregiverPhone"),
  saveCaregiverPhone: document.querySelector("#saveCaregiverPhone"),
  phoneStatus: document.querySelector("#phoneStatus"),
  contactCaregiver: document.querySelector("#contactCaregiver"),
  elderCheckIn: document.querySelector("#elderCheckIn"),
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
  weatherCity: document.querySelector("#weatherCity"),
  weatherDistrict: document.querySelector("#weatherDistrict"),
  weatherCareTime: document.querySelector("#weatherCareTime"),
  weatherCareText: document.querySelector("#weatherCareText"),
  weatherSourceNote: document.querySelector("#weatherSourceNote"),
  roleTable: document.querySelector("#roleTable"),
  loginPanel: document.querySelector("#loginPanel"),
  invitePanel: document.querySelector("#invitePanel"),
  inviteIntro: document.querySelector("#inviteIntro"),
  inviteForm: document.querySelector("#inviteForm"),
  inviteDisplayName: document.querySelector("#inviteDisplayName"),
  inviteUsername: document.querySelector("#inviteUsername"),
  invitePassword: document.querySelector("#invitePassword"),
  inviteError: document.querySelector("#inviteError"),
  inviteRelation: document.querySelector("#inviteRelation"),
  createInvite: document.querySelector("#createInvite"),
  inviteCreateError: document.querySelector("#inviteCreateError"),
  inviteResult: document.querySelector("#inviteResult"),
  inviteLink: document.querySelector("#inviteLink"),
  copyInviteLink: document.querySelector("#copyInviteLink"),
  invitePending: document.querySelector("#invitePending"),
  notifBell: document.querySelector("#notifBell"),
  notifBadge: document.querySelector("#notifBadge"),
  notifDropdown: document.querySelector("#notifDropdown"),
  notifList: document.querySelector("#notifList"),
  prefGrid: document.querySelector("#prefGrid"),
  savePrefs: document.querySelector("#savePrefs"),
  toastContainer: document.querySelector("#toastContainer"),
};

/* ---------- 长辈端字号三档 ----------
   老花程度差异很大，字号不能让产品单方面定死；选择存在本地，下次进来还记得。 */

const FONT_SIZE_KEYS = ["normal", "large", "xlarge"];

function applyFontSize(size) {
  const value = FONT_SIZE_KEYS.includes(size) ? size : "normal";
  document.body.dataset.font = value;
  try {
    localStorage.setItem("techguard_font", value);
  } catch {
    /* 隐私模式下写不了 localStorage，忽略即可 */
  }
  document.querySelectorAll("[data-font-size]").forEach((button) => {
    const active = button.dataset.fontSize === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setupFontSize() {
  let saved = "normal";
  try {
    saved = localStorage.getItem("techguard_font") || "normal";
  } catch {
    saved = "normal";
  }
  applyFontSize(saved);
  document.querySelectorAll("[data-font-size]").forEach((button) => {
    if (button.dataset.fontSizeWired === "1") return;
    button.dataset.fontSizeWired = "1";
    button.addEventListener("click", () => applyFontSize(button.dataset.fontSize));
  });
}

/* ---------- 长辈端紧急联系电话 ----------
   飞书没配好时，「一键联系家人」只是记进应用，家人不一定马上看到。
   直接拨号是最可靠的兜底，所以有号码就要露出来。 */

function renderEmergencyContacts(contacts) {
  if (!els.callCaregiver) return;
  const usable = (contacts || []).filter((item) => String(item?.phone || "").trim());
  if (!usable.length || document.body.dataset.view !== "elder") {
    els.callCaregiver.classList.add("is-hidden");
    return;
  }
  const first = usable[0];
  const dialable = String(first.phone).replace(/[^\d+]/g, "");
  els.callCaregiver.href = `tel:${dialable}`;
  els.callCaregiver.setAttribute("aria-label", activeCopy().callAria(first.name || activeCopy().familyLabel, first.phone));
  if (els.callCaregiverNumber) els.callCaregiverNumber.textContent = first.phone;
  els.callCaregiver.classList.remove("is-hidden");
}

/* ---------- 家属端：体检指标趋势 ----------
   体检报告以前只存一段文字摘要，回答不了「这次比上次是好还是坏」。
   由家属照着报告录入关键数字——这样不依赖任何 AI 服务，没配 key 也能用。 */

// name 是「写入服务端」的规范名（服务端的参考范围表按这些中文名索引），不要改；
// labelEn 只在英文界面用于显示。
const INDICATOR_PRESETS = [
  { name: "空腹血糖", labelEn: "Fasting glucose", unit: "mmol/L" },
  { name: "糖化血红蛋白", labelEn: "HbA1c", unit: "%" },
  { name: "总胆固醇", labelEn: "Total cholesterol", unit: "mmol/L" },
  { name: "甘油三酯", labelEn: "Triglycerides", unit: "mmol/L" },
  { name: "低密度脂蛋白胆固醇", labelEn: "LDL cholesterol", unit: "mmol/L" },
  { name: "高密度脂蛋白胆固醇", labelEn: "HDL cholesterol", unit: "mmol/L" },
  { name: "尿酸", labelEn: "Uric acid", unit: "μmol/L" },
  { name: "肌酐", labelEn: "Creatinine", unit: "μmol/L" },
  { name: "血钾", labelEn: "Potassium", unit: "mmol/L" },
  { name: "血钠", labelEn: "Sodium", unit: "mmol/L" },
  { name: "血红蛋白", labelEn: "Hemoglobin", unit: "g/L" },
];

// 预设指标在英文界面显示英文名；家属自定义的指标名没有对照表，原样显示。
function indicatorLabel(name) {
  if (currentLang !== "en") return name;
  return INDICATOR_PRESETS.find((preset) => preset.name === name)?.labelEn || name;
}

function indicatorRowHtml(presetIndex = 0) {
  const c = activeCopy();
  const options = INDICATOR_PRESETS.map(
    (p, i) =>
      `<option value="${i}"${i === presetIndex ? " selected" : ""}>${escapeHtml(indicatorLabel(p.name))}</option>`
  ).join("");
  return `
  <div class="indicator-row">
    <select data-indicator-name aria-label="${escapeHtml(c.indicatorNameLabel)}">${options}</select>
    <input type="number" step="0.1" inputmode="decimal" data-indicator-value aria-label="${escapeHtml(c.indicatorValueLabel)}" placeholder="${escapeHtml(c.indicatorValuePlaceholder)}" />
    <input type="text" data-indicator-unit aria-label="${escapeHtml(c.indicatorUnitLabel)}" value="${escapeHtml(INDICATOR_PRESETS[presetIndex]?.unit || "")}" />
    <button class="ghost-button is-danger" type="button" data-indicator-remove="1" aria-label="${escapeHtml(c.deleteLabel)}">×</button>
  </div>`;
}

function addIndicatorRow(presetIndex = 0) {
  if (!els.indicatorRows) return;
  els.indicatorRows.insertAdjacentHTML("beforeend", indicatorRowHtml(presetIndex));
}

// 选了下拉里的预设就自动带出单位，省得家属自己敲
els.indicatorRows?.addEventListener("change", (event) => {
  const select = event.target.closest("[data-indicator-name]");
  if (!select) return;
  const unitInput = select.closest(".indicator-row")?.querySelector("[data-indicator-unit]");
  if (unitInput) unitInput.value = INDICATOR_PRESETS[Number(select.value)]?.unit || "";
});

els.indicatorRows?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-indicator-remove]");
  if (!button) return;
  if (els.indicatorRows.querySelectorAll(".indicator-row").length <= 1) return;
  button.closest(".indicator-row")?.remove();
});

function renderIndicatorSparkline(history) {
  const points = (history || []).map((h) => Number(h.value)).filter((v) => Number.isFinite(v));
  if (points.length < 2) return "";
  const width = 160;
  const height = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((v, i) => [i * step, height - ((v - min) / span) * (height - 8) - 4]);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return `<svg class="indicator-spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="var(--accent)" />
  </svg>`;
}

function formatIndicatorRange(refLow, refHigh) {
  if (refLow !== null && refLow !== undefined && refHigh !== null && refHigh !== undefined) {
    return `${refLow} – ${refHigh}`;
  }
  if (refLow !== null && refLow !== undefined) return `≥ ${refLow}`;
  if (refHigh !== null && refHigh !== undefined) return `≤ ${refHigh}`;
  return "";
}

function renderIndicators(items) {
  if (!els.indicatorList) return;
  const c = activeCopy();
  const list = items || [];
  if (!list.length) {
    els.indicatorList.innerHTML = `<p class="muted">${escapeHtml(c.indicatorEmpty)}</p>`;
    return;
  }
  els.indicatorList.innerHTML = list
    .map((item) => {
      const latest = item.latest || {};
      const flag = item.outOfRange
        ? `<span class="indicator-flag is-out">${escapeHtml(c.indicatorOutOfRange)}</span>`
        : item.outOfRange === false
          ? `<span class="indicator-flag is-ok">${escapeHtml(c.indicatorInRange)}</span>`
          : "";
      const deltaClass = item.direction === "up" ? "is-up" : item.direction === "down" ? "is-down" : "is-flat";
      const deltaText =
        item.delta === null || item.delta === undefined
          ? ""
          : `${item.delta > 0 ? "↑" : item.delta < 0 ? "↓" : "→"} ${Math.abs(item.delta)}`;
      const refText = formatIndicatorRange(item.refLow, item.refHigh) || "—";
      const historyRows = (item.history || [])
        .slice()
        .reverse()
        .map(
          (h) => `<li>
            <span>${escapeHtml(formatDayLabel(h.measuredDate))}</span>
            <b>${escapeHtml(String(h.value))}</b>
            <button class="ghost-button is-danger" type="button" data-indicator-delete="${escapeHtml(h.id)}">${escapeHtml(c.deleteLabel)}</button>
          </li>`
        )
        .join("");
      return `
      <details class="indicator-item${item.outOfRange ? " is-out" : ""}">
        <summary>
          ${flag}
          <span class="indicator-name">${escapeHtml(indicatorLabel(item.name))}</span>
          <span class="indicator-latest"><b>${escapeHtml(String(latest.value ?? ""))}</b> <small>${escapeHtml(latest.unit || item.unit || "")}</small></span>
          ${deltaText ? `<span class="indicator-delta ${deltaClass}">${escapeHtml(deltaText)}</span>` : ""}
        </summary>
        <div class="indicator-body">
          <p class="indicator-meta">
            ${escapeHtml(c.indicatorRefLabel)}${escapeHtml(refText)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}
            ${item.previous ? `　${escapeHtml(c.indicatorPrevious(formatDayLabel(item.previous.measuredDate), String(item.previous.value)))}` : ""}
          </p>
          ${renderIndicatorSparkline(item.history)}
          <ol class="indicator-history">${historyRows}</ol>
        </div>
      </details>`;
    })
    .join("");
}

async function loadIndicators() {
  if (!els.indicatorList || document.body.dataset.view !== "family") return;
  const generation = dashboardGeneration;
  try {
    const { indicators } = await api("/api/checkup-indicators");
    if (generation !== dashboardGeneration) return;
    renderIndicators(indicators || []);
  } catch {
    if (generation !== dashboardGeneration) return;
    renderIndicators([]);
  }
}

function resetIndicatorForm() {
  if (!els.indicatorRows || !els.indicatorDate) return;
  els.indicatorRows.innerHTML = "";
  addIndicatorRow(0);
  els.indicatorDate.value = todayIso();
}

els.toggleIndicatorForm?.addEventListener("click", () => {
  const hidden = els.indicatorForm.classList.toggle("is-hidden");
  if (!hidden) resetIndicatorForm();
});

els.addIndicatorRow?.addEventListener("click", () => addIndicatorRow(0));
els.cancelIndicators?.addEventListener("click", () => els.indicatorForm.classList.add("is-hidden"));

els.saveIndicators?.addEventListener("click", async () => {
  const measuredDate = els.indicatorDate.value;
  const rows = [...els.indicatorRows.querySelectorAll(".indicator-row")];
  const items = [];
  for (const row of rows) {
    const presetIndex = Number(row.querySelector("[data-indicator-name]").value);
    const rawValue = row.querySelector("[data-indicator-value]").value.trim();
    if (rawValue === "") continue; // 空行直接跳过，家属不用手动删
    items.push({
      name: INDICATOR_PRESETS[presetIndex]?.name || "",
      value: Number(rawValue),
      unit: row.querySelector("[data-indicator-unit]").value.trim(),
    });
  }
  if (!items.length) {
    showToast(activeCopy().indicatorNeedValue, "warning");
    return;
  }
  els.saveIndicators.disabled = true;
  try {
    await api("/api/checkup-indicators", { method: "POST", body: { measuredDate, items } });
    els.indicatorForm.classList.add("is-hidden");
    showToast(activeCopy().savedToast, "safe");
    await loadIndicators();
  } catch (error) {
    showToast(error.message || activeCopy().actionFailed, "warning");
  } finally {
    els.saveIndicators.disabled = false;
  }
});

els.indicatorList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-indicator-delete]");
  if (!button) return;
  if (!window.confirm(activeCopy().confirmDeleteIndicator)) return;
  button.disabled = true;
  try {
    await api(`/api/checkup-indicators/${button.dataset.indicatorDelete}`, { method: "DELETE" });
    showToast(activeCopy().deletedToast, "safe");
    await loadIndicators();
  } catch (error) {
    button.disabled = false;
    showToast(error.message || activeCopy().actionFailed, "warning");
  }
});

/* ---------- 家属端：药量管理 ----------
   慢病老人断药很危险，但应用原来只知道「该吃药了」，不知道「还剩多少」。
   库存按药名归集（一天吃几次的药共用一盒），确认吃药时由服务端自动扣减。 */

let stockCache = [];
const editingStockNames = new Set();

function stockStatusText(item) {
  const c = activeCopy();
  if (item.unitsRemaining === null || item.unitsRemaining === undefined) return c.stockNotTracked;
  const parts = [c.stockRemaining(item.unitsRemaining, item.unitsPerDose)];
  if (item.remainingDays === null || item.remainingDays === undefined) {
    parts.push(c.stockNoPlan);
  } else if (item.remainingDays <= 0) {
    parts.push(c.stockRunOut);
  } else {
    parts.push(c.stockDaysLeft(item.remainingDays));
  }
  return parts.join(" · ");
}

function stockViewRow(item) {
  const c = activeCopy();
  const tracked = item.id !== null && item.id !== undefined;
  return `
  <article class="stock-item${item.low ? " is-low" : ""}">
    <div class="stock-main">
      <strong>${escapeHtml(item.medicineName)}</strong>
      <span>${escapeHtml(stockStatusText(item))}</span>
    </div>
    <div class="stock-actions">
      <button class="ghost-button" type="button" data-stock-edit="${escapeHtml(item.medicineName)}">${escapeHtml(tracked ? c.stockEdit : c.stockRegister)}</button>
      ${tracked ? `<button class="ghost-button is-danger" type="button" data-stock-delete="${escapeHtml(item.id)}">${escapeHtml(c.stockStop)}</button>` : ""}
    </div>
  </article>`;
}

function stockEditRow(item) {
  const c = activeCopy();
  return `
  <article class="stock-item is-editing">
    <div class="stock-edit">
      <strong>${escapeHtml(item.medicineName)}</strong>
      <label class="field"><span>${escapeHtml(c.stockUnitsLabel)}</span>
        <input type="number" min="0" max="100000" inputmode="numeric" data-stock-field="unitsRemaining"
               value="${item.unitsRemaining === null || item.unitsRemaining === undefined ? "" : escapeHtml(String(item.unitsRemaining))}" /></label>
      <label class="field"><span>${escapeHtml(c.stockPerDoseLabel)}</span>
        <input type="number" min="1" max="100" inputmode="numeric" data-stock-field="unitsPerDose"
               value="${escapeHtml(String(item.unitsPerDose || 1))}" /></label>
    </div>
    <div class="stock-actions">
      <button class="primary-button" type="button" data-stock-save="${escapeHtml(item.medicineName)}">${escapeHtml(c.saveLabel)}</button>
      <button class="ghost-button" type="button" data-stock-cancel="1">${escapeHtml(c.cancelLabel)}</button>
    </div>
  </article>`;
}

function renderStockList() {
  if (!els.stockList) return;
  if (!stockCache.length) {
    els.stockList.innerHTML = `<p class="muted">${escapeHtml(activeCopy().stockEmpty)}</p>`;
    return;
  }
  els.stockList.innerHTML = stockCache
    .map((item) => (editingStockNames.has(item.medicineName) ? stockEditRow(item) : stockViewRow(item)))
    .join("");
}

async function loadMedicationStock() {
  if (!els.stockList || document.body.dataset.view !== "family") return;
  const generation = dashboardGeneration;
  try {
    const { stocks } = await api("/api/medication-stock");
    if (generation !== dashboardGeneration) return;
    stockCache = stocks || [];
  } catch {
    if (generation !== dashboardGeneration) return;
    stockCache = [];
  }
  renderStockList();
}

els.stockList?.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-stock-edit],[data-stock-delete],[data-stock-save],[data-stock-cancel]");
  if (!target) return;
  const { stockEdit, stockDelete, stockSave, stockCancel } = target.dataset;
  try {
    if (stockCancel) {
      editingStockNames.clear();
      renderStockList();
      return;
    }
    if (stockEdit) {
      editingStockNames.clear();
      editingStockNames.add(stockEdit);
      renderStockList();
      return;
    }
    if (stockSave) {
      const article = target.closest(".stock-item");
      const read = (name) => article.querySelector(`[data-stock-field="${name}"]`)?.value.trim() ?? "";
      const unitsRemaining = read("unitsRemaining");
      const unitsPerDose = read("unitsPerDose") || "1";
      if (unitsRemaining === "") {
        showToast(activeCopy().stockNeedUnits, "warning");
        return;
      }
      target.disabled = true;
      await api("/api/medication-stock", {
        method: "POST",
        body: { medicineName: stockSave, unitsRemaining: Number(unitsRemaining), unitsPerDose: Number(unitsPerDose) },
      });
      editingStockNames.clear();
      showToast(activeCopy().savedToast, "safe");
      await loadMedicationStock();
      return;
    }
    if (stockDelete) {
      if (!window.confirm(activeCopy().confirmDeleteStock)) return;
      target.disabled = true;
      await api(`/api/medication-stock/${stockDelete}`, { method: "DELETE" });
      showToast(activeCopy().deletedToast, "safe");
      await loadMedicationStock();
    }
  } catch (error) {
    target.disabled = false;
    showToast(error.message || activeCopy().actionFailed, "warning");
  }
});

/* ---------- 复诊摘要（可打印） ----------
   数据都在应用里，但家属带老人去医院时拿不出来。这里聚合成一张
   医生能直接看的纸：当前用药 / 血压 / 用药完成情况 / 身体不适 / 体检要点。
   只在按需点击或首次进入家属端时查询，避免每次数据变动都跑一遍聚合。 */

let visitSummaryLoaded = false;

function visitRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

function renderVisitSummary(data) {
  if (!els.visitSheet) return;
  const c = activeCopy();
  const bp = data.bloodPressure || {};
  const ad = data.adherence || {};
  const medications = data.medications || [];
  const unwell = data.unwellEvents || [];
  const checkups = data.checkups || [];
  const indicators = data.indicators || [];
  const ep = data.elderProfile || {};
  const profileSummaryParts = [
    ep.bloodType ? `血型：${ep.bloodType}` : "",
    ep.allergies ? `过敏史：${ep.allergies}` : "",
    ep.chronicConditions ? `慢病史：${ep.chronicConditions}` : "",
    ep.emergencyHospital ? `常用医院：${ep.emergencyHospital}` : "",
    ep.doctorName ? `主治医生：${ep.doctorName}${ep.doctorPhone ? `（${ep.doctorPhone}）` : ""}` : "",
  ].filter(Boolean);

  const medRows = medications.length
    ? medications
        .map(
          (m) =>
            `<tr><td>${escapeHtml(m.timeOfDay)}</td><td>${escapeHtml(m.medicineName)}${Number(m.enabled) === 0 ? `（${escapeHtml(c.visitStopped)}）` : ""}</td><td>${escapeHtml(m.doseNote || "—")}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3">${escapeHtml(c.visitNoMedication)}</td></tr>`;

  const bpRows = (bp.records || [])
    .slice(-20)
    .reverse()
    .map((r) => `<tr><td>${escapeHtml(formatTime(r.measuredAt))}</td><td>${r.systolic}/${r.diastolic} mmHg</td><td>${r.pulse || "—"}</td></tr>`)
    .join("");

  const missedRows = (ad.missedDetails || [])
    .map((r) => `<li>${escapeHtml(formatDayLabel(r.dueDate))} ${escapeHtml(r.timeOfDay)} ${escapeHtml(r.medicineName)}</li>`)
    .join("");

  const unwellRows = unwell.map((e) => `<li>${escapeHtml(formatLocalDay(e.createdAt))} ${escapeHtml(e.rawText)}</li>`).join("");

  const checkupBlocks = checkups
    .map(
      (r) =>
        `<li><strong>${escapeHtml(formatLocalDay(r.createdAt))}</strong>：${escapeHtml(r.summary || "")}</li>`
    )
    .join("");

  const indicatorRows = indicators
    .map((item) => {
      const latest = item.latest || {};
      const unit = latest.unit || item.unit || "";
      const refText = formatIndicatorRange(item.refLow, item.refHigh);
      const flag = item.outOfRange === true ? `（${c.indicatorOutOfRange}）` : "";
      const deltaText =
        item.delta === null || item.delta === undefined
          ? "—"
          : item.delta === 0
            ? "0"
            : `${item.delta > 0 ? "↑" : "↓"} ${Math.abs(item.delta)}`;
      return `<tr>
        <td>${escapeHtml(indicatorLabel(item.name))}</td>
        <td>${escapeHtml(`${latest.value ?? "—"}${unit ? ` ${unit}` : ""}${flag}`)}<small>（${escapeHtml(formatDayLabel(latest.measuredDate))}）</small></td>
        <td>${escapeHtml(refText ? `${refText}${item.unit ? ` ${item.unit}` : ""}` : "—")}</td>
        <td>${escapeHtml(deltaText)}</td>
      </tr>`;
    })
    .join("");

  els.visitSheet.innerHTML = `
    <header class="sheet-head">
      <h2>${escapeHtml(c.visitTitle)}</h2>
      <p>${escapeHtml(data.elder?.displayName || "")}　|　${escapeHtml(c.visitPeriod(data.periodDays, data.periodStart))}　|　${escapeHtml(c.visitGenerated(formatTime(data.generatedAt)))}</p>
      ${profileSummaryParts.length ? `<p class="sheet-profile">${escapeHtml(profileSummaryParts.join("　|　"))}</p>` : ""}
    </header>

    <h3>${escapeHtml(c.visitSectionMedication)}</h3>
    <table class="sheet-table"><thead><tr><th>${escapeHtml(c.visitTime)}</th><th>${escapeHtml(c.visitMedicine)}</th><th>${escapeHtml(c.visitDose)}</th></tr></thead><tbody>${medRows}</tbody></table>

    <h3>${escapeHtml(c.visitSectionBp)}</h3>
    <table class="sheet-table sheet-kv">
      <tbody>
        ${visitRow(c.visitBpCount, String(bp.count ?? 0))}
        ${visitRow(c.visitBpAverage, bp.average ? `${bp.average.systolic}/${bp.average.diastolic} mmHg` : "—")}
        ${visitRow(c.visitBpAbnormal, String(bp.abnormalCount ?? 0))}
        ${visitRow(c.visitBpLatest, bp.latest ? `${bp.latest.systolic}/${bp.latest.diastolic} mmHg（${escapeHtml(formatTime(bp.latest.measuredAt))}）` : "—")}
        ${visitRow(c.visitBpLevel, `${escapeHtml(bp.label || "—")}${bp.advice ? `　${escapeHtml(bp.advice)}` : ""}`)}
      </tbody>
    </table>
    ${bpRows ? `<table class="sheet-table"><thead><tr><th>${escapeHtml(c.visitTime)}</th><th>${escapeHtml(c.visitBpValue)}</th><th>${escapeHtml(c.visitPulse)}</th></tr></thead><tbody>${bpRows}</tbody></table>` : ""}

    <h3>${escapeHtml(c.visitSectionAdherence)}</h3>
    <table class="sheet-table sheet-kv"><tbody>
      ${visitRow(c.visitAdherenceTotal, String(ad.total ?? 0))}
      ${visitRow(c.visitAdherenceDone, String(ad.done ?? 0))}
      ${visitRow(c.visitAdherenceMissed, String(ad.missed ?? 0))}
      ${visitRow(c.visitAdherenceRate, ad.rate === null || ad.rate === undefined ? "—" : `${Math.round(ad.rate * 100)}%`)}
    </tbody></table>
    ${missedRows ? `<p class="sheet-sub">${escapeHtml(c.visitMissedDetail)}</p><ul class="sheet-list">${missedRows}</ul>` : ""}

    <h3>${escapeHtml(c.visitSectionUnwell)}</h3>
    ${unwellRows ? `<ul class="sheet-list">${unwellRows}</ul>` : `<p class="muted">${escapeHtml(c.visitNone)}</p>`}

    <h3>${escapeHtml(c.visitSectionCheckup)}</h3>
    ${checkupBlocks ? `<ul class="sheet-list">${checkupBlocks}</ul>` : `<p class="muted">${escapeHtml(c.visitNone)}</p>`}

    <h3>${escapeHtml(c.visitSectionIndicators)}</h3>
    ${indicatorRows ? `<table class="sheet-table"><thead><tr><th>${escapeHtml(c.visitIndicatorName)}</th><th>${escapeHtml(c.visitIndicatorLatest)}</th><th>${escapeHtml(c.visitIndicatorRef)}</th><th>${escapeHtml(c.visitIndicatorTrend)}</th></tr></thead><tbody>${indicatorRows}</tbody></table>` : `<p class="muted">${escapeHtml(c.visitNone)}</p>`}

    <footer class="sheet-foot">${escapeHtml(c.visitFooter)}</footer>
  `;
}

async function loadVisitSummary() {
  if (!els.visitSheet || document.body.dataset.view !== "family") return;
  const days = els.visitSummaryDays?.value || "30";
  const generation = dashboardGeneration;
  els.loadVisitSummary.disabled = true;
  try {
    const data = await api(`/api/visit-summary?days=${encodeURIComponent(days)}`);
    if (generation !== dashboardGeneration) return;
    renderVisitSummary(data);
    visitSummaryLoaded = true;
  } catch (error) {
    els.visitSheet.innerHTML = `<p class="muted">${escapeHtml(error.message || activeCopy().actionFailed)}</p>`;
  } finally {
    els.loadVisitSummary.disabled = false;
  }
}

els.loadVisitSummary?.addEventListener("click", loadVisitSummary);
els.visitSummaryDays?.addEventListener("change", loadVisitSummary);
els.printVisitSummary?.addEventListener("click", () => window.print());

/* ---------- 家属端：填写自己的联系电话 ----------
   长辈端那个「打电话给家人」按钮的号码就来自这里。不填就不显示按钮。 */

function renderCaregiverPhone(user) {
  if (!els.caregiverPhone || document.body.dataset.view !== "family") return;
  els.caregiverPhone.value = user?.phone || "";
  if (els.phoneStatus) {
    els.phoneStatus.textContent = user?.phone ? activeCopy().phoneSaved(user.phone) : activeCopy().phoneEmptyHint;
    els.phoneStatus.dataset.tone = user?.phone ? "safe" : "";
  }
}

els.saveCaregiverPhone?.addEventListener("click", async () => {
  const phone = els.caregiverPhone.value.trim();
  els.saveCaregiverPhone.disabled = true;
  try {
    const result = await api("/api/profile", { method: "POST", body: { phone } });
    showToast(result.phone ? activeCopy().phoneSavedToast : activeCopy().phoneClearedToast, "safe");
    await loadDashboard();
  } catch (error) {
    showToast(error.message || activeCopy().actionFailed, "warning");
  } finally {
    els.saveCaregiverPhone.disabled = false;
  }
});

/* ---------- 家属端：切换正在照护的长辈 ---------- */

function renderElderSwitcher(elders) {
  if (!els.elderSwitcher || !els.elderSwitcherSelect) return;
  const list = elders || [];
  if (document.body.dataset.view !== "family" || list.length < 2) {
    els.elderSwitcher.classList.add("is-hidden");
    return;
  }
  els.elderSwitcher.classList.remove("is-hidden");
  els.elderSwitcherSelect.innerHTML = list
    .map((elder) => `<option value="${escapeHtml(elder.id)}"${elder.isActive ? " selected" : ""}>${escapeHtml(elder.displayName)}</option>`)
    .join("");
}

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
  refreshVoiceButtons();
}

function setLanguage(nextLang) {
  stopSpeaking();
  currentLang = nextLang === "en" ? "en" : "zh";
  localStorage.setItem("techguard_lang", currentLang);
  const url = new URL(window.location.href);
  if (currentLang === "en") url.searchParams.set("lang", "en");
  else url.searchParams.delete("lang");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  // 复诊摘要是一次性生成的 HTML 片段（内含大量拼接文本，解析不到词典），
  // 切语言后必须让它重新生成一次，否则打印出来的稿子会中英混杂。
  visitSummaryLoaded = false;
  if (currentDashboard) renderDashboard(currentDashboard);
  else renderLoggedOut();
  applyLanguage();
}

els.languageToggle?.addEventListener("click", () => {
  setLanguage(currentLang === "en" ? "zh" : "en");
});

let activeRecognition = null;
let activeVoiceButton = null;

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getVoiceCopy() {
  return voiceCopies[currentLang] || voiceCopies.zh;
}

function voiceStatusFor(button) {
  return button.closest(".voice-input")?.querySelector(".voice-status");
}

// state 用来标记「常驻」提示（浏览器不支持 / 非安全上下文）——这种提示会一直挂着，
// 切语言后必须跟着重写；瞬时提示（识别中、出错）不标记，由下一次交互覆盖。
function setVoiceState(button, message, tone = "normal", state = "") {
  const status = voiceStatusFor(button);
  if (status) {
    status.textContent = message;
    status.dataset.tone = tone;
    status.dataset.state = state;
  }
}

function resetVoiceButton(button) {
  if (!button) return;
  button.classList.remove("is-listening");
  button.textContent = getVoiceCopy().idle;
  button.setAttribute("aria-pressed", "false");
}

function refreshVoiceButtons() {
  const copyText = getVoiceCopy();
  document.querySelectorAll("[data-voice-target]").forEach((button) => {
    if (!button.classList.contains("is-listening")) {
      button.textContent = copyText.idle;
    }
    // 常驻提示跟着语言走，否则切到英文后这里会一直挂着中文说明
    const status = voiceStatusFor(button);
    if (status?.dataset.state === "unsupported") status.textContent = copyText.unsupported;
    else if (status?.dataset.state === "insecure") status.textContent = copyText.insecure;
  });
}

function appendVoiceText(target, text) {
  const transcript = String(text || "").trim();
  if (!transcript) return;
  const current = target.value.trim();
  const needsSeparator = current && !/[，。！？,.!?\s]$/.test(current);
  target.value = current ? `${current}${needsSeparator ? "，" : ""}${transcript}` : transcript;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus();
}

function setupVoiceInputs() {
  const buttons = document.querySelectorAll("[data-voice-target]");
  if (!buttons.length) return;

  const SpeechRecognition = getSpeechRecognition();
  const insecure = !window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname);

  buttons.forEach((button) => {
    const target = document.querySelector(button.dataset.voiceTarget);
    button.textContent = getVoiceCopy().idle;
    button.setAttribute("aria-pressed", "false");

    if (!target || !SpeechRecognition || insecure) {
      button.disabled = true;
      setVoiceState(button, insecure ? getVoiceCopy().insecure : getVoiceCopy().unsupported, "warning", insecure ? "insecure" : "unsupported");
      return;
    }

    button.addEventListener("click", () => {
      const copyText = getVoiceCopy();
      if (activeRecognition && activeVoiceButton === button) {
        activeRecognition.stop();
        return;
      }
      if (activeRecognition) {
        activeRecognition.abort();
        resetVoiceButton(activeVoiceButton);
      }

      const recognition = new SpeechRecognition();
      activeRecognition = recognition;
      activeVoiceButton = button;
      let finalTranscript = "";
      let interimTranscript = "";

      recognition.lang = currentLang === "en" ? "en-US" : "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      button.classList.add("is-listening");
      button.textContent = copyText.listening;
      button.setAttribute("aria-pressed", "true");
      setVoiceState(button, copyText.starting, "pending");

      recognition.onresult = (event) => {
        interimTranscript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index][0]?.transcript || "";
          if (event.results[index].isFinal) finalTranscript += transcript;
          else interimTranscript += transcript;
        }
        if (interimTranscript) setVoiceState(button, copyText.interim(interimTranscript), "pending");
      };

      recognition.onerror = (event) => {
        const message = event.error === "not-allowed" || event.error === "service-not-allowed"
          ? copyText.denied
          : event.error === "no-speech"
            ? copyText.noSpeech
            : copyText.error;
        setVoiceState(button, message, "warning");
      };

      recognition.onend = () => {
        const text = finalTranscript || interimTranscript;
        if (text) {
          appendVoiceText(target, text);
          setVoiceState(button, copyText.done, "safe");
        }
        resetVoiceButton(button);
        activeRecognition = null;
        activeVoiceButton = null;
      };

      try {
        recognition.start();
      } catch {
        setVoiceState(button, copyText.error, "warning");
        resetVoiceButton(button);
        activeRecognition = null;
        activeVoiceButton = null;
      }
    });
  });
}

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

let pendingFraudImageData = "";
const fraudImageInput = document.querySelector("#fraudImageInput");
const fraudImageName = document.querySelector("#fraudImageName");
const fraudSourceNote = document.querySelector("#fraudSourceNote");

fraudImageInput?.addEventListener("change", () => {
  const file = fraudImageInput.files?.[0];
  if (!file) {
    pendingFraudImageData = "";
    if (fraudImageName) fraudImageName.textContent = "支持直接截图上传，不用自己打字或复制。";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingFraudImageData = String(reader.result || "");
    if (fraudImageName) fraudImageName.textContent = `已选择截图：${file.name}`;
  };
  reader.readAsDataURL(file);
});

document.querySelector("#analyzeFraud").addEventListener("click", async () => {
  const text = els.fraudInput.value.trim();
  if (!text && !pendingFraudImageData) {
    setElderReply("请先粘贴可疑短信，或者上传一张可疑聊天/短信截图，我帮您看看。");
    return;
  }
  try {
    const { result } = await api("/api/fraud/check", {
      method: "POST",
      body: { text, imageData: pendingFraudImageData || undefined },
    });
    renderFraudResult(result);
    if (fraudSourceNote) {
      if (result.source === "local-fallback") {
        fraudSourceNote.textContent = "提示：当前未启用图片智能识别，请以家人人工核对为准。";
        fraudSourceNote.classList.remove("is-hidden");
      } else {
        fraudSourceNote.classList.add("is-hidden");
      }
    }
    logEvent(result.score >= 80 ? `防骗识别：高危，评分 ${result.score}。` : `防骗识别：评分 ${result.score}。`);
    await loadDashboard();
  } catch (error) {
    setElderReply(error.message || "检测失败，请稍后再试。");
  }
});

document.querySelector("#clearFraud").addEventListener("click", () => {
  els.fraudInput.value = "";
  pendingFraudImageData = "";
  if (fraudImageInput) fraudImageInput.value = "";
  if (fraudImageName) fraudImageName.textContent = "支持直接截图上传，不用自己打字或复制。";
  if (fraudSourceNote) fraudSourceNote.classList.add("is-hidden");
  els.fraudScore.textContent = "--";
  els.fraudMeter.style.width = "0%";
  els.fraudLevel.textContent = "等待检测";
  els.riskReasons.innerHTML = "<li>暂无检测结果</li>";
  setElderReply("输入内容或上传截图后，小护会用简单的话说明风险。");
});

/* 家属端吃药提醒：一次可以保存多个用药时间，不用同一张表单反复填。 */
const selectedMedicineTimes = new Set();

// 清空「新的吃药计划」表单：切换长辈/登出时必须调用，否则选好的时间会串到另一位长辈名下
function resetMedicationForm() {
  selectedMedicineTimes.clear();
  renderMedicineTimeChips();
  if (els.medicineName) els.medicineName.value = "";
  if (els.medicineDose) els.medicineDose.value = "";
}

function renderMedicineTimeChips() {
  const box = document.querySelector("#medicineTimeChips");
  if (!box) return;
  const noTimeHint = currentLang === "en" ? "No time selected yet. Tap a common time above, or pick your own." : "还没有选时间。点上面的常用时间，或在时间框里自己选。";
  const times = Array.from(selectedMedicineTimes).sort();
  if (!times.length) {
    box.innerHTML = `<span class="muted">${escapeHtml(noTimeHint)}</span>`;
  } else {
    box.innerHTML = times
      .map(
        (time) =>
          `<button class="time-chip" type="button" data-remove-med-time="${time}" aria-label="${escapeHtml(activeCopy().removeTimeLabel(time))}">${time}<span aria-hidden="true">×</span></button>`
      )
      .join("");
  }
  const save = document.querySelector("#addMedicineSchedule");
  if (save) save.textContent = times.length > 1 ? `保存吃药提醒（${times.length} 个时间）` : "保存吃药提醒";
}

function addMedicineTime(time) {
  const value = String(time || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(value)) return;
  selectedMedicineTimes.add(value);
  renderMedicineTimeChips();
}

document.querySelector("#medicineTimePresets")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-med-time]");
  if (button) addMedicineTime(button.dataset.medTime);
});

document.querySelector("#medicineTimeChips")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-remove-med-time]");
  if (!chip) return;
  selectedMedicineTimes.delete(chip.dataset.removeMedTime);
  renderMedicineTimeChips();
});

els.medicineTime?.addEventListener("change", () => {
  addMedicineTime(els.medicineTime.value);
  els.medicineTime.value = "";
});

renderMedicineTimeChips();

const medicineRepeatRuleEl = document.querySelector("#medicineRepeatRule");
const medicineRepeatDaysEl = document.querySelector("#medicineRepeatDays");
const medicineStartDateEl = document.querySelector("#medicineStartDate");
const medicineEndDateEl = document.querySelector("#medicineEndDate");
const taskRepeatRuleEl = document.querySelector("#taskRepeatRule");

medicineRepeatRuleEl?.addEventListener("change", () => {
  medicineRepeatDaysEl?.classList.toggle("is-hidden", medicineRepeatRuleEl.value !== "weekly");
});

document.querySelector("#addMedicineSchedule").addEventListener("click", async () => {
  const medicineName = els.medicineName.value.trim();
  const times = Array.from(selectedMedicineTimes).sort();
  const repeatRule = medicineRepeatRuleEl?.value || "daily";
  const repeatDays = repeatRule === "weekly"
    ? Array.from(medicineRepeatDaysEl?.querySelectorAll("input:checked") || []).map((el) => el.value).join(",")
    : "";
  const startDate = medicineStartDateEl?.value || "";
  const endDate = medicineEndDateEl?.value || "";
  if (!medicineName) {
    updateSendStatus(activeCopy().needMedicineName, "warning");
    return;
  }
  if (!times.length) {
    updateSendStatus(activeCopy().needMedicineTime, "warning");
    return;
  }
  if (repeatRule === "weekly" && !repeatDays) {
    updateSendStatus("每周固定日用药请至少勾选一天。", "warning");
    return;
  }
  try {
    for (const timeOfDay of times) {
      await api("/api/medications", {
        method: "POST",
        body: {
          medicineName,
          timeOfDay,
          doseNote: els.medicineDose.value.trim(),
          repeatRule,
          repeatDays,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
    }
    els.medicineName.value = "";
    els.medicineDose.value = "";
    if (medicineRepeatRuleEl) medicineRepeatRuleEl.value = "daily";
    medicineRepeatDaysEl?.classList.add("is-hidden");
    medicineRepeatDaysEl?.querySelectorAll("input").forEach((el) => { el.checked = false; });
    if (medicineStartDateEl) medicineStartDateEl.value = "";
    if (medicineEndDateEl) medicineEndDateEl.value = "";
    selectedMedicineTimes.clear();
    renderMedicineTimeChips();
    logEvent(`吃药安排：${medicineName} 已保存 ${times.length} 个时间。`);
    updateSendStatus(`已保存：${medicineName}（${times.join("、")}）。`, "safe");
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
        repeatRule: taskRepeatRuleEl?.value || "none",
      },
    });
    els.taskTitle.value = "";
    els.taskDescription.value = "";
    if (taskRepeatRuleEl) taskRepeatRuleEl.value = "none";
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
        careTime: els.weatherCareTime.value || "08:00",
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
    const { report } = await api("/api/checkups/analyze", { method: "POST", body: { imageData, fileName: file.name }, timeoutMs: 90000 });
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

els.elderSwitcherSelect?.addEventListener("change", async (event) => {
  const elderId = event.target.value;
  event.target.disabled = true;
  try {
    await api("/api/elders/switch", { method: "POST", body: { elderId } });
    editingMedicationIds.clear();
    editingTaskIds.clear();
    editingStockNames.clear();
    resetMedicationForm();
    visitSummaryLoaded = false;
    showToast(activeCopy().switchedToast, "safe");
    await loadDashboard();
  } catch (error) {
    showToast(error.message || activeCopy().actionFailed, "warning");
    await loadDashboard();
  } finally {
    event.target.disabled = false;
  }
});

els.pushNudge?.addEventListener("click", enablePhoneNotifications);

els.enablePush.addEventListener("click", () => {
  if (els.enablePush.dataset.state === "on") disablePhoneNotifications();
  else enablePhoneNotifications();
});
els.contactCaregiver.addEventListener("click", async () => {
  els.contactCaregiver.disabled = true;
  try {
    const { result } = await api("/api/help/contact-caregiver", { method: "POST" });
    // 飞书没配好时必须说清楚，否则老人以为家人已经知道，可能耽误求助。
    const delivered = result?.ok === true;
    showToast(delivered ? activeCopy().sosSent : activeCopy().sosSentInApp, delivered ? "safe" : "warning", 9000);
    updatePushStatus(delivered ? activeCopy().sosSentHint : activeCopy().sosSentInApp, delivered ? "safe" : "warning");
    await loadDashboard();
  } catch {
    showToast(activeCopy().actionFailed, "warning");
  } finally {
    els.contactCaregiver.disabled = false;
  }
});

els.elderCheckIn?.addEventListener("click", async () => {
  els.elderCheckIn.disabled = true;
  try {
    const result = await api("/api/help/check-in", { method: "POST" });
    if (result.alreadyCheckedIn) {
      showToast(activeCopy().checkInAlready, "info", 6000);
    } else {
      const delivered = result.result?.ok === true;
      showToast(delivered ? activeCopy().checkInSent : activeCopy().checkInSentInApp, delivered ? "safe" : "warning", 6000);
    }
  } catch {
    showToast(activeCopy().actionFailed, "warning");
  } finally {
    els.elderCheckIn.disabled = false;
  }
});

els.todayList?.addEventListener("click", async (event) => {
  const goto = event.target.closest("[data-today-goto]");
  if (goto) {
    document.querySelector(goto.dataset.todayGoto)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const button = event.target.closest("[data-today-complete]");
  if (!button) return;
  const [kind, id] = String(button.dataset.todayComplete).split(":");
  if (!id) return;
  button.disabled = true;
  try {
    if (kind === "medication") {
      await api(`/api/medications/${id}/complete`, { method: "POST", body: { note: "老人确认已吃药" } });
    } else {
      await api(`/api/tasks/${id}/complete`, { method: "POST", body: { note: "" } });
    }
    showToast(activeCopy().todayBoard.doneToast, "safe");
    await loadDashboard();
  } catch {
    button.disabled = false;
    showToast(activeCopy().actionFailed, "warning");
  }
});

document.querySelector("#planTravel").addEventListener("click", async () => {
  const query = els.travelInput.value.trim();
  if (!query) {
    els.travelReply.textContent = "奶奶，您告诉我想什么时候、去哪里，我帮您慢慢安排。";
    return;
  }
  const { plan } = await api("/api/travel/plan", { method: "POST", body: { query } });
  lastTravelPlan = plan;
  // 原来这里是 `|| (plan.risk_level === "medium" ? "需要留意天气" : "天气平稳")`：
  // 没有任何天气信息时也会断言「天气平稳」——又一处把猜测讲成事实。
  els.weatherTrace.textContent = plan.weather_care || currentDashboard?.weatherCare?.text || activeCopy().weatherUnknown;
  els.routeTrace.textContent = plan.route_summary || `前往${plan.destination}`;
  els.travelReply.textContent = plan.reply_for_elder;
  renderSourceNote(els.travelSourceNote, plan.source, LIVE_ROUTE_SOURCES, activeCopy().routeNotLiveHint);
  await loadDashboard();
});

/* ---------- 生活事件记录 ----------
   以前这里是假的：点「提取并记录」只改一句提示文字，老人说的话被静默丢弃。
   现在真的写入 life_events，家属端「照护记录」看得到；身体不适还会自动通知家属。 */

const LIFE_EVENT_KINDS = ["medication", "meal", "sleep", "outing", "unwell", "mood", "other"];

function lifeKindLabel(kind) {
  const labels = activeCopy().lifeKinds || {};
  return labels[kind] || labels.other || kind;
}

function renderLifeEvents(events) {
  const list = events || [];
  const html = list.length
    ? list
        .map((event) => {
          const happened = event.occurredAt ? event.occurredAt : activeCopy().lifeUnknownTime;
          const source = event.source === "voice" ? activeCopy().lifeSourceVoice : activeCopy().lifeSourceText;
          const remove = document.body.dataset.view === "family"
            ? `<button class="ghost-button is-danger life-delete" type="button" data-life-delete="${escapeHtml(event.id)}">${escapeHtml(activeCopy().deleteLabel)}</button>`
            : "";
          return `
          <tr data-kind="${escapeHtml(event.kind)}">
            <td><span class="life-kind life-kind-${escapeHtml(event.kind)}">${escapeHtml(lifeKindLabel(event.kind))}</span></td>
            <td>${escapeHtml(event.rawText)}</td>
            <td>${escapeHtml(happened)}</td>
            <td><span class="life-source">${escapeHtml(source)}</span>${remove}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="4">${escapeHtml(activeCopy().noLifeEvents)}</td></tr>`;
  // 只渲染当前角色那张可见的表：两张表都写会让隐藏的那张也挂上按钮，事件又绑不到。
  const target = document.body.dataset.view === "family" ? els.familyMemoryTable : els.memoryTable;
  if (target) target.innerHTML = html;
}

async function submitLifeEvent(text, source) {
  const value = String(text || "").trim();
  if (!value) {
    els.memoryReply.textContent = activeCopy().lifeNeedText;
    showToast(activeCopy().lifeNeedText, "warning");
    return;
  }
  els.saveMemory.disabled = true;
  try {
    const { event } = await api("/api/life-events", { method: "POST", body: { text: value, source } });
    els.memoryInput.value = "";
    const isUnwell = event.kind === "unwell";
    els.memoryReply.textContent = isUnwell
      ? activeCopy().lifeSavedUnwell(event.occurredAt || "")
      : activeCopy().lifeSaved(lifeKindLabel(event.kind), event.occurredAt || "");
    showToast(isUnwell ? activeCopy().lifeUnwellToast : activeCopy().lifeSavedToast, isUnwell ? "warning" : "safe", isUnwell ? 8000 : 4000);
    await loadDashboard();
  } catch (error) {
    els.memoryReply.textContent = error.message || activeCopy().actionFailed;
    showToast(error.message || activeCopy().actionFailed, "warning");
  } finally {
    els.saveMemory.disabled = false;
  }
}

document.querySelector("#saveMemory").addEventListener("click", () => submitLifeEvent(els.memoryInput.value, "text"));

document.querySelector("#memoryQuickPicks")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-memory-quick]");
  if (!button) return;
  // 快捷记录一键提交，不打字：老人打字慢，说一句更难。
  submitLifeEvent(button.dataset.memoryQuick, "text");
});

async function handleLifeEventClick(event) {
  const button = event.target.closest("[data-life-delete]");
  if (!button) return;
  if (!window.confirm(activeCopy().confirmDeleteLifeEvent)) return;
  button.disabled = true;
  try {
    await api(`/api/life-events/${button.dataset.lifeDelete}`, { method: "DELETE" });
    showToast(activeCopy().deletedToast, "safe");
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    showToast(error.message || activeCopy().actionFailed, "warning");
  }
}

els.memoryTable?.addEventListener("click", handleLifeEventClick);
els.familyMemoryTable?.addEventListener("click", handleLifeEventClick);

document.querySelector("#askMedication").addEventListener("click", () => {
  const pending = currentDashboard?.medications?.filter((item) => item.status !== "done") || [];
  const copyText = activeCopy();
  // 原来写死「奶奶」，可演示长辈是「张爷爷」——称呼要用当前长辈的名字
  const name = displayNameFor(currentDashboard?.elder?.displayName || "");
  els.memoryReply.textContent = pending.length
    ? copyText.askPending(name, pending.length)
    : copyText.askAllDone(name);
});

async function loadDashboard() {
  try {
    currentDashboard = await api("/api/dashboard");
    renderDashboard(currentDashboard);
  } catch (error) {
    // 只有「确实未登录」才回登录页。网络抖动或服务端 5xx 时把用户踢回去，会让正在操作的
    // 家属一头雾水：密码框被清空、刚才那一步是否成功完全无从判断。
    if (error.status === 401) {
      renderLoggedOut();
      return;
    }
    showToast(error.message || activeCopy().loadFailed, "warning");
  }
}

function renderDashboard(data) {
  const viewRole = data.user.role === "caregiver" ? "family" : "elder";
  // 新的仪表盘数据 → 此前在途的子面板请求全部作废
  dashboardGeneration += 1;
  const profile = roleProfile(data.user, data.elder);

  // 长辈端和家属端在字号、信息密度上差异很大，用 body 属性给 CSS 一个稳定的钩子。
  document.body.dataset.view = viewRole;

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

  loadMedicineSchedules();
  loadMedicationStock();
  loadIndicators();
  loadInvites();
  loadNotificationChannels();
  // 登录后要立刻拉一次通知：只靠 30 秒轮询的话，家属登录后头 30 秒看不到告警铃和未读数。
  loadNotifications();
  renderTasks(data.tasks);
  renderAlerts(data.alerts);
  renderMissedMedications(data.missedMedications || []);
  renderWeather(data.weather, data.weatherCare);
  renderBloodPressure(data.bloodPressure || [], data.bloodPressureSummary);
  renderCheckups(data.checkups || []);
  renderMetrics(data);
  renderMembers(data);
  renderTodayBoard(data);
  renderLifeEvents(data.lifeEvents || []);
  renderDailySummary(data);
  renderEmergencyContacts(data.emergencyContacts || []);
  renderElderProfile(data.elderProfile || null);
  renderElderSwitcher(data.elders || []);
  renderCaregiverPhone(data.user);
  if (!visitSummaryLoaded) loadVisitSummary();
  wireSpeakButtons();
  // 只在日志为空时补一条开场记录：原来每次刷新都无条件覆盖，logEvent 刚写的那行会被立刻抹掉。
  if (!els.eventLog?.children.length) logEvent(activeCopy().connectedLog);
  applyLanguage();
  startTodayClock();
  if (viewRole === "elder") refreshPushStatus();
}

function renderLoggedOut() {
  lastFraudResult = null;
  lastTravelPlan = null;
  visitSummaryLoaded = false;
  stopSpeaking();
  // 顶栏在登录页也会渲染，登出必须把通知中心一起清干净：
  // 否则上一个账号的通知正文（长辈天气提醒、身体不适……）会原样留在登录页上被下一个人看到。
  resetNotificationCenter();
  // 邀请链接是上一个账号生成的，登出必须收起来（新 token 只在生成时显示一次）
  els.inviteResult?.classList.add("is-hidden");
  if (els.inviteLink) els.inviteLink.value = "";
  // 表单残留也要清：给长辈 A 选好的「用药时间」胶囊会跟着切到长辈 B，容易误存到别人名下
  resetMedicationForm();
  // 角色标记也要复位，不然登录页会继承上一个角色的样式（长辈端是放大字号）。
  delete document.body.dataset.view;
  els.loginScreen.classList.remove("is-hidden");
  els.appShell.classList.add("is-hidden");
  els.currentRoleChip.classList.add("is-hidden");
}

function resetNotificationCenter() {
  lastUnreadCount = 0;
  els.notifBell?.classList.add("is-hidden");
  els.notifBadge?.classList.add("is-hidden");
  els.notifDropdown?.classList.add("is-hidden");
  if (els.notifList) els.notifList.innerHTML = "";
}

function roleProfile(user, elder) {
  if (user.role === "caregiver") {
    return activeCopy().caregiverProfile(displayNameFor(user.displayName), displayNameFor(elder.displayName));
  }
  return activeCopy().elderProfile(displayNameFor(user.displayName));
}

// 每渲染一次仪表盘就推进一个代次。各子面板的加载函数在 await 前后比对这个代次，
// 用来丢弃「过期响应」：切换长辈时先发出、后返回的旧请求会把新长辈的数据覆盖掉
// （列表换了、标题没换），而且之后不会自愈——家属可能照着错人的计划去改药。
let dashboardGeneration = 0;

let scheduleCache = [];
const editingMedicationIds = new Set();

// 家属端要能看到「已停用」的计划才能重新启用它，所以这里用 GET /api/medications，
// 而不是 dashboard 里那份只有今天、只有启用中的列表。
async function loadMedicineSchedules() {
  if (document.body.dataset.view !== "family" || !els.medicineScheduleList) return;
  const generation = dashboardGeneration;
  try {
    const { medications } = await api("/api/medications");
    if (generation !== dashboardGeneration) return;
    scheduleCache = medications || [];
  } catch {
    if (generation !== dashboardGeneration) return;
    scheduleCache = [];
  }
  renderMedicineSchedules();
}

function scheduleViewRow(item) {
  const disabled = Number(item.enabled) === 0;
  const dose = item.dose_note || activeCopy().noExtra;
  return `
  <article class="reminder-item schedule-item${disabled ? " is-disabled" : ""}">
    <div>
      <strong>${escapeHtml(item.time_of_day)} · ${escapeHtml(item.medicine_name)}</strong>
      <span>${escapeHtml(dose)}${disabled ? ` · ${escapeHtml(activeCopy().disabledTag)}` : ""}</span>
    </div>
    <div class="schedule-actions">
      <button class="ghost-button" type="button" data-med-edit="${escapeHtml(item.id)}">${escapeHtml(activeCopy().editLabel)}</button>
      <button class="ghost-button" type="button" data-med-toggle="${escapeHtml(item.id)}">${escapeHtml(disabled ? activeCopy().enableLabel : activeCopy().disableLabel)}</button>
      <button class="ghost-button is-danger" type="button" data-med-delete="${escapeHtml(item.id)}">${escapeHtml(activeCopy().deleteLabel)}</button>
    </div>
  </article>`;
}

function scheduleEditRow(item) {
  return `
  <article class="reminder-item schedule-item is-editing">
    <div class="schedule-edit">
      <label class="field"><span>${escapeHtml(activeCopy().medicineNameLabel)}</span>
        <input type="text" data-med-field="medicineName" value="${escapeHtml(item.medicine_name)}" /></label>
      <label class="field"><span>${escapeHtml(activeCopy().timeLabel)}</span>
        <input type="time" data-med-field="timeOfDay" value="${escapeHtml(String(item.time_of_day || "").slice(0, 5))}" /></label>
      <label class="field"><span>${escapeHtml(activeCopy().noteLabel)}</span>
        <input type="text" data-med-field="doseNote" value="${escapeHtml(item.dose_note || "")}" /></label>
    </div>
    <div class="schedule-actions">
      <button class="primary-button" type="button" data-med-save="${escapeHtml(item.id)}">${escapeHtml(activeCopy().saveLabel)}</button>
      <button class="ghost-button" type="button" data-med-cancel="${escapeHtml(item.id)}">${escapeHtml(activeCopy().cancelLabel)}</button>
    </div>
  </article>`;
}

function renderMedicineSchedules() {
  if (!els.medicineScheduleList) return;
  if (!scheduleCache.length) {
    els.medicineScheduleList.innerHTML = `<p class="muted">${escapeHtml(activeCopy().noMedication)}</p>`;
    return;
  }
  els.medicineScheduleList.innerHTML = scheduleCache
    .map((item) => (editingMedicationIds.has(item.id) ? scheduleEditRow(item) : scheduleViewRow(item)))
    .join("");
}

els.medicineScheduleList?.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-med-edit],[data-med-toggle],[data-med-delete],[data-med-save],[data-med-cancel]");
  if (!target) return;
  const { medEdit, medToggle, medDelete, medSave, medCancel } = target.dataset;
  try {
    if (medEdit) {
      editingMedicationIds.add(medEdit);
      renderMedicineSchedules();
      return;
    }
    if (medCancel) {
      editingMedicationIds.delete(medCancel);
      renderMedicineSchedules();
      return;
    }
    if (medSave) {
      const article = target.closest(".schedule-item");
      const read = (name) => article.querySelector(`[data-med-field="${name}"]`)?.value.trim() ?? "";
      const medicineName = read("medicineName");
      const timeOfDay = read("timeOfDay");
      if (!medicineName) {
        showToast(activeCopy().needMedicineName, "warning");
        return;
      }
      if (!timeOfDay) {
        showToast(activeCopy().needMedicineTime, "warning");
        return;
      }
      target.disabled = true;
      await api(`/api/medications/${medSave}`, { method: "POST", body: { medicineName, timeOfDay, doseNote: read("doseNote") } });
      editingMedicationIds.delete(medSave);
      showToast(activeCopy().savedToast, "safe");
      await loadDashboard();
      await loadMedicineSchedules();
      return;
    }
    if (medToggle) {
      const item = scheduleCache.find((entry) => entry.id === medToggle);
      const nextEnabled = Number(item?.enabled) === 0;
      target.disabled = true;
      await api(`/api/medications/${medToggle}`, { method: "POST", body: { enabled: nextEnabled } });
      showToast(nextEnabled ? activeCopy().enabledToast : activeCopy().disabledToast, "safe");
      await loadDashboard();
      await loadMedicineSchedules();
      return;
    }
    if (medDelete) {
      const item = scheduleCache.find((entry) => entry.id === medDelete);
      if (!window.confirm(activeCopy().confirmDeleteMedication(item?.medicine_name || ""))) return;
      target.disabled = true;
      await api(`/api/medications/${medDelete}`, { method: "DELETE" });
      showToast(activeCopy().deletedToast, "safe");
      await loadDashboard();
      await loadMedicineSchedules();
    }
  } catch (error) {
    target.disabled = false;
    showToast(error.message || activeCopy().actionFailed, "warning");
  }
});

// 家属端的吃药计划由 loadMedicineSchedules() 渲染（用 GET /api/medications，
// 这样能看到已停用的计划并重新启用）；长辈端不显示这个列表。

/* ---------- 家属端：提醒的修改与删除 ----------
   家属原来只能新建，药名打错或者老人停药了都没法处理。
   停用 = 保留历史记录、只是不再提醒；删除 = 连同记录一起移除。 */

let taskCache = [];

function taskViewRow(item) {
  return `
  <article class="reminder-item schedule-item">
    <div>
      <strong>${escapeHtml(item.due_date)} ${escapeHtml(item.due_time)} · ${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.description || activeCopy().noExtra)} · ${escapeHtml(statusLabel(item.status))}</span>
    </div>
    <div class="schedule-actions">
      <button class="ghost-button" type="button" data-task-edit="${escapeHtml(item.id)}">${escapeHtml(activeCopy().editLabel)}</button>
      <button class="ghost-button is-danger" type="button" data-task-delete="${escapeHtml(item.id)}">${escapeHtml(activeCopy().deleteLabel)}</button>
    </div>
  </article>`;
}

function taskEditRow(item) {
  return `
  <article class="reminder-item schedule-item is-editing">
    <div class="schedule-edit">
      <label class="field"><span>${escapeHtml(activeCopy().taskLabel)}</span>
        <input type="text" data-task-field="title" value="${escapeHtml(item.title)}" /></label>
      <label class="field"><span>${escapeHtml(activeCopy().dateLabel)}</span>
        <input type="date" data-task-field="dueDate" value="${escapeHtml(item.due_date)}" /></label>
      <label class="field"><span>${escapeHtml(activeCopy().timeLabel)}</span>
        <input type="time" data-task-field="dueTime" value="${escapeHtml(String(item.due_time || "").slice(0, 5))}" /></label>
      <label class="field"><span>${escapeHtml(activeCopy().noteLabel)}</span>
        <input type="text" data-task-field="description" value="${escapeHtml(item.description || "")}" /></label>
    </div>
    <div class="schedule-actions">
      <button class="primary-button" type="button" data-task-save="${escapeHtml(item.id)}">${escapeHtml(activeCopy().saveLabel)}</button>
      <button class="ghost-button" type="button" data-task-cancel="${escapeHtml(item.id)}">${escapeHtml(activeCopy().cancelLabel)}</button>
    </div>
  </article>`;
}

function renderTasks(items) {
  taskCache = items || [];
  const empty = `<p class="muted">${activeCopy().noTask}</p>`;
  if (!taskCache.length) {
    els.familyTaskList.innerHTML = empty;
    return;
  }
  els.familyTaskList.innerHTML = taskCache
    .map((item) => (editingTaskIds.has(item.id) ? taskEditRow(item) : taskViewRow(item)))
    .join("");
}

const editingTaskIds = new Set();

function collectTaskFields(article) {
  const read = (name) => article.querySelector(`[data-task-field="${name}"]`)?.value.trim() ?? "";
  return {
    title: read("title"),
    dueDate: read("dueDate"),
    dueTime: read("dueTime"),
    description: read("description"),
  };
}

els.familyTaskList?.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-task-edit],[data-task-delete],[data-task-save],[data-task-cancel]");
  if (!target) return;
  const { taskEdit, taskDelete, taskSave, taskCancel } = target.dataset;
  try {
    if (taskEdit) {
      editingTaskIds.add(taskEdit);
      renderTasks(taskCache);
      return;
    }
    if (taskCancel) {
      editingTaskIds.delete(taskCancel);
      renderTasks(taskCache);
      return;
    }
    if (taskSave) {
      const article = target.closest(".schedule-item");
      const fields = collectTaskFields(article);
      if (!fields.title) {
        showToast(activeCopy().needTaskTitle, "warning");
        return;
      }
      target.disabled = true;
      await api(`/api/tasks/${taskSave}`, { method: "POST", body: fields });
      editingTaskIds.delete(taskSave);
      showToast(activeCopy().savedToast, "safe");
      await loadDashboard();
      return;
    }
    if (taskDelete) {
      const item = taskCache.find((entry) => entry.id === taskDelete);
      if (!window.confirm(activeCopy().confirmDeleteTask(item?.title || ""))) return;
      target.disabled = true;
      await api(`/api/tasks/${taskDelete}`, { method: "DELETE" });
      showToast(activeCopy().deletedToast, "safe");
      await loadDashboard();
    }
  } catch (error) {
    target.disabled = false;
    showToast(error.message || activeCopy().actionFailed, "warning");
  }
});

/* ---------- 长辈端「今天要做的事」 ---------- */

function toMinutes(timeText) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(timeText || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDuration(totalMinutes) {
  const minutes = Math.max(1, Math.round(totalMinutes));
  const isEn = currentLang === "en";
  if (minutes < 60) return isEn ? `${minutes}m` : `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (isEn) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

// 时间戳要按浏览器本地时区显示。之前摘要里直接对 ISO 字符串切片，
// 结果把 UTC 时间当成本地时间显示，北京用户看到的生成时间比真实时间早 8 小时。
function formatLocalDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return currentLang === "en"
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatDayLabel(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return String(isoDate || "");
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (currentLang === "en") {
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${day}`;
  }
  return `${month} 月 ${day} 日`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// 把吃药、任务、量血压合成一条按时间排序的待办清单，长辈只需要看这一处。
// 分成两组：今天要做的，和前几天一直没做的 —— 旧账不去挤今天的安排。
function buildTodayItems(data) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = todayIso();
  const tb = activeCopy().todayBoard;
  const todayItems = [];
  const carriedItems = [];

  (data.medications || []).forEach((item) => {
    todayItems.push({
      key: `med-${item.log_id}`,
      kind: "medication",
      time: item.time_of_day || tb.anyTime,
      at: toMinutes(item.time_of_day),
      title: tb.takeMedicine(item.medicine_name),
      note: item.dose_note || activeCopy().defaultDose,
      status: item.status,
      actionId: item.log_id,
    });
  });

  (data.tasks || []).forEach((item) => {
    const isToday = item.due_date === today;
    (isToday ? todayItems : carriedItems).push({
      key: `task-${item.id}`,
      kind: "task",
      time: isToday ? item.due_time || tb.anyTime : formatDayLabel(item.due_date),
      at: isToday ? toMinutes(item.due_time) : null,
      title: item.title,
      note: item.description || "",
      status: item.status,
      actionId: item.id,
      carriedOn: isToday ? null : item.due_date,
    });
  });

  const bpToday = (data.bloodPressure || []).filter((entry) => String(entry.measured_at || "").slice(0, 10) === today);
  todayItems.push({
    key: "bp-today",
    kind: "bloodPressure",
    time: tb.anyTime,
    at: null,
    title: tb.measureBp,
    note: bpToday.length ? tb.bpDone(bpToday.length) : tb.bpPending,
    status: bpToday.length ? "done" : "pending",
    actionId: null,
    sink: true, // 没有固定时间，排在最后
  });

  for (const item of todayItems) {
    if (item.status !== "pending" || item.at === null || item.at === undefined) continue;
    const diff = item.at - nowMinutes;
    if (diff < 0) item.urgency = { state: "overdue", minutes: -diff };
    else if (diff <= 30) item.urgency = { state: "due", minutes: diff };
    else item.urgency = { state: "later", minutes: diff };
  }

  const sortByTime = (a, b) => {
    if (Boolean(a.sink) !== Boolean(b.sink)) return a.sink ? 1 : -1;
    if (a.at === null || a.at === undefined) return 1;
    if (b.at === null || b.at === undefined) return -1;
    return a.at - b.at;
  };
  todayItems.sort(sortByTime);
  carriedItems.sort((a, b) => String(a.carriedOn || "").localeCompare(String(b.carriedOn || "")));
  return { todayItems, carriedItems };
}

function todayItemStateText(item) {
  const tb = activeCopy().todayBoard;
  if (item.status === "done") return { state: "done", text: tb.done };
  if (item.status === "missed") return { state: "overdue", text: tb.missed };
  if (item.carriedOn) return { state: "overdue", text: tb.carried(formatDayLabel(item.carriedOn)) };
  if (!item.urgency) return { state: "later", text: "" };
  if (item.urgency.state === "overdue") return { state: "overdue", text: tb.overdue(formatDuration(item.urgency.minutes)) };
  if (item.urgency.state === "due") return { state: "due", text: tb.dueNow };
  return { state: "later", text: tb.dueIn(formatDuration(item.urgency.minutes)) };
}

function todayItemHtml(item) {
  const tb = activeCopy().todayBoard;
  const state = todayItemStateText(item);
  let action;
  if (item.status === "done") {
    action = `<span class="todo-check" role="img" aria-label="${escapeHtml(tb.done)}">✓</span>`;
  } else if (item.kind === "bloodPressure") {
    action = `<button class="secondary-button todo-button" type="button" data-today-goto="#bloodPressure">${escapeHtml(tb.bpAction)}</button>`;
  } else {
    const label = item.kind === "medication" ? tb.medicationAction : tb.taskAction;
    action = `<button class="primary-button todo-button" type="button" data-today-complete="${escapeHtml(item.kind)}:${escapeHtml(item.actionId)}">${escapeHtml(label)}</button>`;
  }
  return `
  <article class="todo-item" data-state="${state.state}">
    <div class="todo-time">${escapeHtml(item.time || "")}</div>
    <div class="todo-body">
      <strong>${escapeHtml(item.title)}</strong>
      ${item.note ? `<span>${escapeHtml(item.note)}</span>` : ""}
      ${state.text ? `<em class="todo-state">${escapeHtml(state.text)}</em>` : ""}
    </div>
    <div class="todo-action">${action}</div>
  </article>`;
}

function renderTodayBoard(data) {
  if (!els.todayList) return;
  const tb = activeCopy().todayBoard;
  const { todayItems, carriedItems } = buildTodayItems(data);
  const all = [...todayItems, ...carriedItems];
  const pendingCount = all.filter((item) => item.status !== "done").length;

  els.todayBoardCount.textContent = !all.length
    ? activeCopy().items(0)
    : pendingCount === 0
      ? tb.allDone
      : tb.pending(pendingCount);
  els.todayBoardCount.dataset.tone = pendingCount === 0 && all.length ? "done" : "open";

  if (!all.length) {
    els.todayList.innerHTML = `<p class="muted">${escapeHtml(tb.empty)}</p>`;
  } else {
    const blocks = [todayItems.map(todayItemHtml).join("")];
    if (carriedItems.length) {
      // 前几天漏做的事默认折叠：它们仍然可点可确认，但不会把今天的安排挤到屏幕外。
      blocks.push(
        `<details class="todo-carried"><summary>${escapeHtml(tb.carriedTitle(carriedItems.length))}</summary>` +
          carriedItems.map(todayItemHtml).join("") +
          `</details>`
      );
    }
    els.todayList.innerHTML = blocks.join("");
  }

  const careText = String(data.weatherCare?.text || "").trim();
  if (els.todayWeather && els.todayWeatherText) {
    els.todayWeather.hidden = !careText;
    els.todayWeatherText.textContent = careText;
  }
  updateTodayClock();
}

function updateTodayClock() {
  if (!els.todayClock) return;
  const now = new Date();
  const weekday = currentLang === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()] : `星期${"日一二三四五六"[now.getDay()]}`;
  const dateText =
    currentLang === "en"
      ? `${weekday}, ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : `${now.getMonth() + 1} 月 ${now.getDate()} 日 ${weekday}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  els.todayClock.textContent = activeCopy().todayBoard.now(dateText, time);
}

/* ---------- 语音朗读 ----------
   目标是给视力不好、或者看字慢的长辈用：整个应用是纯文字的，
   老人如果看不清就只能靠家人念。用浏览器自带的 speechSynthesis，不引外部服务。 */

let speakingButton = null;

function speechSupported() {
  return typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
}

function pickSpeechVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const wanted = currentLang === "en" ? ["en-US", "en-GB", "en"] : ["zh-CN", "zh-Hans", "zh"];
  for (const tag of wanted) {
    const hit = voices.find((voice) => String(voice.lang || "").replace("_", "-").toLowerCase().startsWith(tag.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

function setSpeakingButton(button) {
  if (speakingButton && speakingButton !== button) {
    speakingButton.classList.remove("is-speaking");
    speakingButton.textContent = activeCopy().speech.listen;
    speakingButton.setAttribute("aria-pressed", "false");
  }
  speakingButton = button;
  if (!button) return;
  const on = button.classList.contains("is-speaking");
  button.classList.toggle("is-speaking", on);
}

function stopSpeaking() {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  if (speakingButton) {
    speakingButton.classList.remove("is-speaking");
    speakingButton.textContent = activeCopy().speech.listen;
    speakingButton.setAttribute("aria-pressed", "false");
    speakingButton = null;
  }
}

function speak(text, button) {
  if (!text || !text.trim()) return;
  if (!speechSupported()) {
    showToast(activeCopy().speech.unsupported, "warning", 6000);
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = currentLang === "en" ? "en-US" : "zh-CN";
  // 老人听东西比看东西慢，语速调低一点；音量拉满避免手机音量小听不见。
  utterance.rate = 0.88;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voice = pickSpeechVoice();
  if (voice) utterance.voice = voice;
  utterance.onend = () => {
    if (button) {
      button.classList.remove("is-speaking");
      button.textContent = activeCopy().speech.listen;
      button.setAttribute("aria-pressed", "false");
      if (speakingButton === button) speakingButton = null;
    }
  };
  utterance.onerror = utterance.onend;
  if (button) {
    button.classList.add("is-speaking");
    button.textContent = activeCopy().speech.stop;
    button.setAttribute("aria-pressed", "true");
    speakingButton = button;
  }
  window.speechSynthesis.speak(utterance);
}

// "08:00" 读成「早上 8 点」，直接念数字老人不容易反应过来。
function speakableTime(timeText) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(timeText || ""));
  if (!match) return String(timeText || "");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (currentLang === "en") {
    const suffix = hours < 12 ? "AM" : "PM";
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
  }
  const period = hours < 5 ? "凌晨" : hours < 12 ? "早上" : hours < 13 ? "中午" : hours < 18 ? "下午" : "晚上";
  const hour12 = hours > 12 ? hours - 12 : hours;
  if (minutes === 0) return `${period} ${hour12} 点`;
  if (minutes === 30) return `${period} ${hour12} 点半`;
  return `${period} ${hour12} 点 ${minutes} 分`;
}

// 朗读用的时长说法：「8 小时 12 分钟」比「8h 12m」好懂。
function speakableDuration(totalMinutes) {
  const minutes = Math.max(1, Math.round(totalMinutes));
  if (currentLang === "en") {
    const h = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const parts = [];
    if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
    if (rest) parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);
    return parts.join(" and ");
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function speakableDate(date) {
  const weekday = currentLang === "en" ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()] : `星期${"日一二三四五六"[date.getDay()]}`;
  return currentLang === "en"
    ? `${weekday}, ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${weekday}`;
}

// 把待办状态翻译成「念出来顺耳」的一句话，故事里的 8h 12m 要变成 8 小时 12 分钟。
function spokenStateText(item) {
  const copySpeech = activeCopy().speech;
  if (item.status === "done") return copySpeech.done;
  if (item.status === "missed") return copySpeech.missed;
  if (item.carriedOn) return copySpeech.carriedOn(formatDayLabel(item.carriedOn));
  if (!item.urgency) return "";
  if (item.urgency.state === "overdue") return copySpeech.overdue(speakableDuration(item.urgency.minutes));
  if (item.urgency.state === "due") return copySpeech.dueNow;
  return copySpeech.dueIn(speakableDuration(item.urgency.minutes));
}

function speechForToday() {
  if (!currentDashboard) return "";
  const copySpeech = activeCopy().speech;
  const { todayItems, carriedItems } = buildTodayItems(currentDashboard);
  const now = new Date();
  const pending = todayItems.filter((item) => item.status !== "done");
  const parts = [copySpeech.now(speakableDate(now), speakableTime(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`))];

  if (!todayItems.length && !carriedItems.length) {
    parts.push(copySpeech.empty);
    return parts.join(" ");
  }
  parts.push(pending.length ? copySpeech.summary(todayItems.length, pending.length) : copySpeech.allDone);

  for (const item of todayItems) {
    parts.push(copySpeech.item(speakableTime(item.time) || copySpeech.anyTime, item.title, item.note, spokenStateText(item)));
  }
  if (carriedItems.length) parts.push(copySpeech.carried(carriedItems.length));
  if (els.todayWeatherText?.textContent) parts.push(copySpeech.weather(els.todayWeatherText.textContent));
  return parts.filter(Boolean).join(" ");
}

// 没检测过 / 没生成过路线时不能朗读：否则会把「输入内容后小护会……」这句占位提示念出来。
let lastFraudResult = null;
let lastTravelPlan = null;

function speechForFraud() {
  if (!lastFraudResult) return "";
  const reasons = [...(els.riskReasons?.querySelectorAll("li") || [])].map((li) => li.textContent.trim()).filter(Boolean);
  const parts = [String(els.elderReply?.textContent || "").trim()];
  if (reasons.length) parts.push(activeCopy().speech.reasons(reasons.join("、")));
  return parts.filter(Boolean).join(" ");
}

function speechForTravel() {
  if (!lastTravelPlan) return "";
  const reply = String(els.travelReply?.textContent || "").trim();
  if (!reply) return "";
  const weather = String(els.weatherTrace?.textContent || "").trim();
  return weather ? `${reply} ${activeCopy().speech.weather(weather)}` : reply;
}

const speechBuilders = {
  today: speechForToday,
  fraud: speechForFraud,
  travel: speechForTravel,
};

function wireSpeakButtons() {
  document.querySelectorAll("[data-speak-kind]").forEach((button) => {
    if (button.dataset.speakWired === "1") return;
    button.dataset.speakWired = "1";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      if (button.classList.contains("is-speaking")) {
        stopSpeaking();
        return;
      }
      const build = speechBuilders[button.dataset.speakKind];
      const text = build ? build() : "";
      if (!text.trim()) {
        showToast(activeCopy().speech.nothing, "info");
        return;
      }
      speak(text, button);
    });
  });
}

let todayClockTimer = null;

function startTodayClock() {
  if (todayClockTimer) clearInterval(todayClockTimer);
  todayClockTimer = setInterval(() => {
    // 待办状态依赖当前时间，每 30 秒刷新一次，跨过用药时间点后状态会自己变。
    if (currentDashboard && document.body.dataset.view === "elder") renderTodayBoard(currentDashboard);
    else updateTodayClock();
  }, 30 * 1000);
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

// 漏服是家属端最需要主动看到的信号：长辈自己通常不会报告。
function renderMissedMedications(items) {
  if (!els.missedList) return;
  const list = items || [];
  if (!list.length) {
    els.missedList.innerHTML = `<p class="muted">${escapeHtml(activeCopy().noMissed)}</p>`;
    return;
  }
  els.missedList.innerHTML = list
    .map(
      (item) => `
      <article class="missed-item">
        <strong>${escapeHtml(formatDayLabel(item.due_date))} ${escapeHtml(String(item.time_of_day || "").slice(0, 5))}</strong>
        <span>${escapeHtml(item.medicine_name)}${item.dose_note ? ` · ${escapeHtml(item.dose_note)}` : ""}</span>
        <em>${escapeHtml(activeCopy().missedTag)}</em>
      </article>`
    )
    .join("");
}

// 只有这些 source 才代表「真的拿到了实时数据」。
// 其余（local-fallback / local-route-example / openai）都是拿不到实时数据时的替代品，
// 必须让家属一眼看出来，否则「猜的」和「查到的」长得一模一样。
const LIVE_WEATHER_SOURCES = ["open-meteo"];
const LIVE_ROUTE_SOURCES = ["amap-transit"];

// 数据来源提示：是实时数据就藏起来，不是就明确说清楚
function renderSourceNote(element, source, liveSources, hint) {
  if (!element) return;
  const isLive = Boolean(source) && liveSources.includes(source);
  element.textContent = isLive ? "" : hint;
  element.classList.toggle("is-hidden", isLive);
}

function renderWeather(weather, care) {
  if (weather) {
    els.weatherCity.value = weather.city || "";
    els.weatherDistrict.value = weather.district || "";
    els.weatherCareTime.value = weather.care_time || "08:00";
  }
  const weatherText = care?.text || "设置地区后会生成适合长辈看的天气提醒。";
  els.weatherCareText.textContent = weatherText;
  els.weatherTrace.textContent = weatherText;
  // 还没设地区时服务端本来就说了「还没设置」，不用再加一条提示
  renderSourceNote(
    els.weatherSourceNote,
    care?.source === "not-configured" ? "open-meteo" : care?.source,
    LIVE_WEATHER_SOURCES,
    activeCopy().weatherNotLiveHint
  );
}

function renderMetrics(data) {
  els.fraudCount.textContent = data.alerts.filter((item) => item.type === "fraud").length;
  els.memoryCount.textContent = (data.bloodPressure || []).length;
}

// 家庭成员名单。原先只列「当前登录人 + 长辈」，通过邀请加进第二、第三位家属后
// 表里看不到他们，家属会以为邀请没成功。现在用服务端给的 members 渲染真实名单。
function renderMembers(data) {
  const c = activeCopy();
  const members = data.members || [];
  const rows = members.length
    ? members
    : [
        { id: data.user.id, displayName: data.user.displayName, relation: "", role: data.user.role },
        { id: data.elder.id, displayName: data.elder.displayName, relation: "", role: "elder" },
      ];
  els.roleTable.innerHTML = rows
    .map((member) => {
      const isElder = member.role === "elder";
      const isSelf = member.id === data.user.id;
      const relation = isElder ? c.roleSenior : member.relation || c.roleFamily;
      const tag = isElder ? c.roleSenior : c.roleFamily;
      const access = isElder ? c.seniorAccess : c.accessFamily;
      const name = `${escapeHtml(displayNameFor(member.displayName))}${isSelf ? ` <span class="self-tag">${escapeHtml(c.roleSelf)}</span>` : ""}`;
      return `<tr><td>${name}</td><td>${escapeHtml(relation)}</td><td><span class="role-tag">${escapeHtml(tag)}</span></td><td>${escapeHtml(access)}</td></tr>`;
    })
    .join("");
}

/* ---------- 邀请家属 ----------
   邀请链接是「对方自己设置登录名和密码」的入口：这样不需要由管理员代建账号、
   也不需要把密码通过微信发出去。token 明文只在生成时出现一次，库里只存哈希。 */

let pendingInviteToken = "";

async function loadInvites() {
  if (!els.invitePending || document.body.dataset.view !== "family") return;
  const generation = dashboardGeneration;
  try {
    const { invites } = await api("/api/invites");
    if (generation !== dashboardGeneration) return;
    renderInvites(invites || []);
  } catch {
    if (generation !== dashboardGeneration) return;
    renderInvites([]);
  }
}

function renderInvites(invites) {
  if (!els.invitePending) return;
  const c = activeCopy();
  const pending = (invites || []).filter((item) => item.status === "pending");
  if (!pending.length) {
    els.invitePending.innerHTML = `<p class="muted">${escapeHtml(c.inviteNone)}</p>`;
    return;
  }
  els.invitePending.innerHTML = `
    <p class="muted">${escapeHtml(c.invitePendingTitle)}</p>
    <ul class="invite-list">
      ${pending
        .map(
          (item) => `<li>
          <span>${escapeHtml(item.relation)} · ${escapeHtml(c.inviteExpires(formatDayLabel(String(item.expiresAt).slice(0, 10))))}</span>
          <button class="ghost-button is-danger" type="button" data-revoke-invite="${escapeHtml(item.id)}">${escapeHtml(c.inviteRevoke)}</button>
        </li>`
        )
        .join("")}
    </ul>`;
}

async function createInvite() {
  const relation = els.inviteRelation?.value.trim() || "";
  if (els.inviteCreateError) els.inviteCreateError.textContent = "";
  if (!relation) {
    if (els.inviteCreateError) els.inviteCreateError.textContent = activeCopy().inviteNeedRelation;
    return;
  }
  els.createInvite.disabled = true;
  try {
    const { invite } = await api("/api/invites", { method: "POST", body: { relation } });
    els.inviteLink.value = invite.url;
    els.inviteResult.classList.remove("is-hidden");
    els.inviteRelation.value = "";
    // 立刻显示，因为这个 token 关掉之后再也看不到第二次
    els.inviteLink.select();
    await loadInvites();
  } catch (error) {
    if (els.inviteCreateError) els.inviteCreateError.textContent = error.message || activeCopy().actionFailed;
  } finally {
    els.createInvite.disabled = false;
  }
}

async function copyInviteLink() {
  const link = els.inviteLink?.value || "";
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    showToast(activeCopy().inviteCopied, "safe");
  } catch {
    // 非 HTTPS 或用户拒绝时剪贴板 API 会失败：退回到选中文本让用户自己复制
    els.inviteLink.select();
    showToast(activeCopy().inviteCopyManual, "warning");
  }
}

els.createInvite?.addEventListener("click", createInvite);
els.copyInviteLink?.addEventListener("click", copyInviteLink);
els.invitePending?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-revoke-invite]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/invites/${encodeURIComponent(button.dataset.revokeInvite)}`, { method: "DELETE" });
    showToast(activeCopy().inviteRevoked, "safe");
    await loadInvites();
  } catch (error) {
    showToast(error.message || activeCopy().actionFailed, "warning");
    button.disabled = false;
  }
});

/* 接受邀请：打开邀请链接的人看到这个面板，自己设置登录名和密码 */

function showInvitePanel() {
  els.loginPanel?.classList.add("is-hidden");
  els.invitePanel?.classList.remove("is-hidden");
  document.getElementById("loginScreen")?.classList.remove("is-hidden");
  els.inviteDisplayName?.focus();
}

async function openInviteLink(token) {
  try {
    const { invite } = await api(`/api/invites/lookup?token=${encodeURIComponent(token)}`);
    if (els.inviteIntro) {
      els.inviteIntro.textContent = activeCopy().inviteIntro(invite.relation, displayNameFor(invite.elderName));
    }
    pendingInviteToken = token;
    showInvitePanel();
  } catch (error) {
    // token 过期/已用时不能静默停在登录页，否则对方不知道发生了什么
    showInvitePanel();
    els.inviteForm.classList.add("is-hidden");
    if (els.inviteError) els.inviteError.textContent = error.message || activeCopy().inviteInvalid;
  }
}

els.inviteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (els.inviteError) els.inviteError.textContent = "";
  const submit = els.inviteForm.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await api("/api/invites/accept", {
      method: "POST",
      body: {
        token: pendingInviteToken,
        username: els.inviteUsername.value.trim(),
        password: els.invitePassword.value,
        displayName: els.inviteDisplayName.value.trim(),
      },
    });
    // 接受成功即已登录：把 token 从地址栏摘掉，避免刷新时重复提交
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    pendingInviteToken = "";
    els.loginPanel?.classList.remove("is-hidden");
    els.invitePanel?.classList.add("is-hidden");
    await loadDashboard();
  } catch (error) {
    if (els.inviteError) els.inviteError.textContent = error.message || activeCopy().actionFailed;
  } finally {
    if (submit) submit.disabled = false;
  }
});

// 今日概览（吃药/任务/血压/体检/天气的汇总）单独放在照护记录里，
// 之前它被塞进「生活事件记录」表格，表头和内容完全对不上。
function renderDailySummary(data) {
  if (!els.dailySummaryTable) return;
  els.dailySummaryTable.innerHTML = renderReportRows(data);
}

function renderReportRows(data) {
  const labels = activeCopy().reportRows;
  const rows = [
    [labels.medication, labels.today(data.medications.length), labels.done(data.medications.filter((item) => item.status === "done").length), labels.reminder],
    [labels.task, labels.today(data.tasks.length), labels.done(data.tasks.filter((item) => item.status === "done").length), labels.arranged],
    [labels.bp, labels.totalTimes((data.bloodPressure || []).length), translateValue(data.bloodPressureSummary?.label || activeCopy().bpNoRecord), labels.healthFile],
    [labels.checkup, labels.totalReports((data.checkups || []).length), data.checkups?.[0]?.summary || labels.notUploaded, labels.reportReview],
    [labels.weather, data.weather?.city || labels.unset, data.weatherCare?.text || labels.none, labels.weatherCare],
  ];
  return rows.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`).join("");
}

function renderBloodPressure(items, summary) {
  const advice = summary?.advice || activeCopy().bpAdviceEmpty;
  const label = summary?.label || activeCopy().bpNoRecord;
  els.bpState.textContent = label;
  els.bpAdvice.textContent = summary?.latest ? `${label}：${advice}` : advice;
  els.bpAdvice.dataset.tone = summary?.level === "danger" || summary?.level === "warning" ? "warning" : "safe";
  els.familyBpAdvice.textContent = summary?.latest
    ? `最近一次 ${summary.latest.systolic}/${summary.latest.diastolic} mmHg。${advice}`
    : activeCopy().noBp;
  els.familyBpAdvice.dataset.tone = summary?.level === "danger" || summary?.level === "warning" ? "warning" : "safe";
  const rowFor = (item) => `
      <tr>
        <td>${formatTime(item.measured_at)}</td>
        <td>${item.systolic}/${item.diastolic} mmHg</td>
        <td>${item.pulse ? activeCopy().pulseUnit(item.pulse) : activeCopy().notFilled}</td>
        <td>${escapeHtml(item.note || activeCopy().empty)}</td>
      </tr>`;
  const newestFirst = items.slice().reverse();
  // 长辈端只留最近 5 条：20 行表格在手机上要滚很久，当天需要的信息前几条就够。
  const elderRows = newestFirst.slice(0, 5).map(rowFor).join("");
  const rows = newestFirst.map(rowFor).join("");
  const empty = `<tr><td colspan="4">${activeCopy().noBp}</td></tr>`;
  els.bpList.innerHTML = elderRows || empty;
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
        <small>${escapeHtml(activeCopy().analysisMode(item.source, item.risk_level))} · <a href="/api/checkups/${encodeURIComponent(item.id)}/image" target="_blank" rel="noopener">查看原图</a></small>
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
  lastFraudResult = result;
  els.fraudScore.textContent = result.score;
  els.fraudMeter.style.width = `${result.score}%`;
  els.fraudMeter.style.background = result.score >= 80 ? "var(--danger)" : result.score >= 41 ? "var(--warn)" : "var(--safe)";
  els.fraudLevel.textContent = `${result.level} · ${result.type}`;
  els.riskReasons.innerHTML = result.reasons.length ? result.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : `<li>${activeCopy().noRisk}</li>`;
  setElderReply(result.reply_for_elder);
}

/* ---------- 手机提醒（Web Push） ----------
   这条链路以前是假的：只注册了 Service Worker，然后存一个 endpoint 为 "local-demo"
   的假订阅，再弹一个本地通知就宣称「已开启」。老人的手机实际上永远不会响。
   现在做真的：真实 pushManager 订阅 + 服务端按 VAPID 下发，并且如实报告每种失败原因。 */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// iOS 只有「添加到主屏幕」后打开的页面才允许推送，普通 Safari 标签页不行。
function isInstalledApp() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function getPushSubscription() {
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// 未开启时在今日待办顶部放一条提示：老人不知道「没开提醒」等于到点不会响。
function setPushNudge(visible) {
  if (!els.pushNudge) return;
  els.pushNudge.classList.toggle("is-hidden", !visible);
  if (visible) els.pushNudge.textContent = activeCopy().pushNudge;
}

function setPushButton(enabled) {
  if (!els.enablePush) return;
  els.enablePush.textContent = enabled ? activeCopy().pushOn : activeCopy().pushOff;
  els.enablePush.dataset.state = enabled ? "on" : "off";
  els.enablePush.setAttribute("aria-pressed", String(Boolean(enabled)));
}

// 每次进长辈端就核对一次真实状态，不再靠按钮文案猜。
async function refreshPushStatus() {
  if (!els.enablePush || !els.pushStatus) return;
  if (!window.isSecureContext) {
    setPushButton(false);
    setPushNudge(false);
    updatePushStatus(activeCopy().pushNeedHttps);
    return;
  }
  if (!pushSupported()) {
    setPushButton(false);
    setPushNudge(false);
    updatePushStatus(isIosDevice() && !isInstalledApp() ? activeCopy().pushIosInstall : activeCopy().pushUnsupported);
    return;
  }
  if (isIosDevice() && !isInstalledApp()) {
    setPushButton(false);
    setPushNudge(true);
    updatePushStatus(activeCopy().pushIosInstall, "warning");
    return;
  }
  const subscription = await getPushSubscription();
  setPushButton(Boolean(subscription));
  setPushNudge(!subscription);
  if (subscription) updatePushStatus(activeCopy().pushEnabledHint, "safe");
  else updatePushStatus(activeCopy().pushOffHint);
}

async function enablePhoneNotifications() {
  if (!els.enablePush) return;
  els.enablePush.disabled = true;
  try {
    if (!window.isSecureContext) {
      updatePushStatus(activeCopy().pushNeedHttps, "warning");
      return;
    }
    if (!pushSupported()) {
      updatePushStatus(isIosDevice() && !isInstalledApp() ? activeCopy().pushIosInstall : activeCopy().pushUnsupported, "warning");
      return;
    }
    if (isIosDevice() && !isInstalledApp()) {
      updatePushStatus(activeCopy().pushIosInstall, "warning");
      return;
    }
    const registration = await registerServiceWorker();
    if (!registration) {
      updatePushStatus(activeCopy().pushUnsupported, "warning");
      return;
    }

    const config = await api("/api/push/config").catch(() => null);
    if (!config?.enabled || !config.publicKey) {
      updatePushStatus(config?.reason || activeCopy().pushServerDisabled, "warning");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      updatePushStatus(activeCopy().pushDenied, "warning");
      return;
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
    }
    const payload = subscription.toJSON();
    await api("/api/push/subscribe", {
      method: "POST",
      body: {
        endpoint: payload.endpoint,
        keys: { p256dh: payload.keys?.p256dh || "", auth: payload.keys?.auth || "" },
      },
    });
    setPushButton(true);
    setPushNudge(false);
    updatePushStatus(activeCopy().pushEnabledHint, "safe");
    showToast(activeCopy().pushEnabledToast, "safe", 6000);
  } catch (error) {
    // 订阅失败要如实说，否则家属以为提醒已经生效。
    // 浏览器的推送服务连不上（无痕模式、网络限制、企业策略）是很常见的一种，单独给出可操作的建议。
    const noPushService = error?.name === "AbortError" || /push service/i.test(String(error?.message || ""));
    updatePushStatus(noPushService ? activeCopy().pushNoService : activeCopy().pushFailed, "warning");
  } finally {
    els.enablePush.disabled = false;
  }
}

async function disablePhoneNotifications() {
  if (!els.enablePush) return;
  els.enablePush.disabled = true;
  try {
    const subscription = await getPushSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe().catch(() => null);
      await api("/api/push/unsubscribe", { method: "POST", body: { endpoint } }).catch(() => null);
    }
    setPushButton(false);
    setPushNudge(true);
    updatePushStatus(activeCopy().pushOffHint);
    showToast(activeCopy().pushOffToast, "info");
  } finally {
    els.enablePush.disabled = false;
  }
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
  // 日志里会带上用户输入的内容（药品名、任务标题），必须转义：
  // 药名写成 <img onerror=…> 就会被当 HTML 解析
  els.eventLog.innerHTML = logs.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
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

// 默认 20 秒。上传体检报告（base64 图片，最大 6MB）要单独放宽，见调用处的 timeoutMs。
const apiTimeoutMs = 20000;

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? apiTimeoutMs);
  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    // 网络层失败（断网、服务不可达、超时）与「未登录」是两回事，必须让调用方能区分，
    // 否则一次网络抖动就会被当成登录失效处理。
    // 超时上限尤其重要：「一键联系家人」「报平安」在 await 期间是 disabled 的，
    // 请求一直挂住会让老人以为按钮坏了，而这正是最需要它可靠的两个按钮。
    const wrapped = new Error(error?.name === "AbortError" ? activeCopy().requestTimeout : activeCopy().networkError);
    wrapped.networkError = true;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "请求失败");
    error.status = response.status;
    throw error;
  }
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
    els.notifList.innerHTML = `<p class="muted" style="padding:16px;text-align:center;">${escapeHtml(activeCopy().notifEmpty)}</p>`;
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
    const open = !els.notifDropdown.classList.contains("is-hidden");
    els.notifBell.setAttribute("aria-expanded", String(open));
    if (open) {
      markAllNotificationsRead();
    }
  });

  document.addEventListener("click", (event) => {
    if (!els.notifDropdown.contains(event.target) && !els.notifBell.contains(event.target)) {
      els.notifDropdown.classList.add("is-hidden");
      els.notifBell.setAttribute("aria-expanded", "false");
    }
  });

  // role="dialog" 就得能按 Esc 关掉，否则键盘/读屏用户进去出不来
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.notifDropdown.classList.contains("is-hidden")) {
      els.notifDropdown.classList.add("is-hidden");
      els.notifBell.setAttribute("aria-expanded", "false");
      els.notifBell.focus();
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
  // 勾选即时保存（不会因为忘记点按钮而丢设置），「保存偏好」按钮再显式确认一次
  els.prefGrid.addEventListener("change", saveNotificationPreferences);
}

// 「保存偏好」原来是个没有任何监听的装饰按钮：点了没反应、没提示、不发请求。
// 家属会以为设置已经存下了，其实只是勾选那一刻顺手存的。
async function saveNotificationPreferences() {
  if (!els.prefGrid) return;
  const prefs = {};
  els.prefGrid.querySelectorAll("input[data-pref]").forEach((el) => {
    prefs[el.dataset.pref] = el.checked ? 1 : 0;
  });
  try {
    await api("/api/notifications/preferences", { method: "POST", body: prefs });
    showToast(activeCopy().prefsSaved, "safe");
  } catch (error) {
    showToast(error.message || activeCopy().actionFailed, "warning");
  }
}

els.savePrefs?.addEventListener("click", saveNotificationPreferences);

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

// ===== 第二阶段新增：健康急救卡 / 未活跃告警 / 家庭自助注册 / 长辈免密登录 / 新增照护长辈 =====
function renderElderProfile(profile) {
  const p = profile || {};
  const setVal = (id, value) => {
    const el = document.querySelector(id);
    if (el) el.value = value || "";
  };
  setVal("#profileBloodType", p.bloodType);
  setVal("#profileHospital", p.emergencyHospital);
  setVal("#profileDoctorName", p.doctorName);
  setVal("#profileDoctorPhone", p.doctorPhone);
  setVal("#profileAllergies", p.allergies);
  setVal("#profileChronic", p.chronicConditions);
  setVal("#profileNotes", p.notes);
  const enabledEl = document.querySelector("#profileInactivityEnabled");
  if (enabledEl) enabledEl.checked = Boolean(p.inactivityAlertEnabled);
  setVal("#profileInactivityDeadline", p.inactivityDeadline || "12:00");

  // 长辈端急救卡渲染
  const card = document.querySelector("#elderEmergencyCard");
  const body = document.querySelector("#elderEmergencyCardBody");
  if (!card || !body) return;
  const rows = [
    p.bloodType ? `<div><strong>血型：</strong>${escapeHtml(p.bloodType)}</div>` : "",
    p.allergies ? `<div><strong>药物过敏史：</strong>${escapeHtml(p.allergies)}</div>` : "",
    p.chronicConditions ? `<div><strong>慢性病史：</strong>${escapeHtml(p.chronicConditions)}</div>` : "",
    p.emergencyHospital ? `<div><strong>常用医院：</strong>${escapeHtml(p.emergencyHospital)}</div>` : "",
    p.doctorName
      ? `<div><strong>主治医生：</strong>${escapeHtml(p.doctorName)}${
          p.doctorPhone
            ? `　<a href="tel:${escapeHtml(p.doctorPhone.replace(/[^\d+]/g, ""))}">${escapeHtml(p.doctorPhone)}</a>`
            : ""
        }</div>`
      : "",
    p.notes ? `<div><strong>照护备注：</strong>${escapeHtml(p.notes)}</div>` : "",
  ].filter(Boolean);
  if (!rows.length) {
    card.classList.add("is-hidden");
    body.innerHTML = "";
    return;
  }
  body.innerHTML = rows.join("");
  card.classList.remove("is-hidden");
}

document.querySelector("#saveElderProfile")?.addEventListener("click", async () => {
  const statusEl = document.querySelector("#elderProfileStatus");
  try {
    await api("/api/elder-profile", {
      method: "POST",
      body: {
        bloodType: document.querySelector("#profileBloodType")?.value || "",
        emergencyHospital: document.querySelector("#profileHospital")?.value || "",
        doctorName: document.querySelector("#profileDoctorName")?.value || "",
        doctorPhone: document.querySelector("#profileDoctorPhone")?.value || "",
        allergies: document.querySelector("#profileAllergies")?.value || "",
        chronicConditions: document.querySelector("#profileChronic")?.value || "",
        notes: document.querySelector("#profileNotes")?.value || "",
        inactivityAlertEnabled: Boolean(document.querySelector("#profileInactivityEnabled")?.checked),
        inactivityDeadline: document.querySelector("#profileInactivityDeadline")?.value || "12:00",
      },
    });
    if (statusEl) statusEl.textContent = "已保存健康急救卡与未活跃告警设置。";
    showToast("健康急救卡与未活跃告警已保存", "safe");
    await loadDashboard();
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || "保存失败";
    showToast(error.message || "保存失败", "warning");
  }
});

// 家庭自助注册切换与提交
document.querySelector("#showRegisterPanel")?.addEventListener("click", () => {
  document.querySelector("#loginPanel")?.classList.add("is-hidden");
  document.querySelector("#registerPanel")?.classList.remove("is-hidden");
});

document.querySelector("#backToLogin")?.addEventListener("click", () => {
  document.querySelector("#registerPanel")?.classList.add("is-hidden");
  document.querySelector("#loginPanel")?.classList.remove("is-hidden");
});

document.querySelector("#registerForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errEl = document.querySelector("#registerError");
  if (errEl) errEl.textContent = "";
  try {
    await api("/api/auth/register", {
      method: "POST",
      body: {
        caregiverDisplayName: document.querySelector("#regCaregiverName")?.value || "",
        caregiverUsername: document.querySelector("#regCaregiverUsername")?.value || "",
        caregiverPassword: document.querySelector("#regCaregiverPassword")?.value || "",
        relation: document.querySelector("#regRelation")?.value || "家属",
        elderDisplayName: document.querySelector("#regElderName")?.value || "",
      },
    });
    document.querySelector("#registerPanel")?.classList.add("is-hidden");
    document.querySelector("#loginPanel")?.classList.remove("is-hidden");
    showToast("家庭创建成功，已自动登录", "safe");
    await loadDashboard();
  } catch (error) {
    if (errEl) errEl.textContent = error.message || "创建失败，请检查填写内容";
  }
});

// 家属生成长辈免密登录链接
document.querySelector("#createElderLoginLink")?.addEventListener("click", async () => {
  try {
    const { loginLink } = await api("/api/elder-login-link", { method: "POST" });
    const box = document.querySelector("#elderLoginLinkResult");
    const input = document.querySelector("#elderLoginLinkInput");
    if (input) input.value = loginLink.url;
    box?.classList.remove("is-hidden");
    showToast(`已为 ${loginLink.elderName} 生成 24 小时免密登录链接`, "safe");
  } catch (error) {
    showToast(error.message || "生成失败", "warning");
  }
});

document.querySelector("#copyElderLoginLink")?.addEventListener("click", async () => {
  const input = document.querySelector("#elderLoginLinkInput");
  if (!input?.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    showToast("免密链接已复制，发给长辈点击即可登录", "safe");
  } catch {
    input.select();
    showToast("请手动复制框中的链接", "info");
  }
});

// 家属新增照护长辈
document.querySelector("#createElderBtn")?.addEventListener("click", async () => {
  const errEl = document.querySelector("#createElderError");
  if (errEl) errEl.textContent = "";
  const displayName = document.querySelector("#addElderName")?.value?.trim() || "";
  const relation = document.querySelector("#addElderRelation")?.value?.trim() || "家属";
  if (!displayName) {
    if (errEl) errEl.textContent = "请填写长辈称呼";
    return;
  }
  try {
    await api("/api/elders", { method: "POST", body: { displayName, relation } });
    const nameInput = document.querySelector("#addElderName");
    if (nameInput) nameInput.value = "";
    showToast(`已添加长辈「${displayName}」并切换过去`, "safe");
    await loadDashboard();
  } catch (error) {
    if (errEl) errEl.textContent = error.message || "添加失败";
  }
});

// 多通道群通知配置（企业微信 / 钉钉 / 飞书）
const channelLabelMap = { wecom: "企业微信", dingtalk: "钉钉", feishu: "飞书" };

async function loadNotificationChannels() {
  const statusEl = document.querySelector("#channelConfigStatus");
  if (!statusEl || document.body.dataset.view !== "family") return;
  try {
    const { channels } = await api("/api/channels");
    const active = (channels || []).filter((item) => item.configured);
    statusEl.textContent = active.length
      ? `已启用：${active.map((item) => `${channelLabelMap[item.channelType] || item.channelType}（${item.maskedWebhook}）`).join("；")}`
      : "尚未配置个人群机器人通道。";
  } catch {
    statusEl.textContent = "无法加载通知通道状态。";
  }
}

document.querySelector("#saveChannelConfig")?.addEventListener("click", async () => {
  const channelType = document.querySelector("#channelTypeSelect")?.value || "wecom";
  const webhookInput = document.querySelector("#channelWebhookInput");
  const statusEl = document.querySelector("#channelConfigStatus");
  try {
    await api("/api/channels", {
      method: "POST",
      body: { channelType, webhook: webhookInput?.value?.trim() || "" },
    });
    if (webhookInput) webhookInput.value = "";
    showToast(`${channelLabelMap[channelType] || channelType} 通道配置已保存`, "safe");
    await loadNotificationChannels();
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || "保存通道失败";
    showToast(error.message || "保存通道失败", "warning");
  }
});

document.querySelector("#testChannelConfig")?.addEventListener("click", async () => {
  const channelType = document.querySelector("#channelTypeSelect")?.value || "wecom";
  const statusEl = document.querySelector("#channelConfigStatus");
  try {
    const { result } = await api("/api/channels/test", { method: "POST", body: { channelType } });
    const msg = result?.ok ? `${channelLabelMap[channelType] || channelType} 测试消息已发送` : result?.message || "发送失败";
    if (statusEl) statusEl.textContent = msg;
    showToast(msg, result?.ok ? "safe" : "warning");
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || "测试发送失败";
    showToast(error.message || "测试发送失败", "warning");
  }
});

// 长辈免密链接入口
let pendingElderLoginToken = "";
function openElderLoginLink(token) {
  pendingElderLoginToken = token;
  els.loginScreen?.classList.remove("is-hidden");
  els.appShell?.classList.add("is-hidden");
  document.querySelector("#loginPanel")?.classList.add("is-hidden");
  document.querySelector("#registerPanel")?.classList.add("is-hidden");
  els.invitePanel?.classList.add("is-hidden");
  document.querySelector("#elderLoginPanel")?.classList.remove("is-hidden");
}

document.querySelector("#acceptElderLogin")?.addEventListener("click", async () => {
  const errEl = document.querySelector("#elderLoginError");
  if (errEl) errEl.textContent = "";
  try {
    await api("/api/auth/elder-login", { method: "POST", body: { token: pendingElderLoginToken } });
    document.querySelector("#elderLoginPanel")?.classList.add("is-hidden");
    document.querySelector("#loginPanel")?.classList.remove("is-hidden");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("elder_login");
    window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
    await loadDashboard();
  } catch (error) {
    if (errEl) errEl.textContent = error.message || "登录链接无效或已过期";
  }
});

setupVoiceInputs();
setupFontSize();
applyLanguage();
els.taskDate.value = todayDate();
// 带邀请链接或长辈免密链接打开时直接进对应入口
const startupParams = new URL(window.location.href).searchParams;
const inviteToken = startupParams.get("invite");
const elderLoginToken = startupParams.get("elder_login");
if (elderLoginToken) {
  openElderLoginLink(elderLoginToken);
} else if (inviteToken) {
  openInviteLink(inviteToken);
} else {
  loadDashboard();
}
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
