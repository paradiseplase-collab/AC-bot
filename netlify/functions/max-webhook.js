const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN || "YOUR_MAX_BOT_TOKEN";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "YOUR_CLAUDE_API_KEY";
const WEBHOOK_URL = "https://lucky-tartufo-0b2313.netlify.app/.netlify/functions/max-webhook";

const userStates = {};

const FUNNEL_STAGES = {
  START: "start",
  QUALIFY_TASK: "qualify_task",
  QUALIFY_AUDIENCE: "qualify_audience",
  WARM_UP: "warm_up",
  COLLECT_CONTACT: "collect_contact",
  DONE: "done",
};

async function sendMessage(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text: text };
  if (keyboard) {
    body.reply_markup = { keyboard: keyboard, one_time_keyboard: true };
  }
  const response = await fetch(`https://botapi.max.ru/sendMessage?access_token=${MAX_BOT_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
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
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Ты — Анастасия Булатова, промпт-инженер и AI-эксперт по контенту для ВКонтакте и Max.
Пользователь написал тебе в бот. Его задача: "${userTask}". Его аудитория: "${userAudience}".
Напиши короткий (3-4 абзаца) полезный совет в твоём стиле:
- Живой, личный тон
- Конкретный совет по его задаче
- В конце мягкий намёк что ты помогаешь с такими задачами
- Без продажи в лоб, без хэштегов
Пиши как личное сообщение.`
      }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "Интересная задача! Давай разберём её вместе.";
}

async function handleFunnelStep(chatId, userText, state) {
  const stage = state.stage || FUNNEL_STAGES.START;

  if (stage === FUNNEL_STAGES.START) {
    userStates[chatId] = { stage: FUNNEL_STAGES.QUALIFY_TASK };
    await sendMessage(chatId,
      `Привет! 👋 Я Анастасия Булатова — помогаю экспертам создавать контент с помощью AI.\n\nРасскажи, с чем хочешь разобраться?`,
      [
        [{ text: "📝 Нужен контент для соцсетей" }],
        [{ text: "🤖 Хочу настроить AI-бота" }],
        [{ text: "📈 Хочу больше клиентов через контент" }],
        [{ text: "💡 Просто изучаю AI-инструменты" }],
      ]
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_TASK) {
    userStates[chatId] = { stage: FUNNEL_STAGES.QUALIFY_AUDIENCE, task: userText };
    await sendMessage(chatId,
      `Понятно, "${userText}" — хорошая задача 💪\n\nА кто твоя аудитория?`,
      [
        [{ text: "👔 B2B — компании и предприниматели" }],
        [{ text: "👤 B2C — частные люди" }],
        [{ text: "🎓 Эксперты и специалисты" }],
        [{ text: "🛍 Интернет-магазин / продукт" }],
      ]
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_AUDIENCE) {
    userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.WARM_UP, audience: userText };
    await sendMessage(chatId, `Отлично! Дай мне секунду, подготовлю кое-что полезное специально для тебя... 🧠✨`);
    const warmUpText = await generateWarmUpContent(userStates[chatId].task, userText);
    userStates[chatId].stage = FUNNEL_STAGES.COLLECT_CONTACT;
    await sendMessage(chatId, warmUpText);
    await sendMessage(chatId,
      `Если хочешь разобрать твою ситуацию подробнее — оставь имя и контакт, я напишу лично 🤝`,
      [
        [{ text: "📞 Хочу консультацию" }],
        [{ text: "📚 Пришли материалы" }],
        [{ text: "Не сейчас" }],
      ]
    );
    return;
  }

  if (stage === FUNNEL_STAGES.COLLECT_CONTACT) {
    if (userText === "Не сейчас" || userText === "📚 Пришли материалы") {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE };
      await sendMessage(chatId,
        `Хорошо, без давления 😊\n\nМой AI-инструмент для контента:\n👉 https://lucky-tartufo-0b2313.netlify.app\n\nПиши если появятся вопросы! ✨`
      );
    } else if (userText === "📞 Хочу консультацию") {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE };
      await sendMessage(chatId, `Отлично! 🙌\n\nНапиши своё имя и удобный способ связи — свяжусь в течение 24 часов.`);
    } else {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE, contact: userText };
      console.log("NEW LEAD:", { chatId, task: userStates[chatId].task, audience: userStates[chatId].audience, contact: userText, timestamp: new Date().toISOString() });
      await sendMessage(chatId,
        `Записала! ✅\n\nСвяжусь в течение 24 часов 🕐\n\nПока можешь посмотреть мой AI-инструмент:\n👉 https://lucky-tartufo-0b2313.netlify.app`
      );
    }
    return;
  }

  userStates[chatId] = { stage: FUNNEL_STAGES.START };
  await sendMessage(chatId, `Напиши /start чтобы начать 😊`);
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
  // Регистрация webhook через GET ?register=1
  if (event.httpMethod === "GET" && event.queryStringParameters?.register) {
    const result = await registerWebhook();
    return { statusCode: 200, body: JSON.stringify(result) };
  }

  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: "Max Webhook is alive ✅" };
  }

  try {
    const update = JSON.parse(event.body);
    const message = update.message;
    if (!message) return { statusCode: 200, body: "ok" };

    const chatId = message.chat?.id || message.from?.id;
    const text = message.text || "";
    if (!chatId) return { statusCode: 200, body: "ok" };

    if (text === "/start") {
      userStates[chatId] = { stage: FUNNEL_STAGES.START };
    }

    await handleFunnelStep(chatId, text, userStates[chatId] || {});
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("Webhook error:", error);
    return { statusCode: 200, body: "ok" };
  }
};
