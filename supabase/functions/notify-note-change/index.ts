const WXPUSHER_SEND_URL = "https://wxpusher.zjiecode.com/api/send/message";
const DEFAULT_SITE_URL = "https://lixinyu66666.github.io/love-daily-site/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NoteAction = "created" | "updated" | "deleted";

type NotePayload = {
  id?: string;
  type?: string;
  to?: string;
  title?: string;
  body?: string;
  createdAt?: string | number;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const appToken = readSecret("WXPUSHER_APP_TOKEN");
    const uids = readListSecret("WXPUSHER_UIDS");
    const topicIds = readListSecret("WXPUSHER_TOPIC_IDS")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (!appToken || (!uids.length && !topicIds.length)) {
      return jsonResponse({
        ok: false,
        skipped: true,
        error: "WxPusher secrets are not configured.",
      });
    }

    const payload = await request.json();
    const action = normalizeAction(payload.action);
    const note = sanitizeNote(payload.note);
    const previousNote = payload.previousNote
      ? sanitizeNote(payload.previousNote)
      : null;

    if (!action || !note) {
      return jsonResponse({ ok: false, error: "Invalid note payload." }, 400);
    }

    const siteUrl = readSecret("ML99_SITE_URL") || DEFAULT_SITE_URL;
    const content = buildMessageHtml(action, note, previousNote, siteUrl);
    const summary = buildSummary(action, note);
    const wxPayload: Record<string, unknown> = {
      appToken,
      content,
      summary,
      contentType: 2,
      verifyPayType: 0,
      url: siteUrl,
    };

    if (uids.length) {
      wxPayload.uids = uids;
    }
    if (topicIds.length) {
      wxPayload.topicIds = topicIds;
    }

    const response = await fetch(WXPUSHER_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wxPayload),
    });
    const result = await readJson(response);

    if (!response.ok || result?.code !== 1000) {
      return jsonResponse(
        {
          ok: false,
          error: "WxPusher request failed.",
          status: response.status,
          result,
        },
        502
      );
    }

    return jsonResponse({ ok: true, result });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error.",
      },
      500
    );
  }
});

function normalizeAction(value: unknown): NoteAction | null {
  return value === "created" || value === "updated" || value === "deleted"
    ? value
    : null;
}

function sanitizeNote(value: unknown): NotePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const note = value as NotePayload;
  return {
    id: limitText(note.id, 80),
    type: limitText(note.type, 16) || "日志",
    to: limitText(note.to, 24) || "我们",
    title: limitText(note.title, 80) || "没有标题的小记录",
    body: limitText(note.body, 900) || "",
    createdAt: note.createdAt,
  };
}

function buildMessageHtml(
  action: NoteAction,
  note: NotePayload,
  previousNote: NotePayload | null,
  siteUrl: string
) {
  const lines = [
    "<h3>ML99 日志有更新</h3>",
    `操作：${escapeHtml(getActionLabel(action))}`,
    `类型：${escapeHtml(note.type || "日志")}`,
    `写给：${escapeHtml(note.to || "我们")}`,
    `标题：${escapeHtml(note.title || "没有标题的小记录")}`,
  ];

  if (action === "updated" && previousNote) {
    lines.push(
      `原标题：${escapeHtml(previousNote.title || "没有标题的小记录")}`
    );
  }

  if (note.body) {
    lines.push("", "<strong>内容：</strong>", escapeHtml(note.body));
  }

  lines.push(
    "",
    `时间：${escapeHtml(formatShanghaiTime(new Date()))}`,
    `<a href="${escapeHtml(siteUrl)}">打开 ML99</a>`
  );
  return lines.join("<br>");
}

function buildSummary(action: NoteAction, note: NotePayload) {
  return limitText(
    `ML99 ${getActionLabel(action)}：${note.title || "没有标题的小记录"}`,
    96
  );
}

function getActionLabel(action: NoteAction) {
  if (action === "created") {
    return "新增日志";
  }
  if (action === "updated") {
    return "修改日志";
  }
  return "删除日志";
}

function formatShanghaiTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, Math.max(0, maxLength - 1))}…`
    : trimmed;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readSecret(name: string) {
  return (Deno.env.get(name) || "").trim();
}

function readListSecret(name: string) {
  return readSecret(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
