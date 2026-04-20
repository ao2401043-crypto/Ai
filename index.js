import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import express from 'express';

// ========== ENV VARIABLES ==========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const BOT_NAME = process.env.BOT_NAME || 'Miko';

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

// ========== HELPER FUNCTIONS ==========
async function callOpenAIChat(systemPrompt, userText) {
  const body = {
    model: "gpt-4o-mini", // أكثر استقرارًا من gpt-5 في البوتات
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ],
    max_tokens: 160,
    temperature: 0.9,
    top_p: 0.95
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('OpenAI chat error', res.status, txt);
    return "فشلت محاولة الرد، جرّب بعد شوية.";
  }

  const json = await res.json();
  const reply = json.choices?.[0]?.message?.content?.trim();
  return reply || "هااا؟ ما فهمت قصدك 😑";
}

async function checkModeration(text) {
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: text
    })
  });

  if (!res.ok) {
    console.error('Moderation API error', await res.text());
    return false;
  }

  const json = await res.json();
  const flagged = json.results?.[0]?.flagged;
  return !!flagged;
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
