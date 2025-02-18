process.env.NTBA_FIX_319 = 1;
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const XLSX = require("xlsx");

// تنظیم توکن ربات تلگرام
const token = "7800568995:AAGYtZFqrrKk7WL8u-tTdGmmfb_4xLwGWnw";
const bot = new TelegramBot(token, { polling: true });

// متغیرهای وضعیت ربات
let rowIndexStart = 0;
let persianNames = [];
let englishNames = [];
let linksList = [];
let countryNames = [];
let productionYears = [];

// دکمه‌ها و آیدی‌های مبدا و مقصد
const mappings = {
  ایرانی: {
    source_id: "@MrMoovie",
    dest_id: "t.me/+GtX5gVcOHwZiODI0",
  },
  خارجی: {
    source_id: "@towfilm",
    dest_id: "@GlobCinema",
  },
  ترکیبی: {
    dest_id: "@GlobCinema",
  },
};

// ذخیره آیدی‌ها برای کاربران
const userMappings = {};

// صف ارسال پیام
const messageQueue = [];
let isProcessing = false;

// افزودن پیام به صف
const addToQueue = (task) => {
  messageQueue.push(task);
  processQueue();
};

// پردازش صف
const processQueue = async () => {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;

  const task = messageQueue.shift();
  try {
    await task(); // اجرای پیام
  } catch (error) {
    console.error("خطا در پردازش صف:", error);
  }

  isProcessing = false;
  processQueue(); // ادامه پردازش پیام‌های بعدی
};

// فرمان /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "ایرانی", callback_data: "ایرانی" },
          { text: "خارجی", callback_data: "خارجی" },
          { text: "ترکیبی", callback_data: "ترکیبی" },
        ],
        [{ text: "ریستارت ربات", callback_data: "ریستارت" }],
      ],
    },
  };

  bot.sendMessage(chatId, "سلام! لطفاً یک گزینه انتخاب کنید:", options);
  // ریست کردن تمام داده‌های قبلی
  persianNames = [];
  englishNames = [];
  linksList = [];
  countryNames = [];
  productionYears = [];
  rowIndexStart = 0;

  bot.sendMessage(
    chatId,
    "ربات از اول شروع شد! لطفا ابتدا یک فایل اکسل ارسال کنید که شامل نام‌های فارسی، نام‌های انگلیسی، سال تولید، کشورها و لینک‌ها باشد."
  );
});

// مدیریت دستور `/rowstart` برای تنظیم ردیف شروع
bot.onText(/\/rowstart (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;

  // بررسی صحت ورودی
  const rowStartInput = parseInt(match[1], 10);
  if (isNaN(rowStartInput) || rowStartInput < 1) {
    bot.sendMessage(chatId, "❌ لطفاً یک شماره معتبر (بزرگتر از ۰) وارد کنید.");
    return;
  }

  rowIndexStart = rowStartInput - 1;
  bot.sendMessage(
    chatId,
    `✅ شماره ردیف شروع به ${rowStartInput} تنظیم شد. اکنون فایل اکسل را ارسال کنید.`
  );
});

// هندلر برای انتخاب دکمه
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const selectedOption = query.data;

  if (mappings[selectedOption]) {
    const { source_id, dest_id } = mappings[selectedOption];
    userMappings[chatId] = { source_id, dest_id };

    bot.sendMessage(chatId, `تنظیمات ${selectedOption} با موفقیت ذخیره شد.`);
    bot.sendMessage(
      chatId,
      "حالا هر پیام یا رسانه‌ای که ارسال کنید، آیدی‌ها تغییر خواهند کرد."
    );
  }

  if (selectedOption === "ریستارت") {
    delete userMappings[chatId];
    bot.sendMessage(chatId, "ربات با موفقیت ریستارت شد.");
  }
});

