import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;

console.log('1. Express imported');

app.use(cors());
app.use(express.json());

console.log('2. Middleware configured');

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

console.log('3. Routes configured');

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`Database URL: ${process.env.DATABASE_URL}`);
});

console.log('4. Server starting...');
