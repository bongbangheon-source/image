import app from '../src/index.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
app.listen(port, () => console.log(`Morph Studio: http://localhost:${port}`));
