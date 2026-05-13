const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./src/database');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./src/routes/auth'));
// 아래 라우트들은 새 DB 스키마에 맞게 재작성 예정
// app.use('/api/assignments', require('./src/routes/assignments'));
// app.use('/api/stages', require('./src/routes/stages'));
// app.use('/api/logs', require('./src/routes/logs'));
// app.use('/api/analytics', require('./src/routes/analytics'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '수행평가 AI 관리 서버가 실행 중입니다.' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

initDatabase()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`서버가 http://${HOST}:${PORT} 에서 실행 중입니다.`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패:', err);
    process.exit(1);
  });
