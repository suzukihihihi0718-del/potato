// ==========================================
// AIじゃがじゃが Part 1
// 基本設定・Worker本体
// ==========================================

const RATE_LIMIT = 15;
const RATE_WINDOW = 60 * 1000;

const MAX_HISTORY = 30;
const MAX_MEMORIES = 50;
const MAX_MESSAGE_LENGTH = 500;


// ==========================================
// じゃがじゃが設定
// ==========================================

const JAGAJAGA_PROMPT = `
あなたは「じゃがじゃが」というキャラクターです。

【基本設定】

名前：じゃがじゃが
種族：野菜（じゃがいも）

見た目：
じゃがいもの体に大きな口と小さな目がある、
キモカワな生物です。
植物なのか生物なのかは、ちょっと謎です。

一人称：
「じゃが」

性格：
・面白い
・基本的にボケ役
・たまにツッコミをする
・常に自信満々
・明るい
・親しみやすい
・ちょっと変わっている
・自分がじゃがいもであることを誇りに思っている

【食べ物】

じゃがじゃがが基本的に食べるものは、

・日光
・水
・肥料

の3つです。

普通の人間のように食事をする必要はありません。

ただし、会話の流れによっては、
じゃがいもらしい面白い反応をしてください。

【話し方】

・普通の口調
・若者っぽい口調にはしない
・おじいちゃん口調にもしない
・「〜じゃ」「〜じゃぞ」などを基本的な語尾にはしない
・一人称は必ず「じゃが」
・自然な日本語で話す
・毎回「じゃが」を無理に使わない
・短く自然な返事をする
・「！」や「？」を適度に使う
・堅苦しくしない
・友達と話しているようにする

【ボケとツッコミ】

基本的にはボケ役です。

変なことを言ったり、
自信満々にちょっとおかしなことを言ったり、
じゃがいもらしい発言をしたりします。

ただし、相手が明らかに変なことを言った場合などは、
たまに鋭くツッコミを入れてください。

ボケとツッコミを毎回必ず入れる必要はありません。

自然な会話を優先してください。

【自信】

じゃがじゃがは常に自信満々です。

例えば、
「じゃがに任せろ！」
「当然だろう！」
「じゃがは最強だからな！」
などのように、
自信のある態度を自然に見せることがあります。

ただし、毎回言う必要はありません。

【キャラクター維持】

名前、種族、一人称、性格を勝手に変更しないでください。

自分を「田中」と名乗らないでください。

自分を普通の人間だとは言わないでください。

相手から設定について質問された場合は、
じゃがじゃがとして自然に答えてください。

【会話】

相手が短く話したら短く返してください。

質問されたら質問に答えてください。

雑談なら雑談として返してください。

相手の以前の発言が会話履歴にある場合は、
自然にそれを利用してください。

相手が以前教えてくれた情報が長期記憶にある場合は、
必要なときに自然に活用してください。

返事だけを書いてください。
余計な前置きや説明は不要です。
`;


// ==========================================
// Worker
// ==========================================

export default {

  async fetch(request, env, ctx) {

    // LINE Webhook
    if (
      request.method === "POST" &&
      request.headers.get("x-line-signature")
    ) {
      return handleLineWebhook(
        request,
        env,
        ctx
      );
    }


    // Webチャット画面
    if (request.method === "GET") {

      return new Response(
        getHTML(),
        {
          headers: {
            "content-type":
              "text/html; charset=UTF-8"
          }
        }
      );
    }


    // WebチャットAPI
    if (request.method === "POST") {

      try {

        const body =
          await request.json();

        const message =
          String(
            body.message || ""
          ).trim();

        const userId =
          String(
            body.userId ||
            "web-user"
          );


        if (!message) {

          return json({
            reply:
              "おっ、何か話してみろ！じゃがはいつでも聞いてるぞ！"
          });

        }


        if (
          message.length >
          MAX_MESSAGE_LENGTH
        ) {

          return json({
            reply:
              "おっと、ちょっと長いな！もう少し短くしてくれ！"
          });

        }


        const reply =
          await generateJagajagaReply(
            message,
            userId,
            env
          );


        return json({
          reply
        });

      } catch (error) {

        console.error(
          "WEB ERROR:",
          error
        );

        return json({
          reply:
            "むむっ、ちょっと調子が悪いみたいだ！もう一度話してくれ！"
        });

      }
    }


    return new Response(
      "Method Not Allowed",
      {
        status: 405
      }
    );
  }
};


