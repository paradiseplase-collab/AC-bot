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

async function sendMessage(chatId, text) {
  console.log("Sending message to:", chatId, "text:", text.substring(0, 50));
  
  const response = await fetch(`https://botapi.max.ru/messages?access_token=${MAX_BOT_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { chat_id: chatId },
      type: "text",
      text: text
    }),
  });
  
  const result = await response.json();
  console.log("Send result:", JSON.stringify(result).substring(0, 100));
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

async function handleFunnelStep(chatId, userText, state) {
  const stage = state.stage || FUNNEL_STAGES.START;
  console.log("Stage:", stage, "Text:", userText);

  if (stage === FUNNEL_STAGES.START || !stage) {
    userStates[chatId] = { stage: FUNNEL_STAGES.QUALIFY_TASK };
    await sendMessage(chatId,
      "Привет! 👋 Я Анастасия Булатова — помогаю экспертам создавать контент с помощью AI.\n\nРасскажи, с чем хочешь разобраться?\n\n1️⃣ Нужен контент для соцсетей\n2️⃣ Хочу настроить AI-бота\n3️⃣ Хочу больше клиентов через контент\n4️⃣ Просто изучаю AI-инструменты"
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_TASK) {
    userStates[chatId] = { stage: FUNNEL_STAGES.QUALIFY_AUDIENCE, task: userText };
    await sendMessage(chatId,
      `Понятно, "${userText}" — хорошая задача 💪\n\nА кто твоя аудитория?\n\n1️⃣ B2B — компании и предприниматели\n2️⃣ B2C — частные люди\n3️⃣ Эксперты и специалисты\n4️⃣ Интернет-магазин / продукт`
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_AUDIENCE) {
    userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.COLLECT_CONTACT, audience: userText };
    await sendMessage(chatId, "Отлично! Дай мне секунду, подготовлю кое-что полезное специально для тебя... 🧠✨");
    
    const warmUpText = await generateWarmUpContent(userStates[chatId].task, userText);
    await sendMessage(chatId, warmUpText);
    await sendMessage(chatId,
      "Если хочешь разобрать твою ситуацию подробнее — напиши своё имя и контакт, я свяжусь лично 🤝\n\nИли напиши «не сейчас» — пришлю полезные материалы 😊"
    );
    return;
  }

  if (stage === FUNNEL_STAGES.COLLECT_CONTACT) {
    if (userText.toLowerCase().includes("не сейчас")) {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE };
      await sendMessage(chatId,
        "Хорошо, без давления 😊\n\nМой AI-инструмент для контента:\n👉 https://lucky-tartufo-0b2313.netlify.app\n\nПиши если появятся вопросы! ✨"
      );
    } else {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE, contact: userText };
      console.log("NEW LEAD:", { chatId, task: userStates[chatId].task, audience: userStates[chatId].audience, contact: userText });
      await sendMessage(chatId,
        "Записала! ✅\n\nСвяжусь в течение 24 часов 🕐\n\nПока посмотри мой AI-инструмент:\n👉 https://lucky-tartufo-0b2313.netlify.app"
      );
    }
    return;
  }

  // Сброс
  userStates[chatId] = { stage: FUNNEL_STAGES.START };
  await handleFunnelStep(chatId, userText, { stage: FUNNEL_STAGES.START });
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
  console.log("Incoming request:", event.httpMethod, JSON.stringify(event.queryStringParameters));

  if (event.httpMethod === "GET" && event.queryStringParameters?.register) {
    const result = await registerWebhook();
    return { statusCode: 200, body: JSON.stringify(result) };
  }

  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: "Max Webhook is alive ✅" };
  }

  try {
    console.log("Raw body:", event.body?.substring(0, 200));
    const update = JSON.parse(event.body);
    console.log("Update type:", update.update_type, "Update:", JSON.stringify(update).substring(0, 300));

    // Max API формат
    let chatId, text;

    if (update.update_type === "message_created") {
      chatId = update.message?.recipient?.chat_id || update.message?.sender?.user_id;
      text = update.message?.body?.text || "";
    } else if (update.message) {
      // Запасной вариант
      chatId = update.message?.chat?.id || update.message?.from?.id;
      text = update.message?.text || "";
    }

    console.log("chatId:", chatId, "text:", text);

    if (!chatId) {
      console.log("No chatId found, skipping");
      return { statusCode: 200, body: "ok" };
    }

    if (text === "/start" || !userStates[chatId]) {
      userStates[chatId] = { stage: FUNNEL_STAGES.START };
    }

    await handleFunnelStep(chatId, text, userStates[chatId] || {});
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("Webhook error:", error.message, error.stack);
    return { statusCode: 200, body: "ok" };
  }
};
