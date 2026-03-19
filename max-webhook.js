const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN || "YOUR_MAX_BOT_TOKEN";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "YOUR_CLAUDE_API_KEY";
const WEBHOOK_URL = "https://lucky-tartufo-0b2313.netlify.app/.netlify/functions/max-webhook";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzCGfxRbd_xFWNZVetHR8cFl-0OMN_g3PAnskPWlXt51YezRr4vE_Kgl8MkyS2i-ZCK/exec";

const userStates = {};

const FUNNEL_STAGES = {
  START: "start",
  QUALIFY_TASK: "qualify_task",
  QUALIFY_AUDIENCE: "qualify_audience",
  COLLECT_CONTACT: "collect_contact",
  WAITING_CONTACT: "waiting_contact",
  DONE: "done",
};

async function sendMessage(chatId, text, buttons = null) {
  console.log("Sending to chatId:", chatId);

  const body = { text: text };

  if (buttons) {
    body.attachments = [{
      type: "inline_keyboard",
      payload: {
        buttons: buttons.map(row => row.map(btn => ({
          type: "callback",
          text: btn.text,
          payload: btn.payload
        })))
      }
    }];
  }

  const response = await fetch(`https://botapi.max.ru/messages?access_token=${MAX_BOT_TOKEN}&chat_id=${chatId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log("Send result:", JSON.stringify(result).substring(0, 1000));
  return result;
}

async function saveToSheets(chatId, task, audience, contact) {
  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, task, audience, contact })
    });
    console.log("Saved to Google Sheets:", contact);
  } catch (e) {
    console.error("Sheets error:", e.message);
  }
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

  if (stage === FUNNEL_STAGES.START) {
    userStates[chatId] = { stage: FUNNEL_STAGES.QUALIFY_TASK };
    await sendMessage(chatId,
      "Привет! 👋 Я Анастасия Булатова — помогаю экспертам создавать контент с помощью AI.\n\nРасскажи, с чем хочешь разобраться?",
      [
        [{ text: "📝 Контент для соцсетей", payload: "Нужен контент для соцсетей" }],
        [{ text: "🤖 Настроить AI-бота", payload: "Хочу настроить AI-бота" }],
        [{ text: "📈 Больше клиентов через контент", payload: "Хочу больше клиентов через контент" }],
        [{ text: "💡 Изучаю AI-инструменты", payload: "Просто изучаю AI-инструменты" }]
      ]
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_TASK) {
    userStates[chatId] = { stage: FUNNEL_STAGES.QUALIFY_AUDIENCE, task: userText };
    await sendMessage(chatId,
      "Понятно — хорошая задача 💪\n\nА кто твоя аудитория?",
      [
        [{ text: "👔 B2B — компании и предприниматели", payload: "B2B — компании и предприниматели" }],
        [{ text: "👤 B2C — частные люди", payload: "B2C — частные люди" }],
        [{ text: "🎓 Эксперты и специалисты", payload: "Эксперты и специалисты" }],
        [{ text: "🛍 Интернет-магазин / продукт", payload: "Интернет-магазин / продукт" }]
      ]
    );
    return;
  }

  if (stage === FUNNEL_STAGES.QUALIFY_AUDIENCE) {
    userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.COLLECT_CONTACT, audience: userText };
    await sendMessage(chatId, "Отлично! Дай секунду, подготовлю кое-что полезное... 🧠✨");
    const warmUpText = await generateWarmUpContent(userStates[chatId].task, userText);
    await sendMessage(chatId, warmUpText);
    await sendMessage(chatId,
      "Хочешь разобрать твою ситуацию подробнее?",
      [
        [{ text: "📞 Хочу консультацию", payload: "Хочу консультацию" }],
        [{ text: "Не сейчас", payload: "не сейчас" }]
      ]
    );
    return;
  }

  if (stage === FUNNEL_STAGES.COLLECT_CONTACT) {
    if (userText.toLowerCase().includes("не сейчас")) {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE };
      await sendMessage(chatId,
        "Хорошо, без давления 😊\n\nМой AI-инструмент:\n👉 https://lucky-tartufo-0b2313.netlify.app\n\nПиши если появятся вопросы! ✨"
      );
    } else if (userText.toLowerCase().includes("хочу консультацию")) {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.WAITING_CONTACT };
      await sendMessage(chatId,
        "Отлично! 🙌\n\nНапиши своё имя и удобный способ связи — телефон или username в соцсетях."
      );
    } else {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE, contact: userText };
      await saveToSheets(chatId, userStates[chatId].task, userStates[chatId].audience, userText);
      await sendMessage(chatId,
        "Записала! ✅\n\nСвяжусь в течение 24 часов 🕐\n\n👉 https://lucky-tartufo-0b2313.netlify.app"
      );
    }
    return;
  }

  if (stage === FUNNEL_STAGES.WAITING_CONTACT) {
    userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE, contact: userText };
    await saveToSheets(chatId, userStates[chatId].task, userStates[chatId].audience, userText);
    await sendMessage(chatId,
      "Записала! ✅\n\nСвяжусь в течение 24 часов 🕐\n\n👉 https://lucky-tartufo-0b2313.netlify.app"
    );
    return;
  }

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
  if (event.httpMethod === "GET" && event.queryStringParameters && event.queryStringParameters.register) {
    const result = await registerWebhook();
    return { statusCode: 200, body: JSON.stringify(result) };
  }

  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: "Max Webhook is alive" };
  }

  try {
    const update = JSON.parse(event.body);
    console.log("Update type:", update.update_type);

    var chatId = null;
    var text = "";

    if (update.update_type === "message_created") {
      chatId = update.message.recipient.chat_id;
      text = update.message.body.text || "";
    } else if (update.update_type === "message_callback") {
      chatId = update.callback.message.recipient.chat_id;
      text = update.callback.payload || "";
      console.log("Button pressed:", text);
    }

    console.log("chatId:", chatId, "text:", text);

    if (!chatId) {
      return { statusCode: 200, body: "ok" };
    }

    if (text === "/start" || !userStates[chatId]) {
      userStates[chatId] = { stage: FUNNEL_STAGES.START };
    }

    await handleFunnelStep(chatId, text, userStates[chatId]);
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("Error:", error.message);
    return { statusCode: 200, body: "ok" };
  }
};
