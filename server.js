const express = require("express");
const cors = require("cors");
const { WebSocket } = require("ws");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*" }));
app.use(express.json());

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

app.get("/", (req, res) => {
  res.json({ status: "healthy", service: "Edge TTS Render Micro-Server", version: "1.0.0" });
});

app.post("/api/edge-tts", async (req, res) => {
  const { text, voiceName, rate, pitch, volume } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  const voice = voiceName || "my-MM-NilarNeural";
  const connectionId = crypto.randomUUID().replace(/-/g, "");
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}`;

  const audioChunks = [];
  let isClosed = false;

  const timeout = setTimeout(() => {
    if (!isClosed) {
      isClosed = true;
      try { ws.close(); } catch (e) {}
      if (!res.headersSent) {
        res.status(504).json({ error: "Edge TTS synthesis timed out" });
      }
    }
  }, 25000);

  const ws = new WebSocket(wsUrl, {
    headers: {
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  ws.on("open", () => {
    const speechConfig = JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: "false",
              wordBoundaryEnabled: "false"
            },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3"
          }
        }
      }
    });

    ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${speechConfig}`);

    let rateStr = "+0%";
    if (typeof rate === "number") {
      const pct = Math.round((rate - 1.0) * 100);
      rateStr = `${pct >= 0 ? "+" : ""}${pct}%`;
    } else if (typeof rate === "string") {
      rateStr = rate;
    }

    let pitchStr = "+0Hz";
    if (typeof pitch === "number") {
      const pct = Math.round((pitch - 1.0) * 100);
      pitchStr = `${pct >= 0 ? "+" : ""}${pct}Hz`;
    } else if (typeof pitch === "string") {
      pitchStr = pitch;
    }

    let volumeStr = "+0%";
    if (typeof volume === "number") {
      const pct = Math.round((volume - 1.0) * 100);
      volumeStr = `${pct >= 0 ? "+" : ""}${pct}%`;
    } else if (typeof volume === "string") {
      volumeStr = volume;
    }

    const escapedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const requestId = crypto.randomUUID().replace(/-/g, "");
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='${pitchStr}' rate='${rateStr}' volume='${volumeStr}'>${escapedText}</prosody></voice></speak>`;

    ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buffer.length > 2) {
        const headerLen = buffer.readUInt16BE(0);
        if (buffer.length > 2 + headerLen) {
          const audioBody = buffer.slice(2 + headerLen);
          if (audioBody.length > 0) {
            audioChunks.push(audioBody);
          }
        }
      }
    } else {
      const messageStr = data.toString("utf-8");
      if (messageStr.includes("Path:turn.end")) {
        isClosed = true;
        clearTimeout(timeout);
        ws.close();

        if (audioChunks.length === 0) {
          if (!res.headersSent) {
            return res.status(500).json({ error: "No audio generated from Edge TTS" });
          }
          return;
        }

        const finalAudioBuffer = Buffer.concat(audioChunks);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", finalAudioBuffer.length);
        res.send(finalAudioBuffer);
      }
    }
  });

wson  .("error", (err) => {
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.status(500).json({ error: "Edge TTS WebSocket error: " + err.message });
    }
  });

  ws.on("close", () => {
    clearTimeout(timeout);
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Edge TTS Server running on port ${PORT}`);
});
