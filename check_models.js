const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
console.log("🔍 Googleのシステムにアクセスして使えるモデルを調べます...");
readline.question('取得したAPIキーを貼り付けてEnterを押してください: ', (key) => {
  fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`)
    .then(r => r.json())
    .then(d => {
      console.log('\n🌟 【あなたの環境で使えるAIモデル一覧】 🌟');
      if(d.models) {
        d.models
          .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'))
          .forEach(m => console.log('✅ ' + m.name));
        console.log('\n👉 出てきたリストをコピーして、私（AI）に教えてください！正しい名前に書き換えます。');
      } else {
        console.log('❌ 取得に失敗しました:', d);
      }
      process.exit();
    }).catch(err => {
      console.log('通信エラー:', err.message);
      process.exit();
    });
});
