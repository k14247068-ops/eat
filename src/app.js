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

        // 経過時間を省いたスッキリした表示（パーセントと残り時間のみ）
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

export async function processAudio(blob) {
  const tArea = document.getElementById('transcriptArea');
  tArea.value = "🤖 [1/3] 音声をAI用に変換中...\n";
  
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);

    tArea.value += "🤖 [2/3] あなたのPCの処理能力を使って文字起こしを実行中...\n";
    
    const result = await transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'japanese',
      task: 'transcribe',
    });

    tArea.value = "✨ [3/3] 解析完了！\n\n" + result.text;
    document.getElementById('status').textContent = 'ステータス: 待機中';
  } catch (err) {
    tArea.value += `\n❌ エラーが発生しました: ${err.message}`;
  }
}

export function setupListeners() {
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
