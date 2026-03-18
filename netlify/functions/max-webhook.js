const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN || "YOUR_MAX_BOT_TOKEN";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "YOUR_CLAUDE_API_KEY";
const WEBHOOK_URL = "https://lucky-tartufo-0b2313.netlify.app/.netlify/functions/max-webhook";

const userStates = {};

const FUNNEL_STAGES = {
  START: "start",
  QUALIFY_TASK: "qualify_task",
  QUALIFY_AUDIENCE: "qualify_audience",
  COLLECT_CONTACT: "collect_contact",
  DONE: "done",
};

async function sendMessage(userId, text) {
  console.log("Sending message to userId:", userId);
  
  const response = await fetch(`https://botapi.max.ru/messages?access_token=${MAX_BOT_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { user_id: Number(userId) },
      type: "text",
      text: text
    }),
  });
  
  const result = await response.json();
  console.log("Send result:", JSON.stringify(result).substring(0, 150));
  return result;
}

async function generateWarmUpContent(userTask, userAudience) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Ты — Анастасия Булатова, промпт-инженер и AI-эксперт.
Задача пользователя: "${userTask}". Его аудитория: "${userAudience}".
Напиши короткий полезный совет (3 абзаца) в живом личном стиле.
В конце мягко намекни что помогаешь с такими задачами. Без хэштегов.`
      }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "Интересная задача! Давай разберём её вместе.";
}

async function handleFunnelStep(userId, userText, state) {
  const stage = state.stage || FUNNEL_STAGES.START;
  console.log("Stage:", stage, "Text:", userText);

  if (stage === FUNNEL_STAGES.START || !stage) {
    userStates[userId] = { stage: FUNNEL_STAGES.QUALIFY_TASK };
    await sendMessage(userId,
      "Привет! 👋 Я Анастасия Булатова — помогаю экспертам создавать контент с помощью AI.\n\nРасскажи, с чем хочешь разобраться?\n\n1️⃣ Нужен контент для соцсетей\n2️⃣ Хочу настроить AI-бота\n3️⃣ Хочу больше клиентов через контент\n4️⃣ Просто изучаю AI-инструменты"
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_TASK) {
    userStates[userId] = { stage: FUNNEL_STAGES.QUALIFY_AUDIENCE, task: userText };
    await sendMessage(userId,
      `Понятно — хорошая задача 💪\n\nА кто твоя аудитория?\n\n1️⃣ B2B — компании и предприниматели\n2️⃣ B2C — частные люди\n3️⃣ Эксперты и специалисты\n4️⃣ Интернет-магазин / продукт`
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_AUDIENCE) {
    userStates[userId] = { ...userStates[userId], stage: FUNNEL_STAGES.COLLECT_CONTACT, audience: userText };
    await sendMessage(userId, "Отлично! Дай секунду, подготовлю кое-что полезное... 🧠✨");
    const warmUpText = await generateWarmUpContent(userStates[userId].task, userText);
    await sendMessage(userId, warmUpText);
    await sendMessage(userId,
      "Если хочешь разобрать твою ситуацию подробнее — напиши имя и контакт, свяжусь лично 🤝\n\nИли напиши «не сейчас» 😊"
    );
    return;
  }

  if (stage === FUNNEL_STAGES.COLLECT_CONTACT) {
    if (userText.toLowerCase().includes("не сейчас")) {
      userStates[userId] = { ...userStates[userId], stage: FUNNEL_STAGES.DONE };
      await sendMessage(userId,
        "Хорошо, без давления 😊\n\nМой AI-инструмент:\n👉 https://lucky-tartufo-0b2313.netlify.app\n\nПиши если появятся вопросы! ✨"
      );
    } else {
      userStates[userId] = { ...userStates[userId], stage: FUNNEL_STAGES.DONE, contact: userText };
      console.log("NEW LEAD:", { userId, task: userStates[userId].task, contact: userText });
      await sendMessage(userId,
        "Записала! ✅\n\nСвяжусь в течение 24 часов 🕐\n\n👉 https://lucky-tartufo-0b2313.netlify.app"
      );
    }
    return;
  }

  userStates[userId] = { stage: FUNNEL_STAGES.START };
  await handleFunnelStep(userId, userText, { stage: FUNNEL_STAGES.START });
}

async function registerWebhook() {
  const response = await fetch(`https://platform-api.max.ru/subscriptions?access_token=${MAX_BOT_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: WEBHOOK_URL }),
  });
  return response.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET" && event.queryStringParameters?.register) {
    const result = await registerWebhook();
    return { statusCode: 200, body: JSON.stringify(result) };
  }

  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: "Max Webhook is alive ✅" };
  }

  try {
    const update = JSON.parse(event.body);
    console.log("Update:", JSON.stringify(update).substring(0, 300));

    let userId, text;

    if (update.update_type === "message_created") {
      // Отправляем ответ отправителю (sender)
      userId = update.message?.sender?.user_id;
      text = update.message?.body?.text || "";
    }

    console.log("userId:", userId, "text:", text);

    if (!userId) return { statusCode: 200, body: "ok" };

    if (text === "/start" || !userStates[userId]) {
      userStates[userId] = { stage: FUNNEL_STAGES.START };
    }

    await handleFunnelStep(userId, text, userStates[userId] || {});
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("Error:", error.message);
    return { statusCode: 200, body: "ok" };
  }
};
