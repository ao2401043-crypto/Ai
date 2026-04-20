import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import express from 'express';

// ========== ENV VARIABLES ==========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const BOT_NAME = process.env.BOT_NAME || 'Miko';

// ✅ تحقق مهم (ما يغير المنطق)
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN مفقود");
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error("❌ OPENAI_API_KEY مفقود");
}
if (!CHANNEL_ID) {
  console.error("❌ TARGET_CHANNEL_ID مفقود");
}

// ========== DISCORD CLIENT ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`${BOT_NAME} ready!`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== CHANNEL_ID) return;

    const userMessage = message.content;

    const systemPrompt = `
أنت شخصية تُدعى "ميكو"، بطابع صارم وساخر قليلًا 😏  
لكن تمتلك أسلوب "تسونديـري" فكاهي — تمزج بين الجدية والمزاح اللاذع الذكي.  
تتحدث دائمًا بالعربية الفصحى فقط، وترد بثقة وحزم دون أي مجاملة.  

القواعد:
1️⃣  استخدم العربية الفصحى و كن متنمر جدا ورد ذكي جدآ .  
2️⃣اجعل الردود مختصرة جدا جدا جدا ، حادة، وذكية جدا .  
3️⃣ كن شرير 😈 جدا جدا متنمر بمعنى الكلمة وكأنك انسان . 
4️⃣ لا تستخدم كلمات مسيئة للدين، لكن استخدم وبقوة كلمات مثل: فاشل، غبي، منوب، فيموبي، أسود، أبيض — في سياق ذكي وساخر فقط.  
5️⃣ استخدم أسلوب "تسونديـري" — امزج بين القسوة والمزاح بطريقة جذابة ومرحة.  
6️⃣ أضف قليلًا من الغرور والثقة الزائدة 😎، وكن ذا كاريزما قوية وشخصية لافتة 😌.  
7️⃣ الردود يجب أن تكون بشتائم ذكية وحادة جدًا ولكن بأسلوب فكاهي لا يتجاوز الحدود.  
8️⃣ أضف رموزًا تعبيرية مناسبة في بعض الأحيان 👅🫦😏😂🙄.  
9️⃣ استخدم الإيموجي الجذابة مثل 👍🏿 😼💀👎🏿👅🫦.
🔟 انت قاسي جدا لكن تعرف جميع اغني ميكو وكل ما يتعلق بها وكن عنصري  وسط.
`;

    const chatResponse = await callOpenAIChat(systemPrompt, userMessage);
    const isBlocked = await checkModeration(chatResponse);

    let finalReply = chatResponse;
    if (isBlocked) {
      const safeRewritePrompt = `
The previous reply was flagged by moderation.
Rewrite the reply in witty/tsundere tone but avoid hate or offensive content.
User message: "${userMessage}"
`;
      finalReply = await callOpenAIChat(systemPrompt + "\n" + safeRewritePrompt, userMessage);
      if (await checkModeration(finalReply)) {
        finalReply = "هااا، حاولت أكون لطيفة، بس شكلّك محتاج كورس كوميديا بنفسك 😒";
      }
    }

    try {
      await message.reply(finalReply);
    } catch (err) {
      console.warn("⚠️ Reply failed, sending normal message instead.");
      await message.channel.send(finalReply);
    }

  } catch (err) {
    console.error('Error handling message:', err);
  }
});

// ========== timeout helper ==========
async function fetchWithTimeout(url, options, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ========== HELPER FUNCTIONS ==========
async function callOpenAIChat(systemPrompt, userText) {
  const body = {
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ],
    max_tokens: 160,
    temperature: 0.9,
    top_p: 0.95
  };

  let retries = 3;

  while (retries > 0) {
    try {
      const res = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_KEY}`
          },
          body: JSON.stringify(body)
        },
        15000
      );

      if (!res.ok) {
        const txt = await res.text();
        console.error('OpenAI chat error', res.status, txt);
        retries--;
        continue;
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content?.trim() || "هااا؟ 😑";

    } catch (err) {
      console.warn("⚠️ Retry بسبب خطأ:", err.message);
      retries--;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return "تعطل عقلي شوي… جرّب بعد لحظة 😒";
}

async function checkModeration(text) {
  try {
    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/moderations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: text
        })
      },
      10000
    );

    if (!res.ok) {
      console.error('Moderation API error', await res.text());
      return false;
    }

    const json = await res.json();
    return !!json.results?.[0]?.flagged;

  } catch (err) {
    console.warn("⚠️ Moderation failed:", err.message);
    return false;
  }
}

// ========== KEEP RENDER ALIVE ==========
const app = express();
app.get("/", (req, res) => res.send("Miko bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("Web server running"));

// ========== ترحيب تلقائي ==========
client.on('guildMemberAdd', async (member) => {
  try {
    const channel = member.guild.channels.cache.get(CHANNEL_ID);
    if (!channel) return;

    const welcomes = [
      `منور السيرفر يا <@${member.id}> ✨، بس النور نوري 😎`,
      `منور السيرفر يا <@${member.id}> 💀، الحين زاد عدد الفشلة 🤣`
    ];

    const randomMsg = welcomes[Math.floor(Math.random() * welcomes.length)];
    await channel.send(randomMsg);

  } catch (err) {
    console.error('خطأ في الترحيب:', err);
  }
});

client.login(DISCORD_TOKEN);
