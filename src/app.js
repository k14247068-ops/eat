import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.1';
env.allowLocalModels = false;

let transcriber = null;
let currentLoadedModel = null;
let rec = false;
let mediaRecorder;
let audioChunks = [];

function getCurrentEngine() {
  const el = document.getElementById('mainEngineSelect');
  return el ? el.value : 'base';
}

export async function initApp() {
  const tArea = document.getElementById('transcriptArea');
  const status = document.getElementById('status');
  const engine = getCurrentEngine();

  if (!tArea || !status) return;

  if (engine === 'online') {
    transcriber = null;
    currentLoadedModel = null;
    tArea.value = "✨ オンラインAPIモードの準備が完了しました！\n（設定画面から Flash / Flash-Lite / Pro を選択可能です）";
    status.textContent = "ステータス: 待機中 (オンライン)";
    return;
  }

  const modelName = `Xenova/whisper-${engine}`;
  
  if (currentLoadedModel === modelName && transcriber) {
    tArea.value = `✨ オフラインAI (${engine}) の準備は既に完了しています！`;
    status.textContent = `ステータス: 待機中 (${engine})`;
    return;
  }

  try {
    tArea.value = `🤖 オフラインモデル (${engine}) の準備を開始します...\n（初回のみダウンロードに時間がかかります）`;
    
    let startTime = Date.now();

    const progressCallback = (progressInfo) => {
      if (progressInfo.status === 'downloading') {
        const percent = Math.round((progressInfo.loaded / progressInfo.total) * 100);
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        
        let remainingStr = "計算中...";
        if (percent > 0) {
          const totalEstimatedSec = (elapsedSec / percent) * 100;
          const remainingSec = Math.max(0, Math.round(totalEstimatedSec - elapsedSec));
          remainingStr = `約 ${remainingSec} 秒`;
        }

        tArea.value = `🤖 モデル (${engine}) をダウンロード中...\n` +
                      `📊 進捗: ${percent}% (残り ${remainingStr})\n` +
                      `📁 ファイル: ${progressInfo.file || ''}`;
        
        status.textContent = `ステータス: ダウンロード中 (${percent}%)`;
      } else if (progressInfo.status === 'loaded') {
        tArea.value = `✨ モデルのロードが完了しました！`;
      }
    };

    transcriber = await pipeline('automatic-speech-recognition', modelName, {
      type: 'whisper',
      progress_callback: progressCallback
    });

    currentLoadedModel = modelName;
    tArea.value = `✨ オフラインAI (${engine}) の準備が完了しました！音声を入力してください。`;
    status.textContent = `ステータス: 待機中 (${engine})`;
  } catch(e) {
    tArea.value = "❌ モデルの読み込みに失敗しました: " + e.message;
    status.textContent = "ステータス: エラー";
  }
}

function categorizeText(text) {
  const lower = text.toLowerCase();
  if (lower.includes('講義') || lower.includes('授業') || lower.includes('先生') || lower.includes('勉強') || lower.includes('レポート')) {
    return '講義';
  } else if (lower.includes('会議') || lower.includes('ミーティング') || lower.includes('決定') || lower.includes('相談') || lower.includes('案件')) {
    return '会議';
  } else if (lower.includes('アイデア') || lower.includes('思いつき') || lower.includes('企画') || lower.includes('メモ')) {
    return 'アイデア';
  }
  return 'その他';
}

function deduplicateText(text) {
  if (!text) return "";
  let cleaned = text.replace(/(.{3,})\1+/g, '$1');
  cleaned = cleaned.replace(/(.)\1{4,}/g, '$1');
  return cleaned;
}

function autoSaveTranscript(text) {
  const category = categorizeText(text);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  
  const fileName = `[${category}]_${dateStr}_${timeStr}.txt`;
  
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  const autoSaveStatus = document.getElementById('autoSaveStatus');
  if (autoSaveStatus) {
    autoSaveStatus.textContent = `💾 自動保存完了: 「${category}」 (${fileName})`;
    setTimeout(() => { autoSaveStatus.textContent = ''; }, 6000);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// オンラインAPI解析
async function processAudioOnline(blob) {
  const tArea = document.getElementById('transcriptArea');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  const selectedModel = document.getElementById('geminiModelSelect')?.value || 'gemini-3.8-flash';
  
  if (!apiKey) {
    alert("オンラインモードを使用するには、設定画面で Gemini API キーを入力してください。");
    return;
  }

  tArea.value = `🌐 [1/2] 音声データをエンコード中...\n`;
  
  try {
    const base64Data = await blobToBase64(blob);

    tArea.value += `🌐 [2/2] Gemini API (${selectedModel}) で話者分離＆解析を実行中...\n`;

    const promptText = `以下の音声を正確に日本語で文字起こししてください。
【要件】
1. 声質や対話の流れから人物を識別し、会話ごとに「話者A:」「話者B:」「話者C:」のように発言者を分けて記述してください。
2. 相槌や重複、繰り返しのループがある場合は自然な文章に整形してください。
3. 前後の挨拶や要約などの余計な文章は一切含めず、話者分離された文字起こし結果のみを出力してください。`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: blob.type || "audio/webm",
                data: base64Data
              }
            }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`${data.error.code}: ${data.error.message}`);
    }

    const rawResultText = data.candidates[0].content.parts[0].text;
    const finalResultText = deduplicateText(rawResultText);

    tArea.value = `✨ [完了] オンライン解析 (${selectedModel}) ＆自動保存を実行しました！\n\n` + finalResultText;
    document.getElementById('status').textContent = 'ステータス: 待機中 (オンライン)';

    if (finalResultText.trim().length > 0) {
      autoSaveTranscript(finalResultText);
    }

  } catch (err) {
    tArea.value += `\n❌ オンライン解析エラー: ${err.message}`;
    document.getElementById('status').textContent = 'ステータス: エラー';
  }
}

