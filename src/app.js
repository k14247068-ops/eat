import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.1';
env.allowLocalModels = false;

let transcriber = null;
let rec = false;
let mediaRecorder;
let audioChunks = [];

export async function initApp() {
  const tArea = document.getElementById('transcriptArea');
  const status = document.getElementById('status');
  try {
    tArea.value = "🤖 ローカルAIモデル(Whisper)の準備を開始します...";
    
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

        tArea.value = `🤖 AIモデルをダウンロード中...\n` +
                      `📊 進捗: ${percent}% (残り ${remainingStr})\n` +
                      `📁 ファイル: ${progressInfo.file || ''}`;
        
        status.textContent = `ステータス: ダウンロード中 (${percent}%)`;
      } else if (progressInfo.status === 'loaded') {
        tArea.value = `✨ モデルのロードが完了しました！`;
      }
    };

    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      progress_callback: progressCallback
    });

    tArea.value = "✨ オフラインAIの準備が完了しました！音声を入力してください。";
    status.textContent = "ステータス: 待機中";
  } catch(e) {
    tArea.value = "❌ モデルの読み込みに失敗しました: " + e.message;
    status.textContent = "ステータス: エラー";
  }
}

// ① テキストの内容を分析してカテゴリを自動判定する関数
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

// ② 自動保存とフォルダ分け（カテゴリ名付きファイル出力）を実行する関数
function autoSaveTranscript(text) {
  const category = categorizeText(text);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  
  // ファイル名にカテゴリをプレフィックスとして付与（仮想的なフォルダ・分類を実現）
  const fileName = `[${category}]_${dateStr}_${timeStr}.txt`;
  
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  const autoSaveStatus = document.getElementById('autoSaveStatus');
  autoSaveStatus.textContent = `💾 自動保存完了: 「${category}」フォルダ相当 (${fileName})`;
  setTimeout(() => { autoSaveStatus.textContent = ''; }, 6000);
}

export async function processAudio(blob) {
  const tArea = document.getElementById('transcriptArea');
  tArea.value = "🤖 [1/3] 音声をAI用に変換中...\n";
  
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);

    tArea.value += "🤖 [2/3] あなたのPCの処理能力を使って文字起こしを実行中...\n";
    
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
    document.getElementById('status').textContent = 'ステータス: 待機中';

    // 文字起こし完了時に自動保存 ＆ 自動カテゴリ分類を実行
    if (finalResultText.trim().length > 0) {
      autoSaveTranscript(finalResultText);
    }

  } catch (err) {
    tArea.value += `\n❌ エラーが発生しました: ${err.message}`;
  }
}

export function setupListeners() {
  // タブ切り替え
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

  // 設定のロード・セーブ
  const langSelect = document.getElementById('langSelect');
  const taskSelect = document.getElementById('taskSelect');
  
  if(localStorage.getItem('whisper_lang')) langSelect.value = localStorage.getItem('whisper_lang');
  if(localStorage.getItem('whisper_task')) taskSelect.value = localStorage.getItem('whisper_task');

  langSelect.onchange = () => localStorage.setItem('whisper_lang', langSelect.value);
  taskSelect.onchange = () => localStorage.setItem('whisper_task', taskSelect.value);

  document.getElementById('fileBtn').onclick = () => {
    if(!transcriber) return alert("AIの準備が終わるまでお待ちください");
    const file = document.getElementById('audioFile').files[0];
    if (!file) return alert("音声ファイルを選択してください。");
    document.getElementById('status').textContent = 'ステータス: 📁 ファイルを解析中...';
    processAudio(file);
  };

  document.getElementById('recBtn').onclick = async () => {
    if(!transcriber) return alert("AIの準備が終わるまでお待ちください");
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
          status.textContent = 'ステータス: ローカルAIで解析中...';
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