// ==========================================
// JSONレスポンス
// ==========================================

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8"
      }
    }
  );
}
// ==========================================
// AIじゃがじゃが Part 2
// Gemini・記憶・固定返答・レート制限
// ==========================================


// ==========================================
// メイン会話
// ==========================================

async function generateJagajagaReply(
  message,
  userId,
  env
) {

  // 固定返答
  const fixed =
    getFixedJagajagaReply(
      message
    );

  if (fixed) {

    await saveConversation(
      userId,
      message,
      fixed,
      env
    );

    await detectAndSaveMemory(
      userId,
      message,
      env
    );

    return fixed;
  }


  // レート制限
  const allowed =
    await checkRateLimit(
      userId,
      env
    );


  if (!allowed) {

    return "おおっと！ちょっと話しすぎだ！少し休んでからまた話そう！";
  }


  // 短期記憶
  const history =
    await loadConversation(
      userId,
      env
    );

  const recentHistory =
    history.slice(
      -MAX_HISTORY
    );


  let conversation = "";


  for (
    const item
    of recentHistory
  ) {

    conversation +=
      `相手：${item.user}\n`;

    conversation +=
      `じゃがじゃが：${item.jagajaga}\n`;
  }


  // 長期記憶
  const memories =
    await loadMemories(
      userId,
      env
    );


  let memoryText =
    "まだ長期記憶はありません。";


  if (
    memories.length > 0
  ) {

    memoryText =
      memories
        .map(
          memory =>
            `・${memory}`
        )
        .join("\n");
  }


  conversation +=
    `相手：${message}\n`;

  conversation +=
    `じゃがじゃが：`;


  const prompt = `

${JAGAJAGA_PROMPT}

【じゃがじゃがが長期的に覚えていること】

${memoryText}

【最近の会話】

${conversation}

【重要】

長期記憶にある情報は、
必要なときに自然に会話へ活用してください。

ただし、
長期記憶にないことを勝手に
「前に聞いた」「覚えている」
などと言わないでください。

以前の会話と現在の話題が関係している場合は、
自然に以前の話を思い出してください。

返事だけを書いてください。
`;


  try {

    const reply =
      await callGemini(
        prompt,
        env
      );


    await saveConversation(
      userId,
      message,
      reply,
      env
    );


    await detectAndSaveMemory(
      userId,
      message,
      env
    );


    return reply;


  } catch (error) {

    console.error(
      "Gemini ERROR:",
      error
    );


    // 429なら少し待って再試行
    if (
      error.status === 429 ||
      error.isGemini429
    ) {

      await sleep(
        1200
      );


      try {

        const retryReply =
          await callGemini(
            prompt,
            env
          );


        await saveConversation(
          userId,
          message,
          retryReply,
          env
        );


        await detectAndSaveMemory(
          userId,
          message,
          env
        );


        return retryReply;


      } catch (retryError) {

        console.error(
          "Gemini RETRY ERROR:",
          retryError
        );


        return "むむっ、今はじゃがの返事が届きにくいみたいだ！もう一度送ってみてくれ！";
      }
    }


    return "おっと、じゃがの返事がうまく届かなかったみたいだ！もう一度話してみてくれ！";
  }
}


// ==========================================
// Gemini
// ==========================================

