require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🏋️  MHGym API draait op http://localhost:${PORT}`);
  console.log(`📋 Omgeving: ${process.env.NODE_ENV || 'development'}`);
});