export async function processAudio(blob) {
  const engine = getCurrentEngine();

  if (engine === 'online') {
    await processAudioOnline(blob);
    return;
  }

  if (!transcriber) {
    alert("オフラインAIの準備がまだ完了していません。しばらくお待ちください。");
    return;
  }

  const tArea = document.getElementById('transcriptArea');
  tArea.value = `🤖 [1/3] 音声をAI (${engine}) 用に変換中...\n`;
  
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);

    tArea.value += `🤖 [2/3] オフラインモデル (${engine}) で解析中...\n`;
    
    const lang = document.getElementById('langSelect').value;
    const task = document.getElementById('taskSelect').value;

    const result = await transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: lang,
      task: task,
      no_repeat_ngram_size: 3,
      repetition_penalty: 1.2
    });

    const rawResultText = result.text;
    const finalResultText = deduplicateText(rawResultText);

    tArea.value = "✨ [3/3] 解析完了＆自動保存を実行します！\n\n" + finalResultText;
    document.getElementById('status').textContent = `ステータス: 待機中 (${engine})`;

    if (finalResultText.trim().length > 0) {
      autoSaveTranscript(finalResultText);
    }

  } catch (err) {
    tArea.value += `\n❌ オフラインエラー: ${err.message}`;
  }
}

export function setupListeners() {
  const mainEngineSelect = document.getElementById('mainEngineSelect');
  const settingEngineSelect = document.getElementById('settingEngineSelect');
  const apiKeyContainer = document.getElementById('apiKeyContainer');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const geminiModelSelect = document.getElementById('geminiModelSelect');
  const langSelect = document.getElementById('langSelect');
  const taskSelect = document.getElementById('taskSelect');

  const updateEngineUI = (engine) => {
    if (mainEngineSelect) mainEngineSelect.value = engine;
    if (settingEngineSelect) settingEngineSelect.value = engine;
    if (apiKeyContainer) {
      apiKeyContainer.style.display = (engine === 'online') ? 'block' : 'none';
    }
  };

  const savedEngine = localStorage.getItem('whisper_engine') || 'base';
  updateEngineUI(savedEngine);

  if (apiKeyInput && localStorage.getItem('gemini_api_key')) apiKeyInput.value = localStorage.getItem('gemini_api_key');
  if (geminiModelSelect && localStorage.getItem('gemini_model')) geminiModelSelect.value = localStorage.getItem('gemini_model');
  if (langSelect && localStorage.getItem('whisper_lang')) langSelect.value = localStorage.getItem('whisper_lang');
  if (taskSelect && localStorage.getItem('whisper_task')) taskSelect.value = localStorage.getItem('whisper_task');

  const handleEngineChange = async (newEngine) => {
    localStorage.setItem('whisper_engine', newEngine);
    updateEngineUI(newEngine);
    await initApp();
  };

  if (mainEngineSelect) mainEngineSelect.onchange = (e) => handleEngineChange(e.target.value);
  if (settingEngineSelect) settingEngineSelect.onchange = (e) => handleEngineChange(e.target.value);

  if (apiKeyInput) apiKeyInput.oninput = () => localStorage.setItem('gemini_api_key', apiKeyInput.value);
  if (geminiModelSelect) {
    geminiModelSelect.onchange = (e) => {
      localStorage.setItem('gemini_model', e.target.value);
    };
  }
  if (langSelect) langSelect.onchange = () => localStorage.setItem('whisper_lang', langSelect.value);
  if (taskSelect) taskSelect.onchange = () => localStorage.setItem('whisper_task', taskSelect.value);

  const fileBtn = document.getElementById('fileBtn');
  if (fileBtn) {
    fileBtn.onclick = () => {
      const audioFile = document.getElementById('audioFile');
      const file = audioFile ? audioFile.files[0] : null;
      if (!file) return alert("音声ファイルを選択してください。");
      document.getElementById('status').textContent = 'ステータス: 📁 ファイルを解析中...';
      processAudio(file);
    };
  }

  const recBtn = document.getElementById('recBtn');
  if (recBtn) {
    recBtn.onclick = async () => {
      const status = document.getElementById('status');
      if (!rec) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
          mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (status) status.textContent = 'ステータス: 音声を解析中...';
            processAudio(audioBlob);
          };
          mediaRecorder.start();
          rec = true;
          recBtn.textContent = '⏹️ 録音停止'; recBtn.style.background = '#a6e3a1';
          if (status) status.textContent = 'ステータス: 🎙️ 録音中...';
        } catch (err) { alert('マイクエラー: ' + err.message); }
      } else {
        mediaRecorder.stop();
        rec = false;
        recBtn.textContent = '🔴 録音する'; recBtn.style.background = '#f38ba8';
      }
    };
  }
}