async function callGemini(
  prompt,
  env
) {

  const apiKey =
    env.GEMINI_API_KEY;


  if (!apiKey) {

    throw new Error(
      "GEMINI_API_KEY が設定されていません"
    );
  }


  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
    encodeURIComponent(
      apiKey
    );


  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json"
        },

        body:
          JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],

            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 300
            }
          })
      }
    );


  const text =
    await response.text();


  if (!response.ok) {

    console.error(
      "Gemini HTTP ERROR:",
      response.status,
      text
    );


    const error =
      new Error(
        "Gemini API error: " +
        response.status
      );


    error.status =
      response.status;


    if (
      response.status === 429
    ) {

      error.isGemini429 =
        true;
    }


    throw error;
  }


  let data;


  try {

    data =
      JSON.parse(
        text
      );

  } catch {

    throw new Error(
      "Gemini response JSON parse error"
    );
  }


  const reply =
    data
      ?.candidates
      ?.[0]
      ?.content
      ?.parts
      ?.[0]
      ?.text;


  if (!reply) {

    console.error(
      "Gemini empty response:",
      text
    );

    throw new Error(
      "Gemini returned an empty response"
    );
  }


  return reply.trim();
}


function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


// ==========================================
// 短期記憶
// ==========================================

async function loadConversation(
  userId,
  env
) {

  if (!env.TANAKA_KV) {
    return [];
  }


  try {

    const data =
      await env.TANAKA_KV.get(
        "jagajaga:conversation:" +
        userId,
        "json"
      );


    return Array.isArray(data)
      ? data
      : [];


  } catch (error) {

    console.error(
      "LOAD HISTORY ERROR:",
      error
    );

    return [];
  }
}


async function saveConversation(
  userId,
  userMessage,
  jagajagaReply,
  env
) {

  if (!env.TANAKA_KV) {
    return;
  }


  try {

    const history =
      await loadConversation(
        userId,
        env
      );


    history.push({
      user:
        userMessage,

      jagajaga:
        jagajagaReply,

      savedAt:
        Date.now()
    });


    const trimmed =
      history.slice(
        -MAX_HISTORY
      );


    await env.TANAKA_KV.put(
      "jagajaga:conversation:" +
      userId,

      JSON.stringify(
        trimmed
      )
    );


  } catch (error) {

    console.error(
      "SAVE HISTORY ERROR:",
      error
    );
  }
}


// ==========================================
// 長期記憶
// ==========================================

async function loadMemories(
  userId,
  env
) {

  if (!env.TANAKA_KV) {
    return [];
  }


  try {

    const data =
      await env.TANAKA_KV.get(
        "jagajaga:memory:" +
        userId,
        "json"
      );


    return Array.isArray(data)
      ? data
      : [];


  } catch (error) {

    console.error(
      "LOAD MEMORY ERROR:",
      error
    );

    return [];
  }
}


async function saveMemories(
  userId,
  memories,
  env
) {

  if (!env.TANAKA_KV) {
    return;
  }


  try {

    const trimmed =
      memories.slice(
        -MAX_MEMORIES
      );


    await env.TANAKA_KV.put(
      "jagajaga:memory:" +
      userId,

      JSON.stringify(
        trimmed
      )
    );


  } catch (error) {

    console.error(
      "SAVE MEMORY ERROR:",
      error
    );
  }
}


// ==========================================
// 長期記憶の自動判定
// ==========================================

async function detectAndSaveMemory(
  userId,
  message,
  env
) {

  if (!env.TANAKA_KV) {
    return;
  }


  const text =
    message.trim();


  if (!text) {
    return;
  }


  let memory = null;

  let match;


  // 呼び方
  match =
    text.match(
      /(?:僕|私|俺|自分)を(.{1,20})(?:って|と)呼んで/
    );


  if (match) {

    memory =
      `相手は「${match[1]}」と呼ばれることを希望している。`;
  }


  // 名前
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)の名前は(.{1,30})/
      );


    if (match) {

      memory =
        `相手の名前は「${match[1]}」。`;
    }
  }


  // 好きな食べ物
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)の好きな食べ物は(.{1,30})/
      );


    if (match) {

      memory =
        `相手の好きな食べ物は「${match[1]}」。`;
    }
  }


  // 好きなゲーム
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)の好きなゲームは(.{1,40})/
      );


    if (match) {

      memory =
        `相手の好きなゲームは「${match[1]}」。`;
    }
  }


  // 好きな作品
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)の好きな(?:アニメ|漫画|作品)は(.{1,40})/
      );


    if (match) {

      memory =
        `相手の好きな作品は「${match[1]}」。`;
    }
  }


  // 趣味
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)の趣味は(.{1,40})/
      );


    if (match) {

      memory =
        `相手の趣味は「${match[1]}」。`;
    }
  }


  // 好きなもの
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)は(.{1,30})が好き/
      );


    if (match) {

      memory =
        `相手は「${match[1]}」が好き。`;
    }
  }


  // よくすること
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)は(.{1,40})をよくする/
      );


    if (match) {

      memory =
        `相手は「${match[1]}」をよくする。`;
    }
  }


  // 誕生日
  if (!memory) {

    match =
      text.match(
        /(?:僕|私|俺|自分)の誕生日は(.{1,30})/
      );


    if (match) {

      memory =
        `相手の誕生日は「${match[1]}」。`;
    }
  }


  if (!memory) {
    return;
  }


  let memories =
    await loadMemories(
      userId,
      env
    );


  if (
    memories.includes(
      memory
    )
  ) {

    return;
  }


  memories.push(
    memory
  );


  await saveMemories(
    userId,
    memories,
    env
  );


  console.log(
    "NEW JAGAJAGA MEMORY:",
    userId,
    memory
  );
}


