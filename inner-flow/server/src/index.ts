import { createApp } from './server.js';
import { config } from './config.js';

createApp().listen(config.port, () => {
  console.log(`Inner Flow API 已啟動： http://localhost:${config.port}`);
  console.log(`文字模型 ${config.textModel}（備援 ${config.textModelFallback}）／語音 ${config.ttsModel}・${config.ttsVoice}`);
  if (!config.apiKey) console.warn('警告：尚未設定 GEMINI_API_KEY，生成端點會回傳錯誤。');
});