// دریافت فایل اکسل
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;

  try {
    // دریافت فایل
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

    // خواندن فایل اکسل
    const workbook = XLSX.read(response.data, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // استخراج داده‌ها از شیت اکسل
    const data = XLSX.utils.sheet_to_json(sheet);

    persianNames = data.map((row) => row["نام فارسی"] || "");
    englishNames = data.map((row) => row["نام انگلیسی"] || "");
    linksList = data.map((row) => row["لینک در کانال"] || "");
    countryNames = data.map((row) => row["کشور"] || "");
    productionYears = data.map((row) => row["سال تولید"] || "بدون اطلاعات");

    bot.sendMessage(
      chatId,
      "فایل اکسل با موفقیت بارگذاری شد. در حال پردازش اطلاعات..."
    );

    if (
      persianNames.length === englishNames.length &&
      englishNames.length === linksList.length &&
      linksList.length === countryNames.length &&
      countryNames.length === productionYears.length
    ) {
      let message = "";
      let maxMessageLength = 3800;

      for (let i = rowIndexStart; i < englishNames.length; i++) {
        if (
          !persianNames[i] ||
          !englishNames[i] ||
          !linksList[i] ||
          !countryNames[i]
        ) {
          continue;
        }

        const filmMessage = `${i + 1} - <b>${persianNames[i]}</b> (${
          productionYears[i]
        }) ${countryNames[i]}  👇\n😍 <a href="${linksList[i]}">"${
          englishNames[i]
        }"</a>\n\n`;

        if (message.length + filmMessage.length > maxMessageLength) {
          await bot.sendMessage(chatId, message, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
          message = "";
        }

        message += filmMessage;
      }

      if (message.trim().length > 0) {
        message += "\n@GlobCinema\n@Filmoseriyalerooz_Bot";
        await bot.sendMessage(chatId, message, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      }
    } else {
      bot.sendMessage(
        chatId,
        "تعداد نام‌های فارسی، نام‌های انگلیسی، لینک‌ها، سال تولید و کشورها باید برابر باشد. لطفا دوباره امتحان کنید."
      );
    }
  } catch (error) {
    console.error("Error processing the Excel file:", error);
    bot.sendMessage(chatId, "❌ خطا در پردازش فایل اکسل.");
  }
});

// پردازش تصاویر
bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  const userMapping = userMappings[chatId];
  let caption = msg.caption || "";

  if (userMapping) {
    const { dest_id } = userMapping;

    if (dest_id === "t.me/+GtX5gVcOHwZiODI0") {
      caption =
        caption.split("📥 لینک ")[0] +
        "\nt.me/+GtX5gVcOHwZiODI0";
    } else if (dest_id === "@GlobCinema") {
      caption =
        caption.split("➰ لینک دانلود:")[0] +
        "\n❤️@GlobCinema\n❤️@GlobCinemaNews";
    }
  }

  addToQueue(() => bot.sendPhoto(chatId, msg.photo[0].file_id, { caption }));
});

// پردازش ویدیو
bot.on("video", (msg) => {
  const chatId = msg.chat.id;
  const userMapping = userMappings[chatId];
  let caption = msg.caption || "";

  if (userMapping) {
    const { dest_id } = userMapping;

    if (dest_id === "t.me/+GtX5gVcOHwZiODI0" && caption.includes("@MrMoovie")) {
      caption = caption.replace("@MrMoovie", "t.me/+GtX5gVcOHwZiODI0");
    } else if (dest_id === "@GlobCinema" && caption.includes("@towfilm")) {
      caption = caption.replace("@towfilm", "@GlobCinema");
    }
  }

  addToQueue(() => bot.sendVideo(chatId, msg.video.file_id, { caption }));
});

// پردازش پیام‌های متنی
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (msg.text && msg.text !== "/start") {
    let messageText = msg.text;

    const userMapping = userMappings[chatId];
    if (userMapping) {
      const { source_id, dest_id } = userMapping;

      if (source_id && dest_id && messageText.includes(source_id)) {
        messageText = messageText.replace(source_id, dest_id);
      }

      addToQueue(() => bot.sendMessage(chatId, messageText));
    }
  }
});