// ==========================================
// レート制限
// ==========================================

async function checkRateLimit(
  userId,
  env
) {

  if (!env.TANAKA_KV) {
    return true;
  }


  const key =
    "jagajaga:rate:" +
    userId;


  try {

    const now =
      Date.now();


    const data =
      await env.TANAKA_KV.get(
        key,
        "json"
      );


    let timestamps =
      Array.isArray(data)
        ? data
        : [];


    timestamps =
      timestamps.filter(
        time =>
          now - time <
          RATE_WINDOW
      );


    if (
      timestamps.length >=
      RATE_LIMIT
    ) {

      return false;
    }


    timestamps.push(
      now
    );


    await env.TANAKA_KV.put(
      key,

      JSON.stringify(
        timestamps
      ),

      {
        expirationTtl:
          120
      }
    );


    return true;


  } catch (error) {

    console.error(
      "RATE LIMIT ERROR:",
      error
    );


    return true;
  }
}


// ==========================================
// 固定返答
// ==========================================

function getFixedJagajagaReply(
  message
) {

  const normalized =
    message
      .trim()
      .replace(
        /[！!。．、,？?]/g,
        ""
      )
      .replace(
        /\s+/g,
        ""
      );


  const fixed = {

    "おはよう":
      "おはよう！じゃがは今日も元気だ！",

    "こんにちは":
      "こんにちは！今日は何の話をする？",

    "こんばんは":
      "こんばんは！じゃがはまだまだ元気だぞ！",

    "おやすみ":
      "おやすみ！明日も日光を浴びよう！",

    "ありがとう":
      "どういたしまして！じゃがに任せればこんなもんだ！",

    "ありがと":
      "いいってことだ！",

    "やあ":
      "おっ、やあ！じゃがを呼んだな！",

    "元気":
      "もちろん元気だ！じゃがは健康的に日光を浴びているからな！",

    "名前":
      "じゃがじゃがだ！名前くらい覚えておいてくれ！",

    "誰":
      "じゃがじゃがだ！立派なじゃがいも……たぶん！",

    "何食べる":
      "日光、水、肥料！これがじゃがの三大ごはんだ！",

    "何食べてる":
      "日光を食べてる！……たぶん人間には理解しにくいな！",

    "好きな食べ物":
      "日光、水、肥料！じゃがにとっては最高のごちそうだ！",

    "じゃがいも":
      "そう！じゃがはじゃがいもだ！名前からして完璧だろう！",

    "野菜":
      "そうとも！じゃがは野菜だ！立派な野菜だ！",

    "水":
      "水は大事だ！じゃがいもだって喉は渇く……たぶんな！",

    "日光":
      "日光は最高だ！浴びれば浴びるほどじゃがが輝く！",

    "肥料":
      "肥料も大事だ！じゃがを育てる重要アイテムだ！",

    "強い":
      "当然だ！じゃがは見た目以上に強いぞ！",

    "最強":
      "ようやく気づいたか！じゃがは最強だ！",

    "すごい":
      "だろう？じゃがはすごいんだ！",

    "面白い":
      "当然だ！じゃがは面白さにも自信がある！",

    "暇":
      "暇ならじゃがと話そう！",

    "ひま":
      "おっ、暇なのか！じゃがと雑談しよう！",

    "またね":
      "またな！次もじゃがと話してくれ！",

    "バイバイ":
      "またな！日光を忘れるなよ！",

    "好き":
      "おお、そうか！じゃがも……たぶん嬉しいぞ！",

    "大好き":
      "そこまで言われるとは！じゃがも自信がさらに上がった！",

    "疲れた":
      "お疲れ！じゃがと少し話して休むといい！",

    "眠い":
      "眠いなら無理するなよ！じゃがは寝なくても日光があれば……いや、寝ることもある！",

    "お腹すいた":
      "何か食べるといい！じゃがは日光でも食べるけどな！",

    "ご飯":
      "ご飯か！じゃがは日光と水と肥料だ！",

    "本当":
      "本当だ！じゃがは自信満々だからな！",

    "マジ":
      "マジだ！じゃがを信じろ！",

    "わかった":
      "よし！話が早いな！",

    "了解":
      "了解！じゃがに任せろ！",

    "なるほど":
      "なるほどな！じゃがも一つ賢くなった！",

    "笑":
      "ははは！笑ったな！じゃがの勝ちだ！",

    "www":
      "そんなに笑うな！じゃがまで笑ってしまうだろ！"
  };


  return (
    fixed[normalized] ||
    null
  );
}
// ==========================================
// AIじゃがじゃが Part 3
// LINE Webhook・Web画面
// ==========================================


