// ============================================
// Max Bot Webhook — Анастасия Булатова
// Воронка продаж с AI-копирайтером
// ============================================
// ИНСТРУКЦИЯ:
// 1. Замени YOUR_MAX_BOT_TOKEN на свой токен
// 2. Замени YOUR_CLAUDE_API_KEY на свой ключ Claude
// 3. Загрузи в папку netlify/functions/
// ============================================

const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN || "YOUR_MAX_BOT_TOKEN";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "YOUR_CLAUDE_API_KEY";
const MAX_API_BASE = "https://botapi.max.ru";

// Хранилище состояний пользователей (в памяти)
// Для продакшена замени на базу данных (Netlify DB, Supabase и т.д.)
const userStates = {};

// ============================================
// ЭТАПЫ ВОРОНКИ
// ============================================
const FUNNEL_STAGES = {
  START: "start",
  QUALIFY_TASK: "qualify_task",
  QUALIFY_AUDIENCE: "qualify_audience",
  QUALIFY_BUDGET: "qualify_budget",
  WARM_UP: "warm_up",
  COLLECT_CONTACT: "collect_contact",
  OFFER: "offer",
  DONE: "done",
};

// ============================================
// ОТПРАВКА СООБЩЕНИЯ В MAX
// ============================================
async function sendMessage(chatId, text, keyboard = null) {
  const body = {
    chat_id: chatId,
    text: text,
  };

  if (keyboard) {
    body.reply_markup = { keyboard: keyboard, one_time_keyboard: true };
  }

  const response = await fetch(`${MAX_API_BASE}/sendMessage?access_token=${MAX_BOT_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

// ============================================
// ГЕНЕРАЦИЯ КОНТЕНТА ЧЕРЕЗ CLAUDE (ПРОГРЕВ)
// ============================================
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
      messages: [
        {
          role: "user",
          content: `Ты — Анастасия Булатова, промпт-инженер и AI-эксперт по контенту для ВКонтакте и Max.

Пользователь написал тебе в бот. Его задача: "${userTask}". Его аудитория: "${userAudience}".

Напиши короткий (3-4 абзаца) полезный пост-прогрев в твоём стиле:
- Живой, личный тон
- Конкретный совет по его задаче
- В конце — мягкий намёк, что ты помогаешь с такими задачами
- Без продажи в лоб
- Без хэштегов

Пиши как будто это личное сообщение, не пост.`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.content?.[0]?.text || "Интересная задача! Давай разберём её вместе.";
}

// ============================================
// ОБРАБОТКА ЭТАПОВ ВОРОНКИ
// ============================================
async function handleFunnelStep(chatId, userText, state) {
  const stage = state.stage || FUNNEL_STAGES.START;

  // ЭТАП 1: ПРИВЕТСТВИЕ
  if (stage === FUNNEL_STAGES.START) {
    userStates[chatId] = { stage: FUNNEL_STAGES.QUALIFY_TASK };
    await sendMessage(
      chatId,
      `Привет! 👋 Я Анастасия Булатова — помогаю экспертам и бизнесу создавать контент с помощью AI.

Расскажи, с чем хочешь разобраться? Выбери или напиши своё:`,
      [
        [{ text: "📝 Нужен контент для соцсетей" }],
        [{ text: "🤖 Хочу настроить AI-бота" }],
        [{ text: "📈 Хочу больше клиентов через контент" }],
        [{ text: "💡 Просто изучаю AI-инструменты" }],
      ]
    );
    return;
  }

  // ЭТАП 2: КВАЛИФИКАЦИЯ — ЗАДАЧА
  if (stage === FUNNEL_STAGES.QUALIFY_TASK) {
    userStates[chatId] = {
      stage: FUNNEL_STAGES.QUALIFY_AUDIENCE,
      task: userText,
    };
    await sendMessage(
      chatId,
      `Понятно, "${userText}" — хорошая задача 💪

А кто твоя аудитория? Кому ты продаёшь или для кого пишешь?`,
      [
        [{ text: "👔 B2B — компании и предприниматели" }],
        [{ text: "👤 B2C — частные люди" }],
        [{ text: "🎓 Эксперты и специалисты" }],
        [{ text: "🛍 Интернет-магазин / продукт" }],
      ]
    );
    return;
  }

  // ЭТАП 3: КВАЛИФИКАЦИЯ — АУДИТОРИЯ
  if (stage === FUNNEL_STAGES.QUALIFY_AUDIENCE) {
    userStates[chatId] = {
      ...userStates[chatId],
      stage: FUNNEL_STAGES.WARM_UP,
      audience: userText,
    };

    await sendMessage(chatId, `Отлично! Дай мне секунду, подготовлю кое-что полезное специально для тебя... 🧠✨`);

    // Генерируем прогревающий контент через Claude
    const warmUpText = await generateWarmUpContent(
      userStates[chatId].task,
      userText
    );

    userStates[chatId].stage = FUNNEL_STAGES.COLLECT_CONTACT;

    await sendMessage(chatId, warmUpText);

    setTimeout(async () => {
      await sendMessage(
        chatId,
        `Кстати, я работаю с несколькими клиентами индивидуально 🤝

Если хочешь разобрать твою ситуацию подробнее — оставь имя и контакт (телефон или email), я напишу лично.

Или просто напиши "не сейчас" — и я пришлю полезные материалы 😊`,
        [
          [{ text: "📞 Хочу консультацию" }],
          [{ text: "📚 Пришли материалы" }],
          [{ text: "Не сейчас" }],
        ]
      );
    }, 2000);
    return;
  }

  // ЭТАП 4: СБОР КОНТАКТА
  if (stage === FUNNEL_STAGES.COLLECT_CONTACT) {
    if (userText === "Не сейчас" || userText === "📚 Пришли материалы") {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.DONE };
      await sendMessage(
        chatId,
        `Хорошо, без давления 😊

Вот мои бесплатные материалы:
📌 Как писать посты с AI — https://lucky-tartufo-0b2313.netlify.app
📌 Напиши мне в любое время, если появятся вопросы

Удачи с контентом! ✨`
      );
    } else if (userText === "📞 Хочу консультацию") {
      userStates[chatId] = { ...userStates[chatId], stage: FUNNEL_STAGES.OFFER };
      await sendMessage(
        chatId,
        `Отлично! 🙌

Напиши своё имя и удобный способ связи (телефон, email или username в соцсетях) — я свяжусь в течение 24 часов.`
      );
    } else {
      // Пользователь написал контакт
      userStates[chatId] = {
        ...userStates[chatId],
        stage: FUNNEL_STAGES.DONE,
        contact: userText,
      };

      // Сохраняем контакт в лог (в продакшене — отправь в Google Sheets или CRM)
      console.log("NEW LEAD:", {
        chatId,
        task: userStates[chatId].task,
        audience: userStates[chatId].audience,
        contact: userText,
        timestamp: new Date().toISOString(),
      });

      await sendMessage(
        chatId,
        `Отлично, записала! ✅

Свяжусь с тобой в течение 24 часов 🕐

Пока можешь посмотреть мой AI-инструмент для контента:
👉 https://lucky-tartufo-0b2313.netlify.app

До скорого! 👋`
      );
    }
    return;
  }

  // ЕСЛИ НАПИСАЛ ЧТО-ТО НЕ ПО СКРИПТУ — сбрасываем в начало
  userStates[chatId] = { stage: FUNNEL_STAGES.START };
  await sendMessage(
    chatId,
    `Привет! Напиши /start чтобы начать, или задай любой вопрос — отвечу 😊`
  );
}

// ============================================
// ГЛАВНЫЙ ОБРАБОТЧИК WEBHOOK
// ============================================
exports.handler = async (event) => {
  // Проверяем метод
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "Max Webhook is alive ✅" };
  }

  try {
    const update = JSON.parse(event.body);

    // Получаем сообщение
    const message = update.message;
    if (!message) {
      return { statusCode: 200, body: "ok" };
    }

    const chatId = message.chat?.id || message.from?.id;
    const text = message.text || "";

    if (!chatId) {
      return { statusCode: 200, body: "ok" };
    }

    // Команда /start — сброс воронки
    if (text === "/start") {
      userStates[chatId] = { stage: FUNNEL_STAGES.START };
    }

    // Обрабатываем шаг воронки
    await handleFunnelStep(chatId, text, userStates[chatId] || {});

    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("Webhook error:", error);
    return { statusCode: 200, body: "ok" };
  }
};
