import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.1';
env.allowLocalModels = false;

let transcriber = null;
let rec = false;
let mediaRecorder;
let audioChunks = [];

function getCurrentMode() {
  return document.getElementById('mainModeSelect').value;
}

export async function initApp() {
  const tArea = document.getElementById('transcriptArea');
  const status = document.getElementById('status');
  const mode = getCurrentMode();

  if (mode === 'online') {
    tArea.value = "✨ オンラインAPIモードの準備が完了しました！\n（90分などの長尺データも一瞬で高精度に処理できます）";
    status.textContent = "ステータス: 待機中 (オンライン)";
    return;
  }

  try {
    tArea.value = "🤖 最高精度モデル(Whisper-small)の準備を開始します...\n（オフライン初回のみ数分かかります）";
    
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

        tArea.value = `🤖 オフラインモデルをダウンロード中...\n` +
                      `📊 進捗: ${percent}% (残り ${remainingStr})\n` +
                      `📁 ファイル: ${progressInfo.file || ''}`;
        
        status.textContent = `ステータス: ダウンロード中 (${percent}%)`;
      } else if (progressInfo.status === 'loaded') {
        tArea.value = `✨ オフラインモデルのロードが完了しました！`;
      }
    };

    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
      progress_callback: progressCallback
    });

    tArea.value = "✨ オフラインAI（最高精度版）の準備が完了しました！音声を入力してください。";
    status.textContent = "ステータス: 待機中 (オフライン)";
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
  autoSaveStatus.textContent = `💾 自動保存完了: 「${category}」 (${fileName})`;
  setTimeout(() => { autoSaveStatus.textContent = ''; }, 6000);
}

// オンラインAPI (Gemini) - モデル名を gemini-1.5-flash-latest に修正
async function processAudioOnline(blob) {
  const tArea = document.getElementById('transcriptArea');
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  
  if (!apiKey) {
    alert("オンラインモードを使用するには、設定画面で Gemini API キーを入力してください。");
    return;
  }

  tArea.value = "🌐 [1/2] 音声ファイルをクラウドへ安全に送信中...\n";
  
  try {
    const arrayBuffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    tArea.value += "🌐 [2/2] Gemini APIで超高速解析を実行中...\n";

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "以下の音声を正確に日本語で文字起こししてください。余計な挨拶は省き、文字起こし結果のテキストのみ出力してください。" },
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
      throw new Error(data.error.message);
    }

    const finalResultText = data.candidates[0].content.parts[0].text;
    tArea.value = "✨ [完了] オンライン解析＆自動保存を実行しました！\n\n" + finalResultText;
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
  const mode = getCurrentMode();

  if (mode === 'online') {
    await processAudioOnline(blob);
    return;
  }

  if (!transcriber) {
    alert("オフラインAIの準備がまだ完了していません。しばらくお待ちください。");
    return;
  }

  const tArea = document.getElementById('transcriptArea');
  tArea.value = "🤖 [1/3] 音声をAI用に変換中...\n";
  
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);

    tArea.value += "🤖 [2/3] オフラインモデルで解析中...（時間がかかります）\n";
    
    const lang = document.getElementById('langSelect').value;
    const task = document.getElementById('taskSelect').value;

    const result = await transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: lang,
      task: task,
    });

    const finalResultText = result.text;
    tArea.value = "✨ [3/3] 解析完了＆自動保存を実行します！\n\n" + finalResultText;
    document.getElementById('status').textContent = 'ステータス: 待機中 (オフライン)';

    if (finalResultText.trim().length > 0) {
      autoSaveTranscript(finalResultText);
    }

  } catch (err) {
    tArea.value += `\n❌ オフラインエラー: ${err.message}`;
  }
}

export function setupListeners() {
  const tabMain = document.getElementById('tabMain');
  const tabSettings = document.getElementById('tabSettings');
  const secMain = document.getElementById('secMain');
  const secSettings = document.getElementById('secSettings');

  tabMain.onclick = () => {
    tabMain.classList.add('active');
    tabSettings.classList.remove('active');
    secMain.classList.add('active');
    secSettings.classList.remove('active');
  };

  tabSettings.onclick = () => {
    tabSettings.classList.add('active');
    tabMain.classList.remove('active');
    secSettings.classList.add('active');
    secMain.classList.remove('active');
  };

  const mainModeSelect = document.getElementById('mainModeSelect');
  const settingModeSelect = document.getElementById('settingModeSelect');
  const apiKeyContainer = document.getElementById('apiKeyContainer');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const langSelect = document.getElementById('langSelect');
  const taskSelect = document.getElementById('taskSelect');

  const updateModeUI = (mode) => {
    mainModeSelect.value = mode;
    settingModeSelect.value = mode;
    if (mode === 'online') {
      apiKeyContainer.style.display = 'block';
    } else {
      apiKeyContainer.style.display = 'none';
    }
  };

  const savedMode = localStorage.getItem('whisper_mode') || 'offline';
  updateModeUI(savedMode);

  if(localStorage.getItem('gemini_api_key')) apiKeyInput.value = localStorage.getItem('gemini_api_key');
  if(localStorage.getItem('whisper_lang')) langSelect.value = localStorage.getItem('whisper_lang');
  if(localStorage.getItem('whisper_task')) taskSelect.value = localStorage.getItem('whisper_task');

  const handleModeChange = async (newMode) => {
    localStorage.setItem('whisper_mode', newMode);
    updateModeUI(newMode);
    await initApp();
  };

  mainModeSelect.onchange = (e) => handleModeChange(e.target.value);
  settingModeSelect.onchange = (e) => handleModeChange(e.target.value);

  apiKeyInput.oninput = () => localStorage.setItem('gemini_api_key', apiKeyInput.value);
  langSelect.onchange = () => localStorage.setItem('whisper_lang', langSelect.value);
  taskSelect.onchange = () => localStorage.setItem('whisper_task', taskSelect.value);

  document.getElementById('fileBtn').onclick = () => {
    const file = document.getElementById('audioFile').files[0];
    if (!file) return alert("音声ファイルを選択してください。");
    document.getElementById('status').textContent = 'ステータス: 📁 ファイルを解析中...';
    processAudio(file);
  };

  document.getElementById('recBtn').onclick = async () => {
    const btn = document.getElementById('recBtn');
    const status = document.getElementById('status');
    
    if (!rec) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          status.textContent = 'ステータス: 音声を解析中...';
          processAudio(audioBlob);
        };
        mediaRecorder.start();
        rec = true;
        btn.textContent = '⏹️ 録音停止'; btn.style.background = '#a6e3a1';
        status.textContent = 'ステータス: 🎙️ 録音中...';
      } catch (err) { alert('マイクエラー: ' + err.message); }
    } else {
      mediaRecorder.stop();
      rec = false;
      btn.textContent = '🔴 録音する'; btn.style.background = '#f38ba8';
    }
  };
}