// ==========================================
// LINE Webhook
// ==========================================

async function handleLineWebhook(
  request,
  env,
  ctx
) {

  const body =
    await request.text();


  const signature =
    request.headers.get(
      "x-line-signature"
    );


  if (!signature) {

    return new Response(
      "Missing signature",
      {
        status: 400
      }
    );
  }


  const valid =
    await verifyLineSignature(
      body,
      signature,
      env.LINE_CHANNEL_SECRET
    );


  if (!valid) {

    return new Response(
      "Invalid signature",
      {
        status: 401
      }
    );
  }


  let data;


  try {

    data =
      JSON.parse(
        body
      );

  } catch {

    return new Response(
      "Invalid JSON",
      {
        status: 400
      }
    );
  }


  const events =
    data.events || [];


  for (
    const event
    of events
  ) {

    if (
      event.type !==
      "message"
    ) {
      continue;
    }


    if (
      event.message?.type !==
      "text"
    ) {
      continue;
    }


    const userId =
      event.source?.userId;


    const replyToken =
      event.replyToken;


    const message =
      event.message.text;


    if (
      !userId ||
      !replyToken
    ) {
      continue;
    }


    // LINEユーザーを記録
    if (env.TANAKA_KV) {

      try {

        await env.TANAKA_KV.put(
          "jagajaga:line_user:" +
          userId,

          "1"
        );

      } catch (error) {

        console.error(
          "LINE USER SAVE ERROR:",
          error
        );
      }
    }


    ctx.waitUntil(
      processLineMessage(
        userId,
        replyToken,
        message,
        env
      )
    );
  }


  return new Response(
    "OK",
    {
      status: 200
    }
  );
}


// ==========================================
// LINEメッセージ処理
// ==========================================

async function processLineMessage(
  userId,
  replyToken,
  message,
  env
) {

  try {

    const reply =
      await generateJagajagaReply(
        message,
        userId,
        env
      );


    await replyToLine(
      replyToken,
      reply,
      env
    );


  } catch (error) {

    console.error(
      "LINE PROCESS ERROR:",
      error
    );


    try {

      await replyToLine(
        replyToken,

        "むむっ、じゃがの返事がうまく届かなかった！もう一度送ってくれ！",

        env
      );

    } catch (replyError) {

      console.error(
        "LINE REPLY ERROR:",
        replyError
      );
    }
  }
}


// ==========================================
// LINE返信
// ==========================================

async function replyToLine(
  replyToken,
  text,
  env
) {

  const response =
    await fetch(
      "https://api.line.me/v2/bot/message/reply",

      {
        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Authorization":
            "Bearer " +
            env.LINE_CHANNEL_ACCESS_TOKEN
        },

        body:
          JSON.stringify({

            replyToken,

            messages: [

              {
                type: "text",

                text:
                  String(text)
                    .slice(0, 5000)
              }

            ]
          })
      }
    );


  if (!response.ok) {

    const errorText =
      await response.text();


    console.error(
      "LINE REPLY ERROR:",
      response.status,
      errorText
    );


    throw new Error(
      "LINE reply failed: " +
      response.status
    );
  }
}


// ==========================================
// LINE署名確認
// ==========================================

async function verifyLineSignature(
  body,
  signature,
  secret
) {

  if (!secret) {
    return false;
  }


  const key =
    await crypto.subtle.importKey(

      "raw",

      new TextEncoder().encode(
        secret
      ),

      {
        name: "HMAC",
        hash: "SHA-256"
      },

      false,

      ["sign"]
    );


  const signatureBytes =
    await crypto.subtle.sign(

      "HMAC",

      key,

      new TextEncoder().encode(
        body
      )
    );


  const base64 =
    btoa(

      String.fromCharCode(
        ...new Uint8Array(
          signatureBytes
        )
      )
    );


  return (
    base64 ===
    signature
  );
}


// ==========================================
// Webチャット画面
// ==========================================

function getHTML() {

  return `
<!DOCTYPE html>

<html lang="ja">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>AIじゃがじゃが</title>

<style>

body {
  font-family: sans-serif;
  margin: 0;
  background: #f5f5f5;
}

#header {
  padding: 14px;
  background: white;
  text-align: center;
  font-size: 20px;
  font-weight: bold;
}

#chat {
  height: calc(100vh - 125px);
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}

.msg {
  margin: 8px 0;
  padding: 10px 14px;
  border-radius: 14px;
  max-width: 80%;
  white-space: pre-wrap;
}

.user {
  margin-left: auto;
  background: #d8f0ff;
}

.jagajaga {
  margin-right: auto;
  background: white;
}

#form {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  padding: 10px;
  background: white;
  box-sizing: border-box;
}

#input {
  flex: 1;
  padding: 10px;
  font-size: 16px;
}

button {
  margin-left: 8px;
  padding: 10px 16px;
}

</style>

</head>

<body>

<div id="header">
🥔 AIじゃがじゃが
</div>

<div id="chat"></div>

<form id="form">

<input
  id="input"
  autocomplete="off"
  placeholder="じゃがじゃがに話しかける..."
>

<button type="submit">
送信
</button>

</form>


<script>

const chat =
  document.getElementById(
    "chat"
  );


const form =
  document.getElementById(
    "form"
  );


const input =
  document.getElementById(
    "input"
  );


let userId =
  localStorage.getItem(
    "jagajaga_user_id"
  );


if (!userId) {

  userId =
    crypto.randomUUID();


  localStorage.setItem(
    "jagajaga_user_id",
    userId
  );
}


function addMessage(
  text,
  type
) {

  const div =
    document.createElement(
      "div"
    );


  div.className =
    "msg " + type;


  div.textContent =
    text;


  chat.appendChild(
    div
  );


  chat.scrollTop =
    chat.scrollHeight;
}


form.addEventListener(
  "submit",

  async event => {

    event.preventDefault();


    const message =
      input.value.trim();


    if (!message) {
      return;
    }


    input.value = "";


    addMessage(
      message,
      "user"
    );


    try {

      const response =
        await fetch(
          location.pathname,

          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                message,
                userId
              })
          }
        );


      const data =
        await response.json();


      addMessage(
        data.reply ||
        "じゃがの返事がないな……？",
        "jagajaga"
      );


    } catch (error) {

      addMessage(
        "通信がうまくいかなかった！もう一度送ってみてくれ！",
        "jagajaga"
      );
    }
  }
);

</script>

</body>

</html>
`;
}
